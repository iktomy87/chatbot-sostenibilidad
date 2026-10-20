const PDFDocument = require('pdfkit');
const { agruparPorCategoria, sumarTotalCO2, calcularEquivalencias } = require('./calculoEmisiones');

const COLOR_PRIMARIO   = '#1f6f4a';
const COLOR_SECUNDARIO = '#2d9e6b';
const COLOR_TEXTO      = '#222222';
const COLOR_GRIS       = '#666666';
const COLOR_FONDO_BOX  = '#e8f5ee';
const MARGEN           = 50;
const ANCHO_UTIL       = 495; // 595 - 2*50

const NOMBRES_CATEGORIA = {
  electricidad:               'Electricidad',
  gas_natural:                'Gas natural',
  gas_licuado_glp:            'Gas licuado (GLP)',
  combustible_nafta:          'Combustible (nafta)',
  combustible_gasoil:         'Combustible (gasoil)',
  agua:                       'Agua',
  residuos:                   'Residuos',
  transporte_terrestre_carga: 'Transporte de carga',
  transporte_empleados:       'Transporte de empleados',
  general:                    'General',
};

function nombreCategoria(cat) {
  return NOMBRES_CATEGORIA[cat] || cat;
}

/**
 * Genera el documento PDF del reporte de auditoría de sostenibilidad.
 * Devuelve la instancia de PDFDocument (ya con el contenido escrito) para que el
 * llamador la haga `.pipe(res)` y `.end()` como streaming de descarga.
 */
function generarReportePDF({ empresa, auditoria, emisiones, recomendaciones }) {
  const doc = new PDFDocument({ margin: MARGEN, size: 'A4' });

  const totalCo2      = sumarTotalCO2(emisiones);
  const grupos        = agruparPorCategoria(emisiones);
  const equivalencias = calcularEquivalencias(totalCo2);

  // ── 1. BANDA DE ENCABEZADO ─────────────────────────────────────────────────
  const HEADER_H = 72;
  doc.rect(0, 0, 595, HEADER_H).fill(COLOR_PRIMARIO);

  // Nombre del proyecto (izquierda)
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(28)
     .text('AsPym', MARGEN, 14, { lineBreak: false });

  doc.fillColor('#a8d8be')
     .font('Helvetica')
     .fontSize(10)
     .text('Auditor de Sostenibilidad para PyMEs', MARGEN, 48, { lineBreak: false });

  // Título y fecha (derecha) – usando coordenadas absolutas para no interferir
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(13)
     .text('Reporte de Huella de Carbono', MARGEN, 20, { width: ANCHO_UTIL, align: 'right', lineBreak: false });

  doc.fillColor('#a8d8be')
     .font('Helvetica')
     .fontSize(9)
     .text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, MARGEN, 42, { width: ANCHO_UTIL, align: 'right', lineBreak: false });

  // Posicionar cursor debajo de la banda
  doc.y = HEADER_H + 18;

  // ── 2. DATOS DE LA EMPRESA ─────────────────────────────────────────────────
  doc.fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').fontSize(13)
     .text('Datos de la empresa', MARGEN, doc.y);
  doc.moveDown(0.4);

  const datosEmpresa = [
    ['Empresa',          empresa?.nombre || 'N/D'],
    empresa?.sector    ? ['Sector',     empresa.sector]          : null,
    ['Región',           empresa?.region || 'N/D'],
    empresa?.empleados ? ['Empleados',  String(empresa.empleados)]: null,
    ['Período auditado', auditoria?.periodo || 'N/D'],
  ].filter(Boolean);

  datosEmpresa.forEach(([label, value]) => {
    // Escribir cada fila como texto continuo simple para que doc.y avance correctamente
    doc.fillColor(COLOR_TEXTO).font('Helvetica').fontSize(10.5)
       .text(`${label}: ${value}`, MARGEN, doc.y, { width: ANCHO_UTIL });
  });

  doc.moveDown(0.6);
  doc.strokeColor(COLOR_PRIMARIO).lineWidth(1.2)
     .moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_UTIL, doc.y).stroke();
  doc.moveDown(0.8);

  // ── 3. CAJA DE TOTAL DE EMISIONES ──────────────────────────────────────────
  doc.fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').fontSize(13)
     .text('Resumen de emisiones', MARGEN, doc.y);
  doc.moveDown(0.5);

  const BOX_H = 64;
  const yBox  = doc.y;

  // Dibujar la caja con fondo verde claro
  doc.roundedRect(MARGEN, yBox, ANCHO_UTIL, BOX_H, 7)
     .fillOpacity(1).fill(COLOR_FONDO_BOX);
  doc.roundedRect(MARGEN, yBox, ANCHO_UTIL, BOX_H, 7)
     .strokeOpacity(0.45).stroke(COLOR_PRIMARIO);

  // Texto dentro de la caja (posiciones absolutas respecto a yBox)
  doc.fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').fontSize(22)
     .text(`${totalCo2.toLocaleString('es-AR')} kg CO2e`, MARGEN + 14, yBox + 11, { lineBreak: false });

  doc.fillColor(COLOR_GRIS).font('Helvetica').fontSize(9.5)
     .text('Total de emisiones estimadas en el período auditado', MARGEN + 14, yBox + 38, { lineBreak: false });

  // Avanzar el cursor DEBAJO de la caja sin depender de doc.y interno
  doc.y = yBox + BOX_H + 14;

  doc.fillColor(COLOR_TEXTO).font('Helvetica').fontSize(10)
     .text(
       `Equivale aproximadamente a ${equivalencias.arboles_equivalentes_anuales.toLocaleString('es-AR')} árboles` +
       ` necesarios para absorber esa cantidad en un año, o a recorrer` +
       ` ${equivalencias.km_auto_equivalentes.toLocaleString('es-AR')} km en un auto promedio.`,
       MARGEN, doc.y, { width: ANCHO_UTIL }
     );
  doc.moveDown(1);

  // ── 4. TABLA POR CATEGORÍA ─────────────────────────────────────────────────
  doc.fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').fontSize(13)
     .text('Detalle por categoría', MARGEN, doc.y);
  doc.moveDown(0.5);

  const COL = { cat: MARGEN, co2: 340, pct: 450 };
  const COL_W = { cat: 280, co2: 90, pct: 75 };

  // Cabecera
  const yHeaderTabla = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO);
  doc.text('Categoría',   COL.cat, yHeaderTabla, { width: COL_W.cat });
  doc.text('CO2e (kg)',   COL.co2, yHeaderTabla, { width: COL_W.co2, align: 'right' });
  doc.text('% del total', COL.pct, yHeaderTabla, { width: COL_W.pct, align: 'right' });
  doc.moveDown(0.35);

  doc.strokeColor('#cccccc').lineWidth(0.5)
     .moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_UTIL, doc.y).stroke();
  doc.moveDown(0.25);

  // Filas
  doc.font('Helvetica').fontSize(10);
  if (grupos.length === 0) {
    doc.fillColor(COLOR_GRIS)
       .text('No se registraron consumos en esta auditoría.', MARGEN, doc.y, { width: ANCHO_UTIL });
  } else {
    for (const g of grupos) {
      if (doc.y > 720) doc.addPage();
      const pct   = totalCo2 > 0 ? ((g.co2_kg / totalCo2) * 100).toFixed(1) : '0.0';
      const yFila = doc.y;
      doc.fillColor(COLOR_TEXTO)
         .text(nombreCategoria(g.categoria),      COL.cat, yFila, { width: COL_W.cat });
      doc.text(g.co2_kg.toLocaleString('es-AR'),  COL.co2, yFila, { width: COL_W.co2, align: 'right' });
      doc.text(`${pct}%`,                         COL.pct, yFila, { width: COL_W.pct, align: 'right' });
      doc.moveDown(0.65);
    }
  }
  doc.moveDown(1);

  // ── 5. RECOMENDACIONES ─────────────────────────────────────────────────────
  if (doc.y > 650) doc.addPage();
  doc.fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').fontSize(13)
     .text('Recomendaciones de mejora', MARGEN, doc.y);
  doc.moveDown(0.5);

  if (!recomendaciones || recomendaciones.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_GRIS)
       .text('Aún no hay recomendaciones generadas para esta auditoría.', MARGEN, doc.y, { width: ANCHO_UTIL });
  } else {
    recomendaciones.forEach((rec, i) => {
      if (doc.y > 720) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR_SECUNDARIO)
         .text(
           `${i + 1}. ${rec.titulo}  ·  Impacto: ${(rec.impacto_estimado || 'N/D').toUpperCase()}`,
           MARGEN, doc.y, { width: ANCHO_UTIL }
         );
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9.5).fillColor(COLOR_TEXTO)
         .text(rec.descripcion || '', MARGEN + 10, doc.y, { width: ANCHO_UTIL - 10 });
      doc.moveDown(0.7);
    });
  }

  // ── 6. PIE DE PÁGINA ───────────────────────────────────────────────────────
  doc.moveDown(1.5);
  doc.strokeColor('#cccccc').lineWidth(0.5)
     .moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_UTIL, doc.y).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(8).fillColor(COLOR_GRIS)
     .text(
       'Reporte generado automáticamente por AsPym – Auditor de Sostenibilidad para PyMEs. ' +
       'Los factores de emisión utilizados son orientativos; para reportes oficiales validar con fuentes actualizadas (IPCC, Secretaría de Energía, IEA).',
       MARGEN, doc.y, { align: 'center', width: ANCHO_UTIL }
     );

  // Importante: NO se llama a doc.end() acá. El llamador debe hacer doc.pipe(res)
  // y luego doc.end(), para que el streaming hacia la respuesta HTTP funcione bien.
  return doc;
}

module.exports = { generarReportePDF };
