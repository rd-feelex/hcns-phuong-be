require('dotenv').config();
const device = require('../src/services/zkdevice.service');
const { query, pool } = require('../src/config/db');

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

// Chuỗi con chung dài nhất
function lcs(a, b) {
  let best = 0;
  const dp = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) { dp[j] = prev + 1; best = Math.max(best, dp[j]); }
      else dp[j] = 0;
      prev = tmp;
    }
  }
  return best;
}

(async () => {
  const logs = await device.getLogs({ since: new Date('2026-09-01T00:00:00') });
  const byBadge = {};
  for (const l of logs) {
    const b = String(l.enrollid);
    if (b === '0') continue;
    if (!byBadge[b]) byBadge[b] = { name: l.name || '', count: 0 };
    byBadge[b].count += 1;
    if (l.name && !byBadge[b].name) byBadge[b].name = l.name;
  }
  const emp = (await query(
    `SELECT full_name, employee_code, enroll_id FROM employees
     WHERE status='active' AND enroll_id IS NOT NULL`)).rows;

  const mismatch = [], okCount = [], badgeNotInLog = [];
  for (const e of emp) {
    const b = String(e.enroll_id);
    const info = byBadge[b];
    if (!info) { badgeNotInLog.push(e); continue; }
    const ne = norm(e.full_name), nl = norm(info.name);
    // Tên gọi (chữ cuối trong tên tiếng Việt) — tên máy thường dạng "<tengoi><initials><dept>"
    const given = norm(e.full_name.trim().split(/\s+/).pop());
    const ok = !nl || ne === nl || (nl.length >= 4 && ne.includes(nl)) || (ne.length >= 4 && nl.includes(ne))
      || lcs(ne, nl) >= 5
      || (given.length >= 2 && (nl.startsWith(given) || nl.includes(given)));
    if (ok) okCount.push(e);
    else mismatch.push({ e, badgeName: info.name, count: info.count });
  }

  console.log(`✅ Gắn mã ĐÚNG (tên khớp): ${okCount.length} người`);
  console.log(`\n❌ GẮN NHẦM — badge quẹt tên KHÁC với nhân viên: ${mismatch.length} người`);
  for (const m of mismatch) {
    console.log(`  ${m.e.full_name} [${m.e.employee_code}] badge=${m.e.enroll_id} → nhưng badge này quẹt tên "${m.badgeName}" (${m.count} lượt)`);
  }
  console.log(`\n⚠ Badge gắn nhưng KHÔNG quẹt lần nào (từ 1/9): ${badgeNotInLog.length} người`);
  for (const e of badgeNotInLog) console.log(`  ${e.full_name} [${e.employee_code}] badge=${e.enroll_id}`);

  await pool.end();
})();
