require('dotenv').config();
const device = require('../src/services/zkdevice.service');
(async () => {
  const badge = process.argv[2] || '2667';
  const date = process.argv[3] || '2026-10-16';
  const logs = await device.getLogs({ since: new Date(`${date}T00:00:00`) });
  const m = logs.filter((l) => String(l.enrollid) === badge && String(l.time).slice(0, 10) === date);
  console.log(`Badge ${badge} ngày ${date} — máy ghi ${m.length} lượt:`);
  for (const l of m.sort((a, b) => (a.time < b.time ? -1 : 1))) {
    console.log(`  ${l.time} | name="${l.name}"`);
  }
  process.exit(0);
})();
