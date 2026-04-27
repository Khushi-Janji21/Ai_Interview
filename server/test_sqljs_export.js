
import initSqlJs from 'sql.js';

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");
  
  db.run("INSERT INTO test (name) VALUES ('a')");
  console.log('Before export:', db.exec("SELECT last_insert_rowid()")[0].values[0][0]);
  
  db.export();
  console.log('After export:', db.exec("SELECT last_insert_rowid()")[0].values[0][0]);
}

test();
