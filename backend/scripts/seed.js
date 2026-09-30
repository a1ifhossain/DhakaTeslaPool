const crypto = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pool } = require('pg');
const db = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://tesla_user:tesla_password@localhost:5432/tesla_pool',
});
function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (e, k) =>
      e ? reject(e) : resolve(`${salt}:${k.toString('hex')}`),
    ),
  );
}
(async () => {
  try {
    const cast = [
      ['Jashim', 'jashim@teslapool.test', 'DRIVER', 'bullet-driver'],
      ['Nusrat', 'nusrat@teslapool.test', 'PASSENGER', 'nusrat-ride'],
      ['Rafiq', 'rafiq@teslapool.test', 'PASSENGER', 'rafiq-ride'],
      ['Shirin', 'shirin@teslapool.test', 'PASSENGER', 'shirin-ride'],
    ];
    const ids = {};
    for (const [name, email, role, password] of cast) {
      const q = await db.query(
        `INSERT INTO users(name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [name, email, await passwordHash(password), role, '+880 1700 000000'],
      );
      ids[email] = q.rows[0].id;
    }
    await db.query(
      `INSERT INTO vehicles(driver_id,name,plate,capacity,active) VALUES($1,'Bullet','DHK-GA-11-0421',2,true) ON CONFLICT(driver_id) DO UPDATE SET name=EXCLUDED.name,plate=EXCLUDED.plate,capacity=EXCLUDED.capacity,active=true`,
      [ids['jashim@teslapool.test']],
    );
    console.log('Demo users seeded: Jashim, Nusrat, Rafiq, and Shirin.');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
