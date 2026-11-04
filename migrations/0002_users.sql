-- Accounts beyond the admin login in the Worker secrets. Passwords are PBKDF2 hashes.
CREATE TABLE users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Who a course belongs to. NULL means the admin account from USER_NAME and PW.
ALTER TABLE courses ADD COLUMN owner TEXT;
CREATE INDEX courses_owner ON courses(owner, created_at);
