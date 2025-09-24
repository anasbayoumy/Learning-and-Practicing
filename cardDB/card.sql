CREATE DATABASE IF NOT EXISTS cards_db;
USE cards_db;

-- Users table (copied from users_db)
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  entry_date DATETIME,
  expire_date DATETIME
);

-- Cards table
CREATE TABLE IF NOT EXISTS cards (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36),
  some_related_data JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);