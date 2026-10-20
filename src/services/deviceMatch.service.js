const { query } = require('../config/db');
const device = require('./zkdevice.service');

// Bỏ dấu tiếng Việt + chuẩn hoá để so khớp tên gần giống
function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Danh sách người QUẸT MÁY (badge thật từ getlog) + gợi ý ghép với nhân viên web.
// LƯU Ý: getuserlist.id là số thứ tự, KHÔNG phải badge; badge thật nằm ở
// getlog.enrollid. Vì vậy ta dựng danh sách từ log quẹt gần đây.
async function matchTable() {
  // Lấy log ~75 ngày gần nhất để biết ai đang quẹt máy + badge thật
  const since = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000);
  const [logs, emp] = await Promise.all([
    device.getLogs({ since }),
    query('SELECT employee_code, full_name, department, enroll_id FROM employees'),
  ]);

  const employees = emp.rows;
  const takenEnroll = new Map(
    employees.filter((e) => e.enroll_id != null).map((e) => [String(e.enroll_id), e.employee_code])
  );

  // badge thật -> { name, count, last }
  const byBadge = new Map();
  for (const l of logs) {
    const b = String(l.enrollid);
    if (b === '0' || !l.enrollid) continue;
    const cur = byBadge.get(b) || { name: l.name || '', count: 0, last: l.time };
    cur.count += 1;
    if (l.name && !cur.name) cur.name = l.name;
    if (l.time > cur.last) cur.last = l.time;
    byBadge.set(b, cur);
  }

  // Gợi ý: so khớp tên không dấu. Chỉ gợi ý khi khớp đủ mạnh và DUY NHẤT.
  const empNorm = employees
    .filter((e) => e.enroll_id == null)
    .map((e) => ({ ...e, norm: normalize(e.full_name) }));

  const suggestFor = (machineName) => {
    const un = normalize(machineName);
    if (un.length < 3) return null;
    let hits = empNorm.filter((e) => e.norm === un);
    if (!hits.length && un.length >= 5) hits = empNorm.filter((e) => e.norm.includes(un));
    if (!hits.length && un.length >= 6) hits = empNorm.filter((e) => e.norm.length >= 5 && un.includes(e.norm));
    return hits.length === 1 ? { employee_code: hits[0].employee_code, full_name: hits[0].full_name } : null;
  };

  const rows = [...byBadge.entries()]
    .map(([badge, info]) => {
      const already = takenEnroll.get(badge);
      return {
        enroll_id: badge,
        machine_name: info.name,
        punch_count: info.count,
        last_seen: info.last,
        matched_code: already || null,
        suggestion: already ? null : suggestFor(info.name),
      };
    })
    .sort((a, b) => (a.matched_code ? 1 : 0) - (b.matched_code ? 1 : 0) || b.punch_count - a.punch_count);

  return {
    machine_count: byBadge.size,
    web_count: employees.length,
    mapped: employees.filter((e) => e.enroll_id != null).length,
    rows,
  };
}

// Lưu ghép enroll_id -> employee_code (mảng {enroll_id, employee_code})
async function saveMatches(pairs) {
  let saved = 0;
  for (const p of pairs || []) {
    if (p.employee_code == null) continue;
    // enroll_id rỗng -> gỡ ghép
    if (p.enroll_id === '' || p.enroll_id == null) {
      await query('UPDATE employees SET enroll_id = NULL WHERE employee_code = $1', [p.employee_code]);
    } else {
      // đảm bảo enroll_id không trùng người khác
      await query('UPDATE employees SET enroll_id = NULL WHERE enroll_id = $1', [Number(p.enroll_id)]);
      await query('UPDATE employees SET enroll_id = $1 WHERE employee_code = $2',
        [Number(p.enroll_id), p.employee_code]);
    }
    saved += 1;
  }
  return { saved };
}

module.exports = { matchTable, saveMatches };
