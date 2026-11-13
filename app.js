'use strict';

const CLAVE = 'mis-finanzas-v1';
const TASA_ITBMS = 0.07;
const METODOS = ['Visa Banco General', 'Visa Credicorp Bank', 'Yappy', 'Online', 'ACH', 'Efectivo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONEDAS = ['USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP', 'PEN', 'DOP', 'GTQ', 'CRC', 'UYU', 'BOB', 'VES', 'BRL', 'GBP', 'CAD'];
const CATEGORIAS_INICIALES = {
  gasto: ['Vivienda', 'Alimentación', 'Transporte', 'Servicios', 'Salud', 'Entretenimiento', 'Educación', 'Ropa', 'Deudas', 'Suscripciones', 'Otros'],
  ingreso: ['Salario', 'Freelance', 'Negocio', 'Inversiones', 'Otros'],
};

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dos = (n) => String(n).padStart(2, '0');
const redondear = (n) => Math.round(n * 100) / 100;

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// ---------- Estado ----------

function estadoInicial() {
  // borrados y ajustesMod sirven para combinar los datos de varios dispositivos (ver drive.js)
  return { moneda: 'USD', movimientos: [], recurrentes: [], presupuestos: {}, categorias: structuredClone(CATEGORIAS_INICIALES), borrados: {}, ajustesMod: 0 };
}

function normalizar(datos) {
  const e = estadoInicial();
  if (!datos || typeof datos !== 'object') return e;
  if (MONEDAS.includes(datos.moneda)) e.moneda = datos.moneda;
  for (const tipo of ['gasto', 'ingreso']) {
    const lista = datos.categorias?.[tipo];
    if (Array.isArray(lista) && lista.length) e.categorias[tipo] = [...new Set(lista.map(String))];
  }
  if (Array.isArray(datos.movimientos)) {
    e.movimientos = datos.movimientos
      .filter((m) => m && (m.tipo === 'gasto' || m.tipo === 'ingreso') && /^\d{4}-\d{2}-\d{2}$/.test(m.fecha) && Number(m.monto) > 0)
      .map((m) => ({
        id: String(m.id || nuevoId()),
        tipo: m.tipo,
        fecha: m.fecha,
        categoria: String(m.categoria || 'Otros'),
        descripcion: String(m.descripcion || ''),
        contraparte: String(m.contraparte || ''), // de quién se recibe o a quién se paga
        metodo: String(m.metodo || ''),
        factura: m.tipo === 'ingreso' ? String(m.factura || '') : '',
        monto: redondear(Number(m.monto)), // monto sin ITBMS
        itbms: Number(m.itbms) > 0 ? redondear(Number(m.itbms)) : 0,
        mod: Number(m.mod) || 0, // momento de la última edición
        ...(m.recId ? { recId: String(m.recId) } : {}), // creado por un recurrente
      }));
  }
  if (Array.isArray(datos.recurrentes)) {
    e.recurrentes = datos.recurrentes
      .filter((r) => r && (r.tipo === 'gasto' || r.tipo === 'ingreso') && Number(r.monto) > 0 && /^\d{4}-\d{2}$/.test(r.desde))
      .map((r) => ({
        id: String(r.id || `r-${nuevoId()}`),
        tipo: r.tipo,
        categoria: String(r.categoria || 'Otros'),
        descripcion: String(r.descripcion || ''),
        contraparte: String(r.contraparte || ''),
        metodo: String(r.metodo || ''),
        monto: redondear(Number(r.monto)),
        itbms: Number(r.itbms) > 0 ? redondear(Number(r.itbms)) : 0,
        dia: Math.min(31, Math.max(1, Math.round(Number(r.dia)) || 1)), // día del mes en que se registra
        desde: r.desde, // primer mes (AAAA-MM)
        activo: r.activo !== false,
        mod: Number(r.mod) || 0,
      }));
  }
  e.ajustesMod = Number(datos.ajustesMod) || 0;
  if (datos.borrados && typeof datos.borrados === 'object') {
    for (const [id, ts] of Object.entries(datos.borrados)) if (Number(ts) > 0) e.borrados[id] = Number(ts);
  }
  if (datos.presupuestos && typeof datos.presupuestos === 'object') {
    for (const [cat, v] of Object.entries(datos.presupuestos)) if (Number(v) > 0) e.presupuestos[cat] = redondear(Number(v));
  }
  return e;
}

function cargar() {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE));
    const e = normalizar(crudo);
    // Datos de versiones anteriores: sus ajustes deben ganarle a un dispositivo recién instalado
    if (crudo && crudo.ajustesMod === undefined) e.ajustesMod = 1;
    return e;
  } catch { return estadoInicial(); }
}

function guardarLocal() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); }
  catch { alert('No se pudieron guardar los datos en este navegador. Descarga un respaldo desde "Reportes y ajustes".'); }
}

function guardar() {
  guardarLocal();
  window.Nube?.cambioLocal();
}

function nuevoId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let estado = cargar();
let mes = hoy().slice(0, 7);
let vista = 'resumen';
const filtros = { tipo: '', categoria: '', texto: '' };
let tipoDona = 'gasto'; // qué muestra el gráfico circular del resumen
let modoForm = 'mov'; // el formulario edita un movimiento ('mov') o un recurrente ('rec')

// ---------- Utilidades ----------

function dinero(n) {
  return new Intl.NumberFormat('es', { style: 'currency', currency: estado.moneda }).format(n);
}
function fechaCorta(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function nombreMes(m, corto = false) {
  const [a, mm] = m.split('-').map(Number);
  const n = MESES[mm - 1];
  return corto ? n.slice(0, 3) : `${n[0].toUpperCase()}${n.slice(1)} ${a}`;
}
function mesMas(m, n) {
  const [a, mm] = m.split('-').map(Number);
  const d = new Date(a, mm - 1 + n, 1);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}`;
}
function movsDeMes(m) {
  return estado.movimientos.filter((x) => x.fecha.startsWith(m));
}
function totales(movs) {
  const t = { ingresos: 0, gastos: 0, itbmsCobrado: 0, itbmsPagado: 0, ventasFiscales: 0, comprasFiscales: 0, porCat: { gasto: {}, ingreso: {} } };
  for (const m of movs) {
    if (m.tipo === 'ingreso') t.ingresos += m.monto; else t.gastos += m.monto;
    t.porCat[m.tipo][m.categoria] = (t.porCat[m.tipo][m.categoria] || 0) + m.monto;
    if (m.itbms) {
      if (m.tipo === 'ingreso') { t.itbmsCobrado += m.itbms; t.ventasFiscales += m.monto; }
      else { t.itbmsPagado += m.itbms; t.comprasFiscales += m.monto; }
    }
  }
  for (const k of ['ingresos', 'gastos', 'itbmsCobrado', 'itbmsPagado', 'ventasFiscales', 'comprasFiscales']) t[k] = redondear(t[k]);
  t.balance = redondear(t.ingresos - t.gastos);
  t.itbmsBalance = redondear(t.itbmsCobrado - t.itbmsPagado);
  return t;
}
const ordenados = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
const porFecha = (movs) => [...movs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

// ---------- Vistas ----------

function render() {
  $('#mes-etiqueta').textContent = nombreMes(mes);
  for (const b of document.querySelectorAll('#pestanas button')) b.classList.toggle('activa', b.dataset.vista === vista);
  const vistas = { resumen: vistaResumen, movimientos: vistaMovimientos, presupuestos: vistaPresupuestos, recurrentes: vistaRecurrentes, reportes: vistaReportes };
  $('#contenido').innerHTML = vistas[vista]();
}

function vistaResumen() {
  const t = totales(movsDeMes(mes));
  const tasa = t.ingresos > 0 ? t.balance / t.ingresos : null;
  return `
  <section class="cifras">
    <div class="tarjeta cifra"><div class="rotulo">Ingresos</div><div class="valor ingreso">${dinero(t.ingresos)}</div></div>
    <div class="tarjeta cifra"><div class="rotulo">Gastos</div><div class="valor gasto">${dinero(t.gastos)}</div></div>
    <div class="tarjeta cifra"><div class="rotulo">Balance</div><div class="valor ${t.balance < 0 ? 'gasto' : ''}">${dinero(t.balance)}</div></div>
    <div class="tarjeta cifra"><div class="rotulo">Tasa de ahorro</div><div class="valor">${tasa === null ? '—' : Math.round(tasa * 100) + '%'}</div><div class="nota">Meta sugerida: 20%</div></div>
  </section>
  <section class="tarjeta">
    <h2>Balance de ITBMS (7%)</h2>
    <div class="cifras mini">
      <div class="cifra"><div class="rotulo">ITBMS cobrado en ingresos</div><div class="valor">${dinero(t.itbmsCobrado)}</div><div class="nota">sobre ${dinero(t.ventasFiscales)} facturados</div></div>
      <div class="cifra"><div class="rotulo">ITBMS pagado en gastos</div><div class="valor">${dinero(t.itbmsPagado)}</div><div class="nota">sobre ${dinero(t.comprasFiscales)} en facturas</div></div>
      <div class="cifra"><div class="rotulo">${t.itbmsBalance < 0 ? 'Crédito a favor' : 'ITBMS por pagar'}</div><div class="valor ${t.itbmsBalance > 0 ? 'gasto' : t.itbmsBalance < 0 ? 'ingreso' : ''}">${dinero(Math.abs(t.itbmsBalance))}</div><div class="nota">cobrado − pagado</div></div>
    </div>
  </section>
  <section class="tarjeta">
    <h2>Análisis del mes</h2>
    <ul class="consejos">${consejos().map((c) => `<li class="${c.tono}">${c.html}</li>`).join('')}</ul>
  </section>
  <section class="dos">
    <div class="tarjeta">
      <div class="cabecera">
        <h2>Por categoría</h2>
        <div class="segmento chico" role="group" aria-label="Tipo de movimiento">
          <button type="button" data-accion="dona-tipo" data-tipo="gasto" class="${tipoDona === 'gasto' ? 'activo' : ''}">Gastos</button>
          <button type="button" data-accion="dona-tipo" data-tipo="ingreso" class="${tipoDona === 'ingreso' ? 'activo' : ''}">Ingresos</button>
        </div>
      </div>
      ${dona(t.porCat[tipoDona], tipoDona === 'gasto' ? t.gastos : t.ingresos)}
    </div>
    <div class="tarjeta">
      <h2>Últimos 6 meses</h2>
      ${grafico()}
      <div class="leyenda"><span><i style="background:var(--ingreso)"></i>Ingresos</span><span><i style="background:var(--gasto)"></i>Gastos</span></div>
    </div>
  </section>`;
}

// Colores de las categorías; el último (gris) agrupa las categorías pequeñas
const COLORES_CAT = ['#2f7ed8', '#e8833a', '#3fae87', '#d1495b', '#8e6bd1', '#d4a72c', '#26a9b8', '#d45d9b'];
const COLOR_OTRAS = '#8a9893';

function dona(porCat, total) {
  if (!total) return `<p class="vacio">Sin ${tipoDona === 'gasto' ? 'gastos' : 'ingresos'} este mes.</p>`;
  let cats = ordenados(porCat).map(([nombre, monto], i) => ({ nombre, monto, color: COLORES_CAT[i] }));
  // Más de 8 categorías: las menores se juntan en "Otras" para que el gráfico se lea bien
  if (cats.length > COLORES_CAT.length) {
    const resto = cats.slice(COLORES_CAT.length - 1);
    cats = cats.slice(0, COLORES_CAT.length - 1);
    cats.push({ nombre: `Otras (${resto.length})`, monto: resto.reduce((a, c) => a + c.monto, 0), color: COLOR_OTRAS, detalle: resto.map((c) => c.nombre).join(', ') });
  }
  const R = 70, C = 2 * Math.PI * R, hueco = cats.length > 1 ? 2 : 0;
  let acumulado = 0;
  const arcos = cats.map((c) => {
    const largo = (c.monto / total) * C;
    const arco = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${c.color}" stroke-width="34"
      stroke-dasharray="${Math.max(0.5, largo - hueco)} ${C}" stroke-dashoffset="${-acumulado}">
      <title>${esc(c.nombre)}: ${esc(dinero(c.monto))} (${pct(c.monto, total)})</title></circle>`;
    acumulado += largo;
    return arco;
  }).join('');
  return `<div class="dona">
    <svg viewBox="0 0 200 200" role="img" aria-label="Porcentaje por categoría">
      <g transform="rotate(-90 100 100)">${arcos}</g>
      <text x="100" y="94" text-anchor="middle" class="dona-rotulo">Total</text>
      <text x="100" y="116" text-anchor="middle" class="dona-total" style="font-size:${dinero(total).length > 12 ? 13 : dinero(total).length > 10 ? 15 : 17}px">${esc(dinero(total))}</text>
    </svg>
    <ul class="dona-leyenda">${cats.map((c) => `
      <li${c.detalle ? ` title="${esc(c.detalle)}"` : ''}><i style="background:${c.color}"></i><span class="nombre">${esc(c.nombre)}</span><b>${pct(c.monto, total)}</b><span class="cant">${esc(dinero(c.monto))}</span></li>`).join('')}
    </ul>
  </div>`;
}

function pct(parte, total) {
  const v = (parte / total) * 100;
  return `${v < 10 && v % 1 ? v.toFixed(1).replace('.', ',') : Math.round(v)}%`;
}

function grafico() {
  const serie = [];
  for (let i = 5; i >= 0; i--) {
    const m = mesMas(mes, -i);
    serie.push({ m, ...totales(movsDeMes(m)) });
  }
  const max = Math.max(1, ...serie.map((s) => Math.max(s.ingresos, s.gastos)));
  const W = 480, H = 200, base = 170, alto = 150, paso = W / 6, ancho = 22;
  const barras = serie.map((s, i) => {
    const x = i * paso + paso / 2;
    const hi = (s.ingresos / max) * alto;
    const hg = (s.gastos / max) * alto;
    return `
      <rect class="b-ing" x="${x - ancho - 2}" y="${base - hi}" width="${ancho}" height="${hi}" rx="3"><title>${esc(nombreMes(s.m))} · Ingresos: ${esc(dinero(s.ingresos))}</title></rect>
      <rect class="b-gas" x="${x + 2}" y="${base - hg}" width="${ancho}" height="${hg}" rx="3"><title>${esc(nombreMes(s.m))} · Gastos: ${esc(dinero(s.gastos))}</title></rect>
      <text x="${x}" y="${base + 18}" text-anchor="middle">${nombreMes(s.m, true)}</text>`;
  }).join('');
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">
    <line class="eje" x1="0" y1="${base}" x2="${W}" y2="${base}"/>${barras}</svg>`;
}

function consejos() {
  const t = totales(movsDeMes(mes));
  if (!t.ingresos && !t.gastos) {
    return [{ tono: '', html: 'Aún no hay movimientos en este mes. Usa <b>+ Agregar movimiento</b> para registrar tus ingresos y gastos.' }];
  }
  const lista = [];
  const previo = totales(movsDeMes(mesMas(mes, -1)));

  if (t.ingresos > 0) {
    const tasa = t.balance / t.ingresos;
    if (tasa < 0) lista.push({ tono: 'mal', html: `Gastaste <b>${esc(dinero(-t.balance))}</b> más de lo que ingresaste este mes.` });
    else if (tasa < 0.1) lista.push({ tono: 'ojo', html: `Estás ahorrando solo el <b>${Math.round(tasa * 100)}%</b> de tus ingresos. Para llegar al 20% necesitarías reducir gastos en <b>${esc(dinero(t.gastos - t.ingresos * 0.8))}</b>.` });
    else if (tasa < 0.2) lista.push({ tono: '', html: `Ahorras el <b>${Math.round(tasa * 100)}%</b> de tus ingresos. Te faltan <b>${esc(dinero(t.gastos - t.ingresos * 0.8))}</b> menos de gasto para llegar al 20%.` });
    else lista.push({ tono: '', html: `Vas muy bien: estás ahorrando el <b>${Math.round(tasa * 100)}%</b> de tus ingresos (${esc(dinero(t.balance))}).` });
  } else {
    lista.push({ tono: 'ojo', html: 'No has registrado ingresos este mes; agrégalos para calcular tu tasa de ahorro.' });
  }

  const fijos = estado.recurrentes.filter((r) => r.activo && r.tipo === 'gasto').reduce((a, r) => a + r.monto + r.itbms, 0);
  if (fijos > 0 && t.ingresos > 0) {
    const p = fijos / t.ingresos;
    lista.push({ tono: p > 0.6 ? 'ojo' : '', html: `Tus gastos fijos (recurrentes) suman <b>${esc(dinero(fijos))}</b> al mes: el ${Math.round(p * 100)}% de tus ingresos de este mes.` });
  }

  const cats = ordenados(t.porCat.gasto);
  if (cats.length) {
    const [cat, monto] = cats[0];
    lista.push({ tono: '', html: `Tu mayor gasto es <b>${esc(cat)}</b>: ${esc(dinero(monto))} (${Math.round((monto / t.gastos) * 100)}% del total).` });
  }

  let subida = null;
  for (const [cat, monto] of cats) {
    const antes = previo.porCat.gasto[cat] || 0;
    if (antes > 0 && monto > antes * 1.2 && (!subida || monto - antes > subida.dif)) subida = { cat, dif: monto - antes, pct: (monto / antes - 1) * 100 };
  }
  if (subida) lista.push({ tono: 'ojo', html: `En <b>${esc(subida.cat)}</b> gastaste ${esc(dinero(subida.dif))} más que el mes pasado (+${Math.round(subida.pct)}%).` });

  for (const [cat, limite] of Object.entries(estado.presupuestos)) {
    const gastado = t.porCat.gasto[cat] || 0;
    if (gastado > limite) lista.push({ tono: 'mal', html: `Superaste el presupuesto de <b>${esc(cat)}</b> por ${esc(dinero(gastado - limite))}.` });
    else if (gastado >= limite * 0.8) lista.push({ tono: 'ojo', html: `Ya usaste el ${Math.round((gastado / limite) * 100)}% del presupuesto de <b>${esc(cat)}</b>; te quedan ${esc(dinero(limite - gastado))}.` });
  }

  const hoyIso = hoy();
  if (mes === hoyIso.slice(0, 7) && t.gastos > 0) {
    const dia = Number(hoyIso.slice(8));
    const [a, mm] = mes.split('-').map(Number);
    const diasMes = new Date(a, mm, 0).getDate();
    if (dia >= 5 && dia < diasMes) {
      lista.push({ tono: '', html: `A este ritmo cerrarías el mes con unos <b>${esc(dinero((t.gastos / dia) * diasMes))}</b> en gastos.` });
    }
  }
  return lista;
}

function vistaMovimientos() {
  const todasCats = [...new Set([...estado.categorias.gasto, ...estado.categorias.ingreso])];
  return `
  <section class="tarjeta">
    <h2>Movimientos de ${esc(nombreMes(mes))}</h2>
    <div class="filtros">
      <select data-filtro="tipo" aria-label="Filtrar por tipo">
        <option value="">Todos los tipos</option>
        <option value="gasto" ${filtros.tipo === 'gasto' ? 'selected' : ''}>Gastos</option>
        <option value="ingreso" ${filtros.tipo === 'ingreso' ? 'selected' : ''}>Ingresos</option>
      </select>
      <select data-filtro="categoria" aria-label="Filtrar por categoría">
        <option value="">Todas las categorías</option>
        ${todasCats.map((c) => `<option ${filtros.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <input type="search" data-filtro="texto" placeholder="Buscar persona, factura, descripción…" value="${esc(filtros.texto)}" aria-label="Buscar">
    </div>
    <div class="tabla-caja" id="tabla-movs">${tablaMovimientos()}</div>
  </section>`;
}

function tablaMovimientos() {
  const texto = filtros.texto.trim().toLowerCase();
  const movs = porFecha(movsDeMes(mes)).filter((m) =>
    (!filtros.tipo || m.tipo === filtros.tipo) &&
    (!filtros.categoria || m.categoria === filtros.categoria) &&
    (!texto || [m.descripcion, m.categoria, m.contraparte, m.metodo, m.factura].some((v) => v.toLowerCase().includes(texto))));
  if (!movs.length) return '<p class="vacio">No hay movimientos que mostrar.</p>';
  const t = totales(movs);
  return `<div class="lista-movs">${movs.map((m) => `
    <button type="button" class="mov" data-accion="editar" data-id="${esc(m.id)}">
      <span class="mov-info">
        <b>${esc(m.categoria)}${m.recId ? ' <span class="rec" title="Recurrente">↻</span>' : ''}</b>
        <small>${fechaCorta(m.fecha)}${m.contraparte ? ` · ${esc(m.contraparte)}` : ''}${m.descripcion ? ` · ${esc(m.descripcion)}` : ''}</small>
      </span>
      <span class="mov-monto ${m.tipo}">${m.tipo === 'gasto' ? '−' : '+'}${esc(dinero(m.monto + m.itbms))}${m.itbms ? '<small>con ITBMS</small>' : ''}</span>
      <span class="mov-flecha" aria-hidden="true">›</span>
    </button>`).join('')}
    <p class="nota-lista">${movs.length} movimiento${movs.length === 1 ? '' : 's'} · Balance ${esc(dinero(t.balance + t.itbmsBalance))} · Toca uno para editarlo</p>
  </div>
  <table class="tabla-movs">
    <thead><tr><th>Fecha</th><th>Categoría</th><th>De / Para</th><th>Descripción</th><th>Método</th><th class="monto">Monto</th><th class="monto">ITBMS</th><th class="monto">Total</th><th></th></tr></thead>
    <tbody>${movs.map((m) => `
      <tr class="fila-editable" data-fila="${esc(m.id)}" title="Clic para editar">
        <td>${fechaCorta(m.fecha)}</td>
        <td>${esc(m.categoria)}${m.recId ? ' <span class="rec" title="Recurrente">↻</span>' : ''}</td>
        <td class="desc">${esc(m.contraparte)}</td>
        <td class="desc">${esc(m.descripcion)}${m.factura ? `<small>Factura n.º ${esc(m.factura)}</small>` : ''}</td>
        <td>${esc(m.metodo)}</td>
        <td class="monto ${m.tipo}">${m.tipo === 'gasto' ? '−' : '+'}${esc(dinero(m.monto))}</td>
        <td class="monto">${m.itbms ? esc(dinero(m.itbms)) : '—'}</td>
        <td class="monto">${esc(dinero(m.monto + m.itbms))}</td>
        <td class="ops">
          <button type="button" class="enlace" data-accion="editar" data-id="${esc(m.id)}">Editar</button>
          <button type="button" class="enlace peligro" data-accion="borrar" data-id="${esc(m.id)}">Borrar</button>
        </td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr><th colspan="5">${movs.length} movimiento${movs.length === 1 ? '' : 's'} · Balance</th><th class="monto">${esc(dinero(t.balance))}</th><th class="monto">${esc(dinero(t.itbmsBalance))}</th><th class="monto">${esc(dinero(t.balance + t.itbmsBalance))}</th><th></th></tr></tfoot>
  </table>`;
}

function vistaPresupuestos() {
  const t = totales(movsDeMes(mes));
  return `
  <section class="tarjeta">
    <h2>Presupuesto mensual por categoría</h2>
    <p class="ayuda">Define cuánto quieres gastar como máximo en cada categoría. El avance corresponde a ${esc(nombreMes(mes))}.</p>
    ${estado.categorias.gasto.map((cat) => {
      const limite = estado.presupuestos[cat] || 0;
      const gastado = t.porCat.gasto[cat] || 0;
      const pct = limite ? (gastado / limite) * 100 : 0;
      const clase = pct > 100 ? 'excedido' : pct >= 80 ? 'alerta' : '';
      const detalle = limite
        ? `${dinero(gastado)} de ${dinero(limite)} · ${gastado > limite ? `excedido por ${dinero(gastado - limite)}` : `quedan ${dinero(limite - gastado)}`}`
        : `${dinero(gastado)} gastado · sin presupuesto`;
      return `
      <div class="presu">
        <div><b>${esc(cat)}</b><div class="detalle">${esc(detalle)}</div></div>
        <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Sin límite" value="${limite || ''}" data-presupuesto="${esc(cat)}" aria-label="Presupuesto de ${esc(cat)}">
        <div class="pista"><i class="${clase}" style="width:${Math.min(100, pct)}%"></i></div>
      </div>`;
    }).join('')}
  </section>`;
}

// ---------- Recurrentes ----------

function fechaDeMes(m, dia) {
  const [a, mm] = m.split('-').map(Number);
  return `${m}-${dos(Math.min(dia, new Date(a, mm, 0).getDate()))}`; // día 31 en un mes de 30 → último día
}

// Registra los movimientos recurrentes cuyo día ya llegó. El id es fijo por recurrente y mes,
// así dos dispositivos nunca crean el mismo movimiento dos veces, y uno borrado no vuelve a aparecer.
function generarRecurrentes() {
  const ahora = hoy(), mesHoy = ahora.slice(0, 7);
  const existentes = new Set(estado.movimientos.map((m) => m.id));
  let nuevos = 0;
  for (const r of estado.recurrentes) {
    if (!r.activo) continue;
    for (let m = r.desde, vueltas = 0; m <= mesHoy && vueltas < 240; m = mesMas(m, 1), vueltas++) {
      const fecha = fechaDeMes(m, r.dia);
      const id = `rec-${r.id}-${m}`;
      if (fecha > ahora || existentes.has(id) || estado.borrados[id]) continue;
      estado.movimientos.push({
        id, tipo: r.tipo, fecha, categoria: r.categoria, descripcion: r.descripcion, contraparte: r.contraparte,
        metodo: r.metodo, factura: '', monto: r.monto, itbms: r.itbms, mod: Date.now(), recId: r.id,
      });
      existentes.add(id);
      nuevos++;
    }
  }
  if (nuevos) guardar();
  return nuevos;
}

function proximaFecha(r) {
  const ahora = hoy();
  let m = r.desde > ahora.slice(0, 7) ? r.desde : ahora.slice(0, 7);
  if (fechaDeMes(m, r.dia) <= ahora) m = mesMas(m, 1);
  return fechaDeMes(m, r.dia);
}

function vistaRecurrentes() {
  const activos = estado.recurrentes.filter((r) => r.activo);
  const suma = (tipo) => activos.filter((r) => r.tipo === tipo).reduce((a, r) => a + r.monto + r.itbms, 0);
  const lista = [...estado.recurrentes].sort((a, b) => (a.tipo !== b.tipo ? (a.tipo === 'ingreso' ? -1 : 1) : a.dia - b.dia));
  return `
  <section class="cifras">
    <div class="tarjeta cifra"><div class="rotulo">Ingresos fijos al mes</div><div class="valor ingreso">${dinero(suma('ingreso'))}</div></div>
    <div class="tarjeta cifra"><div class="rotulo">Gastos fijos al mes</div><div class="valor gasto">${dinero(suma('gasto'))}</div></div>
    <div class="tarjeta cifra"><div class="rotulo">Queda después de lo fijo</div><div class="valor ${suma('ingreso') - suma('gasto') < 0 ? 'gasto' : ''}">${dinero(suma('ingreso') - suma('gasto'))}</div></div>
  </section>
  <section class="tarjeta">
    <div class="cabecera">
      <h2>Gastos e ingresos recurrentes</h2>
      <button type="button" class="primario" data-accion="nuevo-rec">+ Nuevo recurrente</button>
    </div>
    <p class="ayuda">Se registran solos en Movimientos el día indicado de cada mes. Si cambias o borras uno de esos movimientos, el cambio se respeta.</p>
    ${lista.length ? `<div class="lista-rec">${lista.map((r) => `
      <button type="button" class="mov ${r.activo ? '' : 'pausado'}" data-accion="editar-rec" data-id="${esc(r.id)}">
        <span class="mov-info">
          <b>${esc(r.descripcion || r.categoria)}${r.activo ? '' : ' <span class="etiqueta">En pausa</span>'}</b>
          <small>${esc(r.descripcion ? r.categoria : '')}${r.descripcion ? ' · ' : ''}Día ${r.dia} de cada mes${r.activo ? ` · próximo: ${fechaCorta(proximaFecha(r))}` : ''}${r.contraparte ? ` · ${esc(r.contraparte)}` : ''}</small>
        </span>
        <span class="mov-monto ${r.tipo}">${r.tipo === 'gasto' ? '−' : '+'}${esc(dinero(r.monto + r.itbms))}${r.itbms ? '<small>con ITBMS</small>' : ''}</span>
        <span class="mov-flecha" aria-hidden="true">›</span>
      </button>`).join('')}</div>`
    : '<p class="vacio">Aún no tienes recurrentes. Agrega tu alquiler, servicios, suscripciones o salario para que se registren solos cada mes.</p>'}
  </section>`;
}

function borrarRecurrente(id) {
  const r = estado.recurrentes.find((x) => x.id === id);
  if (!r || !confirm(`¿Eliminar este recurrente?\n${r.descripcion || r.categoria} · ${dinero(r.monto + r.itbms)}\n\nLos movimientos ya registrados se mantienen; solo dejará de crearse en los próximos meses.`)) return false;
  estado.recurrentes = estado.recurrentes.filter((x) => x.id !== id);
  estado.borrados[id] = Date.now();
  guardar();
  render();
  return true;
}

function vistaReportes() {
  const anio = mes.slice(0, 4);
  return `
  <section class="tarjeta">
    <h2>Descargar reporte en Excel</h2>
    <p class="ayuda">El archivo incluye las hojas: Movimientos, Resumen mensual, Balance ITBMS y Por categoría (y Presupuestos cuando el periodo es un mes).</p>
    <div class="fila-form">
      <label>Periodo
        <select id="rep-periodo">
          <option value="mes">${esc(nombreMes(mes))}</option>
          <option value="anio">Año ${anio}</option>
          <option value="todo">Todo el historial</option>
          <option value="rango">Rango personalizado</option>
        </select>
      </label>
      <label>Desde <input type="date" id="rep-desde" value="${mes}-01" disabled></label>
      <label>Hasta <input type="date" id="rep-hasta" value="${hoy()}" disabled></label>
    </div>
    <div class="botones"><button type="button" class="primario" data-accion="exportar">Descargar Excel (.xlsx)</button></div>
  </section>
  <section class="tarjeta">
    <h2>Ajustes</h2>
    <div class="fila-form">
      <label>Moneda
        <select id="aj-moneda">${MONEDAS.map((m) => `<option ${m === estado.moneda ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </label>
    </div>
    <p class="ayuda">Categorías de gasto: ${estado.categorias.gasto.map(esc).join(', ')}.<br>Categorías de ingreso: ${estado.categorias.ingreso.map(esc).join(', ')}.<br>Puedes crear una nueva desde el formulario de movimiento, eligiendo “+ Nueva categoría…”.</p>
  </section>
  <section class="tarjeta">
    <h2>Google Drive</h2>
    <div id="nube-caja">${window.Nube ? window.Nube.vista() : ''}</div>
  </section>
  <section class="tarjeta">
    <h2>Respaldo de datos</h2>
    <p class="ayuda">Tus datos se guardan en este dispositivo (y en tu Google Drive si lo conectas). También puedes descargar un respaldo manual.</p>
    <div class="botones">
      <button type="button" data-accion="respaldar">Descargar respaldo (.json)</button>
      <button type="button" data-accion="restaurar">Restaurar respaldo…</button>
      <input type="file" id="archivo-respaldo" accept="application/json,.json" hidden>
    </div>
  </section>`;
}

// ---------- Formulario ----------

const dialogo = $('#dialogo');
const formulario = $('#formulario');
const NUEVA = '__nueva__';

function llenarCategorias(tipo, seleccion) {
  const sel = formulario.elements.categoria;
  sel.innerHTML = estado.categorias[tipo].map((c) => `<option>${esc(c)}</option>`).join('') + `<option value="${NUEVA}">+ Nueva categoría…</option>`;
  if (seleccion && estado.categorias[tipo].includes(seleccion)) sel.value = seleccion;
}

// Ajusta los campos que dependen de si es ingreso o gasto
function ajustarPorTipo(tipo) {
  $('#rotulo-contraparte').textContent = tipo === 'ingreso' ? 'Recibido de' : 'Pagado a';
  $('#campo-factura').hidden = tipo !== 'ingreso';
}

function abrirFormulario(mov, esRecurrente = false) {
  modoForm = esRecurrente ? 'rec' : 'mov';
  formulario.reset();
  const f = formulario.elements;
  $('#campo-fecha').hidden = esRecurrente;
  f.fecha.required = !esRecurrente;
  $('#bloque-recurrente').hidden = !esRecurrente;
  $('#campo-repetir').hidden = esRecurrente || Boolean(mov);
  if (esRecurrente) {
    const base = hoy().slice(0, 7);
    const meses = new Set([...Array(25)].map((_, i) => mesMas(base, i - 12)));
    if (mov?.desde) meses.add(mov.desde);
    f.desde.innerHTML = [...meses].sort().map((m) => `<option value="${m}">${esc(nombreMes(m))}</option>`).join('');
    f.desde.value = mov?.desde || base;
    f.dia.value = mov?.dia || Number(hoy().slice(8));
    f.activo.checked = mov ? mov.activo : true;
  }
  const metodos = mov?.metodo && !METODOS.includes(mov.metodo) ? [...METODOS, mov.metodo] : METODOS;
  f.metodo.innerHTML = '<option value="">Sin especificar</option>' + metodos.map((m) => `<option>${esc(m)}</option>`).join('');
  f.metodo.value = mov?.metodo || '';
  f.contraparte.value = mov?.contraparte || '';
  f.factura.value = mov?.factura || '';
  $('#lista-contrapartes').innerHTML = [...new Set(estado.movimientos.map((m) => m.contraparte).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es')).map((n) => `<option value="${esc(n)}"></option>`).join('');
  ajustarPorTipo(mov?.tipo || 'gasto');
  f.id.value = mov?.id || '';
  f.tipo.value = mov?.tipo || 'gasto';
  f.monto.value = mov?.monto || '';
  f.fecha.value = mov?.fecha || (mes === hoy().slice(0, 7) ? hoy() : `${mes}-01`);
  f.descripcion.value = mov?.descripcion || '';
  f.itbms.checked = Boolean(mov?.itbms);
  f.incluye.checked = false;
  actualizarDesglose();
  if (mov && !estado.categorias[mov.tipo].includes(mov.categoria)) estado.categorias[mov.tipo].push(mov.categoria);
  llenarCategorias(f.tipo.value, mov?.categoria);
  $('#dialogo-titulo').textContent = esRecurrente ? (mov ? 'Editar recurrente' : 'Nuevo recurrente') : (mov ? 'Editar movimiento' : 'Nuevo movimiento');
  $('#btn-borrar-dialogo').hidden = !mov;
  dialogo.showModal();
  f.monto.focus();
}

// Calcula monto sin ITBMS, ITBMS y total a partir de lo escrito en el formulario
function calcularMontos() {
  const f = formulario.elements;
  const escrito = redondear(Number(f.monto.value) || 0);
  if (!f.itbms.checked) return { base: escrito, itbms: 0, total: escrito };
  if (f.incluye.checked) {
    const base = redondear(escrito / (1 + TASA_ITBMS));
    return { base, itbms: redondear(escrito - base), total: escrito };
  }
  const itbms = redondear(escrito * TASA_ITBMS);
  return { base: escrito, itbms, total: redondear(escrito + itbms) };
}

function actualizarDesglose() {
  const activo = formulario.elements.itbms.checked;
  $('#bloque-itbms').hidden = !activo;
  if (!activo) return;
  const c = calcularMontos();
  $('#desglose').innerHTML = `<div><span>Monto sin ITBMS</span><span>${esc(dinero(c.base))}</span></div>
    <div><span>ITBMS 7%</span><span>${esc(dinero(c.itbms))}</span></div>
    <div><span>Total</span><span>${esc(dinero(c.total))}</span></div>`;
}

formulario.addEventListener('input', actualizarDesglose);

formulario.addEventListener('change', (e) => {
  const f = formulario.elements;
  if (e.target.name === 'tipo') { llenarCategorias(f.tipo.value); ajustarPorTipo(f.tipo.value); }
  if (e.target.name === 'categoria' && f.categoria.value === NUEVA) {
    const nombre = (prompt('Nombre de la nueva categoría:') || '').trim().slice(0, 40);
    const lista = estado.categorias[f.tipo.value];
    if (nombre && !lista.includes(nombre)) { lista.push(nombre); estado.ajustesMod = Date.now(); guardar(); }
    llenarCategorias(f.tipo.value, nombre || lista[0]);
  }
});

formulario.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = formulario.elements;
  const { base: monto, itbms } = calcularMontos();
  if (!(monto > 0) || f.categoria.value === NUEVA) return;
  if (modoForm === 'rec') { guardarRecurrente(monto, itbms); return; }
  if (!f.fecha.value) return;
  const datos = {
    id: f.id.value || nuevoId(),
    tipo: f.tipo.value,
    fecha: f.fecha.value,
    categoria: f.categoria.value,
    descripcion: f.descripcion.value.trim(),
    contraparte: f.contraparte.value.trim(),
    metodo: f.metodo.value,
    factura: f.tipo.value === 'ingreso' ? f.factura.value.trim() : '',
    monto,
    itbms,
    mod: Date.now(),
  };
  const previo = estado.movimientos.find((m) => m.id === datos.id);
  if (previo?.recId) datos.recId = previo.recId;
  // "Repetir cada mes": crea el recurrente y este movimiento cuenta como el de este mes
  if (!previo && f.repetir.checked) {
    const r = { id: `r-${nuevoId()}`, tipo: datos.tipo, categoria: datos.categoria, descripcion: datos.descripcion, contraparte: datos.contraparte,
      metodo: datos.metodo, monto, itbms, dia: Number(datos.fecha.slice(8)), desde: datos.fecha.slice(0, 7), activo: true, mod: Date.now() };
    estado.recurrentes.push(r);
    datos.id = `rec-${r.id}-${r.desde}`;
    datos.recId = r.id;
  }
  const i = estado.movimientos.findIndex((m) => m.id === datos.id);
  if (i >= 0) estado.movimientos[i] = datos; else estado.movimientos.push(datos);
  guardar();
  mes = datos.fecha.slice(0, 7);
  dialogo.close();
  render();
});

function guardarRecurrente(monto, itbms) {
  const f = formulario.elements;
  const previo = estado.recurrentes.find((r) => r.id === f.id.value);
  const r = {
    id: previo?.id || `r-${nuevoId()}`,
    tipo: f.tipo.value,
    categoria: f.categoria.value,
    descripcion: f.descripcion.value.trim(),
    contraparte: f.contraparte.value.trim(),
    metodo: f.metodo.value,
    monto,
    itbms,
    dia: Math.min(31, Math.max(1, Math.round(Number(f.dia.value)) || 1)),
    desde: f.desde.value,
    activo: f.activo.checked,
    mod: Date.now(),
  };
  // Al reactivar uno pausado no se rellenan los meses en pausa
  if (previo && !previo.activo && r.activo && r.desde < hoy().slice(0, 7)) r.desde = hoy().slice(0, 7);
  if (previo) Object.assign(previo, r); else estado.recurrentes.push(r);
  guardar();
  generarRecurrentes();
  dialogo.close();
  render();
}

// ---------- Exportar ----------

function descargar(nombre, datos, tipo) {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hojasReporte(movs, mesPresupuesto) {
  const { ESTILO: S, fechaExcel } = Xlsx;
  const enc = (lista) => lista.map((v) => ({ v, s: S.encabezado }));
  const suma = (col, desde, hasta, v) => ({ v: redondear(v), s: S.dineroNegrita, f: `SUM(${col}${desde}:${col}${hasta})` });
  const hojas = [];

  // Movimientos
  const orden = [...movs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const t = totales(orden);
  const filasMov = [enc(['Fecha', 'Tipo', 'Categoría', 'Recibido de / Pagado a', 'Descripción', 'Método de pago', 'N.º de factura', 'Factura fiscal', 'Ingreso (sin ITBMS)', 'Gasto (sin ITBMS)', 'ITBMS 7%', 'Total con ITBMS'])];
  orden.forEach((m, i) => {
    const r = i + 2;
    filasMov.push([
      { v: fechaExcel(m.fecha), s: S.fecha },
      m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
      m.categoria,
      m.contraparte,
      m.descripcion,
      m.metodo,
      m.factura,
      m.itbms ? 'Sí' : 'No',
      m.tipo === 'ingreso' ? { v: m.monto, s: S.dinero } : null,
      m.tipo === 'gasto' ? { v: m.monto, s: S.dinero } : null,
      m.itbms ? { v: m.itbms, s: S.dinero } : null,
      { v: redondear(m.monto + m.itbms), s: S.dinero, f: `I${r}+J${r}+K${r}` },
    ]);
  });
  if (orden.length) {
    const ult = orden.length + 1;
    const vacias = Array(7).fill(null);
    filasMov.push([{ v: 'TOTAL', s: S.negrita }, ...vacias, suma('I', 2, ult, t.ingresos), suma('J', 2, ult, t.gastos)]);
    filasMov.push([{ v: 'BALANCE', s: S.negrita }, ...vacias, { v: t.balance, s: S.dineroNegrita, f: `I${ult + 1}-J${ult + 1}` }]);
  }
  hojas.push({ nombre: 'Movimientos', anchos: [12, 10, 20, 26, 34, 20, 15, 13, 19, 18, 12, 16], filas: filasMov });

  // Resumen mensual
  const meses = [...new Set(orden.map((m) => m.fecha.slice(0, 7)))];
  const filasMes = [enc(['Mes', 'Ingresos', 'Gastos', 'Balance', '% Ahorro'])];
  meses.forEach((m, i) => {
    const tm = totales(orden.filter((x) => x.fecha.startsWith(m)));
    const r = i + 2;
    filasMes.push([
      nombreMes(m),
      { v: tm.ingresos, s: S.dinero },
      { v: tm.gastos, s: S.dinero },
      { v: tm.balance, s: S.dinero, f: `B${r}-C${r}` },
      { v: tm.ingresos ? tm.balance / tm.ingresos : 0, s: S.porcentaje, f: `IF(B${r}=0,0,D${r}/B${r})` },
    ]);
  });
  if (meses.length) {
    const ult = meses.length + 1;
    filasMes.push([{ v: 'TOTAL', s: S.negrita }, suma('B', 2, ult, t.ingresos), suma('C', 2, ult, t.gastos), suma('D', 2, ult, t.balance), null]);
  }
  hojas.push({ nombre: 'Resumen mensual', anchos: [20, 14, 14, 14, 11], filas: filasMes });

  // Balance de ITBMS por mes
  const filasItbms = [enc(['Mes', 'Ingresos con factura fiscal', 'ITBMS cobrado', 'Gastos con factura fiscal', 'ITBMS pagado', 'ITBMS por pagar (cobrado − pagado)'])];
  meses.forEach((m, i) => {
    const tm = totales(orden.filter((x) => x.fecha.startsWith(m)));
    const r = i + 2;
    filasItbms.push([
      nombreMes(m),
      { v: tm.ventasFiscales, s: S.dinero },
      { v: tm.itbmsCobrado, s: S.dinero },
      { v: tm.comprasFiscales, s: S.dinero },
      { v: tm.itbmsPagado, s: S.dinero },
      { v: tm.itbmsBalance, s: S.dinero, f: `C${r}-E${r}` },
    ]);
  });
  if (meses.length) {
    const ult = meses.length + 1;
    filasItbms.push([{ v: 'TOTAL', s: S.negrita }, suma('B', 2, ult, t.ventasFiscales), suma('C', 2, ult, t.itbmsCobrado), suma('D', 2, ult, t.comprasFiscales), suma('E', 2, ult, t.itbmsPagado), suma('F', 2, ult, t.itbmsBalance)]);
  }
  hojas.push({ nombre: 'Balance ITBMS', anchos: [20, 26, 15, 25, 15, 34], filas: filasItbms });

  // Por categoría
  const filasCat = [enc(['Tipo', 'Categoría', 'Total', '% del tipo'])];
  for (const [tipo, rotulo, total] of [['ingreso', 'Ingreso', t.ingresos], ['gasto', 'Gasto', t.gastos]]) {
    for (const [cat, monto] of ordenados(t.porCat[tipo])) {
      filasCat.push([rotulo, cat, { v: redondear(monto), s: S.dinero }, { v: total ? monto / total : 0, s: S.porcentaje }]);
    }
  }
  hojas.push({ nombre: 'Por categoría', anchos: [10, 24, 14, 12], filas: filasCat });

  // Presupuestos (solo si el periodo es un mes)
  const presu = Object.entries(estado.presupuestos);
  if (mesPresupuesto && presu.length) {
    const filas = [enc(['Categoría', 'Presupuesto', 'Gastado', 'Disponible', '% Usado'])];
    presu.forEach(([cat, limite], i) => {
      const gastado = redondear(t.porCat.gasto[cat] || 0);
      const r = i + 2;
      filas.push([
        cat,
        { v: limite, s: S.dinero },
        { v: gastado, s: S.dinero },
        { v: redondear(limite - gastado), s: S.dinero, f: `B${r}-C${r}` },
        { v: gastado / limite, s: S.porcentaje, f: `IF(B${r}=0,0,C${r}/B${r})` },
      ]);
    });
    hojas.push({ nombre: `Presupuestos ${mesPresupuesto}`, anchos: [24, 14, 14, 14, 11], filas });
  }
  return hojas;
}

function exportarExcel() {
  const periodo = $('#rep-periodo').value;
  let desde = '0000-00-00', hasta = '9999-99-99', etiqueta = 'historial';
  if (periodo === 'mes') { desde = `${mes}-01`; hasta = `${mes}-31`; etiqueta = mes; }
  else if (periodo === 'anio') { const a = mes.slice(0, 4); desde = `${a}-01-01`; hasta = `${a}-12-31`; etiqueta = a; }
  else if (periodo === 'rango') {
    desde = $('#rep-desde').value; hasta = $('#rep-hasta').value;
    if (!desde || !hasta || desde > hasta) { alert('Elige un rango de fechas válido.'); return; }
    etiqueta = `${desde}_a_${hasta}`;
  }
  const movs = estado.movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  if (!movs.length) { alert('No hay movimientos en el periodo elegido.'); return; }
  const bytes = Xlsx.crearXlsx(hojasReporte(movs, periodo === 'mes' ? mes : null));
  descargar(`Finanzas_${etiqueta}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function restaurar(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    let datos;
    try { datos = JSON.parse(lector.result); } catch { alert('El archivo no es un respaldo válido.'); return; }
    if (!datos || !Array.isArray(datos.movimientos)) { alert('El archivo no es un respaldo válido.'); return; }
    const nuevo = normalizar(datos);
    if (!confirm(`Se reemplazarán tus datos actuales (${estado.movimientos.length} movimientos) por los del respaldo (${nuevo.movimientos.length} movimientos). ¿Continuar?`)) return;
    // Marca el respaldo como lo más reciente para que la sincronización no lo deshaga
    const ahora = Date.now();
    const ids = new Set(nuevo.movimientos.map((m) => m.id));
    nuevo.borrados = { ...estado.borrados, ...nuevo.borrados };
    for (const m of estado.movimientos) if (!ids.has(m.id)) nuevo.borrados[m.id] = ahora;
    for (const m of nuevo.movimientos) { m.mod = ahora; delete nuevo.borrados[m.id]; }
    nuevo.ajustesMod = ahora;
    estado = nuevo;
    guardar();
    render();
  };
  lector.readAsText(archivo);
}

// ---------- Eventos ----------

function borrarMovimiento(id) {
  const m = estado.movimientos.find((x) => x.id === id);
  if (!m || !confirm(`¿Borrar este movimiento?\n${fechaCorta(m.fecha)} · ${m.categoria} · ${dinero(m.monto)}`)) return false;
  estado.movimientos = estado.movimientos.filter((x) => x.id !== id);
  estado.borrados[id] = Date.now();
  guardar();
  render();
  return true;
}

document.addEventListener('click', (e) => {
  // Clic en cualquier parte de una fila de la tabla (fuera de sus botones) abre la edición
  const fila = e.target.closest('tr[data-fila]');
  if (fila && !e.target.closest('button')) { abrirFormulario(estado.movimientos.find((m) => m.id === fila.dataset.fila)); return; }

  const pestana = e.target.closest('#pestanas button');
  if (pestana) { vista = pestana.dataset.vista; render(); return; }

  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const id = boton.dataset.id;
  switch (boton.dataset.accion) {
    case 'mes-anterior': mes = mesMas(mes, -1); render(); break;
    case 'mes-siguiente': mes = mesMas(mes, 1); render(); break;
    case 'nuevo': abrirFormulario(); break;
    case 'cancelar': dialogo.close(); break;
    case 'editar': { const m = estado.movimientos.find((x) => x.id === id); if (m) abrirFormulario(m); break; }
    case 'borrar': borrarMovimiento(id); break;
    case 'borrar-dialogo': {
      const ok = modoForm === 'rec' ? borrarRecurrente(formulario.elements.id.value) : borrarMovimiento(formulario.elements.id.value);
      if (ok) dialogo.close();
      break;
    }
    case 'nuevo-rec': abrirFormulario(null, true); break;
    case 'editar-rec': { const r = estado.recurrentes.find((x) => x.id === id); if (r) abrirFormulario(r, true); break; }
    case 'dona-tipo': tipoDona = boton.dataset.tipo; render(); break;
    case 'exportar': exportarExcel(); break;
    case 'respaldar': descargar(`respaldo-finanzas-${hoy()}.json`, JSON.stringify(estado, null, 2), 'application/json'); break;
    case 'restaurar': $('#archivo-respaldo').click(); break;
    case 'nube-conectar': window.Nube?.conectar(); break;
    case 'nube-sincronizar': window.Nube?.sincronizar(); break;
    case 'nube-desconectar': window.Nube?.desconectar(); break;
    case 'nube-estado': window.Nube?.atender(); break;
  }
});

$('#contenido').addEventListener('input', (e) => {
  const f = e.target.dataset.filtro;
  if (!f) return;
  filtros[f] = e.target.value;
  $('#tabla-movs').innerHTML = tablaMovimientos();
});

$('#contenido').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.presupuesto) {
    const v = redondear(Number(el.value));
    if (v > 0) estado.presupuestos[el.dataset.presupuesto] = v; else delete estado.presupuestos[el.dataset.presupuesto];
    estado.ajustesMod = Date.now();
    guardar();
    render();
  } else if (el.id === 'aj-moneda') {
    estado.moneda = el.value;
    estado.ajustesMod = Date.now();
    guardar();
    render();
  } else if (el.id === 'rep-periodo') {
    const rango = el.value === 'rango';
    $('#rep-desde').disabled = !rango;
    $('#rep-hasta').disabled = !rango;
  } else if (el.id === 'archivo-respaldo' && el.files[0]) {
    restaurar(el.files[0]);
    el.value = '';
  }
});

generarRecurrentes();
render();

// Al volver a la app (por ejemplo, al día siguiente) registra los recurrentes que ya tocan
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !dialogo.open && generarRecurrentes()) render();
});

// Modo sin conexión (solo en la versión publicada)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
