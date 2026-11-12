'use strict';
/* Sincronización con Google Drive.
   Guarda todos los datos en un único archivo (mis-finanzas-datos.json) del Drive del usuario
   y combina los cambios hechos en distintos dispositivos, movimiento por movimiento.
   El permiso pedido (drive.file) solo da acceso a los archivos creados por esta app. */
window.Nube = (function () {
  const CLIENTE = String(window.GOOGLE_CLIENT_ID || '').trim();
  const ALCANCE = 'https://www.googleapis.com/auth/drive.file';
  const ARCHIVO = 'mis-finanzas-datos.json';
  const API = 'https://www.googleapis.com/drive/v3';
  const SUBIDA = 'https://www.googleapis.com/upload/drive/v3';
  const CLAVE_NUBE = 'mis-finanzas-nube';
  const EN_WEB = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  const REDIRECCION = location.origin + location.pathname;

  let nube = leer();
  let ocupado = false;
  let repetir = false;
  let temporizador = null;
  let error = '';

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE_NUBE)) || {}; } catch { return {}; }
  }
  function escribir() {
    try { localStorage.setItem(CLAVE_NUBE, JSON.stringify(nube)); } catch { /* sin espacio: se reintenta luego */ }
  }
  const tokenValido = () => Boolean(nube.token) && Date.now() < (nube.expira || 0) - 60000;
  const hora = (ts) => new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ---------- Inicio de sesión (redirección a Google y regreso) ----------

  function conectar() {
    if (!CLIENTE || !EN_WEB) return;
    nube = leer();
    nube.estadoOAuth = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
    escribir();
    const p = new URLSearchParams({
      client_id: CLIENTE,
      redirect_uri: REDIRECCION,
      response_type: 'token',
      scope: ALCANCE,
      state: nube.estadoOAuth,
      include_granted_scopes: 'true',
    });
    if (nube.correo) p.set('login_hint', nube.correo);
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  }

  function recibirRedireccion() {
    if (!/(^#|&)(access_token|error)=/.test(location.hash)) return;
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    const esperado = nube.estadoOAuth;
    delete nube.estadoOAuth;
    if (p.get('error')) {
      error = 'No se completó el inicio de sesión con Google.';
    } else if (!esperado || p.get('state') !== esperado) {
      error = 'El inicio de sesión no se pudo verificar. Intenta conectar de nuevo.';
    } else {
      nube.token = p.get('access_token');
      nube.expira = Date.now() + (Number(p.get('expires_in')) || 3600) * 1000;
      nube.conectado = true;
      nube.pendiente = true;
    }
    escribir();
  }

  function desconectar() {
    if (!confirm('Se dejará de sincronizar con Google Drive en este dispositivo. Tus datos se conservan aquí y en Drive. ¿Continuar?')) return;
    nube = {};
    error = '';
    escribir();
    pintar();
  }

  // ---------- Llamadas a Drive ----------

  async function api(url, opciones = {}) {
    const resp = await fetch(url, { ...opciones, headers: { ...(opciones.headers || {}), Authorization: `Bearer ${nube.token}` } });
    if (resp.status === 401) {
      nube.token = null;
      throw new Error('sesion');
    }
    return resp;
  }

  async function exigir(resp) {
    if (!resp.ok) throw new Error(`Drive respondió ${resp.status}`);
    return resp;
  }

  async function ubicarArchivo() {
    if (nube.archivoId) return nube.archivoId;
    const q = encodeURIComponent(`name='${ARCHIVO}' and trashed=false`);
    const lista = await (await exigir(await api(`${API}/files?q=${q}&orderBy=modifiedTime%20desc&fields=files(id)&spaces=drive`))).json();
    if (lista.files && lista.files.length) {
      nube.archivoId = lista.files[0].id;
    } else {
      const creado = await (await exigir(await api(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ARCHIVO, mimeType: 'application/json' }),
      }))).json();
      nube.archivoId = creado.id;
    }
    return nube.archivoId;
  }

  // ---------- Combinar datos de dos dispositivos ----------

  function fusionar(local, remoto) {
    const borrados = { ...remoto.borrados };
    for (const [id, ts] of Object.entries(local.borrados)) borrados[id] = Math.max(ts, borrados[id] || 0);

    const porId = new Map();
    for (const m of [...remoto.movimientos, ...local.movimientos]) {
      const previo = porId.get(m.id);
      if (!previo || m.mod > previo.mod) porId.set(m.id, m);
    }
    const movimientos = [...porId.values()].filter((m) => !(borrados[m.id] >= m.mod));

    // Los ajustes (moneda, presupuestos) se toman del lado que los cambió más recientemente
    const [gana, otro] = local.ajustesMod > remoto.ajustesMod ? [local, remoto] : [remoto, local];
    const unir = (tipo) => [...new Set([...gana.categorias[tipo], ...otro.categorias[tipo]])];
    return {
      moneda: gana.moneda,
      movimientos,
      presupuestos: { ...gana.presupuestos },
      categorias: { gasto: unir('gasto'), ingreso: unir('ingreso') },
      borrados,
      ajustesMod: gana.ajustesMod,
    };
  }

  function huella(e) {
    return JSON.stringify([
      e.moneda, e.ajustesMod, Object.entries(e.presupuestos).sort(), e.categorias.gasto, e.categorias.ingreso,
      [...e.movimientos].sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((m) => [m.id, m.tipo, m.fecha, m.categoria, m.descripcion, m.contraparte, m.metodo, m.factura, m.monto, m.itbms, m.mod]),
      Object.entries(e.borrados).sort(),
    ]);
  }

  // ---------- Sincronizar ----------

  async function sincronizar() {
    if (ocupado) { repetir = true; return; }
    nube = leer();
    if (!nube.conectado) return;
    if (!tokenValido()) { pintar(); return; }
    ocupado = true;
    error = '';
    pintar();
    try {
      if (!nube.correo) {
        try {
          const yo = await (await api(`${API}/about?fields=user(emailAddress)`)).json();
          nube.correo = yo.user?.emailAddress || '';
        } catch (e) { if (e.message === 'sesion') throw e; }
      }

      let remoto = null;
      for (let intento = 0; intento < 2; intento++) {
        const id = await ubicarArchivo();
        const resp = await api(`${API}/files/${id}?alt=media`);
        if (resp.status === 404 && intento === 0) { nube.archivoId = null; continue; } // el archivo fue borrado en Drive
        const texto = await (await exigir(resp)).text();
        if (texto.trim()) {
          try { remoto = normalizar(JSON.parse(texto)); } catch { remoto = null; }
        }
        break;
      }

      const local = normalizar(estado);
      const fusion = remoto ? fusionar(local, remoto) : local;
      const hf = huella(fusion);
      if (!remoto || hf !== huella(remoto)) {
        await exigir(await api(`${SUBIDA}/files/${nube.archivoId}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fusion, null, 1),
        }));
      }
      // Vuelve a combinar por si se registró algo mientras se sincronizaba
      const ahora = normalizar(estado);
      const final = fusionar(ahora, fusion);
      if (huella(final) !== huella(ahora)) {
        estado = final;
        guardarLocal();
        render();
      }
      if (huella(final) !== hf) repetir = true;
      nube.ultima = Date.now();
      nube.pendiente = false;
    } catch (e) {
      if (e.message !== 'sesion') error = navigator.onLine === false ? 'Sin conexión a internet.' : `No se pudo sincronizar (${e.message}).`;
    } finally {
      ocupado = false;
      escribir();
      pintar();
      if (repetir) { repetir = false; programar(500); }
    }
  }

  function programar(ms) {
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizar, ms);
  }

  function cambioLocal() {
    if (!nube.conectado) return;
    nube.pendiente = true;
    escribir();
    pintar();
    programar(1500);
  }

  // Clic en el indicador del encabezado
  function atender() {
    if (nube.conectado && !tokenValido()) conectar(); else sincronizar();
  }

  // ---------- Interfaz ----------

  function vista() {
    if (!EN_WEB) {
      return '<p class="ayuda">La sincronización con Google Drive funciona en la versión publicada en internet. Sigue los pasos de <b>GUIA.md</b> para publicarla.</p>';
    }
    if (!CLIENTE) {
      return `<p class="ayuda">Falta el “ID de cliente” de Google en el archivo <b>config.js</b> (ver <b>GUIA.md</b>).<br>
        Al crear la credencial en Google, registra esta dirección como origen y como URI de redireccionamiento:</p>
        <p><code>${esc(REDIRECCION)}</code></p>`;
    }
    if (!nube.conectado) {
      return `<p class="ayuda">Guarda tus datos en un archivo de tu Google Drive y mantenlos iguales en tu teléfono y tu computadora. La app solo puede ver ese archivo, no el resto de tu Drive.</p>
        ${error ? `<p class="ayuda gasto">${esc(error)}</p>` : ''}
        <div class="botones"><button type="button" class="primario" data-accion="nube-conectar">Conectar con Google Drive</button></div>`;
    }
    const lineas = [`Conectado${nube.correo ? ` como <b>${esc(nube.correo)}</b>` : ''}. Archivo en tu Drive: <b>${ARCHIVO}</b>.`];
    if (nube.ultima) lineas.push(`Última sincronización: ${esc(hora(nube.ultima))}.`);
    if (!tokenValido()) lineas.push('<span class="gasto">La sesión con Google venció; toca “Reconectar” para seguir sincronizando.</span>');
    else if (nube.pendiente) lineas.push('Hay cambios pendientes de subir.');
    if (error) lineas.push(`<span class="gasto">${esc(error)}</span>`);
    return `<p class="ayuda">${lineas.join('<br>')}</p>
      <div class="botones">
        ${tokenValido()
          ? `<button type="button" class="primario" data-accion="nube-sincronizar" ${ocupado ? 'disabled' : ''}>${ocupado ? 'Sincronizando…' : 'Sincronizar ahora'}</button>`
          : '<button type="button" class="primario" data-accion="nube-conectar">Reconectar</button>'}
        <button type="button" data-accion="nube-desconectar">Desconectar</button>
      </div>`;
  }

  function pintar() {
    const caja = document.getElementById('nube-caja');
    if (caja) caja.innerHTML = vista();
    const ind = document.getElementById('estado-nube');
    if (!ind) return;
    ind.hidden = !nube.conectado;
    if (!nube.conectado) return;
    const vencida = !tokenValido();
    ind.classList.toggle('atencion', vencida || Boolean(error));
    ind.textContent = vencida ? 'Reconectar Drive'
      : ocupado ? 'Sincronizando…'
      : error ? 'Error al sincronizar'
      : nube.pendiente ? 'Cambios por subir'
      : 'Guardado en Drive';
  }

  // ---------- Arranque ----------

  recibirRedireccion();
  pintar();
  if (nube.conectado) programar(300);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && nube.conectado && Date.now() - (nube.ultima || 0) > 30000) sincronizar();
  });
  window.addEventListener('online', () => { if (nube.conectado) sincronizar(); });

  return { vista, conectar, desconectar, sincronizar, cambioLocal, atender };
})();
