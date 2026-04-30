const mysql = require('mysql2/promise');

const adminPool = mysql.createPool({
  host:     process.env.DB_HOST         || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER         || 'root',
  password: process.env.DB_PASSWORD     || '',
  database: process.env.DB_NAME         || 'personal_finance',
});

const appPool = mysql.createPool({
  host:     process.env.DB_HOST         || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.APP_DB_USER     || 'app_user',
  password: process.env.APP_DB_PASSWORD || '',
  database: process.env.DB_NAME         || 'personal_finance',
});

module.exports = { adminPool, appPool };
