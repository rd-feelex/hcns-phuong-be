/**
 * Tạo tài khoản quản trị viên (PostgreSQL).
 * Chạy: node scripts/create-admin.js [email] [password]
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('../src/config/db');

const email = process.argv[2] || 'binhtruong1415@gmail.com';
const password = process.argv[3] || '123456';

async function main() {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO app_users (email, password_hash, role, full_name)
     VALUES (lower($1), $2, 'admin', 'Quản trị viên')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
     RETURNING email`,
    [email, hash]
  );
  console.log(`✔ Quản trị viên: ${rows[0].email}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
