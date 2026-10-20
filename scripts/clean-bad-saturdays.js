require('dotenv').config();
const { query, pool } = require('../src/config/db');
(async () => {
  const apply = process.argv[2] === '--apply';
  // Ô nửa công T7 (auto) nằm TRƯỚC ngày vào làm -> sai, cần xóa
  const bad = await query(
    `SELECT d.employee_code, d.work_date::text wd, to_char(d.work_date,'YYYY-MM') m, e.full_name, e.join_date::text jd
     FROM attendance_daily d JOIN employees e ON e.employee_code=d.employee_code
     WHERE d.source='auto' AND e.join_date IS NOT NULL AND d.work_date < e.join_date
     ORDER BY d.work_date`);
  console.log(`Tìm thấy ${bad.rowCount} ô sai:`);
  for (const r of bad.rows) console.log(`  ${r.wd} ${r.full_name} (vào làm ${r.jd})`);

  if (!apply) { console.log('\n(Chạy lại với --apply để xóa)'); await pool.end(); return; }

  let removed = 0;
  for (const r of bad.rows) {
    await query(`DELETE FROM attendance_daily WHERE employee_code=$1 AND work_date=$2 AND source='auto'`,
      [r.employee_code, r.wd]);
    await query(`UPDATE attendance_records SET days = days - $3 WHERE employee_code=$1 AND month=$2`,
      [r.employee_code, r.m, r.wd]);
    removed += 1;
  }
  console.log(`\n✅ Đã xóa ${removed} ô.`);
  await pool.end();
})();
