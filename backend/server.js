require('dotenv').config();
const express = require('express');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const path = require('node:path');
const {
  areas,
  MAX_PASSENGER_SEATS,
  MAX_POOL_REQUESTS,
  farePaisa,
  hasCapacity,
  nextStatus,
  canCancel,
  validateSignup,
} = require('./domain');
const { routeBetween, bestSharedStopOrder } = require('./routing');
const app = express();
const db = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://tesla_user:tesla_password@localhost:5432/tesla_pool',
});
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || 'local-demo-secret-change-before-deploy';
if (
  process.env.NODE_ENV === 'production' &&
  JWT_SECRET === 'local-demo-secret-change-before-deploy'
)
  throw new Error('Set JWT_SECRET to a long random value before starting in production.');
app.use(express.json({ limit: '32kb' }));
function tokenFor(user) {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: user.id,
      name: user.name,
      role: user.role,
      exp: Date.now() + 7 * 86400000,
    }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function auth(req, res, next) {
  const raw = req.headers.authorization || '';
  try {
    const [h, b, s] = raw.replace(/^Bearer\s+/i, '').split('.');
    if (!h || !b || !s) throw new Error();
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest();
    const actual = Buffer.from(s, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected))
      throw new Error();
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp < Date.now()) throw new Error();
    req.user = { id: payload.sub, name: payload.name, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in to continue.' });
  }
}
const role = (kind) => (req, res, next) =>
  req.user.role === kind
    ? next()
    : res.status(403).json({ error: `${kind.toLowerCase()} account required.` });
const coords = (zone) => areas[zone];
function fail(res, e) {
  console.error(e);
  res
    .status(e.status || 500)
    .json({ error: e.status ? e.message : 'Something went wrong. Please try again.' });
}
app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});
app.get('/api/areas', (_req, res) => res.json({ areas: Object.keys(areas) }));
app.get('/api/fare/estimate', async (req, res) => {
  try {
    const pickup = String(req.query.pickup || '');
    const destination = String(req.query.destination || '');
    const seats = Number(req.query.seats || 1);
    if (!Number.isInteger(seats) || seats < 1 || seats > MAX_PASSENGER_SEATS) {
      return res.status(400).json({ error: 'Choose between one and two passenger seats.' });
    }
    const route = await routeBetween(pickup, destination);
    res.json({
      distanceMeters: route.distanceMeters,
      distanceKm: Number((route.distanceMeters / 1000).toFixed(1)),
      farePaisa: farePaisa(route.distanceMeters, false, seats),
      sharedFarePaisa: farePaisa(route.distanceMeters, true, seats),
    });
  } catch (e) {
    res.status(503).json({ error: 'A route estimate is unavailable right now. Please try again.' });
  }
});
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password || '');
    const found = await db.query(
      'SELECT id,name,email,role,password_hash FROM users WHERE email=$1',
      [email],
    );
    const user = found.rows[0];
    if (
      !user ||
      !(await new Promise((ok, bad) => {
        const [salt, hash] = user.password_hash.split(':');
        crypto.scrypt(password, salt, 64, (e, key) =>
          e ? bad(e) : ok(crypto.timingSafeEqual(key, Buffer.from(hash, 'hex'))),
        );
      }))
    )
      return res.status(401).json({ error: 'Email or password did not match.' });
    const requestedRole = String(req.body.role || '').toUpperCase();
    if (requestedRole && requestedRole !== user.role)
      return res
        .status(403)
        .json({ error: `This account is registered as a ${user.role.toLowerCase()}.` });
    const { password_hash, ...safe } = user;
    res.json({ user: safe, token: tokenFor(safe) });
  } catch (e) {
    fail(res, e);
  }
});
app.post('/api/auth/signup', async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password || '');
    const accountRole = String(req.body.role || 'PASSENGER').toUpperCase();
    const validationErrors = validateSignup(name, email, password, accountRole);
    if (validationErrors.length) return res.status(400).json({ error: validationErrors.join(' ') });
    client = await db.connect();
    const salt = crypto.randomBytes(16).toString('hex');
    const key = await new Promise((resolve, reject) =>
      crypto.scrypt(password, salt, 64, (e, k) => (e ? reject(e) : resolve(k))),
    );
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await client.query(
      'INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role',
      [name, email, `${salt}:${key.toString('hex')}`, accountRole],
    );
    const user = result.rows[0];
    if (accountRole === 'DRIVER') {
      const plate = `DHK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      await client.query(
        "INSERT INTO vehicles(driver_id,name,plate,capacity,active) VALUES($1,'Bullet',$2,$3,true)",
        [user.id, plate, MAX_PASSENGER_SEATS],
      );
    }
    await client.query('COMMIT');
    transactionStarted = false;
    res.status(201).json({ user, token: tokenFor(user) });
  } catch (e) {
    if (transactionStarted && client) await client.query('ROLLBACK');
    if (e.code === '23505')
      return res.status(409).json({ error: 'An account already uses that email.' });
    fail(res, e);
  } finally {
    client?.release();
  }
});
app.get('/api/me', auth, async (req, res) => {
  try {
    const q = await db.query('SELECT id,name,email,role FROM users WHERE id=$1', [req.user.id]);
    res.json({ user: q.rows[0] });
  } catch (e) {
    fail(res, e);
  }
});
app.get('/api/passenger/rides', auth, role('PASSENGER'), async (req, res) => {
  try {
    const q = await db.query(
      `SELECT r.id,r.pickup_zone,r.destination_zone,r.seats,r.fare_paisa,r.status,r.payment_method,r.created_at,p.id pool_id,p.status pool_status,p.drop_order pool_drop_order,p.route_plan pool_route_plan,v.name vehicle_name,v.plate,d.name driver_name,(SELECT json_agg(json_build_object('id',ev.id,'from',ev.from_status,'to',ev.to_status,'note',ev.note,'at',ev.created_at) ORDER BY ev.created_at) FROM status_events ev WHERE ev.ride_id=r.id) history FROM ride_requests r JOIN pools p ON p.id=r.pool_id JOIN vehicles v ON v.id=p.vehicle_id JOIN users d ON d.id=v.driver_id WHERE r.passenger_id=$1 ORDER BY r.created_at DESC`,
      [req.user.id],
    );
    res.json({ rides: q.rows });
  } catch (e) {
    fail(res, e);
  }
});
app.post('/api/passenger/rides', auth, role('PASSENGER'), async (req, res) => {
  const pickup = String(req.body.pickup || '');
  const destination = String(req.body.destination || '');
  const seats = Number(req.body.seats || 1);
  const payment = ['CASH', 'TESLAPAY'].includes(req.body.paymentMethod)
    ? req.body.paymentMethod
    : 'CASH';
  if (
    !coords(pickup) ||
    !coords(destination) ||
    pickup === destination ||
    !Number.isInteger(seats) ||
    seats < 1 ||
    seats > MAX_PASSENGER_SEATS
  )
    return res
      .status(400)
      .json({ error: 'Choose different Dhaka areas and request 1 or 2 passenger seats.' });
  let requestedRoute;
  try {
    requestedRoute = await routeBetween(pickup, destination);
  } catch {
    return res
      .status(503)
      .json({ error: 'A road route could not be calculated. Please try again in a moment.' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    const vehicle = (
      await client.query(
        `SELECT v.id,v.capacity FROM vehicles v WHERE v.active=true ORDER BY (SELECT count(*) FROM pools p WHERE p.vehicle_id=v.id AND p.status='REQUESTED'),v.id LIMIT 1`,
      )
    ).rows[0];
    if (!vehicle) throw Object.assign(new Error('No active Tesla is available.'), { status: 409 });
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [vehicle.id]);
    const candidatePools = await client.query(
      "SELECT id FROM pools WHERE vehicle_id=$1 AND status='REQUESTED' ORDER BY created_at FOR UPDATE",
      [vehicle.id],
    );
    let pool;
    let count = 0;
    let plannedDropOrder;
    let plannedRoute;
    for (const candidate of candidatePools.rows) {
      const members = await client.query(
        'SELECT r.id,r.pickup_zone,r.destination_zone,r.route_distance_m,r.seats,m.seats member_seats,r.status FROM pool_members m JOIN ride_requests r ON r.id=m.ride_id WHERE m.pool_id=$1 ORDER BY r.created_at',
        [candidate.id],
      );
      if (members.rows.length >= MAX_POOL_REQUESTS) continue;
      const occupied = members.rows.reduce((total, member) => total + member.member_seats, 0);
      if (!hasCapacity(occupied, seats, vehicle.capacity)) continue;
      const trips = [
        ...members.rows.map((member) => ({
          pickup: member.pickup_zone,
          destination: member.destination_zone,
          seats: member.member_seats,
          distanceMeters: Number(member.route_distance_m),
        })),
        { pickup, destination, seats, distanceMeters: requestedRoute.distanceMeters },
      ];
      const stopOrder = bestSharedStopOrder(trips, vehicle.capacity);
      if (stopOrder) {
        pool = candidate;
        count = occupied;
        plannedRoute = stopOrder.map(({ area, kind }) => ({ area, kind }));
        plannedDropOrder = [
          ...new Set(stopOrder.filter((stop) => stop.kind === 'dropoff').map((stop) => stop.area)),
        ];
        pool.members = members.rows;
        break;
      }
    }
    let isNew = false;
    if (!pool) {
      plannedDropOrder = [destination];
      plannedRoute = [
        { area: pickup, kind: 'pickup' },
        { area: destination, kind: 'dropoff' },
      ];
      pool = (
        await client.query(
          'INSERT INTO pools(vehicle_id,pickup_zone,drop_order,route_plan) VALUES($1,$2,$3::jsonb,$4::jsonb) RETURNING id',
          [vehicle.id, pickup, JSON.stringify(plannedDropOrder), JSON.stringify(plannedRoute)],
        )
      ).rows[0];
      isNew = true;
    }
    if (!isNew) {
      await client.query(
        'UPDATE pools SET drop_order=$1::jsonb,route_plan=$2::jsonb,updated_at=now() WHERE id=$3',
        [JSON.stringify(plannedDropOrder), JSON.stringify(plannedRoute), pool.id],
      );
    }
    if (!hasCapacity(count, seats, vehicle.capacity))
      throw Object.assign(new Error('This Tesla does not have enough seats.'), { status: 409 });
    const id = (
      await client.query(
        `INSERT INTO ride_requests(passenger_id,pool_id,pickup_zone,destination_zone,seats,fare_paisa,payment_method,route_distance_m) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          req.user.id,
          pool.id,
          pickup,
          destination,
          seats,
          farePaisa(requestedRoute.distanceMeters, count > 0, seats),
          payment,
          requestedRoute.distanceMeters,
        ],
      )
    ).rows[0].id;
    await client.query('INSERT INTO pool_members(pool_id,ride_id,seats) VALUES($1,$2,$3)', [
      pool.id,
      id,
      seats,
    ]);
    if (count > 0) {
      for (const m of pool.members) {
        const updatedFare = farePaisa(m.route_distance_m, true, m.seats);
        await client.query(
          'UPDATE ride_requests SET fare_paisa=$1,route_distance_m=$2,updated_at=now() WHERE id=$3',
          [updatedFare, m.route_distance_m, m.id],
        );
        await client.query(
          'INSERT INTO status_events(ride_id,pool_id,actor_id,from_status,to_status,note) VALUES($1,$2,$3,$4,$4,$5)',
          [
            m.id,
            pool.id,
            req.user.id,
            m.status,
            `Shared-pool fare updated to ${updatedFare} paisa. Planned stops: ${plannedRoute.map((stop) => `${stop.kind} ${stop.area}`).join(' → ')}.`,
          ],
        );
      }
    }
    await client.query(
      `INSERT INTO status_events(ride_id,pool_id,actor_id,to_status,note) VALUES($1,$2,$3,'REQUESTED',$4)`,
      [
        id,
        pool.id,
        req.user.id,
        isNew
          ? `Ride request created. Planned drop-off: ${destination}.`
          : `Matched into an existing Tesla pool. Planned stops: ${plannedRoute.map((stop) => `${stop.kind} ${stop.area}`).join(' → ')}.`,
      ],
    );
    await client.query('COMMIT');
    res.status(201).json({
      rideId: id,
      poolId: pool.id,
      matched: !isNew,
      estimatePaisa: farePaisa(requestedRoute.distanceMeters, count > 0, seats),
      routeDistanceKm: Number((requestedRoute.distanceMeters / 1000).toFixed(1)),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '40001')
      return res.status(409).json({
        error: 'Another request just changed this Tesla’s available seats. Please try again.',
      });
    fail(res, e);
  } finally {
    client.release();
  }
});
app.post('/api/passenger/rides/:id/cancel', auth, role('PASSENGER'), async (req, res) => {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query(
      `SELECT r.*,p.status pool_status,p.drop_order pool_drop_order,p.vehicle_id,v.capacity FROM ride_requests r JOIN pools p ON p.id=r.pool_id JOIN vehicles v ON v.id=p.vehicle_id WHERE r.id=$1 AND r.passenger_id=$2 FOR UPDATE`,
      [req.params.id, req.user.id],
    );
    const r = q.rows[0];
    if (!r) throw Object.assign(new Error('Ride not found.'), { status: 404 });
    if (!canCancel(r.status))
      throw Object.assign(new Error('This ride can no longer be cancelled.'), { status: 409 });
    await c.query("UPDATE ride_requests SET status='CANCELLED',updated_at=now() WHERE id=$1", [
      r.id,
    ]);
    await c.query('DELETE FROM pool_members WHERE ride_id=$1', [r.id]);
    await c.query(
      "INSERT INTO status_events(ride_id,pool_id,actor_id,from_status,to_status,note) VALUES($1,$2,$3,$4,'CANCELLED','Cancelled by passenger')",
      [r.id, r.pool_id, req.user.id, r.status],
    );
    const remains = await c.query('SELECT count(*) FROM pool_members WHERE pool_id=$1', [
      r.pool_id,
    ]);
    if (Number(remains.rows[0].count) === 0) {
      await c.query("UPDATE pools SET status='CANCELLED',updated_at=now() WHERE id=$1", [
        r.pool_id,
      ]);
    } else {
      const remainingRides = await c.query(
        'SELECT r.id,r.status,r.route_distance_m,r.seats,r.pickup_zone,r.destination_zone FROM ride_requests r JOIN pool_members m ON m.ride_id=r.id WHERE m.pool_id=$1',
        [r.pool_id],
      );
      let isStillShared = remainingRides.rows.length > 1;
      const remainingDestinations = new Set(
        remainingRides.rows.map((ride) => ride.destination_zone),
      );
      const plannedDropOrder = (r.pool_drop_order || []).filter((area) =>
        remainingDestinations.has(area),
      );
      for (const ride of remainingRides.rows) {
        if (!plannedDropOrder.includes(ride.destination_zone)) {
          plannedDropOrder.push(ride.destination_zone);
        }
      }
      let routePlan = [];
      if (remainingRides.rows.length === 1) {
        const [remaining] = remainingRides.rows;
        routePlan = [
          { area: remaining.pickup_zone, kind: 'pickup' },
          { area: remaining.destination_zone, kind: 'dropoff' },
        ];
      } else if (remainingRides.rows.length > 1) {
        const stopOrder = bestSharedStopOrder(
          remainingRides.rows.map((ride) => ({
            pickup: ride.pickup_zone,
            destination: ride.destination_zone,
            seats: ride.seats,
            distanceMeters: Number(ride.route_distance_m),
          })),
          r.capacity,
        );
        if (stopOrder) routePlan = stopOrder.map(({ area, kind }) => ({ area, kind }));
      }
      if (routePlan.length === 0) isStillShared = false;
      await c.query(
        'UPDATE pools SET drop_order=$1::jsonb,route_plan=$2::jsonb,updated_at=now() WHERE id=$3',
        [JSON.stringify(plannedDropOrder), JSON.stringify(routePlan), r.pool_id],
      );
      for (const ride of remainingRides.rows) {
        if (!ride.route_distance_m) continue;
        const updatedFare = farePaisa(ride.route_distance_m, isStillShared, ride.seats);
        await c.query('UPDATE ride_requests SET fare_paisa=$1,updated_at=now() WHERE id=$2', [
          updatedFare,
          ride.id,
        ]);
        await c.query(
          'INSERT INTO status_events(ride_id,pool_id,actor_id,from_status,to_status,note) VALUES($1,$2,$3,$4,$4,$5)',
          [
            ride.id,
            r.pool_id,
            req.user.id,
            ride.status,
            `Fare recalculated to ${updatedFare} paisa after a passenger cancelled. Planned drop-offs: ${plannedDropOrder.join(' → ')}.`,
          ],
        );
      }
    }
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK');
    fail(res, e);
  } finally {
    c.release();
  }
});
app.get('/api/driver/pools', auth, role('DRIVER'), async (req, res) => {
  try {
    const q = await db.query(
      `SELECT p.id pool_id,p.pickup_zone,p.status,p.drop_order,p.route_plan,p.created_at,v.name vehicle_name,v.plate,v.capacity,COALESCE(sum(m.seats),0)::int occupied_seats,json_agg(json_build_object('rideId',r.id,'name',u.name,'pickup',r.pickup_zone,'destination',r.destination_zone,'seats',r.seats,'fare_paisa',r.fare_paisa,'status',r.status) ORDER BY r.created_at) FILTER(WHERE r.id IS NOT NULL) passengers FROM pools p JOIN vehicles v ON v.id=p.vehicle_id LEFT JOIN pool_members m ON m.pool_id=p.id LEFT JOIN ride_requests r ON r.id=m.ride_id LEFT JOIN users u ON u.id=r.passenger_id WHERE v.driver_id=$1 GROUP BY p.id,v.id ORDER BY p.created_at DESC`,
      [req.user.id],
    );
    res.json({ pools: q.rows });
  } catch (e) {
    fail(res, e);
  }
});
app.get('/api/driver/status', auth, role('DRIVER'), async (req, res) => {
  try {
    const result = await db.query('SELECT active FROM vehicles WHERE driver_id=$1', [req.user.id]);
    if (!result.rows[0])
      return res.status(404).json({ error: 'No Tesla is assigned to this driver.' });
    res.json({ active: result.rows[0].active });
  } catch (e) {
    fail(res, e);
  }
});
app.post('/api/driver/status', auth, role('DRIVER'), async (req, res) => {
  try {
    if (typeof req.body.active !== 'boolean') {
      return res.status(400).json({ error: 'Choose whether the Tesla is online or offline.' });
    }
    const result = await db.query(
      `UPDATE vehicles v SET active=$2 WHERE v.driver_id=$1 AND ($2 OR NOT EXISTS (SELECT 1 FROM pools p WHERE p.vehicle_id=v.id AND p.status IN ('MATCHED','DRIVER_ARRIVED','STARTED'))) RETURNING active`,
      [req.user.id, req.body.active],
    );
    if (!result.rows[0]) {
      return res.status(409).json({ error: 'Finish the current pool before going offline.' });
    }
    res.json({ active: result.rows[0].active });
  } catch (e) {
    fail(res, e);
  }
});
app.post('/api/driver/pools/:id/:action', auth, role('DRIVER'), async (req, res) => {
  const pair = nextStatus[req.params.action];
  if (!pair) return res.status(404).json({ error: 'Unknown ride action.' });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query(
      `SELECT p.id,p.vehicle_id,p.status,v.capacity,v.active FROM pools p JOIN vehicles v ON v.id=p.vehicle_id WHERE p.id=$1 AND v.driver_id=$2 FOR UPDATE`,
      [req.params.id, req.user.id],
    );
    const p = q.rows[0];
    if (!p) throw Object.assign(new Error('Pool not found.'), { status: 404 });
    if (req.params.action === 'accept' && !p.active)
      throw Object.assign(new Error('Bring Bullet online before accepting a pool.'), {
        status: 409,
      });
    if (
      req.params.action === 'accept' &&
      (
        await c.query(
          "SELECT 1 FROM pools WHERE vehicle_id=$1 AND id<>$2 AND status IN ('MATCHED','DRIVER_ARRIVED','STARTED') LIMIT 1",
          [p.vehicle_id, p.id],
        )
      ).rows.length
    )
      throw Object.assign(new Error('Complete the current pool before accepting another one.'), {
        status: 409,
      });
    if (req.params.action === 'accept') {
      const occupancy = await c.query(
        'SELECT count(*)::int request_count,COALESCE(sum(m.seats),0)::int occupied_seats FROM pool_members m WHERE m.pool_id=$1',
        [p.id],
      );
      const { request_count, occupied_seats } = occupancy.rows[0];
      if (request_count > MAX_POOL_REQUESTS || occupied_seats > p.capacity) {
        throw Object.assign(
          new Error('This request group exceeds Bullet’s limit of two passengers or two seats.'),
          { status: 409 },
        );
      }
    }
    if (p.status !== pair[0])
      throw Object.assign(
        new Error(`Cannot ${req.params.action} a pool that is ${p.status.toLowerCase()}.`),
        { status: 409 },
      );
    await c.query('UPDATE pools SET status=$1,updated_at=now() WHERE id=$2', [pair[1], p.id]);
    await c.query(
      "UPDATE ride_requests SET status=$1,updated_at=now() WHERE pool_id=$2 AND status <> 'CANCELLED'",
      [pair[1], p.id],
    );
    await c.query(
      `INSERT INTO status_events(ride_id,pool_id,actor_id,from_status,to_status,note) SELECT r.id,$1,$2,$3,$4,$5 FROM ride_requests r JOIN pool_members m ON m.ride_id=r.id WHERE m.pool_id=$1`,
      [
        p.id,
        req.user.id,
        p.status,
        pair[1],
        `Driver marked ${pair[1].toLowerCase().replace('_', ' ')}.`,
      ],
    );
    await c.query('COMMIT');
    res.json({ status: pair[1] });
  } catch (e) {
    await c.query('ROLLBACK');
    fail(res, e);
  } finally {
    c.release();
  }
});
app.get('/api/driver/history', auth, role('DRIVER'), async (req, res) => {
  try {
    const q = await db.query(
      `SELECT p.id pool_id,p.pickup_zone,p.status,p.drop_order,p.route_plan,p.created_at,json_agg(json_build_object('name',u.name,'destination',r.destination_zone,'seats',r.seats,'fare_paisa',r.fare_paisa,'status',r.status) ORDER BY r.created_at) FILTER(WHERE r.id IS NOT NULL) passengers FROM pools p JOIN vehicles v ON v.id=p.vehicle_id LEFT JOIN ride_requests r ON r.pool_id=p.id WHERE v.driver_id=$1 GROUP BY p.id ORDER BY p.created_at DESC`,
      [req.user.id],
    );
    res.json({ pools: q.rows });
  } catch (e) {
    fail(res, e);
  }
});
app.use(express.static(path.resolve(__dirname, '../frontend/dist')));
app.get(/.*/, (_req, res) => {
  const f = path.resolve(__dirname, '../frontend/dist/index.html');
  res.sendFile(f, (e) => {
    if (e) res.status(404).send('Frontend not built. Run npm run build.');
  });
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: 'Invalid request.' });
});
app.listen(PORT, '0.0.0.0', () => console.log(`Dhaka Tesla Pool API listening on ${PORT}`));
