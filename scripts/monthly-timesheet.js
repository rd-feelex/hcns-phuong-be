/**
 * Chạy đầu mỗi tháng (mùng 1, 8h sáng): tạo báo cáo chấm công tháng TRƯỚC
 * đúng template Lark, lưu file + gửi vào chat HR trên Lark để up Verification.
 * Chạy thủ công cho 1 tháng: node scripts/monthly-timesheet.js 2026-10
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const timesheet = require('../src/services/timesheet.service');
const lark = require('../src/services/lark.service');
const { pool } = require('../src/config/db');

function prevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const month = process.argv[2] || prevMonth();
  const [y, m] = month.split('-');
  // Hạn phản hồi: ngày 8 tháng sau
  const deadline = `08/${String(Number(m) % 12 + 1).padStart(2, '0')}/${Number(m) === 12 ? Number(y) + 1 : y}`;

  const { buffer, count } = await timesheet.toBuffer(month, { deadline });
  const dir = path.join(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `Bao-cao-cham-cong-${month}.xlsx`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  console.log(`✔ Đã tạo ${fileName} (${count} nhân viên) tại ${filePath}`);

  // Gửi vào chat HR trên Lark (nếu cấu hình)
  if (lark.isConfigured() && lark.NOTIFY_CHAT) {
    try {
      const mmYY = `${m}/${y}`;
      await lark.sendText(lark.NOTIFY_CHAT,
        `📋 Báo cáo chấm công tháng ${mmYY} đã sẵn sàng (${count} nhân viên).\n`
        + `Phòng HCNS vui lòng tải file bên dưới và up lên Lark → Attendance → Timesheet Verification để gửi CBNV xác nhận.\n`
        + `Hạn phản hồi: trước 12h ngày ${deadline}.`);
      const fileKey = await lark.uploadFile(Buffer.from(buffer), fileName);
      await lark.sendFile(lark.NOTIFY_CHAT, fileKey);
      console.log('✔ Đã gửi file vào chat HR trên Lark');
    } catch (e) {
      console.error('Gửi Lark lỗi (file vẫn đã lưu trên server):', e.message);
    }
  } else {
    console.log('(Chưa cấu hình LARK_NOTIFY_CHAT — bỏ qua gửi Lark, file đã lưu trên server)');
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
