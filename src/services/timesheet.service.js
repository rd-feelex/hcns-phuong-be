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

// ===================== BẢNG TÍNH LƯƠNG (BM Chấm công) =====================
const DOW_VN = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const fmtD = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const h2 = (min) => (min == null ? 0 : Math.round(Math.abs(min) / 60 * 100) / 100);
const workCreditOf = (v) => {
  const t = String(v || '').trim().toUpperCase();
  if (t === 'X' || t === 'L') return 1;
  if (t.endsWith('/2')) return 0.5;
  return 0;
};

async function buildPayroll(month) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const emps = (await query(
    `SELECT e.employee_code, e.full_name, e.position, e.department, e.company,
            e.join_date, e.probation_end_date, e.contract_start_date, e.contract_type,
            a.days
     FROM employees e
     LEFT JOIN attendance_records a ON a.employee_code = e.employee_code AND a.month = $1
     WHERE e.status = 'active'
     ORDER BY e.company, e.employee_code`, [month])).rows;

  const daily = (await query(
    `SELECT d.employee_code, e.full_name, e.department, d.work_date::text wd,
            d.check_in, d.check_out, d.diff_minutes, d.worked_minutes, d.status
     FROM attendance_daily d JOIN employees e ON e.employee_code = d.employee_code
     WHERE to_char(d.work_date,'YYYY-MM') = $1 AND e.status = 'active'
       AND d.source IN ('device','corrected')
     ORDER BY d.employee_code, d.work_date`, [month])).rows;

  const wb = new ExcelJS.Workbook();

  // ---- Sheet 1: Chấm công (lưới X/X2) ----
  const s1 = wb.addWorksheet('Chấm công');
  const infoHead = ['Số TT', 'Mã NV', 'Họ tên', 'Chức danh', 'Phòng ban', 'Công ty',
    'Ngày vào cty', 'Ngày KT thử việc', 'Ngày bắt đầu HĐLĐ', 'Phân loại HĐ'];
  const nInfo = infoHead.length;
  const r1 = s1.getRow(1), r2 = s1.getRow(2);
  infoHead.forEach((h, i) => { r1.getCell(i + 1).value = h; s1.mergeCells(1, i + 1, 2, i + 1); });
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    r1.getCell(nInfo + d).value = DOW_VN[dow];
    r2.getCell(nInfo + d).value = d;
  }
  const totalColStart = nInfo + daysInMonth + 1;
  ['Tổng công', 'Nghỉ phép'].forEach((h, i) => { r1.getCell(totalColStart + i).value = h; s1.mergeCells(1, totalColStart + i, 2, totalColStart + i); });
  r1.font = { bold: true }; r2.font = { bold: true };

  let stt = 0;
  for (const e of emps) {
    const days = e.days || {};
    const row = [++stt, e.employee_code, e.full_name, e.position || '', e.department || '', e.company || '',
      fmtD(e.join_date), fmtD(e.probation_end_date), fmtD(e.contract_start_date), e.contract_type || ''];
    let work = 0, leave = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const v = days[`${month}-${String(d).padStart(2, '0')}`] || '';
      row.push(v);
      work += workCreditOf(v);
      const t = String(v).toUpperCase();
      if (t === 'P') leave += 1; else if (t === 'P/2') leave += 0.5;
    }
    row.push(Math.round(work * 100) / 100, Math.round(leave * 100) / 100);
    s1.addRow(row);
  }
  s1.getColumn(1).width = 6; s1.getColumn(2).width = 18; s1.getColumn(3).width = 22;
  s1.getColumn(4).width = 18; s1.getColumn(5).width = 16; s1.getColumn(6).width = 12;
  for (let i = 7; i <= 10; i++) s1.getColumn(i).width = 13;
  for (let d = 0; d < daysInMonth; d++) s1.getColumn(nInfo + 1 + d).width = 4.5;
  s1.views = [{ state: 'frozen', xSplit: nInfo, ySplit: 2 }];

  // ---- Sheet 2: Đi muộn (tổng giờ thiếu/thừa) ----
  const s2 = wb.addWorksheet('Đi muộn');
  s2.addRow(['STT', 'Mã NV', 'Tên nhân viên', 'Tổng giờ thiếu (-)', 'Tổng giờ thừa (+)',
    'Thiếu + Thừa (giờ)', 'Quy đổi thành ngày (÷8)']).font = { bold: true };
  const agg = {};
  for (const d of daily) {
    const a = agg[d.employee_code] || (agg[d.employee_code] = { name: d.full_name, thieu: 0, thua: 0 });
    if (d.diff_minutes < 0) a.thieu += -d.diff_minutes;
    else if (d.diff_minutes > 0) a.thua += d.diff_minutes;
  }
  let i2 = 0;
  for (const [code, a] of Object.entries(agg)) {
    const thieuH = h2(a.thieu), thuaH = h2(a.thua);
    const net = Math.round((thuaH - thieuH) * 100) / 100;
    s2.addRow([++i2, code, a.name, thieuH, thuaH, net, Math.round(net / 8 * 100) / 100]);
  }
  [6, 18, 24, 16, 16, 16, 18].forEach((w, i) => { s2.getColumn(i + 1).width = w; });

  // ---- Sheet 3: Dữ liệu máy chấm công (chi tiết) ----
  const s3 = wb.addWorksheet('Dữ liệu máy chấm công');
  s3.addRow(['STT', 'Mã NV', 'Tên nhân viên', 'Phòng Ban', 'Ngày', 'Thứ', 'Giờ vào', 'Giờ ra',
    'Thiếu (phút)', 'Thừa (phút)', 'Công', 'Tổng giờ', 'Ghi chú']).font = { bold: true };
  let i3 = 0;
  for (const d of daily) {
    const dow = DOW_VN[new Date(`${d.wd}T00:00:00`).getDay()];
    const thieu = d.diff_minutes < 0 ? -d.diff_minutes : 0;
    const thua = d.diff_minutes > 0 ? d.diff_minutes : 0;
    s3.addRow([++i3, d.employee_code, d.full_name, d.department || '', fmtD(d.wd), dow,
      d.check_in ? d.check_in.slice(0, 5) : '', d.check_out ? d.check_out.slice(0, 5) : '',
      thieu, thua, workCreditOf(d.status), h2(d.worked_minutes)]);
  }
  [6, 18, 22, 16, 11, 7, 8, 8, 11, 11, 7, 9, 26].forEach((w, i) => { s3.getColumn(i + 1).width = w; });

  return { workbook: wb, count: emps.length };
}

async function toBufferPayroll(month) {
  const { workbook, count } = await buildPayroll(month);
  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, count };
}

module.exports = { build, toBuffer, standardWorkdays, buildPayroll, toBufferPayroll };
