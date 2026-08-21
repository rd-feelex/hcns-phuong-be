const supabase = require('../config/supabase');

// Lịch sử biến động lương/nhân sự
async function changes({ search, limit = 500 }) {
  let query = supabase
    .from('salary_changes')
    .select('*')
    .order('effective_date', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (search) query = query.or(`full_name.ilike.%${search}%,employee_code.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Chi tiết truy thu theo tháng
async function arrears({ month }) {
  let query = supabase.from('arrears_details').select('*').order('employee_code');
  if (month) query = query.eq('month', month);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Thưởng Ebitda theo tháng
async function ebitda({ month }) {
  let query = supabase
    .from('ebitda_bonuses')
    .select('*')
    .order('final_bonus', { ascending: false });
  if (month) query = query.eq('month', month);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Thang bảng lương chuẩn
async function grades() {
  const { data, error } = await supabase
    .from('salary_grades')
    .select('*')
    .order('grade', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// KPI chi tiết
async function kpiDetails({ month, sheet }) {
  let query = supabase.from('kpi_details').select('*').order('employee_code');
  if (month) query = query.eq('month', month);
  if (sheet) query = query.eq('sheet', sheet);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Lương CTV theo tháng
async function contractorSalaries({ month }) {
  let query = supabase
    .from('contractor_salaries')
    .select('*, employees(full_name, position, department, employee_type, status)')
    .order('employee_code');
  if (month) query = query.eq('month', month);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map((r) => ({
    ...r,
    full_name: r.employees?.full_name,
    position: r.employees?.position,
    department: r.employees?.department,
    employee_type: r.employees?.employee_type,
    emp_status: r.employees?.status,
    employees: undefined,
  }));
}

module.exports = { changes, arrears, ebitda, grades, kpiDetails, contractorSalaries };
