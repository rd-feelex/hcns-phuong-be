const { query } = require('../config/db');

// Ghi một dòng lịch sử biến động nhân sự
async function logChange(emp, changeType, note) {
  const now = new Date();
  const month = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  await query(
    `INSERT INTO salary_changes
       (month, employee_code, full_name, position, department, change_type, note, effective_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)`,
    [month, emp.employee_code, emp.full_name, emp.position, emp.department, changeType, note]
  );
}

// So sánh hồ sơ cũ/mới -> các biến động cần ghi
function diffChanges(oldE, newE) {
  const out = [];
  const changed = (f) =>
    newE[f] !== undefined && (oldE[f] || '') !== (newE[f] || '');
  if (changed('company')) {
    out.push(['Chuyển công ty', `${oldE.company || '—'} → ${newE.company || '—'}`]);
  }
  if (changed('position')) {
    out.push(['Điều chỉnh chức danh', `${oldE.position || '—'} → ${newE.position || '—'}`]);
  }
  if (changed('department')) {
    out.push(['Chuyển phòng ban', `${oldE.department || '—'} → ${newE.department || '—'}`]);
  }
  if (changed('contract_type')) {
    const label = String(newE.contract_type).toLowerCase().includes('chính thức')
      ? 'Vào chính thức' : 'Đổi loại hợp đồng';
    out.push([label, `${oldE.contract_type || '—'} → ${newE.contract_type}`]);
  }
  if (changed('status')) {
    out.push(newE.status === 'inactive'
      ? ['Nghỉ việc', null]
      : ['Quay lại làm việc', null]);
  }
  return out;
}

async function list({ search, company, department, status, type, missing, page = 1, limit = 20 }) {
  const where = [];
  const params = [];
  const add = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  if (search) {
    const p = add(`%${search}%`);
    where.push(`(full_name ILIKE ${p} OR employee_code ILIKE ${p})`);
  }
  if (company) where.push(`company = ${add(company)}`);
  if (department) where.push(`department = ${add(department)}`);
  if (status) where.push(`status = ${add(status)}`);
  if (type === 'contractor') where.push(`employee_type IN ('ctv','intern')`);
  else if (type) where.push(`employee_type = ${add(type)}`);
  // Lọc thiếu thông tin tích hợp
  if (missing === 'enroll') where.push(`enroll_id IS NULL`);
  else if (missing === 'lark') where.push(`lark_user_id IS NULL`);
  else if (missing === 'any') where.push(`(enroll_id IS NULL OR lark_user_id IS NULL)`);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);

  const { rows } = await query(
    `SELECT *, count(*) OVER() AS _total FROM employees ${whereSql}
     ORDER BY employee_code LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = rows[0] ? Number(rows[0]._total) : 0;
  return {
    data: rows.map(({ _total, ...r }) => r),
    total,
    page: Number(page),
    limit: Number(limit),
  };
}

async function getByCode(code) {
  const emp = await query('SELECT * FROM employees WHERE employee_code = $1', [code]);
  if (!emp.rows.length) return null;

  const byCode = (table, order = 'month DESC') =>
    query(`SELECT * FROM ${table} WHERE employee_code = $1 ORDER BY ${order}`, [code]);

  const [salaries, attendance, summary, ctv, arrears, ebitda, changes, kpi] =
    await Promise.all([
      byCode('salary_records'),
      byCode('attendance_records'),
      byCode('attendance_summary'),
      byCode('contractor_salaries'),
      byCode('arrears_details'),
      byCode('ebitda_bonuses'),
      byCode('salary_changes', 'effective_date DESC NULLS LAST'),
      byCode('kpi_details'),
    ]);

  return {
    ...emp.rows[0],
    salaries: salaries.rows,
    attendance: attendance.rows,
    attendance_summary: summary.rows,
    contractor_salaries: ctv.rows,
    arrears: arrears.rows,
    ebitda: ebitda.rows,
    salary_changes: changes.rows,
    kpi_details: kpi.rows,
  };
}

const EMPLOYEE_COLUMNS = [
  'employee_code', 'full_name', 'position', 'department', 'company',
  'join_date', 'probation_end_date', 'contract_start_date', 'contract_type',
  'contract_number', 'employee_type', 'salary_grade', 'salary_form',
  'num_dependents', 'email', 'phone', 'status', 'enroll_id', 'lark_user_id', 'lark_uid',
];

function pick(payload) {
  const cols = [];
  const vals = [];
  for (const c of EMPLOYEE_COLUMNS) {
    if (payload[c] !== undefined) {
      cols.push(c);
      vals.push(payload[c]);
    }
  }
  return { cols, vals };
}

async function create(payload) {
  const { cols, vals } = pick(payload);
  if (!cols.includes('employee_code') || !cols.includes('full_name')) {
    const err = new Error('Thiếu mã nhân viên hoặc họ tên');
    err.status = 400;
    throw err;
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const { rows } = await query(
      `INSERT INTO employees (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    await logChange(rows[0], 'CBNV mới', `Tạo hồ sơ trên hệ thống`);
    return rows[0];
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('Mã nhân viên đã tồn tại');
      err.status = 400;
      throw err;
    }
    throw e;
  }
}

async function update(code, payload) {
  const { cols, vals } = pick(payload);
  if (!cols.length) return getByCode(code);

  const before = await query('SELECT * FROM employees WHERE employee_code = $1', [code]);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const { rows } = await query(
    `UPDATE employees SET ${sets} WHERE employee_code = $${cols.length + 1} RETURNING *`,
    [...vals, code]
  );
  const updated = rows[0] || null;

  // Tự ghi lịch sử biến động (chuyển công ty, đổi chức danh, nghỉ việc...)
  if (updated && before.rows[0]) {
    for (const [type, note] of diffChanges(before.rows[0], payload)) {
      await logChange(updated, type, note);
    }
  }
  return updated;
}

async function remove(code) {
  await query('DELETE FROM employees WHERE employee_code = $1', [code]);
}

async function meta() {
  const { rows } = await query(
    `SELECT
       array_remove(array_agg(DISTINCT company), NULL) AS companies,
       array_remove(array_agg(DISTINCT department), NULL) AS departments
     FROM employees`
  );
  return {
    companies: (rows[0].companies || []).sort(),
    departments: (rows[0].departments || []).sort(),
  };
}

module.exports = { list, getByCode, create, update, remove, meta };
