require('dotenv').config();
const { query, pool } = require('../src/config/db');
(async () => {
  await query(`CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz DEFAULT now()
  )`);
  console.log('OK app_settings');
  await pool.end();
})();
