const { query } = require('../config/db');

const ATT_KEY = 'attendance_time';

// Mặc định (khớp DEFAULT_CONFIG trong attendanceSync.service)
const ATT_DEFAULT = {
  in_grace: '08:30',
  aft_start: '13:00',
  aft_in_grace: '13:30',
  morning_end: '12:00',
  out_std: '17:00',
  out_ot_cap: '17:30',
  sat_in_grace: '08:30',
  sat_out_std: '12:00',
  sat_out_ot_cap: '12:30',
  min_session: 120,
};

async function getAttendanceConfig() {
  const r = await query('SELECT value FROM app_settings WHERE key = $1', [ATT_KEY]);
  return { ...ATT_DEFAULT, ...(r.rows[0]?.value || {}) };
}

async function saveAttendanceConfig(cfg) {
  // chỉ nhận các khoá hợp lệ
  const clean = {};
  for (const k of Object.keys(ATT_DEFAULT)) {
    if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') clean[k] = cfg[k];
  }
  clean.min_session = Number(clean.min_session) || ATT_DEFAULT.min_session;
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
    [ATT_KEY, JSON.stringify(clean)]);
  return { ...ATT_DEFAULT, ...clean };
}

module.exports = { getAttendanceConfig, saveAttendanceConfig, ATT_DEFAULT };
