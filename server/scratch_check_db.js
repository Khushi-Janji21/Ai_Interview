
import { initializeDatabase, dbAll } from './db/init.js';

async function check() {
  try {
    await initializeDatabase();
    const sessions = dbAll('SELECT * FROM sessions');
    console.log('Sessions:', JSON.stringify(sessions, null, 2));
    
    const messages = dbAll('SELECT * FROM messages');
    console.log('Messages count:', messages.length);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

check();
