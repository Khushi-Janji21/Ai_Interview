
import { initializeDatabase, dbAll } from './db/init.js';

async function check() {
  try {
    await initializeDatabase();
    console.log('--- SESSIONS ---');
    const sessions = dbAll('SELECT * FROM sessions');
    console.log(sessions);
    
    console.log('--- USERS ---');
    const users = dbAll('SELECT id, name, email FROM users');
    console.log(users);

    console.log('--- LAST ROWID TEST ---');
    const { dbRun } = await import('./db/init.js');
    const res = dbRun("INSERT INTO sessions (user_id, interview_type, job_role, difficulty) VALUES (?, ?, ?, ?)", 
      [users[0]?.id || 1, 'Technical', 'Test', 'Beginner']);
    console.log('Result of test insert:', res);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

check();
