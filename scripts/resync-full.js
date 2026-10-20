/**
 * Đồng bộ LẠI toàn bộ một tháng từ máy chấm công (full=true).
 * Dùng để phục hồi dữ liệu bị lệch (vd giờ vào bị ghi đè thành giờ ra).
 * Cách chạy:  node scripts/resync-full.js 2026-10
 */
require('dotenv').config();
const sync = require('../src/services/attendanceSync.service');
const { pool } = require('../src/config/db');

(async () => {
  const month = process.argv[2] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  try {
    console.log('Đồng bộ lại toàn bộ tháng', month, '…');
    const r = await sync.sync({ fromMonth: month, full: true });
    console.log('XONG', JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('LỖI', e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
