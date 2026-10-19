/**
 * Import dữ liệu migration (scripts/data/migration/*.json) vào PostgreSQL.
 * Chạy TRÊN SERVER sau khi đã áp schema: node scripts/import-pg.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { query, pool } = require('../src/config/db');

const DIR = path.join(__dirname, 'data', 'migration');

// Thứ tự import tôn trọng khóa ngoại (employees trước)
const TABLES = [
  'employees', 'salary_records', 'attendance_records', 'attendance_summary',
  'payroll_inputs', 'contractor_salaries', 'salary_changes', 'arrears_details',
  'ebitda_bonuses', 'salary_grades', 'kpi_details',
];

async function importTable(table) {
  const file = path.join(DIR, `${table}.json`);
  if (!fs.existsSync(file)) {
    console.log(`- ${table}: không có file, bỏ qua`);
    return;
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!rows.length) {
    console.log(`- ${table}: 0 rows`);
    return;
  }
  await query(`DELETE FROM ${table}`);
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  for (const r of rows) {
    const vals = cols.map((c) => {
      const v = r[c];
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    });
    await query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      vals
    );
  }
  console.log(`✔ ${table}: ${rows.length} rows`);
}

async function main() {
  for (const t of TABLES) await importTable(t);

  // Tài khoản: đặt lại mật khẩu mặc định 123456 (người dùng đổi sau)
  const usersFile = path.join(DIR, 'app_users.json');
  if (fs.existsSync(usersFile)) {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    const hash = await bcrypt.hash('123456', 10);
    for (const u of users) {
      await query(
        `INSERT INTO app_users (email, password_hash, role, full_name)
         VALUES (lower($1), $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`,
        [u.email, hash, u.role, u.full_name]
      );
    }
    console.log(`✔ app_users: ${users.length} tài khoản (mật khẩu mặc định 123456)`);
  }
  await pool.end();
  console.log('Import hoàn tất.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
