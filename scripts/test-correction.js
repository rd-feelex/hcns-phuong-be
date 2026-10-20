require('dotenv').config();
const sync = require('../src/services/attendanceSync.service');
const { query, pool } = require('../src/config/db');

const CODE = 'OZO06042021VVT';   // Vũ Văn Thắng
const DATE = '2026-08-10';       // ngày anh ấy quẹt 1 lần (08:06), thiếu giờ ra

(async () => {
  console.log('TRƯỚC:', JSON.stringify((await query(
    'SELECT check_in,check_out,status,source,punches FROM attendance_daily WHERE employee_code=$1 AND work_date=$2',
    [CODE, DATE])).rows[0]));

  const r = await sync.applyCorrection(CODE, { date: DATE, check_out: '17:00' });
  console.log('KẾT QUẢ bù:', JSON.stringify(r));

  console.log('SAU:', JSON.stringify((await query(
    'SELECT check_in,check_out,status,source,punches FROM attendance_daily WHERE employee_code=$1 AND work_date=$2',
    [CODE, DATE])).rows[0]));

  // Khôi phục nguyên trạng (device, 1 lượt 08:06)
  await query(
    `UPDATE attendance_daily SET check_out=NULL, worked_minutes=NULL, diff_minutes=NULL,
       source='device', status='X', note='Chỉ có 1 lượt quẹt (quên quẹt ra?) — kiểm tra lại',
       punches='["08:06:19"]'::jsonb, check_in='08:06:00', updated_at=now()
     WHERE employee_code=$1 AND work_date=$2`, [CODE, DATE]);
  console.log('Đã khôi phục nguyên trạng.');
  await pool.end();
})();
