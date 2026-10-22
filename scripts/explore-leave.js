require('dotenv').config();
const lark = require('../src/services/lark.service');
const { query, pool } = require('../src/config/db');

(async () => {
  const token = await lark.getToken();
  const b = await query(`SELECT lark_user_id FROM employees WHERE employee_code='XTRAD24082026'`);
  const uid = b.rows[0]?.lark_user_id;
  console.log('user_id Mai:', uid);

  const tries = [
    ['GET', `/attendance/v1/leave_employ_expire_records?employee_type=employee_id&user_id=${uid}`],
    ['POST', `/attendance/v1/leaves/leave_balances?employee_type=employee_id`, { user_ids: [uid] }],
    ['GET', `/attendance/v1/leave_accrual_record/${uid}?employee_type=employee_id`],
    ['GET', `/attendance/v1/user_settings?employee_type=employee_id&user_ids=${uid}`],
  ];
  for (const [m, p, body] of tries) {
    try {
      const r = await lark.request(m, p, { token, body });
      console.log(`\n${m} ${p.split('?')[0]} -> code=${r.code} msg=${r.msg || ''}`);
      if (r.code === 0) console.log('  DATA:', JSON.stringify(r.data).slice(0, 600));
    } catch (e) { console.log(`\n${m} ${p.split('?')[0]} -> LỖI ${e.message}`); }
  }
  await pool.end();
})();
