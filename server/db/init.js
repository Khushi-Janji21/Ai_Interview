import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'interview.db');

let db;

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Auto-save every 30 seconds
setInterval(saveDb, 30000);

export function getDb() {
  return db;
}

// Helper functions to match better-sqlite3 API style
export function dbRun(sql, params = []) {
  db.run(sql, params);
  const lastInsertRowid = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
  saveDb();
  return { lastInsertRowid };
}

export function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    const columns = stmt.getColumnNames();
    const values = stmt.get();
    result = {};
    columns.forEach((col, i) => {
      result[col] = values[i];
    });
  }
  stmt.free();
  return result;
}

export function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  const columns = stmt.getColumnNames();
  while (stmt.step()) {
    const values = stmt.get();
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    results.push(row);
  }
  stmt.free();
  return results;
}

export async function initializeDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      target_role TEXT DEFAULT '',
      skills TEXT DEFAULT '',
      experience_years INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      interview_type TEXT NOT NULL CHECK(interview_type IN ('Technical', 'HR', 'Behavioral', 'Mixed')),
      job_role TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
      status TEXT DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'abandoned')),
      current_question INTEGER DEFAULT 0,
      overall_score INTEGER DEFAULT 0,
      communication_score INTEGER DEFAULT 0,
      technical_score INTEGER DEFAULT 0,
      confidence_score INTEGER DEFAULT 0,
      relevance_score INTEGER DEFAULT 0,
      strengths TEXT DEFAULT '[]',
      weaknesses TEXT DEFAULT '[]',
      tips TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('interviewer', 'candidate')),
      content TEXT NOT NULL,
      question_number INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Create indexes (ignore if exists)
  try { db.run('CREATE INDEX idx_sessions_user_id ON sessions(user_id)'); } catch(e) {}
  try { db.run('CREATE INDEX idx_messages_session_id ON messages(session_id)'); } catch(e) {}
  try { db.run('CREATE INDEX idx_sessions_status ON sessions(status)'); } catch(e) {}

  // Seed admin account if not exists
  const adminCheck = dbGet('SELECT id FROM users WHERE email = ?', ['admin@interview.ai']);
  if (!adminCheck) {
    const hash = bcrypt.hashSync('admin123', 10);
    dbRun(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ['Admin', 'admin@interview.ai', hash, 'admin']
    );
    console.log('✅ Default admin account created (admin@interview.ai / admin123)');
  }

  saveDb();
  console.log('✅ Database initialized successfully');
  return db;
}
