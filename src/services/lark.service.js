/**
 * Tích hợp Lark Open API (bản .larksuite.com):
 *  - Lấy tenant_access_token
 *  - Giải lark_user_id từ email/điện thoại (Contact API)
 *  - Đẩy giờ chấm vào Lark Attendance (user_flows batch_create)
 *
 * Cần trong .env: LARK_APP_ID, LARK_APP_SECRET
 * (Tùy chọn) LARK_BASE = https://open.larksuite.com/open-apis  (mặc định quốc tế)
 */
const https = require('https');
const { query } = require('../config/db');

const APP_ID = process.env.LARK_APP_ID;
const APP_SECRET = process.env.LARK_APP_SECRET;
const BASE = (process.env.LARK_BASE || 'https://open.larksuite.com/open-apis').replace(/\/$/, '');
const MAPPING_APP_TOKEN = process.env.LARK_MAPPING_APP_TOKEN;
const MAPPING_TABLE = process.env.LARK_MAPPING_TABLE;
// employee_type dùng cho Attendance API ('employee_id' = Lark user_id)
const EMPLOYEE_TYPE = process.env.LARK_EMPLOYEE_TYPE || 'employee_id';
const TIMEZONE = process.env.LARK_TIMEZONE || 'Asia/Ho_Chi_Minh';
const DEFAULT_LOCATION = process.env.LARK_LOCATION || '67A Trương Định';

function isConfigured() {
  return !!(APP_ID && APP_SECRET);
}

function request(method, path, { token, body, query: qs } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    if (qs) for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(url, { method, headers, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Lark trả về dữ liệu lỗi')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Lark không phản hồi')); });
    if (payload) req.write(payload);
    req.end();
  });
}

let cachedToken = null;
let tokenExpire = 0;

async function getToken() {
  if (!isConfigured()) throw new Error('Chưa cấu hình LARK_APP_ID / LARK_APP_SECRET');
  const now = Date.now();
  if (cachedToken && now < tokenExpire - 60000) return cachedToken;
  const r = await request('POST', '/auth/v3/tenant_access_token/internal', {
    body: { app_id: APP_ID, app_secret: APP_SECRET },
  });
  if (r.code !== 0) throw new Error(`Lấy token Lark lỗi: ${r.msg}`);
  cachedToken = r.tenant_access_token;
  tokenExpire = now + (r.expire || 7200) * 1000;
  return cachedToken;
}

function normalizeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Lấy toàn bộ user trong phạm vi app (qua Contact scopes, phân trang)
async function listAllUsers() {
  const token = await getToken();
  const openIds = [];
  let pageToken = '';
  for (let guard = 0; guard < 100; guard++) {
    const r = await request('GET', '/contact/v3/scopes', {
      token,
      query: { user_id_type: 'open_id', page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
    });
    if (r.code !== 0) break;
    openIds.push(...(r.data?.user_ids || []));
    if (!r.data?.has_more) break;
    pageToken = r.data.page_token;
  }

  // batch get thông tin (tối đa 50/lần)
  const users = [];
  for (let i = 0; i < openIds.length; i += 50) {
    const chunk = openIds.slice(i, i + 50);
    const qs = new URLSearchParams();
    qs.set('user_id_type', 'open_id');
    for (const id of chunk) qs.append('user_ids', id);
    const r = await request('GET', `/contact/v3/users/batch?${qs.toString()}`, { token });
    if (r.code === 0) {
      for (const u of r.data?.items || []) {
        users.push({ open_id: u.open_id, name: u.name, email: u.email || '', mobile: u.mobile || '' });
      }
    }
  }
  return users;
}

// Đọc bảng mapping (Bitable) của công ty: Mã Ozo ↔ Mã chấm công ↔ Lark User ID.
// Tự điền enroll_id + lark_user_id vào bảng employees theo Mã Ozo (= employee_code).
async function syncMappingFromBitable() {
  if (!MAPPING_APP_TOKEN || !MAPPING_TABLE) {
    throw new Error('Chưa cấu hình LARK_MAPPING_APP_TOKEN / LARK_MAPPING_TABLE');
  }
  const token = await getToken();
  const records = [];
  let pageToken = '';
  for (let guard = 0; guard < 50; guard++) {
    const path = `/bitable/v1/apps/${MAPPING_APP_TOKEN}/tables/${MAPPING_TABLE}/records/search`
      + `?page_size=500${pageToken ? `&page_token=${pageToken}` : ''}`;
    const r = await request('POST', path, {
      token,
      body: {
        filter: { conjunction: 'and', conditions: [{ field_name: 'Enable', operator: 'is', value: ['Enable'] }] },
        page_size: 500,
      },
    });
    if (r.code !== 0) throw new Error(`Đọc bảng mapping lỗi: ${r.msg}`);
    records.push(...(r.data?.items || []));
    if (!r.data?.has_more) break;
    pageToken = r.data.page_token;
  }

  const txt = (v) => {
    if (Array.isArray(v) && v.length) return (v[0]?.text ?? v[0] ?? '').toString().trim();
    return (v ?? '').toString().trim();
  };

  // Chuẩn bị tra cứu employee_code: theo mã, và theo tên chuẩn hoá (khớp duy nhất)
  const emp = await query('SELECT employee_code, full_name FROM employees');
  const byCode = new Set(emp.rows.map((e) => e.employee_code));
  const byName = {};
  for (const e of emp.rows) {
    const n = normalizeName(e.full_name);
    (byName[n] = byName[n] || []).push(e.employee_code);
  }

  let mappedEnroll = 0, mappedLark = 0, unmatched = 0, created = 0;
  for (const rec of records) {
    const f = rec.fields || {};
    const ozo = txt(f['Mã Ozo']);
    const name = txt(f['Họ tên']);
    const machine = txt(f['Mã chấm công']).replace(/^0+/, '');
    const larkId = txt(f['Lark User ID']);
    const dept = txt(f['Phòng ban']);

    // Tìm employee_code: ưu tiên Mã Ozo khớp, không thì theo tên (duy nhất)
    let code = null;
    if (ozo && byCode.has(ozo)) code = ozo;
    else {
      const hit = byName[normalizeName(name)];
      if (hit && hit.length === 1) code = hit[0];
    }

    // Chưa khớp ai: nếu có Mã Ozo hợp lệ và chưa trùng -> TẠO hồ sơ mới
    if (!code) {
      if (ozo && !byCode.has(ozo) && name) {
        const up = ozo.toUpperCase();
        const etype = up.startsWith('CTV') ? 'ctv' : 'staff';
        const company = up.startsWith('XTRAD') ? 'XTRADING'
          : up.startsWith('OZO') ? 'OZO'
          : up.startsWith('XC') ? 'XCentre'
          : up.startsWith('XE') ? 'XExtra'
          : up.startsWith('XG') ? 'XGlobal' : null;
        try {
          await query(
            `INSERT INTO employees (employee_code, full_name, department, company, employee_type, status)
             VALUES ($1,$2,$3,$4,$5,'active') ON CONFLICT (employee_code) DO NOTHING`,
            [ozo, name, dept || null, company, etype]);
          byCode.add(ozo);
          code = ozo;
          created += 1;
        } catch { /* bỏ qua lỗi tạo */ }
      }
      if (!code) { unmatched += 1; continue; }
    }

    const enroll = /^\d+$/.test(machine) ? Number(machine) : null;
    if (enroll != null) {
      await query('UPDATE employees SET enroll_id = NULL WHERE enroll_id = $1 AND employee_code <> $2', [enroll, code]);
      const u = await query('UPDATE employees SET enroll_id = $1 WHERE employee_code = $2', [enroll, code]);
      if (u.rowCount) mappedEnroll += 1;
    }
    if (larkId) {
      const u = await query('UPDATE employees SET lark_user_id = $1 WHERE employee_code = $2', [larkId, code]);
      if (u.rowCount) mappedLark += 1;
    }
  }
  return { records: records.length, mappedEnroll, mappedLark, unmatched, created };
}

// Map lark_user_id theo TÊN (fallback khi không có bảng mapping)
async function resolveUserIds() {
  if (MAPPING_APP_TOKEN && MAPPING_TABLE) {
    const r = await syncMappingFromBitable();
    return { resolved: r.mappedLark, source: 'bitable', ...r };
  }
  const larkUsers = await listAllUsers();
  if (!larkUsers.length) return { resolved: 0, larkTotal: 0 };
  const { rows } = await query(`SELECT employee_code, full_name FROM employees WHERE lark_user_id IS NULL`);
  const larkByName = {};
  for (const u of larkUsers) {
    const n = normalizeName(u.name);
    (larkByName[n] = larkByName[n] || []).push(u);
  }
  let resolved = 0;
  for (const e of rows) {
    const hit = larkByName[normalizeName(e.full_name)];
    if (hit && hit.length === 1) {
      await query('UPDATE employees SET lark_user_id = $1 WHERE employee_code = $2', [hit[0].open_id, e.employee_code]);
      resolved += 1;
    }
  }
  return { resolved, larkTotal: larkUsers.length, source: 'name' };
}

/**
 * Đẩy các lượt chấm lên Lark Attendance.
 * flows: [{ lark_user_id, check_time(Date), comment }]
 * Lark cần timestamp giây (string). type: 1 = ra, 0 = vào (ta để mặc định theo giờ).
 */
async function pushUserFlows(flows) {
  if (!flows.length) return { pushed: 0, failed: 0 };
  const token = await getToken();
  // Định dạng khớp tool công ty đã chạy: employee_type=employee_id, type=5 (máy
  // chấm công), có time_zone; check_time là Unix giây (string).
  const records = flows.map((f) => ({
    user_id: f.lark_user_id,
    creator_id: f.lark_user_id,
    location_name: f.location_name || DEFAULT_LOCATION,
    check_time: String(Math.floor(new Date(f.check_time).getTime() / 1000)),
    time_zone: TIMEZONE,
    comment: f.comment || 'Đồng bộ từ HCNS (máy chấm công)',
    is_field: false,
    is_wifi: false,
    type: 5,
    photo_urls: [],
  }));

  let pushed = 0;
  const errors = [];
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const r = await request('POST', '/attendance/v1/user_flows/batch_create', {
      token,
      query: { employee_type: EMPLOYEE_TYPE },
      body: { flow_records: batch },
    });
    if (r.code !== 0) errors.push(`${r.msg} (code ${r.code})`);
    else pushed += batch.length;
  }
  if (pushed === 0 && errors.length) throw new Error(`Đẩy Lark lỗi: ${errors[0]}`);
  return { pushed, failed: records.length - pushed, errors };
}

// ---- Gửi tin nhắn / file vào chat Lark (để báo cáo cho HR) ----
const NOTIFY_CHAT = process.env.LARK_NOTIFY_CHAT || null;

// Upload file lên Lark -> file_key (dùng fetch + FormData native của Node 20+)
async function uploadFile(buffer, fileName) {
  const token = await getToken();
  const form = new FormData();
  form.append('file_type', 'stream');
  form.append('file_name', fileName);
  form.append('file', new Blob([buffer]), fileName);
  const res = await fetch(`${BASE}/im/v1/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(`Upload file Lark lỗi: ${j.msg}`);
  return j.data.file_key;
}

async function sendText(chatId, text) {
  const token = await getToken();
  const r = await request('POST', '/im/v1/messages', {
    token,
    query: { receive_id_type: 'chat_id' },
    body: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) },
  });
  if (r.code !== 0) throw new Error(`Gửi tin Lark lỗi: ${r.msg}`);
  return true;
}

async function sendFile(chatId, fileKey) {
  const token = await getToken();
  const r = await request('POST', '/im/v1/messages', {
    token,
    query: { receive_id_type: 'chat_id' },
    body: { receive_id: chatId, msg_type: 'file', content: JSON.stringify({ file_key: fileKey }) },
  });
  if (r.code !== 0) throw new Error(`Gửi file Lark lỗi: ${r.msg}`);
  return true;
}

module.exports = {
  isConfigured, getToken, request, resolveUserIds, pushUserFlows, listAllUsers,
  uploadFile, sendText, sendFile, NOTIFY_CHAT,
};
