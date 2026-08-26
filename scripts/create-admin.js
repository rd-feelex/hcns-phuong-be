/**
 * Tạo tài khoản quản trị viên đầu tiên.
 * Chạy: node scripts/create-admin.js [email] [password]
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const email = process.argv[2] || 'binhtruong1415@gmail.com';
const password = process.argv[3] || '123456';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin', full_name: 'Quản trị viên' },
  });
  if (error) {
    if (String(error.message).toLowerCase().includes('already')) {
      console.log(`Tài khoản ${email} đã tồn tại — bỏ qua.`);
      return;
    }
    throw new Error(error.message);
  }
  console.log(`✔ Đã tạo quản trị viên: ${data.user.email} (role: admin)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
