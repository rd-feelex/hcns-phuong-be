/**
 * Job đồng bộ chấm công — chạy bởi cron mỗi 15 phút.
 * Gọi trực tiếp service (không qua HTTP), kéo log mới từ máy + tính công + đẩy Lark.
 */
require('dotenv').config();
const sync = require('../src/services/attendanceSync.service');
const { pool } = require('../src/config/db');

(async () => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  try {
    const r = await sync.sync({ fromMonth: month });
    console.log(now.toISOString(), 'OK', JSON.stringify(r));
  } catch (e) {
    console.error(now.toISOString(), 'ERR', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
