/**
 * Seed dữ liệu từ file Excel lương tháng 7/2026 (đã trích xuất ra JSON) vào Supabase.
 * Chạy: node scripts/seed.js  (cần .env với SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env');
  process.exit(1);
}
const supabase = createClient(url, key);

const load = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'data', name), 'utf-8'));

const loadOptional = (name) => {
  const p = path.join(__dirname, 'data', name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : [];
};

const dedupe = (rows, keyFn) => {
  const seen = new Set();
  return rows.filter((r) => {
    const k = keyFn(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

async function upsertChunks(table, rows, onConflict) {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`✔ ${table}: ${rows.length} rows`);
}

// Bảng không có khóa tự nhiên: xóa theo tháng (hoặc toàn bộ) rồi chèn lại
async function replaceRows(table, rows, months) {
  if (months?.length) {
    const { error } = await supabase.from(table).delete().in('month', months);
    if (error) throw new Error(`${table} (delete): ${error.message}`);
  } else {
    const { error } = await supabase.from(table).delete().gte('created_at', '1970-01-01');
    if (error) throw new Error(`${table} (delete): ${error.message}`);
  }
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`✔ ${table}: ${rows.length} rows`);
}

async function main() {
  const employees = dedupe(load('seed_employees.json'), (r) => r.employee_code);
  const salaries = dedupe(
    load('seed_salaries.json').map((r) => ({ ...r, company: r.company || '' })),
    (r) => `${r.employee_code}|${r.month}|${r.company}`
  );
  const attendance = dedupe(
    load('seed_attendance.json'),
    (r) => `${r.employee_code}|${r.month}`
  );
  const summary = dedupe(
    load('seed_attendance_summary.json'),
    (r) => `${r.employee_code}|${r.month}`
  );

  const inputs = dedupe(
    load('seed_payroll_inputs.json'),
    (r) => `${r.employee_code}|${r.month}`
  );

  // Nhân sự CTV/TTS + chấm công của họ (file optional, sinh bởi extract_extra.py)
  const ctvEmployees = dedupe(loadOptional('seed_ctv_employees.json'), (r) => r.employee_code)
    .filter((r) => !employees.some((e) => e.employee_code === r.employee_code));
  const allEmployees = employees
    .concat(ctvEmployees)
    .map((e) => ({
      ...e,
      employee_type: e.employee_type || 'staff',
      num_dependents: e.num_dependents ?? 0,
    }));
  const ctvAttendance = dedupe(loadOptional('seed_ctv_attendance.json'), (r) => `${r.employee_code}|${r.month}`);
  const ctvSummary = dedupe(loadOptional('seed_ctv_attendance_summary.json'), (r) => `${r.employee_code}|${r.month}`);
  const ctvSalaries = dedupe(
    loadOptional('seed_ctv_salaries.json').map((r) => ({ ...r, company: r.company || '' })),
    (r) => `${r.employee_code}|${r.month}|${r.company}`
  );

  await upsertChunks('employees', allEmployees, 'employee_code');
  await upsertChunks('salary_records', salaries, 'employee_code,month,company');
  await upsertChunks('attendance_records', attendance.concat(ctvAttendance), 'employee_code,month');
  await upsertChunks('attendance_summary', summary.concat(ctvSummary), 'employee_code,month');
  await upsertChunks('payroll_inputs', inputs, 'employee_code,month');
  await upsertChunks('contractor_salaries', ctvSalaries, 'employee_code,month,company');

  // Các bảng dữ liệu bổ sung
  const changes = loadOptional('seed_salary_changes.json');
  const arrears = loadOptional('seed_arrears.json');
  const ebitda = loadOptional('seed_ebitda.json');
  const kpi = loadOptional('seed_kpi_details.json');
  const grades = loadOptional('seed_grades.json');
  if (changes.length) await replaceRows('salary_changes', changes, null);
  if (arrears.length) await replaceRows('arrears_details', arrears, [...new Set(arrears.map((r) => r.month))]);
  if (ebitda.length) await replaceRows('ebitda_bonuses', ebitda, [...new Set(ebitda.map((r) => r.month))]);
  if (kpi.length) await replaceRows('kpi_details', kpi, [...new Set(kpi.map((r) => r.month))]);
  if (grades.length) await upsertChunks('salary_grades', grades, 'grade,title');
  console.log('Seed hoàn tất.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
