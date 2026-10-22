const { query } = require('../config/db');

/**
 * Quỹ phép năm: entitled (phép năm) + adjusted (điều chỉnh tay) − used (tự tính
 * từ bảng chấm công: P = 1 ngày, P/2 = 0.5 ngày) = còn lại.
 */
async function list(year) {
  const { rows } = await query(
    `WITH used AS (
       SELECT a.employee_code,
              SUM(CASE
                    WHEN upper(v.value) = 'P' THEN 1
                    WHEN upper(v.value) = 'P/2' THEN 0.5
                    WHEN upper(v.value) = 'X/2+P/2' THEN 0.5
                    ELSE 0
                  END) AS used_days
       FROM attendance_records a, jsonb_each_text(a.days) v
       WHERE a.month LIKE $2
       GROUP BY a.employee_code
     )
     SELECT e.employee_code, e.full_name, e.department, e.company, e.employee_type,
            e.join_date,
            COALESCE(lb.entitled, 12) AS entitled,
            COALESCE(lb.adjusted, 0) AS adjusted,
            lb.note,
            COALESCE(u.used_days, 0) AS used,
            COALESCE(lb.entitled, 12) + COALESCE(lb.adjusted, 0)
              - COALESCE(u.used_days, 0) AS remaining
     FROM employees e
     LEFT JOIN leave_balances lb
       ON lb.employee_code = e.employee_code AND lb.year = $1
     LEFT JOIN used u ON u.employee_code = e.employee_code
     WHERE e.status = 'active'
     ORDER BY e.employee_code`,
    [year, `${year}-%`]
  );
  return rows;
}

async function save(year, items) {
  let saved = 0;
  for (const i of items || []) {
    if (!i.employee_code) continue;
    await query(
      `INSERT INTO leave_balances (employee_code, year, entitled, adjusted, note, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (employee_code, year) DO UPDATE SET
         entitled = EXCLUDED.entitled,
         adjusted = EXCLUDED.adjusted,
         note = EXCLUDED.note,
         updated_at = now()`,
      [i.employee_code, year, i.entitled ?? 12, i.adjusted ?? 0, i.note || null]
    );
    saved += 1;
  }
  return { saved };
}

// Ghi phép (P) vào bảng chấm công cho danh sách ngày — dùng cho webhook Lark
async function applyLeaveDates(employee_code, dates, code = 'P') {
  const byMonth = {};
  for (const d of dates || []) {
    const month = String(d).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    (byMonth[month] = byMonth[month] || []).push(String(d).slice(0, 10));
  }
  for (const [month, days] of Object.entries(byMonth)) {
    const patch = Object.fromEntries(days.map((d) => [d, code]));
    await query(
      `INSERT INTO attendance_records (employee_code, month, days)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (employee_code, month)
       DO UPDATE SET days = attendance_records.days || EXCLUDED.days`,
      [employee_code, month, JSON.stringify(patch)]
    );
  }
  return { months: Object.keys(byMonth).length, days: (dates || []).length };
}

/**
 * Tích luỹ phép năm: nhân viên CHÍNH THỨC được +1 ngày/tháng (tối đa 12/năm).
 * Tính theo số tháng kể từ đầu năm (hoặc từ tháng vào chính thức) đến tháng hiện tại.
 * Đặt entitled = số đã tích luỹ (giữ nguyên "adjusted" là điều chỉnh tay).
 * Idempotent: chạy lại cho ra cùng kết quả (an toàn để cron chạy hàng tháng).
 */
async function accrueLeave({ year, perMonth = 1, maxPerYear = 12 } = {}) {
  const now = new Date();
  const Y = year || now.getFullYear();
  const curIdx = (Y === now.getFullYear()) ? now.getMonth() : 11; // 0-11; năm cũ = đủ 12 tháng
  const emps = (await query(
    `SELECT employee_code, employee_type, join_date, contract_start_date
     FROM employees WHERE status='active'`)).rows;

  let staff = 0;
  for (const e of emps) {
    let accrued = 0;
    if (e.employee_type === 'staff') {
      // tháng bắt đầu tính trong năm
      let startIdx = 0;
      const start = e.contract_start_date || e.join_date;
      if (start) {
        const d = new Date(start);
        if (d.getFullYear() > Y) { accrued = 0; }
        else if (d.getFullYear() === Y) startIdx = d.getMonth();
      }
      accrued = Math.min(maxPerYear, Math.max(0, (curIdx - startIdx + 1) * perMonth));
      staff += 1;
    }
    await query(
      `INSERT INTO leave_balances (employee_code, year, entitled, adjusted, updated_at)
       VALUES ($1,$2,$3,0, now())
       ON CONFLICT (employee_code, year) DO UPDATE SET entitled = $3, updated_at = now()`,
      [e.employee_code, Y, accrued]);
  }
  return { year: Y, staff, total: emps.length };
}

module.exports = { list, save, applyLeaveDates, accrueLeave };
