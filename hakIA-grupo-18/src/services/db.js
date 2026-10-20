const { pool } = require('../config/dbClient');

// ---------------------------------------------------------------------------
// EMPRESAS
// ---------------------------------------------------------------------------
async function crearEmpresa({ nombre, sector, region = 'Argentina', empleados, email_contacto, telefono, sitio_web, superficie_m2, facturacion_anual, tamaño_empresa }) {
  const query = `
    INSERT INTO empresas (nombre, sector, region, empleados, email_contacto, telefono, sitio_web, superficie_m2, facturacion_anual, tamaño_empresa)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [nombre, sector, region, empleados, email_contacto, telefono, sitio_web, superficie_m2, facturacion_anual, tamaño_empresa]);
  return rows[0];
}

async function obtenerEmpresa(id) {
  const { rows } = await pool.query('SELECT * FROM empresas WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listarEmpresas() {
  const { rows } = await pool.query('SELECT * FROM empresas ORDER BY creado_en DESC');
  return rows;
}

// ---------------------------------------------------------------------------
// SERVICIOS EMPRESA
// ---------------------------------------------------------------------------
async function crearServicioEmpresa({ empresa_id, nombre_servicio, descripcion }) {
  const query = `
    INSERT INTO servicios_empresa (empresa_id, nombre_servicio, descripcion)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [empresa_id, nombre_servicio, descripcion]);
  return rows[0];
}

async function listarServiciosPorEmpresa(empresa_id) {
  const { rows } = await pool.query('SELECT * FROM servicios_empresa WHERE empresa_id = $1 ORDER BY creado_en ASC', [empresa_id]);
  return rows;
}

// ---------------------------------------------------------------------------
// INDICADORES SOCIALES
// ---------------------------------------------------------------------------
async function crearIndicadoresSociales({ empresa_id, mujeres_liderazgo, porcentaje_diversidad, horas_capacitacion_anual, salario_minimo_vs_vital_movil }) {
  const query = `
    INSERT INTO indicadores_sociales (empresa_id, mujeres_liderazgo, porcentaje_diversidad, horas_capacitacion_anual, salario_minimo_vs_vital_movil)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [empresa_id, mujeres_liderazgo, porcentaje_diversidad, horas_capacitacion_anual, salario_minimo_vs_vital_movil]);
  return rows[0];
}

async function obtenerIndicadoresSocialesPorEmpresa(empresa_id) {
  const { rows } = await pool.query('SELECT * FROM indicadores_sociales WHERE empresa_id = $1 ORDER BY creado_en DESC LIMIT 1', [empresa_id]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// AUDITORIAS
// ---------------------------------------------------------------------------
async function crearAuditoria({ empresa_id, periodo }) {
  const query = `
    INSERT INTO auditorias (empresa_id, periodo, estado, total_co2_kg, resumen)
    VALUES ($1, $2, 'en_progreso', 0, '{}'::jsonb)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [empresa_id, periodo]);
  return rows[0];
}

async function obtenerAuditoria(id) {
  const { rows } = await pool.query('SELECT * FROM auditorias WHERE id = $1', [id]);
  return rows[0] || null;
}

async function actualizarAuditoria(id, patch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return await obtenerAuditoria(id);
  
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map(k => patch[k]);
  
  const query = `
    UPDATE auditorias 
    SET ${setClauses}, actualizado_en = now() 
    WHERE id = $1 
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [id, ...values]);
  return rows[0] || null;
}

async function listarAuditoriasPorEmpresa(empresa_id) {
  const { rows } = await pool.query('SELECT * FROM auditorias WHERE empresa_id = $1 ORDER BY creado_en ASC', [empresa_id]);
  return rows;
}

// ---------------------------------------------------------------------------
// FACTURAS
// ---------------------------------------------------------------------------
async function crearFactura({ auditoria_id, categoria, nombre_archivo, tipo_mime, texto_extraido, datos_estructurados = {} }) {
  const query = `
    INSERT INTO facturas (auditoria_id, categoria, nombre_archivo, tipo_mime, texto_extraido, datos_estructurados, confirmada, co2_kg)
    VALUES ($1, $2, $3, $4, $5, $6, false, 0)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [auditoria_id, categoria, nombre_archivo, tipo_mime, texto_extraido, datos_estructurados]);
  return rows[0];
}

async function obtenerFactura(id) {
  const { rows } = await pool.query('SELECT * FROM facturas WHERE id = $1', [id]);
  return rows[0] || null;
}

async function actualizarFactura(id, patch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return await obtenerFactura(id);
  
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map(k => patch[k]);
  
  const query = `
    UPDATE facturas 
    SET ${setClauses} 
    WHERE id = $1 
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [id, ...values]);
  return rows[0] || null;
}

async function listarFacturasPorAuditoria(auditoria_id) {
  const { rows } = await pool.query('SELECT * FROM facturas WHERE auditoria_id = $1 ORDER BY creado_en ASC', [auditoria_id]);
  return rows;
}

// ---------------------------------------------------------------------------
// EMISIONES
// ---------------------------------------------------------------------------
async function crearEmision({ auditoria_id, factura_id = null, categoria, concepto, consumo, unidad, factor_emision, co2_kg, origen = 'factura' }) {
  const query = `
    INSERT INTO emisiones (auditoria_id, factura_id, categoria, concepto, consumo, unidad, factor_emision, co2_kg, origen)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [auditoria_id, factura_id, categoria, concepto, consumo, unidad, factor_emision, co2_kg, origen]);
  return rows[0];
}

async function listarEmisionesPorAuditoria(auditoria_id) {
  const { rows } = await pool.query('SELECT * FROM emisiones WHERE auditoria_id = $1 ORDER BY creado_en ASC', [auditoria_id]);
  return rows;
}

// ---------------------------------------------------------------------------
// RECOMENDACIONES
// ---------------------------------------------------------------------------
async function crearRecomendacion({ auditoria_id, categoria, titulo, descripcion, impacto_estimado }) {
  const query = `
    INSERT INTO recomendaciones (auditoria_id, categoria, titulo, descripcion, impacto_estimado)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [auditoria_id, categoria, titulo, descripcion, impacto_estimado]);
  return rows[0];
}

async function listarRecomendacionesPorAuditoria(auditoria_id) {
  const { rows } = await pool.query('SELECT * FROM recomendaciones WHERE auditoria_id = $1 ORDER BY creado_en ASC', [auditoria_id]);
  return rows;
}

async function reemplazarRecomendaciones(auditoria_id, listaRecomendaciones) {
  await pool.query('DELETE FROM recomendaciones WHERE auditoria_id = $1', [auditoria_id]);
  const creadas = [];
  for (const rec of listaRecomendaciones) {
    creadas.push(await crearRecomendacion({ auditoria_id, ...rec }));
  }
  return creadas;
}

// ---------------------------------------------------------------------------
// MENSAJES DE CHAT
// ---------------------------------------------------------------------------
async function guardarMensajeChat({ auditoria_id, rol, contenido }) {
  const query = `
    INSERT INTO mensajes_chat (auditoria_id, rol, contenido)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [auditoria_id, rol, contenido]);
  return rows[0];
}

async function listarMensajesChat(auditoria_id) {
  const { rows } = await pool.query('SELECT * FROM mensajes_chat WHERE auditoria_id = $1 ORDER BY creado_en ASC', [auditoria_id]);
  return rows;
}

// ---------------------------------------------------------------------------
// VISTA CONSOLIDADA
// ---------------------------------------------------------------------------
async function obtenerAuditoriaCompleta(auditoria_id) {
  const auditoria = await obtenerAuditoria(auditoria_id);
  if (!auditoria) return null;
  const [empresa, facturas, emisiones, recomendaciones, servicios, indicadores] = await Promise.all([
    obtenerEmpresa(auditoria.empresa_id),
    listarFacturasPorAuditoria(auditoria_id),
    listarEmisionesPorAuditoria(auditoria_id),
    listarRecomendacionesPorAuditoria(auditoria_id),
    listarServiciosPorEmpresa(auditoria.empresa_id),
    obtenerIndicadoresSocialesPorEmpresa(auditoria.empresa_id),
  ]);
  return { auditoria, empresa, facturas, emisiones, recomendaciones, servicios, indicadores };
}

module.exports = {
  crearEmpresa,
  obtenerEmpresa,
  listarEmpresas,
  crearAuditoria,
  obtenerAuditoria,
  actualizarAuditoria,
  listarAuditoriasPorEmpresa,
  crearFactura,
  obtenerFactura,
  actualizarFactura,
  listarFacturasPorAuditoria,
  crearEmision,
  listarEmisionesPorAuditoria,
  crearRecomendacion,
  listarRecomendacionesPorAuditoria,
  reemplazarRecomendaciones,
  guardarMensajeChat,
  listarMensajesChat,
  obtenerAuditoriaCompleta,
  crearServicioEmpresa,
  listarServiciosPorEmpresa,
  crearIndicadoresSociales,
  obtenerIndicadoresSocialesPorEmpresa,
};
