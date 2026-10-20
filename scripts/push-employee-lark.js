/**
 * Đẩy chấm công của 1 nhân viên (1 tháng) lên Lark Attendance — bỏ qua mốc PUSH_FROM.
 * node scripts/push-employee-lark.js <employee_code> <YYYY-MM>
 */
require('dotenv').config();
const lark = require('../src/services/lark.service');
const { query, pool } = require('../src/config/db');

(async () => {
  const code = process.argv[2];
  const month = process.argv[3] || '2026-10';
  if (!code) { console.log('Thiếu employee_code'); process.exit(1); }

  const { rows } = await query(
    `SELECT d.work_date, d.check_in, d.check_out, e.lark_user_id, e.full_name
     FROM attendance_daily d JOIN employees e ON e.employee_code = d.employee_code
     WHERE d.employee_code = $1 AND to_char(d.work_date,'YYYY-MM') = $2
       AND d.check_in IS NOT NULL AND e.lark_user_id IS NOT NULL
     ORDER BY d.work_date`, [code, month]);

  if (!rows.length) { console.log('Không có dữ liệu để đẩy'); await pool.end(); return; }

  const flows = [];
  for (const r of rows) {
    const dateStr = String(r.work_date).slice(0, 10);
    if (r.check_in) flows.push({ lark_user_id: r.lark_user_id, type: 0, check_time: `${dateStr}T${r.check_in}+07:00`, comment: 'Chấm công (HCNS)' });
    if (r.check_out) flows.push({ lark_user_id: r.lark_user_id, type: 1, check_time: `${dateStr}T${r.check_out}+07:00`, comment: 'Chấm công (HCNS)' });
  }
  console.log(`${rows[0].full_name}: ${rows.length} ngày -> ${flows.length} lượt đẩy Lark`);
  const res = await lark.pushUserFlows(flows);
  console.log('Kết quả:', JSON.stringify(res));
  await query(`UPDATE attendance_daily SET lark_pushed = true WHERE employee_code=$1 AND to_char(work_date,'YYYY-MM')=$2`, [code, month]);
  await pool.end();
})();
