require('dotenv').config();
const { query, pool } = require('../src/config/db');
(async () => {
  const month = process.argv[2] || '2026-10';
  const inact = await query(`SELECT COUNT(*) c FROM employees WHERE status <> 'active'`);
  console.log('Nhân viên đã nghỉ:', inact.rows[0].c);
  const att = await query(
    `SELECT e.full_name, e.employee_code, e.enroll_id, COUNT(*) n
     FROM attendance_daily d JOIN employees e ON e.employee_code = d.employee_code
     WHERE e.status <> 'active' AND to_char(d.work_date,'YYYY-MM') = $1
     GROUP BY 1,2,3 ORDER BY n DESC`, [month]);
  console.log(`Người đã nghỉ nhưng CÓ công ${month}:`, att.rowCount);
  for (const x of att.rows) console.log(`  ${x.full_name} [${x.employee_code}] badge=${x.enroll_id || '-'} : ${x.n} ngày`);
  await pool.end();
})();
