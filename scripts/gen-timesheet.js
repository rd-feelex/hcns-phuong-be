/**
 * Tạo file timesheet 1 tháng (lọc theo mã NV nếu truyền) ra file.
 * node scripts/gen-timesheet.js <YYYY-MM> <outfile> [code1,code2,...]
 */
require('dotenv').config();
const timesheet = require('../src/services/timesheet.service');
const { query, pool } = require('../src/config/db');
const fs = require('fs');

(async () => {
  const month = process.argv[2] || '2026-08';
  const out = process.argv[3] || `/home/binh/timesheet-${month}.xlsx`;
  const codes = process.argv[4] ? process.argv[4].split(',') : null;

  // In trước lark_uid của các NV để biết có xuất được không
  if (codes) {
    const r = await query('SELECT employee_code, full_name, lark_uid FROM employees WHERE employee_code = ANY($1)', [codes]);
    for (const e of r.rows) console.log(`${e.full_name} [${e.employee_code}] lark_uid=${e.lark_uid || 'THIẾU'}`);
  }

  const { buffer, count } = await timesheet.toBuffer(month, { codes, deadline: null });
  fs.writeFileSync(out, Buffer.from(buffer));
  console.log(`Đã tạo ${out} — ${count} nhân viên`);
  await pool.end();
})();
