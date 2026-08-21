/**
 * XÓA TOÀN BỘ dữ liệu trên Supabase rồi nạp lại từ JSON trong scripts/data.
 * Chạy: node scripts/reset-seed.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env');
  process.exit(1);
}
const supabase = createClient(url, key);

async function wipe() {
  // Xóa employees sẽ cascade sang salary_records, attendance_*, payroll_inputs
  const { error } = await supabase
    .from('employees')
    .delete()
    .neq('employee_code', '');
  if (error) throw new Error(`Xóa employees: ${error.message}`);
  console.log('✔ Đã xóa toàn bộ dữ liệu cũ');
}

async function main() {
  await wipe();
  require('./seed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
