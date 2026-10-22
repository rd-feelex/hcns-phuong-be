const { query } = require('../config/db');

async function stats(month) {
  const [empRes, salRes] = await Promise.all([
    query('SELECT employee_code, company, department, status, employee_type, contract_type FROM employees'),
    month
      ? query('SELECT * FROM salary_records WHERE month = $1', [month])
      : query('SELECT * FROM salary_records'),
  ]);
  const employees = empRes.rows;
  const salaries = salRes.rows;

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

  const empMap0 = Object.fromEntries(employees.map((e) => [e.employee_code, e]));

  // Nhân sự theo công ty đếm theo BẢNG LƯƠNG từng công ty (khớp từng sheet Excel)
  const pairs = new Map();
  for (const s of salaries) {
    const comp = s.company || empMap0[s.employee_code]?.company || 'Khác';
    pairs.set(`${comp}|${s.employee_code}`, { comp, code: s.employee_code });
  }
  for (const e of employees) {
    const comp = e.company || 'Khác';
    if (![...pairs.keys()].some((k) => k.endsWith(`|${e.employee_code}`))) {
      pairs.set(`${comp}|${e.employee_code}`, { comp, code: e.employee_code });
    }
  }

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

  const salWithDept = salaries.map((s) => ({
    ...s,
    department: empMap0[s.employee_code]?.department,
  }));

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
    by_type: (() => {
      const act = employees.filter((e) => e.status === 'active');
      const isProb = (e) => String(e.contract_type || '').toLowerCase().includes('thử việc');
      return {
        chinh_thuc: act.filter((e) => (e.employee_type || 'staff') === 'staff' && !isProb(e)).length,
        thu_viec: act.filter((e) => (e.employee_type || 'staff') === 'staff' && isProb(e)).length,
        ctv: act.filter((e) => e.employee_type === 'ctv').length,
        intern: act.filter((e) => e.employee_type === 'intern').length,
      };
    })(),
    headcount_by_company: groupBy([...pairs.values()], (p) => p.comp, () => 1),
    headcount_by_department: groupBy(employees, (e) => e.department, () => 1),
    payroll_by_company: groupBy(salaries, (s) => s.company, (s) => Number(s.final_received) || 0),
    payroll_by_department: groupBy(salWithDept, (s) => s.department, (s) => Number(s.final_received) || 0),
  };
}

module.exports = { stats };
