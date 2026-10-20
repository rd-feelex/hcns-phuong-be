/**
 * Job đồng bộ chấm công — chạy bởi cron mỗi 15 phút.
 * Gọi trực tiếp service (không qua HTTP), kéo log mới từ máy + tính công + đẩy Lark.
 */
require('dotenv').config();
const sync = require('../src/services/attendanceSync.service');
const approval = require('../src/services/approval.service');
const { pool } = require('../src/config/db');

(async () => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  try {
    const r = await sync.sync({ fromMonth: month });
    console.log(now.toISOString(), 'OK', JSON.stringify(r));
  } catch (e) {
    console.error(now.toISOString(), 'ERR sync', e.message);
    process.exitCode = 1;
  }
  // Kéo phiếu Lark (quên chấm công + nghỉ phép) đã duyệt -> tự áp vào chấm công
  try {
    const a = await approval.syncApprovals({ days: 40 });
    console.log(now.toISOString(), 'APPROVALS', JSON.stringify(a));
  } catch (e) {
    console.error(now.toISOString(), 'ERR approvals', e.message);
  } finally {
    await pool.end();
  }
})();
