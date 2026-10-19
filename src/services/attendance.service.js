const { query } = require('../config/db');

async function list({ month }) {
  const params = [];
  let whereSql = '';
  if (month) {
    params.push(month);
    whereSql = 'WHERE a.month = $1';
  }
  const { rows } = await query(
    `SELECT a.*, e.full_name, e.position, e.department, e.company
     FROM attendance_summary a
     LEFT JOIN employees e ON e.employee_code = a.employee_code
     ${whereSql}
     ORDER BY a.employee_code`,
    params
  );
  return rows;
}

async function detail(code, month) {
  const params = [code];
  let sql = 'SELECT * FROM attendance_records WHERE employee_code = $1';
  if (month) {
    params.push(month);
    sql += ' AND month = $2';
  }
  const { rows } = await query(sql, params);
  return rows;
}

// Ma trận chấm công: mọi nhân sự đang làm việc + days của tháng
async function matrix(month) {
  const { rows } = await query(
    `SELECT e.employee_code, e.full_name, e.department, e.company, e.probation_end_date,
            COALESCE(a.days, '{}'::jsonb) AS days
     FROM employees e
     LEFT JOIN attendance_records a
       ON a.employee_code = e.employee_code AND a.month = $1
     WHERE e.status = 'active'
     ORDER BY e.employee_code`,
    [month]
  );
  return rows.map((r) => ({ ...r, month }));
}

// Khởi tạo tháng mới: mặc định X cho Thứ 2 - Thứ 7, Chủ nhật để trống
async function init(month) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const defaultDays = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    if (new Date(date).getDay() !== 0) defaultDays[date] = 'X';
  }
  const { rows } = await query(
    `INSERT INTO attendance_records (employee_code, month, days)
     SELECT employee_code, $1, $2::jsonb FROM employees
     WHERE status = 'active'
     ON CONFLICT (employee_code, month) DO NOTHING
     RETURNING employee_code`,
    [month, JSON.stringify(defaultDays)]
  );
  return { created: rows.length, month };
}

// Lưu chấm công nhiều nhân viên cùng lúc + cập nhật bảng tổng hợp
async function bulkSave(month, records) {
  const rows = (records || []).map((r) => ({
    employee_code: r.employee_code,
    days: r.days || {},
  }));
  if (!rows.length) return { saved: 0 };

  for (const r of rows) {
    await query(
      `INSERT INTO attendance_records (employee_code, month, days)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (employee_code, month) DO UPDATE SET days = EXCLUDED.days`,
      [r.employee_code, month, JSON.stringify(r.days)]
    );

    let work = 0, leave = 0, unpaid = 0, meal = 0, paid = 0;
    for (const raw of Object.values(r.days)) {
      const v = String(raw).trim().toUpperCase();
      if (v.startsWith('KL')) { unpaid += 1; continue; }
      const credit = v.endsWith('/2') ? 0.5 : 1;
      if (v.startsWith('P')) leave += credit;
      else work += credit;
      if (v === 'X' || v === 'L') meal += 1;
      paid += credit;
    }
    await query(
      `INSERT INTO attendance_summary
         (employee_code, month, total_work_days, total_leave_days,
          unpaid_leave_days, late_days, meal_days, total_paid_days)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
       ON CONFLICT (employee_code, month) DO UPDATE SET
         total_work_days = EXCLUDED.total_work_days,
         total_leave_days = EXCLUDED.total_leave_days,
         unpaid_leave_days = EXCLUDED.unpaid_leave_days,
         meal_days = EXCLUDED.meal_days,
         total_paid_days = EXCLUDED.total_paid_days`,
      [r.employee_code, month, work, leave, unpaid, meal, paid]
    );
  }
  return { saved: rows.length };
}

module.exports = { list, detail, matrix, init, bulkSave };
