require('dotenv').config();
const device = require('../src/services/zkdevice.service');
const { query, pool } = require('../src/config/db');

(async () => {
  // 1 bản ghi userlist + 1 bản ghi log để xem cấu trúc field
  const users = await device.getAllUsers();
  console.log('USERLIST count=', users.length, 'sample=', JSON.stringify(users[0]));
  // Lập map id->name từ userlist (nếu có field badge thật thì in ra)
  console.log('USERLIST keys:', Object.keys(users[0] || {}).join(','));

  const logs = await device.getLogs({ since: new Date('2026-10-01T00:00:00') });
  console.log('LOGS count=', logs.length, 'sample=', JSON.stringify(logs[0]));
  console.log('LOG keys:', Object.keys(logs[0] || {}).join(','));

  // Các badge chưa map (từ getlog.enrollid) vs employees.enroll_id
  const emp = await query('SELECT enroll_id FROM employees WHERE enroll_id IS NOT NULL');
  const mapped = new Set(emp.rows.map((e) => String(e.enroll_id)));
  const byBadge = {};
  for (const l of logs) {
    const b = String(l.enrollid);
    if (!byBadge[b]) byBadge[b] = { count: 0, name: l.name, first: l.time, last: l.time };
    byBadge[b].count += 1;
    byBadge[b].last = l.time;
  }
  console.log('\n--- BADGE chưa map (có quẹt tháng 10) ---');
  for (const [b, v] of Object.entries(byBadge).sort((a, c) => c[1].count - a[1].count)) {
    if (!mapped.has(b)) console.log(`badge ${b} | ${v.count} lượt | name="${v.name || ''}" | ${String(v.first).slice(0,16)} → ${String(v.last).slice(0,16)}`);
  }
  // Có userlist nào có tên trùng mà badge khác không — in toàn bộ userlist id+name
  console.log('\n--- USERLIST id → name ---');
  for (const u of users) console.log(`${u.id}\t${u.name}`);
  await pool.end();
})();
