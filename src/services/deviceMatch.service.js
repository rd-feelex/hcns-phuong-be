const { query } = require('../config/db');
const device = require('./zkdevice.service');

// Bỏ dấu tiếng Việt + chuẩn hoá để so khớp tên gần giống
function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Danh sách người trên máy + gợi ý ghép với nhân viên web
async function matchTable() {
  const [machineUsers, emp] = await Promise.all([
    device.getAllUsers(),
    query('SELECT employee_code, full_name, department, enroll_id FROM employees'),
  ]);

  const employees = emp.rows;
  const takenEnroll = new Map(
    employees.filter((e) => e.enroll_id != null).map((e) => [String(e.enroll_id), e.employee_code])
  );

  // Gợi ý: so khớp tên không dấu. Chỉ gợi ý khi khớp đủ mạnh và DUY NHẤT,
  // để tránh tên máy ngắn ("Linh", "Anh") khớp nhầm nhiều người.
  const empNorm = employees
    .filter((e) => e.enroll_id == null)
    .map((e) => ({ ...e, norm: normalize(e.full_name) }));

  const suggestFor = (machineName) => {
    const un = normalize(machineName);
    if (un.length < 3) return null;
    // 1) khớp tuyệt đối toàn bộ tên
    let hits = empNorm.filter((e) => e.norm === un);
    // 2) tên máy là chuỗi con đủ dài & duy nhất của đúng 1 tên web
    if (!hits.length && un.length >= 5) hits = empNorm.filter((e) => e.norm.includes(un));
    // 3) tên web là chuỗi con của tên máy (máy ghi dài hơn) — hiếm, cần dài
    if (!hits.length && un.length >= 6) hits = empNorm.filter((e) => e.norm.length >= 5 && un.includes(e.norm));
    return hits.length === 1 ? { employee_code: hits[0].employee_code, full_name: hits[0].full_name } : null;
  };

  const rows = machineUsers.map((u) => {
    const already = takenEnroll.get(String(u.id));
    const suggestion = already ? null : suggestFor(u.name);
    return {
      enroll_id: u.id,
      machine_name: u.name,
      has_face: !!u.face,
      matched_code: already || null,
      suggestion,
    };
  });

  return {
    machine_count: machineUsers.length,
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
