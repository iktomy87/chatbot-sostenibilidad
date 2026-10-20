const { agruparPorCategoria } = require('./calculoEmisiones');
const { generarRecomendacionesIA } = require('./groqService');

// ---------------------------------------------------------------------------
// Motor de reglas (fallback cuando la IA no está disponible)
// ---------------------------------------------------------------------------
const REGLAS = [
  {
    categoria: 'electricidad',
    umbral_kg: 200,
    titulo: 'Migrar a iluminación LED y sensores de presencia',
    descripcion:
      'El consumo eléctrico representa una porción relevante de la huella. Reemplazar luminarias por LED y agregar sensores de presencia en áreas de bajo tránsito puede reducir el consumo entre un 20% y 40%.',
    impacto_estimado: 'alto',
  },
  {
    categoria: 'electricidad',
    umbral_kg: 500,
    titulo: 'Evaluar contratación de energía renovable o generación propia',
    descripcion:
      'Con un consumo eléctrico elevado, conviene evaluar contratos de energía renovable certificada o paneles solares para autoconsumo, lo que puede reducir significativamente las emisiones asociadas a la red.',
    impacto_estimado: 'alto',
  },
  {
    categoria: 'gas_natural',
    umbral_kg: 150,
    titulo: 'Mantenimiento de calderas y aislación térmica',
    descripcion:
      'Un mantenimiento periódico de calderas y una mejor aislación térmica del edificio pueden reducir el consumo de gas natural entre un 10% y 25%.',
    impacto_estimado: 'medio',
  },
  {
    categoria: 'gas_licuado_glp',
    umbral_kg: 100,
    titulo: 'Optimizar uso de GLP en procesos productivos',
    descripcion:
      'Revisar la eficiencia de los equipos que utilizan GLP y considerar alternativas eléctricas o híbridas donde sea viable.',
    impacto_estimado: 'medio',
  },
  {
    categoria: 'combustible_nafta',
    umbral_kg: 100,
    titulo: 'Optimizar rutas y considerar flota híbrida/eléctrica',
    descripcion:
      'Optimizar rutas de reparto, capacitar en conducción eficiente y evaluar la incorporación gradual de vehículos híbridos o eléctricos para la flota liviana.',
    impacto_estimado: 'medio',
  },
  {
    categoria: 'combustible_gasoil',
    umbral_kg: 150,
    titulo: 'Plan de mantenimiento y eficiencia de flota pesada',
    descripcion:
      'Un plan de mantenimiento preventivo y control de presión de neumáticos puede mejorar el rendimiento de combustible entre un 5% y 10% en vehículos de carga.',
    impacto_estimado: 'medio',
  },
  {
    categoria: 'agua',
    umbral_kg: 50,
    titulo: 'Instalar dispositivos ahorradores de agua',
    descripcion:
      'Griferías de bajo caudal, sensores y reutilización de agua de procesos pueden reducir el consumo de agua y su huella asociada.',
    impacto_estimado: 'bajo',
  },
  {
    categoria: 'residuos',
    umbral_kg: 50,
    titulo: 'Implementar programa de separación y reciclaje',
    descripcion:
      'Separar residuos reciclables y compostar orgánicos puede reducir significativamente el volumen enviado a relleno sanitario y su huella asociada.',
    impacto_estimado: 'medio',
  },
  {
    categoria: 'transporte_empleados',
    umbral_kg: 100,
    titulo: 'Fomentar movilidad sustentable de empleados',
    descripcion:
      'Incentivar el uso de transporte público, bicicleta o esquemas de carpooling para el traslado de empleados reduce las emisiones indirectas de la empresa.',
    impacto_estimado: 'bajo',
  },
  {
    categoria: 'transporte_terrestre_carga',
    umbral_kg: 200,
    titulo: 'Consolidar cargas y optimizar logística',
    descripcion:
      'Consolidar envíos, mejorar la planificación logística y evaluar proveedores de transporte con menor huella puede reducir las emisiones de la cadena de distribución.',
    impacto_estimado: 'alto',
  },
];

// Recomendación transversal que siempre se incluye
const REC_UNIVERSAL = {
  categoria: 'general',
  titulo: 'Capacitar al personal en buenas prácticas ambientales',
  descripcion:
    'Sensibilizar y capacitar periódicamente al personal sobre uso eficiente de energía, agua y gestión de residuos potencia el impacto de cualquier medida técnica.',
  impacto_estimado: 'bajo',
};

/**
 * Motor de reglas determinístico (usado como fallback si la IA falla).
 */
function generarRecomendacionesReglas(emisiones = []) {
  const agrupado = agruparPorCategoria(emisiones);
  const recomendaciones = [];

  for (const grupo of agrupado) {
    const reglasCategoria = REGLAS.filter(
      (r) => r.categoria === grupo.categoria && grupo.co2_kg >= r.umbral_kg
    );
    for (const regla of reglasCategoria) {
      recomendaciones.push({
        categoria: regla.categoria,
        titulo: regla.titulo,
        descripcion: regla.descripcion,
        impacto_estimado: regla.impacto_estimado,
      });
    }
  }

  if (recomendaciones.length === 0 && agrupado.length > 0) {
    recomendaciones.push({
      categoria: 'general',
      titulo: 'Establecer una línea base y objetivos de reducción',
      descripcion:
        'Los consumos registrados aún son bajos o iniciales. Se recomienda seguir monitoreando mensualmente y fijar metas de reducción del 5-10% interanual.',
      impacto_estimado: 'bajo',
    });
  }

  recomendaciones.push(REC_UNIVERSAL);
  return recomendaciones;
}

// ---------------------------------------------------------------------------
// Función principal: IA con fallback a reglas
// ---------------------------------------------------------------------------

/**
 * Genera recomendaciones para una auditoría.
 * Intenta usar el LLM (Groq) para recomendaciones personalizadas.
 * Si la IA falla por cualquier motivo, cae al motor de reglas determinístico.
 *
 * @param {Array}  emisiones - Lista de emisiones de la auditoría
 * @param {Object} empresa   - Datos de la empresa (nombre, sector, región, etc.)
 */
async function generarRecomendaciones(emisiones = [], empresa = null) {
  try {
    const recsIA = await generarRecomendacionesIA({ emisiones, empresa });
    if (recsIA && recsIA.length > 0) {
      console.log(`[recomendaciones] IA generó ${recsIA.length} recomendaciones.`);
      // Agregar siempre la recomendación transversal si la IA no la incluyó
      const yaIncluida = recsIA.some((r) => r.titulo === REC_UNIVERSAL.titulo);
      return yaIncluida ? recsIA : [...recsIA, REC_UNIVERSAL];
    }
  } catch (err) {
    console.warn('[recomendaciones] Falló la IA, usando motor de reglas como fallback:', err.message);
  }

  console.log('[recomendaciones] Usando motor de reglas.');
  return generarRecomendacionesReglas(emisiones);
}

module.exports = { generarRecomendaciones, generarRecomendacionesReglas, REGLAS };

