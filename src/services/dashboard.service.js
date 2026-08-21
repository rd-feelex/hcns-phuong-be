const supabase = require('../config/supabase');

async function stats(month) {
  const [{ data: employees, error: e1 }, { data: salaries, error: e2 }] =
    await Promise.all([
      supabase.from('employees').select('employee_code, company, department, status, employee_type'),
      month
        ? supabase.from('salary_records').select('*').eq('month', month)
        : supabase.from('salary_records').select('*'),
    ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const sum = (field) =>
    salaries.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);

  const groupBy = (rows, keyFn, valFn) => {
    const map = {};
    for (const r of rows) {
      const k = keyFn(r) || 'Khác';
      map[k] = (map[k] || 0) + valFn(r);
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  // Gắn phòng ban/công ty của nhân viên vào bản ghi lương
  const empMap = Object.fromEntries(employees.map((e) => [e.employee_code, e]));
  const salWithDept = salaries.map((s) => ({
    ...s,
    department: empMap[s.employee_code]?.department,
  }));

  // Nhân sự theo công ty đếm theo BẢNG LƯƠNG từng công ty (một người nhận lương
  // ở nhiều công ty được đếm ở từng nơi — khớp với số dòng của từng sheet Excel).
  const empMap0 = Object.fromEntries(employees.map((e) => [e.employee_code, e]));
  const pairs = new Map(); // "company|code" -> {company, code}
  for (const s of salaries) {
    const comp = s.company || empMap0[s.employee_code]?.company || 'Khác';
    pairs.set(`${comp}|${s.employee_code}`, { comp, code: s.employee_code });
  }
  // Nhân viên chưa có bảng lương vẫn được đếm theo công ty chính
  for (const e of employees) {
    const comp = e.company || 'Khác';
    if (![...pairs.keys()].some((k) => k.endsWith(`|${e.employee_code}`))) {
      pairs.set(`${comp}|${e.employee_code}`, { comp, code: e.employee_code });
    }
  }

  // Phòng ban nhóm theo từng công ty: [{ company, total, departments: [{name, value}] }]
  const byCompany = {};
  for (const { comp, code } of pairs.values()) {
    const dept = empMap0[code]?.department || 'Chưa phân phòng ban';
    byCompany[comp] = byCompany[comp] || { company: comp, total: 0, departments: {} };
    byCompany[comp].total += 1;
    byCompany[comp].departments[dept] = (byCompany[comp].departments[dept] || 0) + 1;
  }
  const company_departments = Object.values(byCompany)
    .map((c) => ({
      company: c.company,
      total: c.total,
      departments: Object.entries(c.departments)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    month,
    company_departments,
    total_employees: employees.filter(
      (e) => e.status === 'active' && (e.employee_type || 'staff') === 'staff'
    ).length,
    total_contractors: employees.filter(
      (e) => e.status === 'active' && ['ctv', 'intern'].includes(e.employee_type)
    ).length,
    total_net_pay: sum('final_received'),
    total_income: sum('total_income'),
    total_tax: sum('personal_income_tax'),
    total_insurance: sum('social_insurance_total'),
    total_company_cost: sum('company_cost'),
    headcount_by_company: groupBy([...pairs.values()], (p) => p.comp, () => 1),
    headcount_by_department: groupBy(employees, (e) => e.department, () => 1),
    payroll_by_company: groupBy(salaries, (s) => s.company, (s) => Number(s.final_received) || 0),
    payroll_by_department: groupBy(salWithDept, (s) => s.department, (s) => Number(s.final_received) || 0),
  };
}

module.exports = { stats };
