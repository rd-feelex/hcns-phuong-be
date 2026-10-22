/**
 * Tích luỹ phép năm: nhân viên chính thức +1 ngày/tháng (tối đa 12/năm).
 * Chạy bởi cron mùng 1 hàng tháng. node scripts/accrue-leave.js [year]
 */
require('dotenv').config();
const leave = require('../src/services/leave.service');
const { pool } = require('../src/config/db');

(async () => {
  const year = process.argv[2] ? Number(process.argv[2]) : undefined;
  try {
    const r = await leave.accrueLeave({ year });
    console.log(new Date().toISOString(), 'ACCRUE', JSON.stringify(r));
  } catch (e) {
    console.error('LỖI', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
