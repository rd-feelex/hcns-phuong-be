require('dotenv').config();
const { query, pool } = require('../src/config/db');
(async () => {
  const month = process.argv[2] || '2026-10';
  const r = await query(
    `SELECT e.full_name, e.employee_code, COUNT(*) n
     FROM attendance_daily d JOIN employees e ON e.employee_code = d.employee_code
     WHERE to_char(d.work_date,'YYYY-MM') = $1
       AND d.source = 'device' AND d.check_in IS NOT NULL AND d.check_out IS NULL
       AND e.status = 'active'
       AND d.work_date < CURRENT_DATE
       AND EXTRACT(DOW FROM d.work_date) <> 0
     GROUP BY 1,2 ORDER BY n DESC, e.full_name`, [month]);
  const totalDays = r.rows.reduce((a, x) => a + Number(x.n), 0);
  console.log(`Tháng ${month}: ${r.rowCount} người, tổng ${totalDays} ngày thiếu quẹt ra\n`);
  for (const x of r.rows) console.log(`  ${x.n} ngày — ${x.full_name} [${x.employee_code}]`);
  await pool.end();
})();
