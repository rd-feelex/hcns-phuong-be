/**
 * TEST có kiểm soát: đẩy chấm công của MỘT nhân viên, MỘT ngày lên Lark.
 * Chạy: node scripts/test-lark-push.js <employee_code> [YYYY-MM-DD]
 */
require('dotenv').config();
const device = require('../src/services/zkdevice.service');
const lark = require('../src/services/lark.service');
const { computeDay } = require('../src/services/attendanceSync.service');
const { query, pool } = require('../src/config/db');

async function main() {
  const code = process.argv[2];
  const dateArg = process.argv[3]; // optional
  if (!code) throw new Error('Cần employee_code');

  const emp = (await query(
    'SELECT employee_code, full_name, enroll_id, lark_user_id FROM employees WHERE employee_code = $1', [code]
  )).rows[0];
  if (!emp) throw new Error('Không tìm thấy nhân viên');
  if (!emp.enroll_id) throw new Error('Nhân viên chưa có enroll_id (mã máy)');
  if (!emp.lark_user_id) throw new Error('Nhân viên chưa có lark_user_id');
  console.log(`NV: ${emp.full_name} | enroll_id=${emp.enroll_id} | lark=${emp.lark_user_id}`);

  // Đọc log tháng này từ máy, lọc đúng người
  const since = new Date();
  since.setDate(1); since.setHours(0, 0, 0, 0);
  const logs = (await device.getLogs({ since })).filter((l) => String(l.enrollid) === String(emp.enroll_id));
  console.log(`Log cua nguoi nay trong thang: ${logs.length} luot`);

  // Gom theo ngày
  const byDate = {};
  for (const l of logs) {
    const d = l.time.slice(0, 10);
    (byDate[d] = byDate[d] || []).push(new Date(l.time));
  }
  const dates = Object.keys(byDate).sort();
  const target = dateArg || dates[dates.length - 1];
  if (!byDate[target]) throw new Error(`Không có log ngày ${target}. Các ngày có: ${dates.join(', ')}`);

  const res = computeDay(byDate[target]);
  console.log(`Ngay ${target}: vao ${res.check_in} ra ${res.check_out || '-'} | cong ${res.status} | ${res.note}`);

  // Chuẩn bị flows: vào + ra
  const flows = [];
  if (res.check_in) flows.push({ lark_user_id: emp.lark_user_id, type: 0, check_time: `${target}T${res.check_in}+07:00`, comment: 'TEST khuôn mặt (HCNS)' });
  if (res.check_out) flows.push({ lark_user_id: emp.lark_user_id, type: 1, check_time: `${target}T${res.check_out}+07:00`, comment: 'TEST khuôn mặt (HCNS)' });
  console.log('Se day len Lark:', flows.map((f) => `${f.check_time}`).join(', '));

  const r = await lark.pushUserFlows(flows);
  console.log('KET QUA DAY LARK:', JSON.stringify(r));
  await pool.end();
}

main().catch((e) => { console.error('LOI:', e.message); process.exit(1); });
