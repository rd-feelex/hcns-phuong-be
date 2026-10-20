require('dotenv').config();
const { query, pool } = require('../src/config/db');
(async () => {
  const c = await query(`SELECT COUNT(*) n FROM approvals`);
  console.log('Tổng số phiếu đã nhận vào web:', c.rows[0].n);
  const byType = await query(`SELECT type, status, COUNT(*) n FROM approvals GROUP BY 1,2 ORDER BY 3 DESC`);
  for (const r of byType.rows) console.log(`  type="${r.type}" status=${r.status}: ${r.n}`);
  const recent = await query(`SELECT external_id, type, status, employee_code, title, created_at FROM approvals ORDER BY created_at DESC LIMIT 5`);
  console.log('\n5 phiếu gần nhất:');
  for (const r of recent.rows) console.log(`  ${String(r.created_at).slice(0,16)} | ${r.type} | ${r.status} | ${r.employee_code || '-'} | ${r.title || ''}`);
  await pool.end();
})();
