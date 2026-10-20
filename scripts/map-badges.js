require('dotenv').config();
const device = require('../src/services/zkdevice.service');
const { query, pool } = require('../src/config/db');

const normalize = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

(async () => {
  const apply = process.argv[2] === '--apply';
  const logs = await device.getLogs({ since: new Date('2026-10-01T00:00:00') });
  const emp = (await query('SELECT employee_code, full_name, enroll_id FROM employees')).rows;
  const mappedBadges = new Set(emp.filter((e) => e.enroll_id != null).map((e) => String(e.enroll_id)));
  const empFree = emp.filter((e) => e.enroll_id == null).map((e) => ({ ...e, norm: normalize(e.full_name) }));

  // badge -> name (từ log)
  const byBadge = {};
  for (const l of logs) {
    const b = String(l.enrollid);
    if (b === '0' || !l.name) continue;
    if (!byBadge[b]) byBadge[b] = { name: l.name, count: 0 };
    byBadge[b].count += 1;
  }

  const match = (nm) => {
    const un = normalize(nm);
    if (un.length < 3) return [];
    let hits = empFree.filter((e) => e.norm === un);
    if (!hits.length && un.length >= 5) hits = empFree.filter((e) => e.norm.includes(un));
    if (!hits.length && un.length >= 4) hits = empFree.filter((e) => e.norm.length >= 4 && un.includes(e.norm));
    // last resort: cùng chứa 1 "từ" đủ dài
    return hits;
  };

  const plan = [];
  for (const [b, v] of Object.entries(byBadge)) {
    if (mappedBadges.has(b)) continue;
    const hits = match(v.name);
    console.log(`badge ${b} "${v.name}" (${v.count} lượt) -> ${hits.length ? hits.map((h) => `${h.full_name}[${h.employee_code}]`).join(' | ') : '❌ KHÔNG khớp'}`);
    if (hits.length === 1) plan.push({ badge: Number(b), code: hits[0].employee_code, name: hits[0].full_name });
  }

  console.log(`\n${plan.length} badge khớp DUY NHẤT:`);
  plan.forEach((p) => console.log(`  ${p.badge} -> ${p.name} [${p.code}]`));

  if (apply) {
    for (const p of plan) {
      await query('UPDATE employees SET enroll_id = NULL WHERE enroll_id = $1', [p.badge]);
      await query('UPDATE employees SET enroll_id = $1 WHERE employee_code = $2', [p.badge, p.code]);
    }
    console.log(`\n✅ Đã gắn ${plan.length} badge.`);
  } else {
    console.log('\n(Chạy lại với --apply để gắn)');
  }
  await pool.end();
})();
