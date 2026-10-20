/**
 * Kéo phiếu Lark (quên chấm công + nghỉ phép) đã duyệt về web.
 * node scripts/sync-approvals.js [days]
 */
require('dotenv').config();
const approval = require('../src/services/approval.service');
const { pool } = require('../src/config/db');

(async () => {
  const days = Number(process.argv[2]) || 100;
  try {
    const r = await approval.syncApprovals({ days });
    console.log('KẾT QUẢ:', JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('LỖI', e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
