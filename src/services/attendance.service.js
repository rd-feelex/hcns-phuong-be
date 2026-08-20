const supabase = require('../config/supabase');

async function list({ month }) {
  let query = supabase
    .from('attendance_summary')
    .select('*, employees(full_name, position, department, company)')
    .order('employee_code');
  if (month) query = query.eq('month', month);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map((r) => ({
    ...r,
    full_name: r.employees?.full_name,
    position: r.employees?.position,
    department: r.employees?.department,
    company: r.employees?.company,
    employees: undefined,
  }));
}

async function detail(code, month) {
  let query = supabase
    .from('attendance_records')
    .select('*')
    .eq('employee_code', code);
  if (month) query = query.eq('month', month);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Ma trận chấm công: mọi nhân viên đang làm việc + days của tháng
async function matrix(month) {
  const [emps, att] = await Promise.all([
    supabase
      .from('employees')
      .select('employee_code, full_name, department, company, probation_end_date')
      .eq('status', 'active')
      .order('employee_code'),
    supabase.from('attendance_records').select('*').eq('month', month),
  ]);
  if (emps.error) throw new Error(emps.error.message);
  if (att.error) throw new Error(att.error.message);
  const map = Object.fromEntries(att.data.map((a) => [a.employee_code, a.days]));
  return emps.data.map((e) => ({ ...e, month, days: map[e.employee_code] || {} }));
}

// Khởi tạo tháng mới: mặc định X cho Thứ 2 - Thứ 7, Chủ nhật để trống
async function init(month) {
  const { data: emps, error: e1 } = await supabase
    .from('employees')
    .select('employee_code')
    .eq('status', 'active');
  if (e1) throw new Error(e1.message);

  const { data: existing, error: e2 } = await supabase
    .from('attendance_records')
    .select('employee_code')
    .eq('month', month);
  if (e2) throw new Error(e2.message);
  const has = new Set(existing.map((r) => r.employee_code));

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const defaultDays = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    if (new Date(date).getDay() !== 0) defaultDays[date] = 'X';
  }

  const rows = emps
    .filter((e) => !has.has(e.employee_code))
    .map((e) => ({ employee_code: e.employee_code, month, days: defaultDays }));
  if (rows.length) {
    const { error } = await supabase.from('attendance_records').insert(rows);
    if (error) throw new Error(error.message);
  }
  return { created: rows.length, month };
}

// Lưu chấm công nhiều nhân viên cùng lúc
async function bulkSave(month, records) {
  const rows = (records || []).map((r) => ({
    employee_code: r.employee_code,
    month,
    days: r.days || {},
  }));
  if (!rows.length) return { saved: 0 };
  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'employee_code,month' });
  if (error) throw new Error(error.message);

  // Cập nhật lại bảng tổng hợp từ days
  const summaries = rows.map((r) => {
    let work = 0, leave = 0, unpaid = 0, meal = 0, paid = 0;
    for (const raw of Object.values(r.days)) {
      const v = String(raw).trim().toUpperCase();
      if (v.startsWith('KL')) { unpaid += 1; continue; }
      const credit = v.endsWith('/2') ? 0.5 : v === 'X/2+P/2' ? 1 : 1;
      if (v.startsWith('P')) leave += credit;
      else work += credit;
      if (v === 'X' || v === 'L') meal += 1;
      paid += credit;
    }
    return {
      employee_code: r.employee_code,
      month,
      total_work_days: work,
      total_leave_days: leave,
      unpaid_leave_days: unpaid,
      late_days: 0,
      meal_days: meal,
      total_paid_days: paid,
    };
  });
  const { error: e2 } = await supabase
    .from('attendance_summary')
    .upsert(summaries, { onConflict: 'employee_code,month' });
  if (e2) throw new Error(e2.message);

  return { saved: rows.length };
}

module.exports = { list, detail, matrix, init, bulkSave };
