const { query } = require('../config/db');

async function list({ month, company, search }) {
  const where = [];
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };

  if (month) where.push(`s.month = ${add(month)}`);
  if (company) where.push(`s.company = ${add(company)}`);
  if (search) {
    const p = add(`%${search}%`);
    where.push(`(e.full_name ILIKE ${p} OR s.employee_code ILIKE ${p})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT s.*, e.full_name, e.position, e.department
     FROM salary_records s
     LEFT JOIN employees e ON e.employee_code = s.employee_code
     ${whereSql}
     ORDER BY s.employee_code`,
    params
  );
  return rows;
}

async function months() {
  const { rows } = await query(
    'SELECT DISTINCT month FROM salary_records ORDER BY month DESC'
  );
  return rows.map((r) => r.month);
}

const BASELINE_COLUMNS = [
  'agreed_salary', 'base_salary', 'insurance_salary',
  'allowance_phone', 'allowance_fuel', 'allowance_attendance',
  'allowance_responsibility', 'allowance_meal_per_day',
  'kpi_salary_target', 'standard_workdays',
];

// Cơ cấu lương chuẩn (bản ghi nền để engine tính các tháng sau)
async function saveBaseline(payload) {
  const { employee_code, month, company } = payload;
  if (!employee_code || !month) {
    const err = new Error('Thiếu employee_code hoặc month');
    err.status = 400;
    throw err;
  }

  // Lịch sử tăng/giảm lương: so với cơ cấu gần nhất trước đó
  const prev = await query(
    `SELECT base_salary, agreed_salary FROM salary_records
     WHERE employee_code = $1 ORDER BY month DESC LIMIT 1`,
    [employee_code]
  );
  const old = prev.rows[0];
  const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('vi-VN'));
  if (old) {
    const notes = [];
    if (payload.base_salary != null && Number(old.base_salary) !== Number(payload.base_salary)) {
      notes.push(`Lương cơ bản: ${fmt(old.base_salary)} → ${fmt(payload.base_salary)}`);
    }
    if (payload.agreed_salary != null && Number(old.agreed_salary) !== Number(payload.agreed_salary)) {
      notes.push(`Thu nhập thỏa thuận: ${fmt(old.agreed_salary)} → ${fmt(payload.agreed_salary)}`);
    }
    if (notes.length) {
      const emp = await query(
        'SELECT employee_code, full_name, position, department FROM employees WHERE employee_code = $1',
        [employee_code]
      );
      if (emp.rows[0]) {
        const now = new Date();
        await query(
          `INSERT INTO salary_changes
             (month, employee_code, full_name, position, department, change_type, note, effective_date)
           VALUES ($1, $2, $3, $4, $5, 'Điều chỉnh lương', $6, $7)`,
          [`${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
            emp.rows[0].employee_code, emp.rows[0].full_name, emp.rows[0].position,
            emp.rows[0].department, `${notes.join(' · ')} (áp dụng từ ${month})`,
            `${month}-01`]
        );
      }
    }
  }
  const cols = ['employee_code', 'month', 'company', 'source', ...BASELINE_COLUMNS];
  const vals = [employee_code, month, company || '', 'baseline',
    ...BASELINE_COLUMNS.map((c) => payload[c] ?? null)];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = ['source', ...BASELINE_COLUMNS]
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  const { rows } = await query(
    `INSERT INTO salary_records (${cols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (employee_code, month, company) DO UPDATE SET ${updates}
     RETURNING *`,
    vals
  );
  return rows[0];
}

module.exports = { list, months, saveBaseline };
