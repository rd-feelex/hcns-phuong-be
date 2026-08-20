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

  await upsertChunks('employees', employees, 'employee_code');
  await upsertChunks('salary_records', salaries, 'employee_code,month,company');
  await upsertChunks('attendance_records', attendance, 'employee_code,month');
  await upsertChunks('attendance_summary', summary, 'employee_code,month');
  await upsertChunks('payroll_inputs', inputs, 'employee_code,month');
  console.log('Seed hoàn tất.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
