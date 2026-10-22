const { query } = require('../config/db');

// Lịch sử biến động lương/nhân sự
async function changes({ search, limit = 500 }) {
  const params = [];
  let whereSql = '';
  if (search) {
    params.push(`%${search}%`);
    whereSql = 'WHERE full_name ILIKE $1 OR employee_code ILIKE $1';
  }
  params.push(Number(limit));
  const { rows } = await query(
    `SELECT * FROM salary_changes ${whereSql}
     ORDER BY effective_date DESC NULLS LAST LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function arrears({ month }) {
  const params = [];
  let whereSql = '';
  if (month) {
    params.push(month);
    whereSql = 'WHERE month = $1';
  }
  const { rows } = await query(
    `SELECT * FROM arrears_details ${whereSql} ORDER BY employee_code`,
    params
  );
  return rows;
}

async function ebitda({ month }) {
  const params = [];
  let whereSql = '';
  if (month) {
    params.push(month);
    whereSql = 'WHERE month = $1';
  }
  const { rows } = await query(
    `SELECT * FROM ebitda_bonuses ${whereSql} ORDER BY final_bonus DESC`,
    params
  );
  return rows;
}

async function grades() {
  const { rows } = await query('SELECT * FROM salary_grades ORDER BY grade DESC');
  return rows;
}

async function kpiDetails({ month, sheet }) {
  const where = [];
  const params = [];
  if (month) { params.push(month); where.push(`month = $${params.length}`); }
  if (sheet) { params.push(sheet); where.push(`sheet = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM kpi_details ${whereSql} ORDER BY employee_code`,
    params
  );
  return rows;
}

async function contractorSalaries({ month }) {
  const params = [];
  const where = [`e.status = 'active'`]; // ẩn người đã nghỉ khỏi bảng lương CTV
  if (month) { params.push(month); where.push(`c.month = $${params.length}`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const { rows } = await query(
    `SELECT c.*, e.full_name, e.position, e.department, e.employee_type,
            e.status AS emp_status
     FROM contractor_salaries c
     JOIN employees e ON e.employee_code = c.employee_code
     ${whereSql}
     ORDER BY c.employee_code`,
    params
  );
  return rows;
}

module.exports = { changes, arrears, ebitda, grades, kpiDetails, contractorSalaries };
