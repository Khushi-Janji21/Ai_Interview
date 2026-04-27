
import initSqlJs from 'sql.js';

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");
  
  console.log('--- Test 1: db.run then db.exec ---');
  db.run("INSERT INTO test (name) VALUES ('a')");
  let res = db.exec("SELECT last_insert_rowid()");
  console.log('RowID:', res[0].values[0][0]);

  console.log('--- Test 2: db.prepare then db.exec ---');
  const stmt = db.prepare("INSERT INTO test (name) VALUES ('b')");
  stmt.run();
  stmt.free();
  res = db.exec("SELECT last_insert_rowid()");
  console.log('RowID:', res[0].values[0][0]);

  console.log('--- Test 3: db.exec for both ---');
  db.exec("INSERT INTO test (name) VALUES ('c')");
  res = db.exec("SELECT last_insert_rowid()");
  console.log('RowID:', res[0].values[0][0]);
}

test();
