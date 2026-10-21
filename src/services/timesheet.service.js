/**
 * Tạo file Excel báo cáo chấm công đúng template Lark Timesheet Verification.
 * Cột: UserID | Name | Department | Employee ID | 1..N (ngày) | Tổng công chuẩn |
 *      Tổng công làm việc | Nghỉ phép năm | Tổng công hưởng lương | Số giờ thiếu | Ghi chú
 */
const ExcelJS = require('exceljs');
const { query } = require('../config/db');

// Số công của 1 ký hiệu (X=1, X/2=0.5, L=1 nghỉ lễ hưởng lương, P=phép, KL=0)
function workCredit(v) {
  const t = String(v || '').trim().toUpperCase();
  if (t === 'X' || t === 'L') return 1;
  if (t === 'X/2') return 0.5;
  if (t === 'X/2+P/2') return 0.5; // nửa làm
  return 0;
}
function leaveCredit(v) {
  const t = String(v || '').trim().toUpperCase();
  if (t === 'P') return 1;
  if (t === 'P/2') return 0.5;
  if (t === 'X/2+P/2') return 0.5;
  return 0;
}

// Số công chuẩn của tháng: T2–T6 = 1, T7 = 0.5, CN = 0
function standardWorkdays(year, month) {
  const days = new Date(year, month, 0).getDate();
  let total = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0) continue;
    total += dow === 6 ? 0.5 : 1;
  }
  return total;
}

async function build(month, { deadline, codes } = {}) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const stdDays = standardWorkdays(y, m);

  const params = [month];
  let codeFilter = '';
  if (Array.isArray(codes) && codes.length) {
    params.push(codes);
    codeFilter = `AND e.employee_code = ANY($${params.length})`;
  }

  // Nhân viên có UserID Lark + bảng chấm công tháng + giờ thiếu
  const emps = (await query(
    `SELECT e.employee_code, e.full_name, e.lark_uid, e.lark_dept, e.department,
            a.days,
            COALESCE((SELECT -sum(diff_minutes) FROM attendance_daily d
                      WHERE d.employee_code = e.employee_code
                        AND to_char(d.work_date,'YYYY-MM') = $1
                        AND d.diff_minutes < 0), 0) AS deficit_minutes
     FROM employees e
     LEFT JOIN attendance_records a
       ON a.employee_code = e.employee_code AND a.month = $1
     WHERE e.status = 'active' AND e.lark_uid IS NOT NULL ${codeFilter}
     ORDER BY e.employee_code`,
    params
  )).rows;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('cbnv');

  // Hàng 1: hướng dẫn (Lark cho phép xoá, giữ để giống template gốc)
  ws.getCell('A1').value =
    'Instructions:\n1.You can delete this instruction row before uploading your file.\n2.We use UserID to identify and match each user.';

  // Hàng 2: tiêu đề
  const headers = ['UserID', 'Name', 'Department', 'Employee ID'];
  for (let d = 1; d <= daysInMonth; d++) headers.push(String(d));
  headers.push('Tổng công chuẩn', 'Tổng công làm việc', 'Nghỉ phép năm',
    'Tổng công hưởng lương', 'Số giờ thiếu', 'Ghi chú');
  ws.addRow([]); // chiếm hàng 1 (instructions ở A1)
  const headerRow = ws.getRow(2);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  headerRow.font = { bold: true };

  const ghiChu = deadline
    ? `Hạn phản hồi: trước 12h ngày ${deadline}. Anh/Chị vui lòng kiểm tra và xác nhận.`
    : 'Anh/Chị vui lòng kiểm tra và xác nhận bảng công.';

  for (const e of emps) {
    const days = e.days || {};
    const row = [e.lark_uid, e.full_name, e.lark_dept || e.department || '', e.employee_code];
    let work = 0, leave = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const v = days[date] || '';
      row.push(v);
      work += workCredit(v);
      leave += leaveCredit(v);
    }
    const deficitHours = Math.round((Number(e.deficit_minutes) || 0) / 60 * 100) / 100;
    row.push(
      stdDays,                       // Tổng công chuẩn
      Math.round(work * 100) / 100,  // Tổng công làm việc
      Math.round(leave * 100) / 100, // Nghỉ phép năm
      Math.round((work + leave) * 100) / 100, // Tổng công hưởng lương
      deficitHours,                  // Số giờ thiếu
      ghiChu
    );
    ws.addRow(row);
  }

  // Độ rộng cột cơ bản
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 24;
  ws.getColumn(4).width = 16;
  for (let d = 0; d < daysInMonth; d++) ws.getColumn(5 + d).width = 4;

  return { workbook: wb, count: emps.length, stdDays };
}

async function toBuffer(month, opts) {
  const { workbook, count, stdDays } = await build(month, opts);
  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, count, stdDays };
}

module.exports = { build, toBuffer, standardWorkdays };
