const Groq = require('groq-sdk');
const { categoriasValidas } = require('./calculoEmisiones');

// Modelos vigentes en Groq (revisar https://console.groq.com/docs/deprecations si vuelve a fallar):
// - Chat/tool-calling: openai/gpt-oss-120b (reemplaza a llama-3.3-70b-versatile, deprecado)
// - Visión: qwen/qwen3.6-27b (único modelo multimodal soportado actualmente; reemplaza a
//   llama-3.2-90b-vision-preview y meta-llama/llama-4-scout-17b-16e-instruct, ambos deprecados)
const MODELO_CHAT = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MODELO_VISION = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';

let clienteGroq = null;
function obtenerCliente() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY no está configurada en el entorno (.env)');
  }
  if (!clienteGroq) {
    clienteGroq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return clienteGroq;
}

const PROMPT_SISTEMA_CHAT = `Sos "EcoAuditor", un asistente conversacional cálido y experto en sostenibilidad y huella de carbono para PyMEs de Argentina/Latinoamérica.
Tu rol principal es guiar al usuario en el relevamiento de consumos de su empresa (electricidad, gas, combustibles, agua, residuos, transporte de empleados y de carga). Pero también podés responder preguntas generales sobre sostenibilidad, explicar conceptos, y orientar sobre el uso de la herramienta.

Reglas de comunicación:
- Hablá en español rioplatense, con tono profesional, cercano y empático.
- SIEMPRE respondé directamente a lo que el usuario dijo o preguntó antes de avanzar al siguiente tema.
- Si el usuario pide el reporte, explicale que puede descargarlo usando el botón "Descargar reporte PDF" que aparece en la pantalla principal. No digas solo "Listo" sin atender su pedido.
- Si el usuario hace una consulta general (sobre sostenibilidad, CO2, emisiones, etc.), respondela con claridad.
- Respondé de forma natural y completa. No seas lacónico ni cortante. Si acabás de registrar un dato, confirmalo con entusiasmo antes de preguntar el siguiente.
- Si el dato es ambiguo (falta unidad o categoría), preguntá para aclarar antes de registrar.

Reglas de registro de consumos:
- Cuando la persona te dé un dato numérico de consumo con su categoría (ej: "gastamos 500 kWh de luz" o "cargamos 200 litros de nafta al mes"), DEBÉS llamar a la función "registrar_consumo" con los datos estructurados.
- Las categorías válidas son exactamente: ${categoriasValidas.join(', ')}.
- No inventes cifras: si la persona no dio un número, no llames a la función.
- Después de registrar un consumo, confirmá lo que se registró y preguntá por la siguiente categoría pendiente.
- Si te preguntan qué categorías faltan relevar, respondé con base en el contexto de la auditoría que se te provee.
- Cuando el usuario indique que ya terminó de cargar datos, sugerí generar el reporte final usando el botón "Descargar reporte PDF".`;


const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'registrar_consumo',
      description:
        'Registra un consumo de una categoría de emisión mencionado por el usuario en la conversación, para calcular su huella de carbono.',
      parameters: {
        type: 'object',
        properties: {
          categoria: {
            type: 'string',
            enum: categoriasValidas,
            description: 'Categoría de emisión a la que corresponde el consumo.',
          },
          consumo: {
            type: 'number',
            description: 'Cantidad numérica consumida en la unidad estándar de la categoría (kWh, m3, litros, kg o km).',
          },
          concepto: {
            type: 'string',
            description: 'Breve descripción del consumo tal como lo mencionó el usuario, ej: "Consumo eléctrico de la planta en enero".',
          },
        },
        required: ['categoria', 'consumo'],
      },
    },
  },
];

/**
 * Ejecuta un turno de chat con el modelo, incluyendo function calling.
 * @param {Array} mensajes - historial en formato [{role: 'system'|'user'|'assistant'|'tool', content, tool_call_id?, name?}]
 * @returns {Promise<{message: object}>} - el mensaje crudo devuelto por el modelo (puede incluir tool_calls)
 */
async function generarTurnoChat(mensajes) {
  const groq = obtenerCliente();
  const respuesta = await groq.chat.completions.create({
    model: MODELO_CHAT,
    messages: mensajes,
    tools: HERRAMIENTAS,
    tool_choice: 'auto',
    temperature: 0.3,
    max_completion_tokens: 700,
  });
  return respuesta.choices[0].message;
}

/**
 * Arma el array de mensajes inicial para una conversación, incluyendo contexto de la auditoría.
 */
function construirMensajesConContexto({ historial, contextoAuditoria }) {
  const contextoTexto = contextoAuditoria
    ? `Contexto actual de la auditoría (no lo repitas literalmente, usalo para orientar preguntas):\n${JSON.stringify(contextoAuditoria)}`
    : 'Todavía no hay datos cargados en esta auditoría.';

  return [
    { role: 'system', content: PROMPT_SISTEMA_CHAT },
    { role: 'system', content: contextoTexto },
    ...historial,
  ];
}

/**
 * Guía de desambiguación específica por tipo de servicio. Las facturas argentinas suelen
 * tener grillas densas con múltiples números parecidos (lecturas, IDs, montos, gráficos
 * históricos) que pueden confundir la extracción si no se indica explícitamente qué
 * campo es "el consumo del período" y cuáles hay que ignorar.
 */
// Pista breve para el modelo de visión (compacta para no exceder el límite de TPM)
const HINT_VISION = `Reglas: usá el consumo del período actual (no históricos). Gas: preferí "Consumo m3" sobre el corregido. Electricidad: kWh activos. Nunca uses CUIT, N° medidor ni montos como consumo.`;

function construirEsquemaJson() {
  return `{"categoria":"<una de [${categoriasValidas.join('|')}] o desconocida>","consumo":<número o null>,"unidad":"<kWh|m3|litro|kg|km|null>","proveedor":"<string o null>","periodo_facturado":"<string o null>","confianza":<0-1>}`;
}

/**
 * Analiza una imagen de factura usando el modelo de visión de Groq y devuelve datos estructurados.
 * Es el método principal para cualquier imagen (foto/escaneo): el modelo de visión razona
 * sobre la disposición espacial de tablas/columnas, algo que un OCR lineal como Tesseract
 * no puede garantizar en facturas con grillas densas.
 */
async function analizarFacturaImagen({ base64Image, mimeType, categoriaSugerida = null }) {
  const groq = obtenerCliente();

  const prompt = [
    'Extraé datos de esta factura de servicios.',
    categoriaSugerida ? `Categoría indicada: "${categoriaSugerida}".` : '',
    HINT_VISION,
    'Respondé SOLO con este JSON exacto (sin markdown ni texto extra):',
    construirEsquemaJson(),
  ].filter(Boolean).join(' ');

  const respuesta = await groq.chat.completions.create({
    model: MODELO_VISION,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      },
    ],
    temperature: 0.1,
    max_completion_tokens: 1800,
  });

  const contenido = respuesta.choices[0].message.content || '{}';
  console.log('[groqService][vision] Respuesta cruda del modelo:\n', contenido);
  return parsearJsonSeguro(contenido);
}

/**
 * Intenta parsear un JSON devuelto por el modelo, tolerando:
 *  - Bloques de razonamiento <think>...</think> (modelos qwen/deepseek)
 *  - Bloques de código markdown ```json ... ```
 *  - Texto extra antes/después del objeto JSON
 */
function parsearJsonSeguro(texto) {
  // 1. Eliminar bloque <think>...</think> (modelos con chain-of-thought visible)
  let limpio = texto.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Eliminar markdown code fences (```json ... ```)
  limpio = limpio.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 3. Intentar parsear directamente
  try {
    return JSON.parse(limpio);
  } catch (_) {
    // 4. Extraer el primer bloque {...} del texto en caso de que el modelo
    //    haya añadido prosa antes o después del JSON
    const match = limpio.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (err) {
        console.error('[groqService] No se pudo parsear JSON del modelo:', err.message, '\nContenido:', limpio);
      }
    } else {
      console.error('[groqService] No se encontró ningún bloque JSON en la respuesta del modelo.\nContenido:', limpio);
    }
    return {
      categoria: 'desconocida',
      consumo: null,
      unidad: null,
      consumo_alternativo: null,
      consumo_alternativo_etiqueta: null,
      proveedor: null,
      periodo_facturado: null,
      monto_total: null,
      confianza: 0,
      advertencia: 'No se pudo interpretar la respuesta del modelo; revisar manualmente.',
    };
  }
}

/**
 * Analiza texto ya extraído (por pdf-parse o Tesseract) de una factura y devuelve datos estructurados.
 * Se usa cuando el OCR/parseo de texto fue suficiente (no hace falta visión).
 */
async function analizarTextoFactura(texto, categoriaSugerida = null) {
  const groq = obtenerCliente();

  const prompt = `Este es el texto extraído de una factura de servicios de una PyME:
"""${texto.slice(0, 4000)}"""
${categoriaSugerida ? `La persona usuaria indicó que la categoría es: "${categoriaSugerida}". Priorizá esa categoría salvo que el texto muestre claramente otra cosa.` : ''}

${GUIA_DESAMBIGUACION}

Devolvé ÚNICAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma exacta:
${construirEsquemaJson()}`;

  const respuesta = await groq.chat.completions.create({
    model: MODELO_CHAT,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_completion_tokens: 500,
    response_format: { type: 'json_object' },
  });

  return parsearJsonSeguro(respuesta.choices[0].message.content || '{}');
}

/**
 * Genera recomendaciones de reducción de huella usando el LLM.
 * Devuelve un array [{categoria, titulo, descripcion, impacto_estimado}] o null si falla.
 */
async function generarRecomendacionesIA({ emisiones, empresa }) {
  const { agruparPorCategoria, sumarTotalCO2 } = require('./calculoEmisiones');
  const grupos = agruparPorCategoria(emisiones);
  const totalCo2 = sumarTotalCO2(emisiones);

  if (grupos.length === 0) return null;

  const resumen = grupos
    .map(g => `${g.categoria}: ${g.co2_kg} kg CO2e`)
    .join(' | ');

  const contexto = [
    empresa?.nombre            ? `Empresa: ${empresa.nombre}`          : null,
    empresa?.sector            ? `Sector: ${empresa.sector}`           : null,
    empresa?.region            ? `Región: ${empresa.region}`           : 'Región: Argentina',
    empresa?.empleados         ? `Empleados: ${empresa.empleados}`     : null,
  ].filter(Boolean).join(', ');

  const prompt = `Sos experto en sostenibilidad ambiental para PyMEs argentinas. \
Analizá el siguiente perfil de emisiones y generá entre 3 y 5 recomendaciones concretas, \
accionables y personalizadas para reducir la huella de carbono de esta empresa.

${contexto}
CO2e total del período: ${totalCo2.toLocaleString('es-AR')} kg
Emisiones por categoría: ${resumen}

Respondé con un objeto JSON con esta forma exacta:
{"recomendaciones":[{"categoria":"<${categoriasValidas.join('|')}|general>","titulo":"<título conciso máx 80 chars>","descripcion":"<1-2 oraciones concretas>","impacto_estimado":"<alto|medio|bajo>"}]}`;

  const groq = obtenerCliente();
  const respuesta = await groq.chat.completions.create({
    model: MODELO_CHAT,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_completion_tokens: 1200,
    response_format: { type: 'json_object' },
  });

  const parsed = parsearJsonSeguro(respuesta.choices[0].message.content || '{}');
  const lista = parsed?.recomendaciones;
  return Array.isArray(lista) && lista.length > 0 ? lista : null;
}

module.exports = {
  generarTurnoChat,
  analizarTextoFactura,
  construirMensajesConContexto,
  analizarFacturaImagen,
  generarRecomendacionesIA,
  HERRAMIENTAS,
  MODELO_CHAT,
  MODELO_VISION,
};
