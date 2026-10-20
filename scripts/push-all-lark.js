/**
 * Đẩy chấm công của TẤT CẢ nhân viên đang làm (có Lark ID) lên Lark Attendance.
 * Chỉ đẩy ngày CHƯA đẩy (lark_pushed=false) trong tháng chỉ định (mặc định tháng hiện tại).
 * Dùng cho cron 20h mỗi tối. node scripts/push-all-lark.js [YYYY-MM]
 */
require('dotenv').config();
const lark = require('../src/services/lark.service');
const { query, pool } = require('../src/config/db');

function curMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

(async () => {
  const month = process.argv[2] || curMonth();
  if (!lark.isConfigured()) { console.log('Lark chưa cấu hình'); await pool.end(); return; }

  const { rows } = await query(
    `SELECT d.id, d.work_date, d.check_in, d.check_out, e.lark_user_id
     FROM attendance_daily d JOIN employees e ON e.employee_code = d.employee_code
     WHERE d.lark_pushed = false AND e.status = 'active' AND e.lark_user_id IS NOT NULL
       AND d.check_in IS NOT NULL AND to_char(d.work_date,'YYYY-MM') = $1
     ORDER BY d.work_date`, [month]);

  if (!rows.length) { console.log(new Date().toISOString(), 'Không có lượt mới để đẩy'); await pool.end(); return; }

  const flows = [];
  const ids = [];
  for (const r of rows) {
    const dateStr = String(r.work_date).slice(0, 10);
    if (r.check_in) flows.push({ lark_user_id: r.lark_user_id, type: 0, check_time: `${dateStr}T${r.check_in}+07:00`, comment: 'Chấm công (HCNS)' });
    if (r.check_out) flows.push({ lark_user_id: r.lark_user_id, type: 1, check_time: `${dateStr}T${r.check_out}+07:00`, comment: 'Chấm công (HCNS)' });
    ids.push(r.id);
  }
  const res = await lark.pushUserFlows(flows);
  await query(`UPDATE attendance_daily SET lark_pushed = true WHERE id = ANY($1::uuid[])`, [ids]);
  console.log(new Date().toISOString(), `Đẩy ${rows.length} ngày / ${flows.length} lượt lên Lark:`, JSON.stringify(res));
  await pool.end();
})();
