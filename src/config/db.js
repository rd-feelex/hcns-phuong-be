const { Pool, types } = require('pg');

// numeric/int8 trả về number thay vì string
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// date (không giờ) trả về chuỗi YYYY-MM-DD để FE hiển thị đúng, không lệch múi giờ
types.setTypeParser(1082, (v) => v);

if (!process.env.DATABASE_URL) {
  throw new Error('Thiếu DATABASE_URL trong .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

// query('SELECT ... WHERE x=$1', [v]) -> { rows }
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
