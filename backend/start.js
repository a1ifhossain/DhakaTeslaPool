const { spawnSync } = require('node:child_process');
const path = require('node:path');

const migrationPath = path.join(__dirname, 'scripts', 'migrate.js');
const migration = spawnSync(process.execPath, [migrationPath], {
  env: process.env,
  stdio: 'inherit',
});

if (migration.error) {
  console.error('Could not run database migrations:', migration.error);
  process.exit(1);
}

if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}

require('./server');
