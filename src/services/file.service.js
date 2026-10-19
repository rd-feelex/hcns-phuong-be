const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('../config/db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

async function listByEmployee(code) {
  const { rows } = await query(
    `SELECT id, employee_code, file_name, mime, size, uploaded_by, created_at
     FROM employee_files WHERE employee_code = $1 ORDER BY created_at DESC`,
    [code]
  );
  return rows;
}

async function save(code, file, uploadedBy) {
  if (!file) {
    const err = new Error('Chưa chọn file');
    err.status = 400;
    throw err;
  }
  if (file.size > MAX_SIZE) {
    const err = new Error('File tối đa 20MB');
    err.status = 400;
    throw err;
  }
  const ext = path.extname(file.originalname).slice(0, 12);
  const storedName = `${code}_${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), file.buffer);

  // multer để latin1 với tên có dấu -> chuyển về utf8
  const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const { rows } = await query(
    `INSERT INTO employee_files (employee_code, file_name, stored_name, mime, size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, employee_code, file_name, mime, size, uploaded_by, created_at`,
    [code, fileName, storedName, file.mimetype, file.size, uploadedBy]
  );
  return rows[0];
}

async function getFile(id) {
  const { rows } = await query('SELECT * FROM employee_files WHERE id = $1', [id]);
  const f = rows[0];
  if (!f) return null;
  return { ...f, full_path: path.join(UPLOAD_DIR, f.stored_name) };
}

async function remove(id) {
  const f = await getFile(id);
  if (!f) return;
  await query('DELETE FROM employee_files WHERE id = $1', [id]);
  try { fs.unlinkSync(f.full_path); } catch { /* file đã mất trên đĩa */ }
}

module.exports = { listByEmployee, save, getFile, remove };
