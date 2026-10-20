require('dotenv').config();
const { query, pool } = require('../src/config/db');

(async () => {
  const month = process.argv[2] || '2026-10';
  const today = new Date().toISOString().slice(0, 10);

  const { rows } = await query(
    `SELECT d.employee_code, e.full_name, e.status AS emp_status, e.enroll_id,
            d.work_date::text AS work_date, d.check_in, d.check_out, d.worked_minutes,
            d.status, d.source, d.note, d.punches
     FROM attendance_daily d JOIN employees e ON e.employee_code = d.employee_code
     WHERE to_char(d.work_date,'YYYY-MM') = $1
     ORDER BY d.work_date, e.full_name`, [month]);

  const dow = (ds) => new Date(`${ds}T00:00:00`).getDay(); // 0=CN,6=T7

  const issues = { noOut: [], negWorked: [], aftWeekday: [], onePunch: [], futureOrToday: 0 };
  for (const r of rows) {
    const d = dow(r.work_date);
    const isPast = r.work_date < today;
    if (r.source !== 'device') continue;
    if (r.check_in && !r.check_out && isPast && d !== 0) issues.noOut.push(r);
    if (r.worked_minutes != null && r.worked_minutes < 0) issues.negWorked.push(r);
    // Vào buổi chiều (sau 12h) ngày T2-T6 => chỉ nửa ca chiều (có thể do quên quẹt sáng)
    if (r.check_in && r.check_in >= '12:00:00' && d >= 1 && d <= 5) issues.aftWeekday.push(r);
    if (Array.isArray(r.punches) && r.punches.length === 1 && isPast && d !== 0) issues.onePunch.push(r);
  }

  // Nhân viên đang làm, CÓ badge, nhưng KHÔNG có ngày chấm device nào trong tháng
  const active = (await query(
    `SELECT employee_code, full_name, enroll_id FROM employees
     WHERE status='active' AND enroll_id IS NOT NULL`)).rows;
  const haveDevice = new Set(rows.filter((r) => r.source === 'device').map((r) => r.employee_code));
  const zeroDays = active.filter((e) => !haveDevice.has(e.employee_code));

  const p = (r) => `   ${r.work_date} ${r.full_name} | vào ${r.check_in || '-'} ra ${r.check_out || '-'} | ${r.status} | punches=${JSON.stringify(r.punches)}`;

  console.log(`===== AUDIT CHẤM CÔNG ${month} =====`);
  console.log(`Tổng số dòng ngày công: ${rows.length}`);
  console.log(`Nguồn device: ${rows.filter((r) => r.source === 'device').length} | auto(T7 online): ${rows.filter((r) => r.source === 'auto').length} | manual: ${rows.filter((r) => r.source === 'manual').length}`);

  console.log(`\n[1] Thiếu giờ RA (quẹt vào, không quẹt ra) — ${issues.noOut.length} dòng:`);
  issues.noOut.slice(0, 60).forEach((r) => console.log(p(r)));
  if (issues.noOut.length > 60) console.log(`   … +${issues.noOut.length - 60} dòng nữa`);

  console.log(`\n[2] Giờ làm ÂM (bất thường) — ${issues.negWorked.length} dòng:`);
  issues.negWorked.forEach((r) => console.log(p(r)));

  console.log(`\n[3] Vào buổi CHIỀU ngày thường (T2-T6) — ${issues.aftWeekday.length} dòng (nửa ca chiều / có thể quên quẹt sáng):`);
  issues.aftWeekday.slice(0, 40).forEach((r) => console.log(p(r)));
  if (issues.aftWeekday.length > 40) console.log(`   … +${issues.aftWeekday.length - 40} dòng nữa`);

  console.log(`\n[4] Nhân viên đang làm + có badge nhưng 0 ngày chấm máy — ${zeroDays.length} người:`);
  zeroDays.forEach((e) => console.log(`   ${e.full_name} [${e.employee_code}] badge=${e.enroll_id}`));

  await pool.end();
})();
