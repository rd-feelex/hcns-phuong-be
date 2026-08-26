const supabase = require('../config/supabase');
const { createClient } = require('@supabase/supabase-js');

// Client RIÊNG cho việc đăng nhập: signInWithPassword gắn phiên user vào client,
// nếu dùng chung client dữ liệu thì mọi truy vấn sau đó bị RLS chặn hết.
const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function login(email, password) {
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error) {
    const err = new Error('Email hoặc mật khẩu không đúng');
    err.status = 401;
    throw err;
  }
  return {
    access_token: data.session.access_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      role: data.user.user_metadata?.role || 'user',
      full_name: data.user.user_metadata?.full_name || null,
    },
  };
}

async function verify(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    role: data.user.user_metadata?.role || 'user',
    full_name: data.user.user_metadata?.full_name || null,
  };
}

async function listUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);
  return data.users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.user_metadata?.role || 'user',
    full_name: u.user_metadata?.full_name || null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));
}

async function createUser({ email, password, role = 'user', full_name }) {
  if (!email || !password) {
    const err = new Error('Thiếu email hoặc mật khẩu');
    err.status = 400;
    throw err;
  }
  if (password.length < 6) {
    const err = new Error('Mật khẩu tối thiểu 6 ký tự');
    err.status = 400;
    throw err;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, full_name: full_name || null },
  });
  if (error) {
    const err = new Error(error.message);
    err.status = 400;
    throw err;
  }
  return { id: data.user.id, email: data.user.email, role };
}

async function updateUser(id, { password, role, full_name }) {
  const payload = {};
  if (password) payload.password = password;
  if (role || full_name !== undefined) {
    payload.user_metadata = {};
    if (role) payload.user_metadata.role = role;
    if (full_name !== undefined) payload.user_metadata.full_name = full_name;
  }
  const { data, error } = await supabase.auth.admin.updateUserById(id, payload);
  if (error) throw new Error(error.message);
  return { id: data.user.id, email: data.user.email };
}

async function deleteUser(id) {
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}

module.exports = { login, verify, listUsers, createUser, updateUser, deleteUser };
