require('dotenv').config();
const lark = require('../src/services/lark.service');

const CODE = process.argv[2] || '8B032A66-5DDB-4ABC-A12F-0DDA84B0A111';

(async () => {
  const token = await lark.getToken();
  const end = Date.now();
  const start = end - 120 * 24 * 60 * 60 * 1000; // 120 ngày

  // 1) Lấy danh sách instance của loại phiếu này
  let codes = [];
  let pageToken = '';
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({
      approval_code: CODE, start_time: String(start), end_time: String(end), page_size: '100',
    });
    if (pageToken) q.set('page_token', pageToken);
    const r = await lark.request('GET', `/approval/v4/instances?${q.toString()}`, { token });
    if (r.code !== 0) { console.log('LỖI list instances:', JSON.stringify(r)); break; }
    codes.push(...(r.data.instance_code_list || []));
    if (!r.data.has_more) break;
    pageToken = r.data.page_token;
  }
  console.log('Số instance tìm thấy:', codes.length);
  if (!codes.length) { console.log('(không có phiếu nào — kiểm tra approval_code hoặc quyền app)'); return; }

  // 2) Lấy chi tiết vài phiếu đã duyệt để xem cấu trúc form
  for (const ic of codes.slice(0, 3)) {
    const r = await lark.request('GET', `/approval/v4/instances/${ic}`, { token });
    if (r.code !== 0) { console.log('LỖI detail:', JSON.stringify(r)); continue; }
    const d = r.data;
    console.log('\n========== instance', ic, '==========');
    console.log('status:', d.status, '| user_id:', d.user_id, '| serial:', d.serial_number);
    console.log('start/end:', d.start_time, d.end_time);
    console.log('FORM:', d.form);
  }
})();
