/**
 * Nạp danh bạ UserID Lark (từ file timesheet tháng 9) vào employees.
 * Map theo Employee ID (= employee_code). Chạy: node scripts/import-lark-uid.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../src/config/db');

async function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'lark_userid_map.json'), 'utf-8'));
  let updated = 0, missing = [];
  for (const r of rows) {
    if (!r.emp_id) continue;
    const u = await query(
      'UPDATE employees SET lark_uid = $1, lark_dept = $2 WHERE employee_code = $3',
      [r.user_id, r.dept, r.emp_id]
    );
    if (u.rowCount) updated += 1;
    else missing.push(`${r.emp_id} (${r.name})`);
  }
  console.log(`✔ Gắn UserID Lark: ${updated}/${rows.length}`);
  if (missing.length) console.log(`  Không khớp employee_code: ${missing.length} — ${missing.slice(0, 10).join(', ')}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
