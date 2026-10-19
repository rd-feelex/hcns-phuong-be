/**
 * Giao tiếp với máy chấm công khuôn mặt ZK AI qua Web API (port 80).
 * Mỗi lệnh POST /api kèm password. Phân trang getlog theo index, getuserlist theo stn.
 */
const http = require('http');

const HOST = process.env.ZK_HOST || '192.168.1.11';
const PORT = Number(process.env.ZK_PORT || 80);
const PASSWORD = process.env.ZK_PASSWORD || 'admin';

function apiCall(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ ...payload, password: PASSWORD });
    const req = http.request(
      { host: HOST, port: PORT, path: '/api', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 15000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Máy chấm công trả về dữ liệu lỗi')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Máy chấm công không phản hồi')); });
    req.write(body);
    req.end();
  });
}

async function ping() {
  const r = await apiCall({ cmd: 'login', username: 'admin' });
  return { ok: r.result === true, sn: r.sn };
}

// Toàn bộ nhân viên trên máy (id, name, photourl...)
async function getAllUsers() {
  const users = [];
  let stn = 1;
  for (let guard = 0; guard < 50; guard++) {
    const r = await apiCall({ cmd: 'getuserlist', stn });
    const batch = r.record || [];
    users.push(...batch);
    if (batch.length < 50 || users.length >= (r.count || 0)) break;
    stn += 1;
  }
  return users;
}

// Lấy log chấm công. opts: { since: Date } để dừng sớm khi gặp bản ghi cũ hơn.
async function getLogs({ since } = {}) {
  const logs = [];
  let index = 0;
  for (let guard = 0; guard < 4000; guard++) {
    const r = await apiCall({ cmd: 'getlog', index });
    const batch = r.record || [];
    if (!batch.length) break;
    let stop = false;
    for (const rec of batch) {
      if (since && new Date(rec.time) < since) { stop = true; break; }
      logs.push(rec);
    }
    const count = r.count || 0;
    index = (r.to || index + batch.length);
    if (stop || index >= count) break;
  }
  return logs;
}

module.exports = { ping, getAllUsers, getLogs };
