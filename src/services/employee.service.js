const supabase = require('../config/supabase');

async function list({ search, company, department, status, type, page = 1, limit = 20 }) {
  const from = (page - 1) * limit;
  let query = supabase
    .from('employees')
    .select('*', { count: 'exact' })
    .order('employee_code')
    .range(from, from + limit - 1);

  if (search) query = query.or(`full_name.ilike.%${search}%,employee_code.ilike.%${search}%`);
  if (company) query = query.eq('company', company);
  if (department) query = query.eq('department', department);
  if (status) query = query.eq('status', status);
  if (type === 'staff') query = query.eq('employee_type', 'staff');
  else if (type === 'contractor') query = query.in('employee_type', ['ctv', 'intern']);
  else if (type) query = query.eq('employee_type', type);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { data, total: count, page: Number(page), limit: Number(limit) };
}

async function getByCode(code) {
  const { data: employee, error } = await supabase
    .from('employees')
    .select('*')
    .eq('employee_code', code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!employee) return null;

  const byCode = (table, order = 'month') =>
    supabase
      .from(table)
      .select('*')
      .eq('employee_code', code)
      .order(order, { ascending: false });

  const [salaries, attendance, summary, ctvSalaries, arrears, ebitda, changes, kpi] =
    await Promise.all([
      byCode('salary_records'),
      byCode('attendance_records'),
      byCode('attendance_summary'),
      byCode('contractor_salaries'),
      byCode('arrears_details'),
      byCode('ebitda_bonuses'),
      byCode('salary_changes', 'effective_date'),
      byCode('kpi_details'),
    ]);
  for (const r of [salaries, attendance, summary]) {
    if (r.error) throw new Error(r.error.message);
  }

  return {
    ...employee,
    salaries: salaries.data,
    attendance: attendance.data,
    attendance_summary: summary.data,
    contractor_salaries: ctvSalaries.data || [],
    arrears: arrears.data || [],
    ebitda: ebitda.data || [],
    salary_changes: changes.data || [],
    kpi_details: kpi.data || [],
  };
}

async function create(payload) {
  const { data, error } = await supabase
    .from('employees')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function update(code, payload) {
  const { data, error } = await supabase
    .from('employees')
    .update(payload)
    .eq('employee_code', code)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function remove(code) {
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('employee_code', code);
  if (error) throw new Error(error.message);
}

async function meta() {
  const { data, error } = await supabase
    .from('employees')
    .select('company, department');
  if (error) throw new Error(error.message);
  const companies = [...new Set(data.map((r) => r.company).filter(Boolean))].sort();
  const departments = [...new Set(data.map((r) => r.department).filter(Boolean))].sort();
  return { companies, departments };
}

module.exports = { list, getByCode, create, update, remove, meta };
