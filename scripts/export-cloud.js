/**
 * Export toàn bộ dữ liệu từ Supabase cloud ra JSON (scripts/data/migration/).
 * Chạy trên máy có SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong .env
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TABLES = [
  'employees', 'salary_records', 'attendance_records', 'attendance_summary',
  'payroll_inputs', 'contractor_salaries', 'salary_changes', 'arrears_details',
  'ebitda_bonuses', 'salary_grades', 'kpi_details',
];

async function fetchAll(table) {
  const all = [];
  const SIZE = 1000;
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...data);
    if (data.length < SIZE) break;
  }
  return all;
}

async function main() {
  const dir = path.join(__dirname, 'data', 'migration');
  fs.mkdirSync(dir, { recursive: true });
  for (const t of TABLES) {
    const rows = await fetchAll(t);
    fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows));
    console.log(`✔ ${t}: ${rows.length} rows`);
  }
  // Danh sách tài khoản (không export được mật khẩu — sẽ đặt lại khi import)
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);
  const users = data.users.map((u) => ({
    email: u.email,
    role: u.user_metadata?.role || 'user',
    full_name: u.user_metadata?.full_name || null,
  }));
  fs.writeFileSync(path.join(dir, 'app_users.json'), JSON.stringify(users));
  console.log(`✔ app_users: ${users.length} accounts (mật khẩu sẽ đặt lại 123456)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
