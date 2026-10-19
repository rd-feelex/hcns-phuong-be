/**
 * TEST: gửi bảng công cá nhân tháng cho 1 nhân viên qua Lark bot (direct message).
 * Chạy: node scripts/test-send-report.js <employee_code> [YYYY-MM]
 */
require('dotenv').config();
const lark = require('../src/services/lark.service');
const { query, pool } = require('../src/config/db');

function curMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function sendDM(userId, text) {
  const token = await lark.getToken();
  const https = require('https');
  const body = JSON.stringify({ receive_id: userId, msg_type: 'text', content: JSON.stringify({ text }) });
  return new Promise((resolve, reject) => {
    const req = https.request('https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=user_id',
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function main() {
  const code = process.argv[2];
  const month = process.argv[3] || curMonth();
  const emp = (await query('SELECT * FROM employees WHERE employee_code=$1', [code])).rows[0];
  if (!emp) throw new Error('Không tìm thấy NV');
  if (!emp.lark_user_id) throw new Error('NV chưa có lark_user_id');

  const daily = (await query(
    `SELECT work_date, check_in, check_out, status, diff_minutes, note
     FROM attendance_daily WHERE employee_code=$1 AND to_char(work_date,'YYYY-MM')=$2
     ORDER BY work_date`, [code, month])).rows;

  let work = 0, half = 0;
  const lines = daily.map((d) => {
    if (d.status === 'X') work += 1; else if (d.status === 'X/2') half += 1;
    const io = d.check_in ? `${d.check_in.slice(0,5)}–${(d.check_out||'--').slice(0,5)}` : '(online)';
    const diff = d.diff_minutes ? ` (${d.diff_minutes>0?'+':''}${d.diff_minutes}p)` : '';
    return `  ${d.work_date.toISOString?.().slice(8,10) || String(d.work_date).slice(8,10)}: ${d.status} ${io}${diff}`;
  });
  const total = work + half * 0.5;

  const text = `📋 [THỬ NGHIỆM] Bảng công tháng ${month.split('-').reverse().join('/')} — ${emp.full_name}\n`
    + `Tổng công: ${total} (${work} ngày đủ + ${half} nửa ngày)\n`
    + `Chi tiết:\n${lines.join('\n')}\n\n`
    + `(Đây là bản chạy thử của hệ thống HCNS mới, chưa chính thức.)`;

  console.log(text);
  const r = await sendDM(emp.lark_user_id, text);
  console.log('\nKET QUA GUI LARK:', JSON.stringify(r).slice(0, 200));
  await pool.end();
}
main().catch((e) => { console.error('LOI:', e.message); process.exit(1); });
