require('dotenv').config();
const lark = require('../src/services/lark.service');
const { query, pool } = require('../src/config/db');

(async () => {
  const token = await lark.getToken();

  // 1) Ca làm việc (shifts) đã cấu hình chưa?
  const s = await lark.request('GET', '/attendance/v1/shifts?page_size=20', { token });
  if (s.code === 0) {
    const list = s.data.shift_list || [];
    console.log(`CA LÀM VIỆC (shifts): ${list.length}`);
    for (const sh of list) console.log(`  - ${sh.shift_name} (id ${sh.shift_id})`);
  } else {
    console.log('Shifts lỗi:', JSON.stringify(s));
  }

  // 2) Dữ liệu mình đẩy có nằm trong Lark không? Query user_flows của Bình
  const b = await query(`SELECT lark_user_id FROM employees WHERE employee_code='CTV01072026'`);
  const uid = b.rows[0]?.lark_user_id;
  console.log(`\nKiểm tra lượt quẹt của Bình (user_id=${uid}) ngày 19-20/10 trên Lark:`);
  const f = await lark.request('POST', '/attendance/v1/user_flows/query', {
    token,
    query: { employee_type: 'employee_id' },
    body: { user_ids: [uid], check_time_from: String(Math.floor(new Date('2026-10-19T00:00:00+07:00').getTime() / 1000)),
            check_time_to: String(Math.floor(new Date('2026-10-20T23:59:59+07:00').getTime() / 1000)) },
  });
  if (f.code === 0) {
    const recs = f.data.user_flow_results || [];
    console.log(`  Lark có ${recs.length} lượt:`);
    for (const r of recs) console.log(`   ${new Date(Number(r.check_time) * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} | type=${r.type} | ${r.comment || ''}`);
  } else {
    console.log('  user_flows query lỗi:', JSON.stringify(f));
  }

  await pool.end();
})();
