const supabase = require('../config/supabase');

async function list({ month, company, search }) {
  let query = supabase
    .from('salary_records')
    .select('*, employees(full_name, position, department)')
    .order('employee_code');
  if (month) query = query.eq('month', month);
  if (company) query = query.eq('company', company);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = data.map((r) => ({
    ...r,
    full_name: r.employees?.full_name,
    position: r.employees?.position,
    department: r.employees?.department,
    employees: undefined,
  }));
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.full_name?.toLowerCase().includes(q) ||
        r.employee_code?.toLowerCase().includes(q)
    );
  }
  return rows;
}

async function months() {
  const { data, error } = await supabase.from('salary_records').select('month');
  if (error) throw new Error(error.message);
  return [...new Set(data.map((r) => r.month))].sort().reverse();
}

// Lưu cơ cấu lương chuẩn của nhân viên (bản ghi nền để engine tính các tháng sau).
// Ghi vào salary_records với source='baseline', month = tháng bắt đầu áp dụng.
async function saveBaseline(payload) {
  const {
    employee_code, month, company,
    agreed_salary, base_salary, insurance_salary,
    allowance_phone, allowance_fuel, allowance_attendance,
    allowance_responsibility, allowance_meal_per_day,
    kpi_salary_target, standard_workdays,
  } = payload;
  if (!employee_code || !month) {
    const err = new Error('Thiếu employee_code hoặc month');
    err.status = 400;
    throw err;
  }
  const row = {
    employee_code, month, company: company || '',
    agreed_salary, base_salary, insurance_salary,
    allowance_phone, allowance_fuel, allowance_attendance,
    allowance_responsibility, allowance_meal_per_day,
    kpi_salary_target, standard_workdays,
    source: 'baseline',
  };
  const { data, error } = await supabase
    .from('salary_records')
    .upsert(row, { onConflict: 'employee_code,month,company' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

module.exports = { list, months, saveBaseline };
