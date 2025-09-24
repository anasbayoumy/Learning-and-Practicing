// src/db.js
const mysql = require('mysql2/promise');

const {
  MYSQL_HOST = 'mysql_card',
  MYSQL_PORT = 3306,
  MYSQL_USER = 'root',
  MYSQL_PASS = 'rootpass',
  MYSQL_DB = 'cards_db',
  MYSQL_CONNECTION_LIMIT = 10
} = process.env;

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASS,
  database: MYSQL_DB,
  waitForConnections: true,
  connectionLimit: Number(MYSQL_CONNECTION_LIMIT),
  timezone: 'Z',
});

module.exports = { pool };