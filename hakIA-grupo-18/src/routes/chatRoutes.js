const express = require('express');
const router = express.Router();

const db = require('../services/db');
const groqService = require('../services/groqService');
const { calcularEmision, sumarTotalCO2, agruparPorCategoria } = require('../services/calculoEmisiones');
const { generarRecomendaciones } = require('../services/recomendaciones');

/**
 * Convierte los mensajes guardados en BD/memoria al formato { role, content } esperado por Groq.
 */
function historialAFormatoChat(mensajes) {
  return mensajes.map((m) => ({ role: m.rol, content: m.contenido }));
}

/**
 * Ejecuta la función "registrar_consumo" solicitada por el modelo: calcula el CO2
 * y persiste el registro de emisión asociado a la auditoría (origen: chat).
 */
async function ejecutarRegistrarConsumo(auditoriaId, argumentos) {
  const { categoria, consumo, concepto } = argumentos;
  const calculo = calcularEmision(categoria, consumo, 'Argentina');

  const emision = await db.crearEmision({
    auditoria_id: auditoriaId,
    factura_id: null,
    categoria,
    concepto: concepto || `Consumo de ${categoria} relevado por chat`,
    consumo: Number(consumo),
    unidad: calculo.unidad,
    factor_emision: calculo.factor_emision,
    co2_kg: calculo.co2_kg,
    origen: 'chat',
  });

  // Recalcular totales y recomendaciones tras el nuevo dato
  const todasEmisiones = await db.listarEmisionesPorAuditoria(auditoriaId);
  const totalCo2 = sumarTotalCO2(todasEmisiones);
  const porCategoria = agruparPorCategoria(todasEmisiones);
  await db.actualizarAuditoria(auditoriaId, { total_co2_kg: totalCo2, resumen: { por_categoria: porCategoria } });

  const nuevasRecomendaciones = await generarRecomendaciones(todasEmisiones);
  await db.reemplazarRecomendaciones(auditoriaId, nuevasRecomendaciones);

  return { emision, total_co2_kg: totalCo2 };
}

/**
 * POST /chat/:auditoriaId
 * body: { mensaje: string }
 * Envía un mensaje del usuario al asistente conversacional. Si el modelo detecta
 * un consumo mencionado, lo registra automáticamente vía function calling.
 */
router.post('/chat/:auditoriaId', async (req, res, next) => {
  try {
    const { auditoriaId } = req.params;
    const { mensaje } = req.body;
    if (!mensaje || !mensaje.trim()) {
      return res.status(400).json({ error: 'El campo "mensaje" es obligatorio.' });
    }

    const auditoria = await db.obtenerAuditoria(auditoriaId);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada.' });

    // Contexto: resumen actual de emisiones y datos de la empresa para orientar al modelo
    const emisionesActuales = await db.listarEmisionesPorAuditoria(auditoriaId);
    const empresaInfo = await db.obtenerEmpresa(auditoria.empresa_id);
    const servicios = await db.listarServiciosPorEmpresa(auditoria.empresa_id);
    const indicadores = await db.obtenerIndicadoresSocialesPorEmpresa(auditoria.empresa_id);
    const contextoAuditoria = {
      periodo: auditoria.periodo,
      total_co2_kg: sumarTotalCO2(emisionesActuales),
      categorias_ya_relevadas: agruparPorCategoria(emisionesActuales).map((g) => g.categoria),
      servicios_ofrecidos: servicios.map(s => s.nombre_servicio),
      indicadores_sociales: indicadores || 'No relevados'
    };

    // Guardar mensaje del usuario
    await db.guardarMensajeChat({ auditoria_id: auditoriaId, rol: 'user', contenido: mensaje });

    const historialPrevio = await db.listarMensajesChat(auditoriaId);
    const mensajesChat = groqService.construirMensajesConContexto({
      historial: historialAFormatoChat(historialPrevio),
      contextoAuditoria,
    });

    // Primer turno: el modelo puede responder texto o pedir una function call
    let mensajeModelo = await groqService.generarTurnoChat(mensajesChat);
    const accionesEjecutadas = [];

    // Si el modelo pidió llamar a alguna herramienta, ejecutarla y devolverle el resultado
    if (mensajeModelo.tool_calls && mensajeModelo.tool_calls.length > 0) {
      const mensajesConToolCalls = [...mensajesChat, mensajeModelo];

      for (const toolCall of mensajeModelo.tool_calls) {
        if (toolCall.function.name === 'registrar_consumo') {
          let argumentos;
          try {
            argumentos = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            argumentos = {};
          }

          let resultado;
          try {
            resultado = await ejecutarRegistrarConsumo(auditoriaId, argumentos);
            accionesEjecutadas.push({ tipo: 'registrar_consumo', argumentos, resultado });
          } catch (errCalculo) {
            resultado = { error: errCalculo.message };
          }

          mensajesConToolCalls.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(resultado),
          });
        }
      }

      // Segundo turno: el modelo redacta la respuesta final ya con el resultado de la función
      mensajeModelo = await groqService.generarTurnoChat(mensajesConToolCalls);
    }

    const respuestaTexto = mensajeModelo.content
      || 'No entendí bien, ¿podés reformular tu mensaje? Estoy acá para ayudarte con el relevamiento de emisiones o cualquier consulta sobre sostenibilidad.';

    await db.guardarMensajeChat({ auditoria_id: auditoriaId, rol: 'assistant', contenido: respuestaTexto });

    res.json({
      respuesta: respuestaTexto,
      acciones_ejecutadas: accionesEjecutadas,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /chat/:auditoriaId/historial
 * Devuelve el historial de mensajes de una auditoría (para reconstruir la UI del chat).
 */
router.get('/chat/:auditoriaId/historial', async (req, res, next) => {
  try {
    const mensajes = await db.listarMensajesChat(req.params.auditoriaId);
    res.json(mensajes);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
