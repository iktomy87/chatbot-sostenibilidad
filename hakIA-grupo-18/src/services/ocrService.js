const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

const MIME_PDF = 'application/pdf';
const MIMES_IMAGEN = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp'];

/**
 * Extrae texto digital de un buffer PDF usando pdf-parse.
 * Si el PDF es escaneado (sin texto embebido), devolverá una cadena vacía o muy corta,
 * en cuyo caso el llamador puede decidir usar visión (Groq) sobre las páginas rasterizadas.
 */
async function extraerTextoPdf(buffer) {
  try {
    const resultado = await pdfParse(buffer);
    return (resultado.text || '').trim();
  } catch (err) {
    console.error('[ocrService] Error al parsear PDF:', err.message);
    return '';
  }
}

/**
 * Extrae texto de una imagen usando Tesseract.js (OCR).
 * Se configura en español para mejorar el reconocimiento de facturas locales.
 */
async function extraerTextoImagen(buffer) {
  try {
    const { data } = await Tesseract.recognize(buffer, 'spa', {
      logger: () => {}, // silenciar progreso en consola
    });
    return (data.text || '').trim();
  } catch (err) {
    console.error('[ocrService] Error en OCR con Tesseract:', err.message);
    return '';
  }
}

/**
 * Punto de entrada único: recibe el buffer del archivo subido y su mimetype,
 * y devuelve el texto extraído junto con una bandera que indica si el texto es
 * suficiente (útil) o si conviene recurrir a un modelo de visión como respaldo.
 */
async function extraerTexto(buffer, mimetype) {
  let texto = '';
  let metodo = 'ninguno';

  if (mimetype === MIME_PDF) {
    texto = await extraerTextoPdf(buffer);
    metodo = 'pdf-parse';
  } else if (MIMES_IMAGEN.includes(mimetype)) {
    texto = await extraerTextoImagen(buffer);
    metodo = 'tesseract';
  } else {
    throw new Error(`Tipo de archivo no soportado para OCR: ${mimetype}`);
  }

  const textoUtil = texto.replace(/\s+/g, ' ').trim();
  const esSuficiente = textoUtil.length >= 25; // umbral simple para decidir si hace falta visión

  return {
    texto: textoUtil,
    metodo,
    esSuficiente,
  };
}

module.exports = {
  extraerTexto,
  extraerTextoPdf,
  extraerTextoImagen,
  MIME_PDF,
  MIMES_IMAGEN,
};
