const express = require('express');
const multer = require('multer');
const router = express.Router();

const db = require('../services/db');
const { extraerTexto, MIME_PDF, MIMES_IMAGEN } = require('../services/ocrService');
const { analizarTextoFactura, analizarFacturaImagen } = require('../services/groqService');
const { calcularEmision } = require('../services/calculoEmisiones');
const { generarRecomendaciones } = require('../services/recomendaciones');
const { sumarTotalCO2, agruparPorCategoria } = require('../services/calculoEmisiones');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

const TIPOS_SOPORTADOS = [MIME_PDF, ...MIMES_IMAGEN];

/**
 * Sube y procesa una factura: extrae texto (OCR/parser), y si es insuficiente,
 * recurre al modelo de visión de Groq para leer la imagen directamente.
 * Devuelve la factura creada con datos_estructurados listos para confirmar.
 */
router.post('/auditorias/:auditoriaId/facturas', upload.single('archivo'), async (req, res, next) => {
  try {
    const { auditoriaId } = req.params;
    const auditoria = await db.obtenerAuditoria(auditoriaId);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada.' });

    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo en el campo "archivo".' });
    if (!TIPOS_SOPORTADOS.includes(req.file.mimetype)) {
      return res.status(415).json({ error: `Tipo de archivo no soportado: ${req.file.mimetype}. Se acepta PDF o imágenes.` });
    }

    const categoriaSugeridaManual = req.body.categoria || null;
    const esImagen = MIMES_IMAGEN.includes(req.file.mimetype);

    // 1) Extraer texto (digital o vía OCR). Para imágenes esto se usa solo como "pista"
    //    de apoyo, nunca como única fuente: el OCR de Tesseract no respeta el orden
    //    espacial de facturas con tablas multi-columna (lecturas, consumos, etc.),
    //    y podría mezclar números de columnas distintas de forma silenciosa.
    const { texto, metodo, esSuficiente } = await extraerTexto(req.file.buffer, req.file.mimetype);

    let datosEstructurados;
    if (esImagen) {
      // Las imágenes SIEMPRE van por el modelo de visión: puede razonar sobre la
      // ubicación espacial de columnas/tablas mucho mejor que un OCR lineal.
      // El texto de Tesseract (si logró extraer algo) se pasa como pista adicional.
      const base64Image = req.file.buffer.toString('base64');
      datosEstructurados = await analizarFacturaImagen({
        base64Image,
        mimeType: req.file.mimetype,
        categoriaSugerida: categoriaSugeridaManual,
      });
    } else if (esSuficiente) {
      // PDF con texto digital embebido (no escaneado): analizar el texto plano
      datosEstructurados = await analizarTextoFactura(texto, categoriaSugeridaManual);
    } else {
      // PDF escaneado sin texto digital y sin soporte de rasterizado en este prototipo:
      // devolver vacío para que el usuario complete manualmente, o resubir como imagen.
      datosEstructurados = {
        categoria: 'desconocida',
        consumo: null,
        unidad: null,
        proveedor: null,
        periodo_facturado: null,
        monto_total: null,
        confianza: 0,
        advertencia: 'PDF escaneado sin texto digital: no se pudo analizar automáticamente. Probá resubiéndolo como imagen (JPG/PNG) para usar el análisis por visión, o cargá los datos manualmente.',
      };
    }

    // Si el usuario indicó categoría manualmente, priorizarla sobre la inferida
    if (categoriaSugeridaManual) {
      datosEstructurados.categoria = categoriaSugeridaManual;
    }

    const factura = await db.crearFactura({
      auditoria_id: auditoriaId,
      categoria: datosEstructurados.categoria || 'desconocida',
      nombre_archivo: req.file.originalname,
      tipo_mime: req.file.mimetype,
      texto_extraido: texto,
      datos_estructurados: { ...datosEstructurados, metodo_extraccion: metodo },
    });

    res.status(201).json(factura);
  } catch (err) {
    next(err);
  }
});

/**
 * Lista las facturas cargadas para una auditoría.
 */
router.get('/auditorias/:auditoriaId/facturas', async (req, res, next) => {
  try {
    const facturas = await db.listarFacturasPorAuditoria(req.params.auditoriaId);
    res.json(facturas);
  } catch (err) {
    next(err);
  }
});

/**
 * Confirma una factura: permite al usuario corregir los datos estructurados antes de calcular
 * el CO2 definitivo, crea el registro de emisión asociado y regenera recomendaciones.
 */
router.post('/facturas/:id/confirmar', async (req, res, next) => {
  try {
    const factura = await db.obtenerFactura(req.params.id);
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada.' });
    if (factura.confirmada) return res.status(409).json({ error: 'Esta factura ya fue confirmada previamente.' });

    // El usuario puede corregir categoría/consumo antes de confirmar
    const categoria = req.body.categoria || factura.categoria;
    const consumo = req.body.consumo !== undefined ? req.body.consumo : factura.datos_estructurados?.consumo;
    const region = req.body.region || 'Argentina';

    if (!categoria || categoria === 'desconocida') {
      return res.status(400).json({ error: 'Debe indicarse una categoría válida para confirmar la factura.' });
    }
    if (consumo === null || consumo === undefined || Number.isNaN(Number(consumo))) {
      return res.status(400).json({ error: 'Debe indicarse un valor de consumo numérico para confirmar la factura.' });
    }

    const calculo = calcularEmision(categoria, consumo, region);

    const emision = await db.crearEmision({
      auditoria_id: factura.auditoria_id,
      factura_id: factura.id,
      categoria,
      concepto: `Factura: ${factura.nombre_archivo}`,
      consumo: Number(consumo),
      unidad: calculo.unidad,
      factor_emision: calculo.factor_emision,
      co2_kg: calculo.co2_kg,
      origen: 'factura',
    });

    await db.actualizarFactura(factura.id, {
      confirmada: true,
      categoria,
      co2_kg: calculo.co2_kg,
      datos_estructurados: { ...factura.datos_estructurados, consumo: Number(consumo) },
    });

    // Recalcular total de la auditoría y regenerar recomendaciones
    const todasEmisiones = await db.listarEmisionesPorAuditoria(factura.auditoria_id);
    const totalCo2 = sumarTotalCO2(todasEmisiones);
    const porCategoria = agruparPorCategoria(todasEmisiones);
    await db.actualizarAuditoria(factura.auditoria_id, { total_co2_kg: totalCo2, resumen: { por_categoria: porCategoria } });

    const auditoriaCompleta = await db.obtenerAuditoria(factura.auditoria_id);
    const empresa = auditoriaCompleta?.empresa_id ? await db.obtenerEmpresa(auditoriaCompleta.empresa_id) : null;
    const nuevasRecomendaciones = await generarRecomendaciones(todasEmisiones, empresa);
    await db.reemplazarRecomendaciones(factura.auditoria_id, nuevasRecomendaciones);

    res.json({ emision, total_co2_kg: totalCo2 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
