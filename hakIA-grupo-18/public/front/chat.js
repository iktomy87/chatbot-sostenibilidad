/* ============================================================
   AsPym — lógica de la auditoría conectada al backend (/api)
   Los 3 pasos (empresa/período, chat, resumen + facturas) están
   siempre visibles juntos, como en el prototipo de hakIA.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  const log = document.getElementById('chat-log');
  const input = document.getElementById('composer-input');
  const sendBtn = document.getElementById('send-btn');

  // Si esta página no tiene el panel de auditoría, no hacemos nada.
  if (!log || !input) return;

  const API = '/api';
  const el = (id) => document.getElementById(id);

  let empresaId = localStorage.getItem('aspym_empresaId') || null;
  let auditoriaId = localStorage.getItem('aspym_auditoriaId') || null;

  const NOMBRES_CATEGORIA = {
    electricidad: 'Electricidad',
    gas_natural: 'Gas natural',
    gas_licuado_glp: 'Gas licuado (GLP)',
    combustible_nafta: 'Combustible (nafta)',
    combustible_gasoil: 'Combustible (gasoil)',
    agua: 'Agua',
    residuos: 'Residuos',
    transporte_terrestre_carga: 'Transporte de carga',
    transporte_empleados: 'Transporte de empleados',
    general: 'General',
  };

  function opcionesCategoria(seleccionada){
    return Object.entries(NOMBRES_CATEGORIA)
      .filter(([k]) => k !== 'general')
      .map(([k, v]) => `<option value="${k}" ${k === seleccionada ? 'selected' : ''}>${v}</option>`)
      .join('');
  }

  /* ---------------------------------------------------------
     Helpers de burbujas de chat
  --------------------------------------------------------- */
  function scrollToEnd(){ log.scrollTop = log.scrollHeight; }

  function addUserMessage(text){
    const wrap = document.createElement('div');
    wrap.className = 'msg from-user';
    wrap.innerHTML = '<div class="bubble"></div>';
    wrap.querySelector('.bubble').textContent = text;
    log.appendChild(wrap);
    scrollToEnd();
  }

  function addBotMessage(text){
    const wrap = document.createElement('div');
    wrap.className = 'msg from-bot';
    wrap.innerHTML = '<div class="bubble"></div>';
    wrap.querySelector('.bubble').textContent = text;
    log.appendChild(wrap);
    scrollToEnd();
    return wrap;
  }

  function addTypingBubble(){
    const wrap = document.createElement('div');
    wrap.className = 'msg from-bot';
    wrap.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
    log.appendChild(wrap);
    scrollToEnd();
    return wrap;
  }

  /* ---------------------------------------------------------
     Habilitar / bloquear el chat y la carga de facturas según
     si ya existe una auditoría activa (sin ocultar los paneles)
  --------------------------------------------------------- */
  function actualizarDisponibilidad(){
    const activa = Boolean(auditoriaId);
    input.disabled = !activa;
    sendBtn.disabled = !activa;
    const uploadBtn = el('btn-subir-factura');
    const uploadInput = el('input-archivo');
    if (uploadBtn) uploadBtn.disabled = !activa;
    if (uploadInput) uploadInput.disabled = !activa;

    if (activa && log.children.length === 0) {
      addBotMessage('Contame los consumos de tu empresa (ej: "gastamos 850 kWh de luz en enero") o subí una factura en el paso 3 para empezar.');
    }
  }

  /* ---------------------------------------------------------
     Paso 1: crear empresa + auditoría
  --------------------------------------------------------- */
  function marcarAuditoriaCreada(nombreEmpresa, periodo){
    el('setup-hint').textContent = `Auditoría activa: ${nombreEmpresa || 'tu empresa'} · ${periodo || ''}`;
    ['input-nombre', 'input-sector', 'input-region', 'input-empleados', 'input-telefono', 'input-sitio-web', 'input-superficie', 'input-facturacion', 'input-tamano', 'input-periodo'].forEach((id) => {
      const campo = el(id);
      if (campo) campo.disabled = true;
    });
    const btn = el('btn-crear-auditoria');
    if (btn) { btn.disabled = true; btn.textContent = 'Auditoría en curso'; }
    actualizarDisponibilidad();
  }

  const setupForm = el('setup-form');
  if (setupForm) {
    setupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = el('input-nombre').value.trim();
      const periodo = el('input-periodo').value.trim();
      if (!nombre || !periodo) return;

      const btn = el('btn-crear-auditoria');
      btn.disabled = true;
      const textoOriginal = btn.innerHTML;
      btn.textContent = 'Creando auditoría...';

      try {
        const empresa = await (await fetch(`${API}/empresas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre,
            sector: el('input-sector').value.trim(),
            region: el('input-region').value.trim() || 'Argentina',
            empleados: el('input-empleados').value ? Number(el('input-empleados').value) : null,
            telefono: el('input-telefono').value.trim() || null,
            sitio_web: el('input-sitio-web').value.trim() || null,
            superficie_m2: el('input-superficie').value ? Number(el('input-superficie').value) : null,
            facturacion_anual: el('input-facturacion').value ? Number(el('input-facturacion').value) : null,
            tamaño_empresa: el('input-tamano').value || null,
          }),
        })).json();

        const auditoria = await (await fetch(`${API}/auditorias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empresa_id: empresa.id, periodo }),
        })).json();

        empresaId = empresa.id;
        auditoriaId = auditoria.id;
        localStorage.setItem('aspym_empresaId', empresaId);
        localStorage.setItem('aspym_auditoriaId', auditoriaId);

        marcarAuditoriaCreada(nombre, periodo);
        await actualizarResumen();
        await cargarFacturas();
      } catch (err) {
        alert('No se pudo crear la auditoría: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
      }
    });
  }

  /* ---------------------------------------------------------
     Paso 2: chat conversacional
  --------------------------------------------------------- */
  async function enviarMensaje(){
    const mensaje = input.value.trim();
    if (!mensaje) return;
    if (!auditoriaId) { alert('Primero completá el paso 1 para iniciar la auditoría.'); return; }

    addUserMessage(mensaje);
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    const indicator = addTypingBubble();
    try {
      const r = await fetch(`${API}/chat/${auditoriaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje }),
      });
      const data = await r.json();
      indicator.remove();
      if (!r.ok) throw new Error(data.error || 'Error en el chat');

      addBotMessage(data.respuesta);
      if (data.acciones_ejecutadas && data.acciones_ejecutadas.length > 0) {
        await actualizarResumen();
      }
    } catch (err) {
      indicator.remove();
      addBotMessage('Ocurrió un error al procesar el mensaje: ' + err.message);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener('click', enviarMensaje);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      enviarMensaje();
    }
  });

  /* ---------------------------------------------------------
     Paso 3: cargar y analizar factura
  --------------------------------------------------------- */
  const uploadForm = el('upload-form');
  const inputArchivo = el('input-archivo');
  const filePickerLabel = el('file-picker-label');
  const inputCategoriaManual = el('input-categoria-manual');

  if (inputArchivo && filePickerLabel) {
    inputArchivo.addEventListener('change', () => {
      filePickerLabel.textContent = inputArchivo.files[0] ? inputArchivo.files[0].name : 'Seleccionar archivo';
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!auditoriaId) { alert('Primero completá el paso 1 para iniciar la auditoría.'); return; }

      const archivo = inputArchivo.files[0];
      if (!archivo) { alert('Elegí un archivo primero.'); return; }

      const btn = el('btn-subir-factura');
      btn.disabled = true;
      btn.textContent = 'Analizando...';

      const formData = new FormData();
      formData.append('archivo', archivo);
      const categoriaManual = inputCategoriaManual.value;
      if (categoriaManual) formData.append('categoria', categoriaManual);

      try {
        const r = await fetch(`${API}/auditorias/${auditoriaId}/facturas`, { method: 'POST', body: formData });
        const factura = await r.json();
        if (!r.ok) throw new Error(factura.error || 'Error al subir la factura');

        addBotMessage(`Analicé "${factura.nombre_archivo}". Confirmala en el paso 3 para sumarla al reporte.`);
        await cargarFacturas();
        inputArchivo.value = '';
        inputCategoriaManual.value = '';
        filePickerLabel.textContent = 'Seleccionar archivo';
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Subir y analizar';
      }
    });
  }

  async function confirmarFactura(id, categoria, consumo){
    const r = await fetch(`${API}/facturas/${id}/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, consumo: Number(consumo) }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error al confirmar la factura');
    await actualizarResumen();
    await cargarFacturas();
    return data;
  }

  async function cargarFacturas(){
    if (!auditoriaId) return;
    const cont = el('lista-facturas');
    if (!cont) return;

    try {
      const r = await fetch(`${API}/auditorias/${auditoriaId}/facturas`);
      const facturas = await r.json();
      if (!r.ok) return;

      cont.innerHTML = '';
      if (facturas.length === 0) {
        cont.innerHTML = '<div class="cat-empty">Todavía no cargaste facturas.</div>';
        return;
      }

      facturas.forEach((f) => {
        const de = f.datos_estructurados || {};
        const div = document.createElement('div');
        div.className = 'invoice-item';

        if (f.confirmada) {
          div.innerHTML = `
            <div class="inv-name">${f.nombre_archivo}<span class="badge">Confirmada · ${f.co2_kg} kg CO2e</span></div>
            <div class="inv-meta">${NOMBRES_CATEGORIA[f.categoria] || f.categoria}</div>
          `;
        } else {
          div.innerHTML = `
            <div class="inv-name">${f.nombre_archivo}<span class="badge pending">Pendiente</span></div>
            <div class="inv-meta">Confianza: ${de.confianza != null ? Math.round(de.confianza * 100) + '%' : 'N/D'} · Proveedor: ${de.proveedor || 'N/D'}</div>
            <div class="inv-row">
              <select class="sel-categoria" data-id="${f.id}">${opcionesCategoria(f.categoria)}</select>
              <input type="number" class="input-consumo" data-id="${f.id}" placeholder="Consumo" value="${de.consumo ?? ''}">
              <button class="btn-confirmar" data-id="${f.id}">Confirmar</button>
            </div>
          `;
        }
        cont.appendChild(div);
      });

      cont.querySelectorAll('.btn-confirmar').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const categoria = cont.querySelector(`.sel-categoria[data-id="${id}"]`).value;
          const consumo = cont.querySelector(`.input-consumo[data-id="${id}"]`).value;
          if (!consumo) { alert('Indicá el consumo de la factura.'); return; }
          btn.disabled = true;
          btn.textContent = 'Confirmando...';
          try {
            await confirmarFactura(id, categoria, consumo);
          } catch (err) {
            alert('Error: ' + err.message);
            btn.disabled = false;
            btn.textContent = 'Confirmar';
          }
        });
      });
    } catch (e) { /* silencioso */ }
  }

  /* ---------------------------------------------------------
     Resumen de la auditoría
  --------------------------------------------------------- */
  async function actualizarResumen(){
    if (!auditoriaId) return;
    try {
      const r = await fetch(`${API}/auditorias/${auditoriaId}`);
      const data = await r.json();
      if (!r.ok) return;

      el('resumen-total-co2').textContent = `${(data.total_co2_kg || 0).toLocaleString('es-AR')} kg CO2e`;

      const cont = el('resumen-categorias');
      cont.innerHTML = '';
      const categorias = data.resumen_por_categoria || [];
      if (categorias.length === 0) {
        cont.innerHTML = '<div class="cat-empty">Todavía no hay consumos registrados.</div>';
        return;
      }
      categorias.forEach((g) => {
        const row = document.createElement('div');
        row.className = 'cat-row';
        row.innerHTML = `<span class="cat-name">${NOMBRES_CATEGORIA[g.categoria] || g.categoria}</span><span class="cat-val">${g.co2_kg.toLocaleString('es-AR')} kg</span>`;
        cont.appendChild(row);
      });
    } catch (e) { /* silencioso: se puede reintentar con el botón actualizar */ }
  }

  const btnRefrescar = el('btn-refrescar');
  if (btnRefrescar) btnRefrescar.addEventListener('click', () => { actualizarResumen(); cargarFacturas(); });

  const btnPdf = el('btn-descargar-pdf');
  if (btnPdf) btnPdf.addEventListener('click', () => {
    if (!auditoriaId) { alert('Primero completá el paso 1 para iniciar la auditoría.'); return; }
    window.open(`${API}/auditorias/${auditoriaId}/reporte`, '_blank');
  });

  /* ---------------------------------------------------------
     Historial de chat (al recargar la página con auditoría activa)
  --------------------------------------------------------- */
  async function cargarHistorial(){
    try {
      const r = await fetch(`${API}/chat/${auditoriaId}/historial`);
      const mensajes = await r.json();
      if (!r.ok || !Array.isArray(mensajes) || mensajes.length === 0) return false;
      mensajes.forEach((m) => {
        if (m.rol === 'user') addUserMessage(m.contenido);
        else addBotMessage(m.contenido);
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------------------------------------------------
     CTA del hero: lleva directo al paso 1
  --------------------------------------------------------- */
  const heroCta = el('hero-cta');
  if (heroCta) {
    heroCta.addEventListener('click', () => {
      const destino = auditoriaId ? log : el('input-nombre');
      if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (auditoriaId) input.focus(); else el('input-nombre').focus();
    });
  }

  /* ---------------------------------------------------------
     Inicialización
  --------------------------------------------------------- */
  if (auditoriaId) {
    fetch(`${API}/auditorias/${auditoriaId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(async (data) => {
        // Rellenar el paso 1 con los datos ya guardados y bloquearlo
        el('input-nombre').value = data.empresa?.nombre || '';
        el('input-sector').value = data.empresa?.sector || '';
        el('input-region').value = data.empresa?.region || 'Argentina';
        el('input-empleados').value = data.empresa?.empleados || '';
        el('input-telefono').value = data.empresa?.telefono || '';
        el('input-sitio-web').value = data.empresa?.sitio_web || '';
        el('input-superficie').value = data.empresa?.superficie_m2 || '';
        el('input-facturacion').value = data.empresa?.facturacion_anual || '';
        el('input-tamano').value = data.empresa?.tamaño_empresa || '';
        el('input-periodo').value = data.auditoria?.periodo || '';
        marcarAuditoriaCreada(data.empresa?.nombre, data.auditoria?.periodo);

        el('resumen-total-co2').textContent = `${(data.total_co2_kg || 0).toLocaleString('es-AR')} kg CO2e`;
        const huboHistorial = await cargarHistorial();
        if (!huboHistorial) actualizarDisponibilidad();
        actualizarResumen();
        cargarFacturas();
      })
      .catch(() => {
        // La auditoría guardada ya no existe: limpiamos y volvemos a habilitar el paso 1
        localStorage.removeItem('aspym_empresaId');
        localStorage.removeItem('aspym_auditoriaId');
        empresaId = null;
        auditoriaId = null;
        actualizarDisponibilidad();
      });
  } else {
    actualizarDisponibilidad();
  }

});
