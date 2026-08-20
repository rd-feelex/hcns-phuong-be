const supabase = require('../config/supabase');

async function list({ search, company, department, status, page = 1, limit = 20 }) {
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

  const [salaries, attendance, summary] = await Promise.all([
    supabase
      .from('salary_records')
      .select('*')
      .eq('employee_code', code)
      .order('month', { ascending: false }),
    supabase
      .from('attendance_records')
      .select('*')
      .eq('employee_code', code)
      .order('month', { ascending: false }),
    supabase
      .from('attendance_summary')
      .select('*')
      .eq('employee_code', code)
      .order('month', { ascending: false }),
  ]);
  for (const r of [salaries, attendance, summary]) {
    if (r.error) throw new Error(r.error.message);
  }

  return {
    ...employee,
    salaries: salaries.data,
    attendance: attendance.data,
    attendance_summary: summary.data,
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
