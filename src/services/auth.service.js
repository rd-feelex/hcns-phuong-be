const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong .env');
const TOKEN_TTL = '7d';

function toPublic(u) {
  return { id: u.id, email: u.email, role: u.role, full_name: u.full_name };
}

async function login(email, password) {
  const { rows } = await query('SELECT * FROM app_users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    const err = new Error('Email hoặc mật khẩu không đúng');
    err.status = 401;
    throw err;
  }
  await query('UPDATE app_users SET last_sign_in_at = now() WHERE id = $1', [user.id]);
  const access_token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
  return { access_token, user: toPublic(user) };
}

function verify(token) {
  try {
    const p = jwt.verify(token, JWT_SECRET);
    return { id: p.sub, email: p.email, role: p.role || 'user', full_name: p.full_name || null };
  } catch {
    return null;
  }
}

async function listUsers() {
  const { rows } = await query(
    'SELECT id, email, role, full_name, created_at, last_sign_in_at FROM app_users ORDER BY created_at'
  );
  return rows;
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
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      `INSERT INTO app_users (email, password_hash, role, full_name)
       VALUES (lower($1), $2, $3, $4) RETURNING id, email, role`,
      [email, hash, role, full_name || null]
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('Email đã tồn tại');
      err.status = 400;
      throw err;
    }
    throw e;
  }
}

async function updateUser(id, { password, role, full_name }) {
  if (password) {
    if (password.length < 6) {
      const err = new Error('Mật khẩu tối thiểu 6 ký tự');
      err.status = 400;
      throw err;
    }
    const hash = await bcrypt.hash(password, 10);
    await query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [hash, id]);
  }
  if (role) await query('UPDATE app_users SET role = $1 WHERE id = $2', [role, id]);
  if (full_name !== undefined && full_name !== null) {
    await query('UPDATE app_users SET full_name = $1 WHERE id = $2', [full_name, id]);
  }
  const { rows } = await query('SELECT id, email, role FROM app_users WHERE id = $1', [id]);
  return rows[0];
}

async function deleteUser(id) {
  await query('DELETE FROM app_users WHERE id = $1', [id]);
}

module.exports = { login, verify, listUsers, createUser, updateUser, deleteUser };
