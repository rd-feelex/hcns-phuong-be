require('dotenv').config();
const { query, pool } = require('../src/config/db');
(async () => {
  const c = await query(`SELECT
     COUNT(*) FILTER (WHERE status='active') active,
     COUNT(*) FILTER (WHERE status='active' AND join_date IS NULL) no_join
     FROM employees`);
  console.log('Active:', c.rows[0].active, '| thiếu join_date:', c.rows[0].no_join);

  // Số ô auto (T7 online) bị điền SAI: work_date < join_date
  const bad = await query(
    `SELECT to_char(d.work_date,'YYYY-MM') m, COUNT(*) n
     FROM attendance_daily d JOIN employees e ON e.employee_code=d.employee_code
     WHERE d.source='auto' AND e.join_date IS NOT NULL AND d.work_date < e.join_date
     GROUP BY 1 ORDER BY 1`);
  console.log('\nÔ nửa công T7 điền SAI (trước ngày vào làm), theo tháng:');
  let tot = 0;
  for (const r of bad.rows) { console.log(`  ${r.m}: ${r.n}`); tot += Number(r.n); }
  console.log('  Tổng:', tot);
  await pool.end();
})();
