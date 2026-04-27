
import initSqlJs from 'sql.js';

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");
  db.run("INSERT INTO test (name) VALUES ('hello')");
  const res = db.exec("SELECT last_insert_rowid()");
  console.log('Result:', JSON.stringify(res, null, 2));
  console.log('RowID:', res[0]?.values[0]?.[0]);
}

test();
