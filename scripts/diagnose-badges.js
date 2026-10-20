require('dotenv').config();
const device = require('../src/services/zkdevice.service');
const { query, pool } = require('../src/config/db');

const normalize = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

(async () => {
  const month = process.argv[2] || '2026-10';
  const logs = await device.getLogs({ since: new Date(`${month}-01T00:00:00`) });

  // badge -> {name, count} từ log
  const byBadge = {};
  for (const l of logs) {
    const b = String(l.enrollid);
    if (b === '0') continue;
    if (!byBadge[b]) byBadge[b] = { name: l.name, count: 0, norm: normalize(l.name) };
    byBadge[b].count += 1;
  }

  // nhân viên active có badge nhưng badge đó KHÔNG xuất hiện trong log tháng
  const emp = (await query(
    `SELECT employee_code, full_name, enroll_id FROM employees
     WHERE status='active' AND enroll_id IS NOT NULL`)).rows;
  const badgesInLog = new Set(Object.keys(byBadge));

  console.log(`Nhân viên có badge nhưng badge KHÔNG quẹt lần nào trong ${month}:\n`);
  for (const e of emp) {
    if (badgesInLog.has(String(e.enroll_id))) continue; // badge có quẹt -> ổn
    const un = normalize(e.full_name);
    // tìm badge trong log có tên khớp
    const cand = Object.entries(byBadge).filter(([, v]) =>
      v.norm === un || (un.length >= 5 && v.norm.includes(un)) || (v.norm.length >= 5 && un.includes(v.norm)));
    if (cand.length) {
      console.log(`⚠ ${e.full_name} [${e.employee_code}] badge hiện=${e.enroll_id} → CÓ THỂ SAI, badge quẹt thật: ` +
        cand.map(([b, v]) => `${b}("${v.name}",${v.count} lượt)`).join(' | '));
    } else {
      console.log(`·  ${e.full_name} [${e.employee_code}] badge=${e.enroll_id} → không thấy quẹt (nghỉ/không lên VP?)`);
    }
  }
  await pool.end();
})();
