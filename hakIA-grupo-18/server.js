require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const { pool } = require('./src/config/dbClient');
const auditoriaRoutes = require('./src/routes/auditoriaRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const facturaRoutes = require('./src/routes/facturaRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos del frontend minimalista
app.use(express.static(path.join(__dirname, 'public', 'front')));

// Endpoint de salud / info general
app.get('/api/estado', (req, res) => {
  res.json({
    ok: true,
    almacenamiento: pool ? 'postgres' : 'ninguno',
    groq_configurado: Boolean(process.env.GROQ_API_KEY),
  });
});

// Rutas de la API (bajo /api)
app.use('/api', auditoriaRoutes);
app.use('/api', facturaRoutes);
app.use('/api', chatRoutes);

// 404 para rutas de API no encontradas
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
});

// Manejo global de errores
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Error interno del servidor.',
  });
});

app.listen(PORT, () => {
  console.log(`\n🌱 Auditor de Sostenibilidad escuchando en http://localhost:${PORT}`);
  console.log(`   Almacenamiento: ${pool ? 'postgres' : 'ninguno'}`);
  console.log(`   Groq configurado: ${Boolean(process.env.GROQ_API_KEY)}\n`);
});
