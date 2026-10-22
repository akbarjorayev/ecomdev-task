import { createApp } from './app.js';
import { openDb } from './db.js';

const port = Number(process.env.PORT) || 3000;
const dbPath = process.env.DB_PATH || 'data/app.db';

const db = openDb(dbPath);
createApp(db).listen(port, () => {
  console.log(`Server running at http://localhost:${port} (database: ${dbPath})`);
});
