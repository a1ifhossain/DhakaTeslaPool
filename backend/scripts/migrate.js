const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://tesla_user:tesla_password@localhost:5432/tesla_pool',
});
(async () => {
  try {
    const migrationsPath = path.join(__dirname, '../migrations');
    const migrations = fs
      .readdirSync(migrationsPath)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const migration of migrations) {
      const sql = fs.readFileSync(path.join(migrationsPath, migration), 'utf8');
      await db.query(sql);
      console.log(`Applied ${migration}.`);
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
