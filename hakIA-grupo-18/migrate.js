require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./src/config/dbClient');

async function run() {
  console.log('--- Iniciando migración de la base de datos ---');
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf8');
    
    // Drop existing tables to ensure clean slate with new columns
    console.log('Eliminando tablas existentes (modo prototipo)...');
    await pool.query(`
      DROP TABLE IF EXISTS 
        mensajes_chat, 
        recomendaciones, 
        emisiones, 
        facturas, 
        indicadores_sociales, 
        servicios_empresa, 
        auditorias, 
        empresas 
      CASCADE;
    `);

    console.log('Aplicando nuevo esquema (schema.sql)...');
    await pool.query(schema);

    console.log('✅ Migración completada exitosamente.');
  } catch (err) {
    console.error('❌ Error en la migración:', err);
  } finally {
    pool.end();
  }
}

run();
