const { query } = require('../config/db');

/**
 * Engine tính lương — công thức được đối chiếu từ bảng lương Excel 7/2026:
 *
 * - Lương ngày công = (lương cơ bản + PC điện thoại + xăng xe + chuyên cần
 *   + trách nhiệm) / công chuẩn × công tính lương. Ngày trong thời gian
 *   thử việc tính theo tỷ lệ 85%.
 * - Phụ cấp ăn ca = mức ăn ca/ngày × số ngày đi làm đủ công (X).
 * - Lương KPI = lương hiệu quả công việc × % KPI đạt.
 * - BHXH NLĐ = 10.5% mức đóng BHXH (8% BHXH + 1.5% BHYT + 1% BHTN);
 *   công ty chịu 21.5%; đoàn phí NLĐ 0.5%, kinh phí công đoàn cty 2%.
 * - Giảm trừ gia cảnh 2026: 15.500.000đ bản thân + 6.200.000đ/người phụ thuộc.
 * - Thu nhập miễn thuế: phụ cấp ăn ca + phụ cấp điện thoại (theo thực tế).
 * - Thuế TNCN lũy tiến (biểu 2026 — hai bậc đầu đối chiếu khớp dữ liệu Excel,
 *   các bậc trên lấy theo biểu 5 bậc hiện hành, chỉnh tại TAX_BRACKETS nếu cần).
 */

const SELF_DEDUCTION = 15500000;
const DEPENDENT_DEDUCTION = 6200000;
const PROBATION_RATE = 0.85;
const SI_EMPLOYEE = 0.105;
const SI_COMPANY = 0.215;
const UNION_EMPLOYEE = 0.005;
const UNION_COMPANY = 0.02;

// [mức trần bậc, thuế suất]
const TAX_BRACKETS = [
  [10000000, 0.05],
  [30000000, 0.1],
  [60000000, 0.2],
  [100000000, 0.3],
  [Infinity, 0.35],
];

function progressiveTax(taxable) {
  if (!taxable || taxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const [cap, rate] of TAX_BRACKETS) {
    const band = Math.min(taxable, cap) - prev;
    if (band <= 0) break;
    tax += band * rate;
    prev = cap;
  }
  return Math.round(tax);
}

// Đếm công từ bảng chấm công theo ngày.
// X = đi làm, X/2 = nửa công, P = phép hưởng lương, P/2, KL = không lương, L = nghỉ lễ.
function countAttendance(days = {}, probationEnd) {
  let paidOfficial = 0; // công chính thức
  let paidProbation = 0; // công trong thời gian thử việc
  let workDays = 0;
  let leaveDays = 0;
  let unpaidDays = 0;
  let mealDays = 0;

  const probEnd = probationEnd ? new Date(probationEnd) : null;

  for (const [date, raw] of Object.entries(days)) {
    const v = String(raw).trim().toUpperCase();
    let credit = 0;
    if (v === 'X' || v === 'L' || v === 'LE' || v === 'LỄ') credit = 1;
    else if (v === 'X/2') credit = 0.5;
    else if (v === 'P') credit = 1;
    else if (v === 'P/2') credit = 0.5;
    else if (v === 'X/2+P/2') credit = 1;
    else if (v.startsWith('KL')) credit = 0;
    else if (v.startsWith('X')) credit = 1;
    else if (v.startsWith('P')) credit = 1;

    if (v.startsWith('KL')) unpaidDays += 1;
    else if (v.startsWith('P')) leaveDays += credit;
    else if (credit > 0) workDays += credit;
    if (v === 'X' || v === 'L' || v === 'LE' || v === 'LỄ') mealDays += 1;

    const inProbation = probEnd && new Date(date) <= probEnd;
    if (inProbation) paidProbation += credit;
    else paidOfficial += credit;
  }

  return { paidOfficial, paidProbation, workDays, leaveDays, unpaidDays, mealDays };
}

function computeRow({ employee, baseline, days, input, standardDefault }) {
  const b = baseline || {};
  const inp = input || {};
  const num = (v, d = 0) => (v === null || v === undefined ? d : Number(v));

  const standardWorkdays = num(b.standard_workdays, standardDefault);
  const att = countAttendance(days, employee.probation_end_date);
  const paidWorkdays = att.paidOfficial + att.paidProbation;

  // Lương cứng tháng = cơ bản + các phụ cấp cố định (trừ ăn ca tính theo ngày)
  const fixedMonthly =
    num(b.base_salary) +
    num(b.allowance_phone) +
    num(b.allowance_fuel) +
    num(b.allowance_attendance) +
    num(b.allowance_responsibility);

  const dailyRate = standardWorkdays > 0 ? fixedMonthly / standardWorkdays : 0;
  const salaryByWorkdays =
    dailyRate * att.paidOfficial + dailyRate * PROBATION_RATE * att.paidProbation;

  const mealAllowance = num(b.allowance_meal_per_day) * att.mealDays;
  const phoneActual =
    standardWorkdays > 0
      ? num(b.allowance_phone) * Math.min(paidWorkdays / standardWorkdays, 1)
      : 0;

  const kpiPercent = inp.kpi_percent === null || inp.kpi_percent === undefined ? 1 : Number(inp.kpi_percent);
  const kpiSalary = num(b.kpi_salary_target) * kpiPercent;

  const totalIncome =
    salaryByWorkdays +
    mealAllowance +
    kpiSalary +
    num(inp.business_bonus) +
    num(inp.incentive_bonus) +
    num(inp.arrears) -
    num(inp.other_deduction);

  const insuranceSalary = num(b.insurance_salary);
  const siEmployee = insuranceSalary * SI_EMPLOYEE;
  const siCompany = insuranceSalary * SI_COMPANY;
  const unionEmployee = insuranceSalary * UNION_EMPLOYEE;
  const unionCompany = insuranceSalary * UNION_COMPANY;

  const familyDeduction =
    SELF_DEDUCTION + DEPENDENT_DEDUCTION * num(employee.num_dependents);
  const taxExempt = mealAllowance + phoneActual;
  const taxable = totalIncome - familyDeduction - siEmployee - taxExempt;
  const tax = progressiveTax(taxable);

  const netIncome = totalIncome - siEmployee - unionEmployee - tax;
  const finalReceived = netIncome - num(inp.advance_paid);

  const r = (v) => Math.round(v);
  return {
    employee_code: employee.employee_code,
    company: employee.company || '',
    agreed_salary: num(b.agreed_salary) || null,
    base_salary: num(b.base_salary) || null,
    insurance_salary: insuranceSalary || null,
    allowance_phone: num(b.allowance_phone) || null,
    allowance_fuel: num(b.allowance_fuel) || null,
    allowance_attendance: num(b.allowance_attendance) || null,
    allowance_responsibility: num(b.allowance_responsibility) || null,
    allowance_meal_per_day: num(b.allowance_meal_per_day) || null,
    kpi_salary_target: num(b.kpi_salary_target) || null,
    standard_workdays: standardWorkdays,
    paid_workdays: paidWorkdays,
    salary_by_workdays: r(salaryByWorkdays),
    total_allowance: r(mealAllowance),
    kpi_percent: kpiPercent,
    kpi_salary_actual: r(kpiSalary),
    business_bonus: num(inp.business_bonus),
    incentive_bonus: num(inp.incentive_bonus),
    other_deduction: num(inp.other_deduction),
    total_bonus: r(kpiSalary + num(inp.business_bonus) + num(inp.incentive_bonus)),
    arrears: num(inp.arrears),
    arrears_note: inp.arrears_note || null,
    total_income: r(totalIncome),
    social_insurance_total: r(siEmployee + siCompany + unionEmployee + unionCompany),
    social_insurance_employee: r(siEmployee),
    union_fee_employee: r(unionEmployee),
    personal_income_tax: tax,
    net_income: r(netIncome),
    advance_paid: num(inp.advance_paid),
    final_received: r(finalReceived),
    company_cost: r(finalReceived + siEmployee + siCompany + unionEmployee + unionCompany + tax),
    source: 'computed',
    // Thông tin hiển thị thêm cho màn preview (không lưu DB)
    _extra: {
      full_name: employee.full_name,
      department: employee.department,
      num_dependents: num(employee.num_dependents),
      work_days: att.workDays,
      leave_days: att.leaveDays,
      unpaid_days: att.unpaidDays,
      meal_days: att.mealDays,
      family_deduction: familyDeduction,
      taxable_income: r(taxable),
      has_attendance: Object.keys(days || {}).length > 0,
    },
  };
}

// Lấy bản ghi lương gần nhất (<= tháng tính) làm cơ cấu lương chuẩn của mỗi NV
async function getBaselines(month) {
  const { rows } = await query(
    `SELECT DISTINCT ON (employee_code) *
     FROM salary_records WHERE month <= $1
     ORDER BY employee_code, month DESC`,
    [month]
  );
  return Object.fromEntries(rows.map((r) => [r.employee_code, r]));
}

async function preview(month, { standardWorkdays = 26 } = {}) {
  const [emps, baselines, att, inputs] = await Promise.all([
    // Chỉ tính lương nhân viên chính thức — CTV/TTS có bảng lương riêng
    query(`SELECT * FROM employees WHERE status = 'active' AND employee_type = 'staff'`),
    getBaselines(month),
    query('SELECT * FROM attendance_records WHERE month = $1', [month]),
    query('SELECT * FROM payroll_inputs WHERE month = $1', [month]),
  ]);

  const attMap = Object.fromEntries(att.rows.map((a) => [a.employee_code, a.days]));
  const inputMap = Object.fromEntries(inputs.rows.map((i) => [i.employee_code, i]));

  return emps.rows
    .map((employee) =>
      computeRow({
        employee,
        baseline: baselines[employee.employee_code],
        days: attMap[employee.employee_code] || {},
        input: inputMap[employee.employee_code],
        standardDefault: standardWorkdays,
      })
    )
    .sort((a, b) => a.employee_code.localeCompare(b.employee_code));
}

async function compute(month, options = {}) {
  const rows = await preview(month, options);
  const toSave = rows
    .filter((r) => r._extra.has_attendance)
    .map(({ _extra, ...rest }) => ({ ...rest, month }));

  if (!toSave.length) {
    const err = new Error(`Chưa có dữ liệu chấm công tháng ${month} — hãy chấm công trước khi tính lương`);
    err.status = 400;
    throw err;
  }

  const cols = Object.keys(toSave[0]);
  const updates = cols
    .filter((c) => !['employee_code', 'month', 'company'].includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  for (const row of toSave) {
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    await query(
      `INSERT INTO salary_records (${cols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT (employee_code, month, company) DO UPDATE SET ${updates}`,
      cols.map((c) => row[c])
    );
  }
  return { saved: toSave.length, month };
}

async function getInputs(month) {
  const { rows } = await query('SELECT * FROM payroll_inputs WHERE month = $1', [month]);
  return rows;
}

async function saveInputs(month, items) {
  const rows = (items || []).map((i) => ({
    employee_code: i.employee_code,
    kpi_percent: i.kpi_percent ?? 1,
    business_bonus: i.business_bonus ?? 0,
    incentive_bonus: i.incentive_bonus ?? 0,
    other_deduction: i.other_deduction ?? 0,
    arrears: i.arrears ?? 0,
    arrears_note: i.arrears_note || null,
    advance_paid: i.advance_paid ?? 0,
  }));
  if (!rows.length) return { saved: 0 };
  for (const r of rows) {
    await query(
      `INSERT INTO payroll_inputs
         (employee_code, month, kpi_percent, business_bonus, incentive_bonus,
          other_deduction, arrears, arrears_note, advance_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (employee_code, month) DO UPDATE SET
         kpi_percent = EXCLUDED.kpi_percent,
         business_bonus = EXCLUDED.business_bonus,
         incentive_bonus = EXCLUDED.incentive_bonus,
         other_deduction = EXCLUDED.other_deduction,
         arrears = EXCLUDED.arrears,
         arrears_note = EXCLUDED.arrears_note,
         advance_paid = EXCLUDED.advance_paid`,
      [r.employee_code, month, r.kpi_percent, r.business_bonus, r.incentive_bonus,
        r.other_deduction, r.arrears, r.arrears_note, r.advance_paid]
    );
  }
  return { saved: rows.length };
}

module.exports = { preview, compute, getInputs, saveInputs, computeRow, progressiveTax };
