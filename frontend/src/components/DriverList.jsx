import Status from './Status.jsx';
import { money, shortDate } from '../utils.js';

export default function DriverList({ pools, action, busy, online = true }) {
  if (!pools.length)
    return (
      <div className="empty">
        <div className="empty-icon">◷</div>
        <b>No pools yet</b>
        <p>New shared ride requests show up here.</p>
      </div>
    );
  return (
    <div className="pool-list">
      {pools.map((p) => (
        <article className="pool-card" key={p.pool_id}>
          <div className="pool-head">
            <div>
              <div className="eyebrow muted">
                {p.vehicle_name || 'Bullet'} · {p.plate || 'DHK-GA-11-0421'}
              </div>
              <h3>
                {p.pickup_zone} pickup <span>·</span> {p.occupied_seats} / {p.capacity || 2}{' '}
                passenger seats
              </h3>
            </div>
            <Status status={p.status} />
          </div>
          {p.route_plan?.length > 0 && (
            <div className="drop-order">
              <span>Planned route</span>
              <b>{p.route_plan.map((stop) => `${stop.kind}: ${stop.area}`).join(' → ')}</b>
            </div>
          )}
          <div className="pool-passengers">
            {(p.passengers || []).map((x) => (
              <div className="passenger-row" key={x.rideId}>
                <div className="avatar small">
                  {x.name
                    .split(' ')
                    .map((s) => s[0])
                    .join('')}
                </div>
                <div>
                  <b>{x.name}</b>
                  <small>
                    {x.pickup} → {x.destination} · {x.seats} {x.seats === 1 ? 'seat' : 'seats'}
                  </small>
                </div>
                <strong>{money(x.fare_paisa)}</strong>
                <Status status={x.status} />
              </div>
            ))}
          </div>
          <div className="pool-actions">
            {p.status === 'REQUESTED' && (
              <button
                className="btn dark"
                disabled={busy || !online}
                onClick={() => action(p.pool_id, 'accept')}
              >
                {online
                  ? p.passengers?.length > 1
                    ? 'Accept both rides'
                    : 'Accept this ride'
                  : 'Go online to accept'}{' '}
                <span>↗</span>
              </button>
            )}
            {p.status === 'MATCHED' && (
              <button
                className="btn dark"
                disabled={busy}
                onClick={() => action(p.pool_id, 'arrive')}
              >
                Mark arrived <span>↗</span>
              </button>
            )}
            {p.status === 'DRIVER_ARRIVED' && (
              <button
                className="btn dark"
                disabled={busy}
                onClick={() => action(p.pool_id, 'start')}
              >
                Start trip <span>↗</span>
              </button>
            )}
            {p.status === 'STARTED' && (
              <button
                className="btn dark"
                disabled={busy}
                onClick={() => action(p.pool_id, 'complete')}
              >
                Complete trip <span>↗</span>
              </button>
            )}
            <span className="pool-time">Requested {shortDate(p.created_at)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
