const express = require('express');
const router = express.Router();

const db = require('../services/db');
const { generarReportePDF } = require('../services/reportePdfService');
const { generarRecomendaciones } = require('../services/recomendaciones');
const { sumarTotalCO2, agruparPorCategoria } = require('../services/calculoEmisiones');

// ---------------------------------------------------------------------------
// EMPRESAS
// ---------------------------------------------------------------------------

// Crear una empresa nueva
router.post('/empresas', async (req, res, next) => {
  try {
    const { nombre, sector, region, empleados, email_contacto, telefono, sitio_web, superficie_m2, facturacion_anual, tamaño_empresa } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El campo "nombre" es obligatorio.' });
    const empresa = await db.crearEmpresa({ nombre, sector, region, empleados, email_contacto, telefono, sitio_web, superficie_m2, facturacion_anual, tamaño_empresa });
    res.status(201).json(empresa);
  } catch (err) {
    next(err);
  }
});

// Listar empresas
router.get('/empresas', async (req, res, next) => {
  try {
    const empresas = await db.listarEmpresas();
    res.json(empresas);
  } catch (err) {
    next(err);
  }
});

// Obtener una empresa puntual
router.get('/empresas/:id', async (req, res, next) => {
  try {
    const empresa = await db.obtenerEmpresa(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada.' });
    res.json(empresa);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// SERVICIOS DE LA EMPRESA
// ---------------------------------------------------------------------------

router.post('/empresas/:id/servicios', async (req, res, next) => {
  try {
    const { nombre_servicio, descripcion } = req.body;
    if (!nombre_servicio) return res.status(400).json({ error: 'El campo "nombre_servicio" es obligatorio.' });
    const servicio = await db.crearServicioEmpresa({ empresa_id: req.params.id, nombre_servicio, descripcion });
    res.status(201).json(servicio);
  } catch (err) {
    next(err);
  }
});

router.get('/empresas/:id/servicios', async (req, res, next) => {
  try {
    const servicios = await db.listarServiciosPorEmpresa(req.params.id);
    res.json(servicios);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// INDICADORES SOCIALES
// ---------------------------------------------------------------------------

router.post('/empresas/:id/indicadores', async (req, res, next) => {
  try {
    const { mujeres_liderazgo, porcentaje_diversidad, horas_capacitacion_anual, salario_minimo_vs_vital_movil } = req.body;
    const indicadores = await db.crearIndicadoresSociales({
      empresa_id: req.params.id,
      mujeres_liderazgo,
      porcentaje_diversidad,
      horas_capacitacion_anual,
      salario_minimo_vs_vital_movil
    });
    res.status(201).json(indicadores);
  } catch (err) {
    next(err);
  }
});

router.get('/empresas/:id/indicadores', async (req, res, next) => {
  try {
    const indicadores = await db.obtenerIndicadoresSocialesPorEmpresa(req.params.id);
    if (!indicadores) return res.status(404).json({ error: 'No hay indicadores registrados para esta empresa.' });
    res.json(indicadores);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// AUDITORÍAS
// ---------------------------------------------------------------------------

// Crear una auditoría para una empresa
router.post('/auditorias', async (req, res, next) => {
  try {
    const { empresa_id, periodo } = req.body;
    if (!empresa_id) return res.status(400).json({ error: 'El campo "empresa_id" es obligatorio.' });
    const empresa = await db.obtenerEmpresa(empresa_id);
    if (!empresa) return res.status(404).json({ error: 'La empresa indicada no existe.' });

    const auditoria = await db.crearAuditoria({ empresa_id, periodo: periodo || 'Sin especificar' });
    res.status(201).json(auditoria);
  } catch (err) {
    next(err);
  }
});

// Listar auditorías de una empresa
router.get('/empresas/:empresaId/auditorias', async (req, res, next) => {
  try {
    const auditorias = await db.listarAuditoriasPorEmpresa(req.params.empresaId);
    res.json(auditorias);
  } catch (err) {
    next(err);
  }
});

// Obtener el detalle completo de una auditoría (empresa + facturas + emisiones + recomendaciones)
router.get('/auditorias/:id', async (req, res, next) => {
  try {
    const completa = await db.obtenerAuditoriaCompleta(req.params.id);
    if (!completa) return res.status(404).json({ error: 'Auditoría no encontrada.' });

    const totalCo2 = sumarTotalCO2(completa.emisiones);
    const porCategoria = agruparPorCategoria(completa.emisiones);

    res.json({ ...completa, total_co2_kg: totalCo2, resumen_por_categoria: porCategoria });
  } catch (err) {
    next(err);
  }
});

// Recalcular y regenerar recomendaciones para una auditoría en base a sus emisiones actuales
router.post('/auditorias/:id/recomendaciones', async (req, res, next) => {
  try {
    const auditoria = await db.obtenerAuditoria(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada.' });

    const emisiones = await db.listarEmisionesPorAuditoria(req.params.id);
    const empresa = auditoria.empresa_id ? await db.obtenerEmpresa(auditoria.empresa_id) : null;
    const nuevasRecomendaciones = await generarRecomendaciones(emisiones, empresa);
    const guardadas = await db.reemplazarRecomendaciones(req.params.id, nuevasRecomendaciones);

    res.json(guardadas);
  } catch (err) {
    next(err);
  }
});

// Marcar la auditoría como completada (guarda un resumen final)
router.post('/auditorias/:id/completar', async (req, res, next) => {
  try {
    const auditoria = await db.obtenerAuditoria(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada.' });

    const emisiones = await db.listarEmisionesPorAuditoria(req.params.id);
    const totalCo2 = sumarTotalCO2(emisiones);
    const porCategoria = agruparPorCategoria(emisiones);

    const actualizada = await db.actualizarAuditoria(req.params.id, {
      estado: 'completada',
      total_co2_kg: totalCo2,
      resumen: { por_categoria: porCategoria },
    });

    res.json(actualizada);
  } catch (err) {
    next(err);
  }
});

// Generar y descargar el reporte PDF de la auditoría
router.get('/auditorias/:id/reporte', async (req, res, next) => {
  try {
    const completa = await db.obtenerAuditoriaCompleta(req.params.id);
    if (!completa) return res.status(404).json({ error: 'Auditoría no encontrada.' });

    const nombreArchivo = `reporte-huella-carbono-${(completa.empresa?.nombre || 'empresa').replace(/\s+/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);

    const doc = generarReportePDF({
      empresa: completa.empresa,
      auditoria: completa.auditoria,
      emisiones: completa.emisiones,
      recomendaciones: completa.recomendaciones,
    });

    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
