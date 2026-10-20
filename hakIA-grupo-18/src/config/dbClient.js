const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('[dbClient] Conectado a PostgreSQL en AWS RDS');
} else {
  console.warn('[dbClient] DATABASE_URL no configurada. Asegúrate de configurarla en el .env');
}

module.exports = { pool };
