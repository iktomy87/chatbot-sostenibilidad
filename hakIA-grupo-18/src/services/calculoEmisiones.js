const factoresData = require('../data/factoresEmision.json');

/**
 * Obtiene la tabla de factores de emisión para una región dada.
 * Si la región no existe en el catálogo, usa el conjunto "generico".
 */
function obtenerFactoresPorRegion(region) {
  return factoresData.regiones[region] || factoresData.regiones.generico;
}

/**
 * Devuelve la ficha de un factor de emisión específico (unidad + factor + descripción).
 */
function obtenerFactor(categoria, region = 'Argentina') {
  const factores = obtenerFactoresPorRegion(region);
  const ficha = factores[categoria];
  if (!ficha) {
    throw new Error(
      `Categoría de emisión desconocida: "${categoria}". Categorías válidas: ${factoresData.categorias_validas.join(', ')}`
    );
  }
  return ficha;
}

/**
 * Calcula las emisiones de CO2e (en kg) para un consumo dado.
 * @param {string} categoria - una de factoresData.categorias_validas
 * @param {number} consumo - cantidad consumida (en la unidad esperada por la categoría)
 * @param {string} region - región para elegir el factor de emisión (default Argentina)
 * @returns {{ co2_kg: number, factor_emision: number, unidad: string, descripcion: string }}
 */
function calcularEmision(categoria, consumo, region = 'Argentina') {
  const consumoNum = Number(consumo);
  if (Number.isNaN(consumoNum) || consumoNum < 0) {
    throw new Error(`Consumo inválido para el cálculo de emisiones: ${consumo}`);
  }
  const ficha = obtenerFactor(categoria, region);
  const co2_kg = Number((consumoNum * ficha.factor).toFixed(3));
  return {
    co2_kg,
    factor_emision: ficha.factor,
    unidad: ficha.unidad,
    descripcion: ficha.descripcion,
  };
}

/**
 * Calcula el total de CO2 (kg) para una lista de registros de emisión ya calculados.
 */
function sumarTotalCO2(emisiones = []) {
  return Number(emisiones.reduce((acc, e) => acc + Number(e.co2_kg || 0), 0).toFixed(3));
}

/**
 * Agrupa emisiones por categoría, sumando el CO2 de cada una. Útil para gráficos/resúmenes.
 */
function agruparPorCategoria(emisiones = []) {
  const grupos = {};
  for (const e of emisiones) {
    if (!grupos[e.categoria]) grupos[e.categoria] = 0;
    grupos[e.categoria] += Number(e.co2_kg || 0);
  }
  return Object.entries(grupos)
    .map(([categoria, co2_kg]) => ({ categoria, co2_kg: Number(co2_kg.toFixed(3)) }))
    .sort((a, b) => b.co2_kg - a.co2_kg);
}

/**
 * Conversión de referencia: kg de CO2e -> equivalentes intuitivos para el reporte final.
 * (árboles necesarios para absorberlo en un año, km recorridos en auto equivalentes)
 */
function calcularEquivalencias(totalCo2Kg) {
  const ARBOL_ABSORCION_ANUAL_KG = 21; // promedio simplificado (kg CO2/año por árbol)
  const AUTO_KM_FACTOR = 0.171; // kg CO2 por km (mismo factor que transporte_empleados)
  return {
    arboles_equivalentes_anuales: Math.round(totalCo2Kg / ARBOL_ABSORCION_ANUAL_KG),
    km_auto_equivalentes: Math.round(totalCo2Kg / AUTO_KM_FACTOR),
  };
}

module.exports = {
  obtenerFactoresPorRegion,
  obtenerFactor,
  calcularEmision,
  sumarTotalCO2,
  agruparPorCategoria,
  calcularEquivalencias,
  categoriasValidas: factoresData.categorias_validas,
};
