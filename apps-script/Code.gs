/**
 * Turnos de RQ's — versión Google Apps Script
 * ------------------------------------------------------------------
 * App web ligada a una Google Sheet (script "vinculado" a la hoja).
 * La hoja guarda todo:
 *   - RQs     → historial de turnos tomados (una fila por RQ)
 *   - Estado  → a quién le toca y el orden de rotación
 *   - Config  → nombre del equipo, clientes, prioridades, dominio
 *
 * Para usarla en otro equipo solo se copia la hoja (el script viaja con
 * ella), se edita la pestaña Config y se implementa como app web.
 * Ver LEEME.md.
 */

// ---------------- Nombres de hojas y columnas ----------------
const SHEET_RQS = 'RQs';
const SHEET_ESTADO = 'Estado';
const SHEET_CONFIG = 'Config';

const RQ_HEADERS = ['id', 'fecha', 'miembro', 'cliente', 'prioridad',
                    'registrado_por', 'editado_por', 'editado_en', 'origen'];
const COL = { id: 0, fecha: 1, miembro: 2, cliente: 3, prioridad: 4,
              registrado_por: 5, editado_por: 6, editado_en: 7, origen: 8 };

// Valores por defecto: solo se usan al crear la pestaña Config la primera vez.
const DEFAULT_CONFIG = {
  equipo: "Turnos RQ's",
  subtitulo: 'Rotación del equipo · datos compartidos',
  zona_horaria: 'America/Bogota',
  dominio_permitido: '',            // ej. "empresa.com"; vacío = no restringe
  miembros: ['Ana', 'Luis', 'Sofía', 'Diego', 'Valeria'],
  clientes: ['Cliente A', 'Cliente B', 'Cliente C', 'Cliente D', 'Soporte (otras cuentas)'],
  prioridades: ['Low', 'Medium', 'High']
};

// ================================================================
// ===================  Punto de entrada web  =====================
// ================================================================
function doGet() {
  setup_();
  const cfg = getConfig_();
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.equipo = cfg.equipo;
  return tpl.evaluate()
    .setTitle(cfg.equipo)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Menú en la hoja para tareas de administración. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Turnos RQ's")
    .addItem('Preparar hojas (setup)', 'setup')
    .addItem('Migrar desde la app de Streamlit…', 'migrarDesdeStreamlitUI')
    .addToUi();
}

// ================================================================
// ===================  API llamada desde la UI  ==================
// ================================================================
// Todas devuelven el estado completo para que la UI se repinte.

function getState() {
  checkAccess_();
  return buildState_();
}

function tomarRq(cliente, prioridad) {
  return withLock_(function () {
    const cfg = getConfig_();
    validarCliente_(cfg, cliente);
    validarPrioridad_(cfg, prioridad);
    const est = leerEstado_();
    if (!est.orden.length) throw new Error('No hay miembros en la rotación.');
    const miembro = est.orden[est.indice % est.orden.length];
    hoja_(SHEET_RQS).appendRow([
      Utilities.getUuid(), new Date(), miembro, cliente, prioridad,
      usuario_(), '', '', 'app'
    ]);
    guardarEstado_((est.indice + 1) % est.orden.length, est.orden);
    return { state: buildState_(), msg: 'RQ de ' + cliente + ' registrada para ' + miembro };
  });
}

function editarRq(id, miembro, cliente, prioridad) {
  return withLock_(function () {
    const cfg = getConfig_();
    validarCliente_(cfg, cliente);
    validarPrioridad_(cfg, prioridad);
    const fila = buscarFila_(id);
    const sh = hoja_(SHEET_RQS);
    sh.getRange(fila, COL.miembro + 1, 1, 3).setValues([[miembro, cliente, prioridad]]);
    sh.getRange(fila, COL.editado_por + 1, 1, 2).setValues([[usuario_(), new Date()]]);
    return { state: buildState_(), msg: 'RQ corregida' };
  });
}

function eliminarRq(id) {
  return withLock_(function () {
    hoja_(SHEET_RQS).deleteRow(buscarFila_(id));
    return { state: buildState_(), msg: 'RQ eliminada' };
  });
}

function saltarTurno() {
  return withLock_(function () {
    const est = leerEstado_();
    guardarEstado_((est.indice + 1) % est.orden.length, est.orden);
    return { state: buildState_(), msg: 'Turno saltado' };
  });
}

function guardarOrden(orden) {
  return withLock_(function () {
    const est = leerEstado_();
    const limpio = orden.map(String).map(function (s) { return s.trim(); }).filter(String);
    if (limpio.length !== est.orden.length ||
        limpio.slice().sort().join('|') !== est.orden.slice().sort().join('|')) {
      throw new Error('El orden cambió mientras editabas. Actualiza e intenta de nuevo.');
    }
    // Mantiene el turno en la misma persona aunque cambie su posición.
    const actual = est.orden[est.indice % est.orden.length];
    guardarEstado_(limpio.indexOf(actual), limpio);
    return { state: buildState_(), msg: 'Orden actualizado para el equipo' };
  });
}

function agregarMiembro(nombre) {
  return withLock_(function () {
    nombre = String(nombre || '').trim();
    if (!nombre) throw new Error('Escribe un nombre.');
    const est = leerEstado_();
    if (est.orden.indexOf(nombre) >= 0) throw new Error(nombre + ' ya está en el equipo.');
    guardarEstado_(est.indice, est.orden.concat([nombre]));
    return { state: buildState_(), msg: nombre + ' agregado al equipo' };
  });
}

function quitarMiembro(nombre) {
  return withLock_(function () {
    const est = leerEstado_();
    if (est.orden.length <= 1) throw new Error('Debe quedar al menos una persona.');
    const pos = est.orden.indexOf(nombre);
    if (pos < 0) throw new Error(nombre + ' no está en el equipo.');
    const actual = est.orden[est.indice % est.orden.length];
    const nueva = est.orden.filter(function (m) { return m !== nombre; });
    // Si se quita a quien le tocaba, el turno pasa al siguiente.
    let idx = actual === nombre ? pos % nueva.length : nueva.indexOf(actual);
    guardarEstado_(idx, nueva);
    return { state: buildState_(), msg: nombre + ' quitado del equipo' };
  });
}

/** CSV con todo el historial (para el botón "Exportar"). */
function exportarCsv() {
  checkAccess_();
  const cfg = getConfig_();
  const rows = leerRqs_(cfg);
  const head = ['fecha', 'miembro', 'cliente', 'prioridad', 'registrado_por', 'origen'];
  const esc = function (v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const lines = [head.join(',')].concat(rows.map(function (r) {
    return [r.fechaIso, r.miembro, r.cliente, r.prioridad, r.registradoPor, r.origen]
      .map(esc).join(',');
  }));
  return lines.join('\n');
}

// ================================================================
// =========================  Internos  ===========================
// ================================================================

function buildState_() {
  const cfg = getConfig_();
  const est = leerEstado_();
  return {
    config: {
      equipo: cfg.equipo, subtitulo: cfg.subtitulo,
      clientes: cfg.clientes, prioridades: cfg.prioridades
    },
    orden: est.orden,
    indice: est.orden.length ? est.indice % est.orden.length : 0,
    rqs: leerRqs_(cfg),
    usuario: usuario_()
  };
}

function leerRqs_(cfg) {
  const sh = hoja_(SHEET_RQS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const tz = cfg.zona_horaria;
  return sh.getRange(2, 1, n, RQ_HEADERS.length).getValues()
    .filter(function (r) { return r[COL.id]; })
    .map(function (r) {
      const f = r[COL.fecha] instanceof Date ? r[COL.fecha] : new Date(r[COL.fecha]);
      return {
        id: String(r[COL.id]),
        ts: f.getTime(),
        fechaIso: Utilities.formatDate(f, tz, "yyyy-MM-dd'T'HH:mm"),
        fecha: Utilities.formatDate(f, tz, 'dd/MM/yyyy HH:mm'),
        mes: Utilities.formatDate(f, tz, 'yyyy-MM'),
        miembro: String(r[COL.miembro]),
        cliente: String(r[COL.cliente]),
        prioridad: String(r[COL.prioridad]),
        registradoPor: String(r[COL.registrado_por] || ''),
        origen: String(r[COL.origen] || '')
      };
    })
    .sort(function (a, b) { return b.ts - a.ts; });   // más reciente primero
}

function leerEstado_() {
  const sh = hoja_(SHEET_ESTADO);
  const v = sh.getRange(2, 1, 1, 2).getValues()[0];
  const orden = String(v[1] || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  return { indice: parseInt(v[0], 10) || 0, orden: orden };
}

function guardarEstado_(indice, orden) {
  hoja_(SHEET_ESTADO).getRange(2, 1, 1, 4)
    .setValues([[Math.max(0, indice), orden.join(','), usuario_(), new Date()]]);
}

function buscarFila_(id) {
  const sh = hoja_(SHEET_RQS);
  const n = sh.getLastRow() - 1;
  if (n >= 1) {
    const ids = sh.getRange(2, 1, n, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  }
  throw new Error('No encontré esa RQ. Pulsa Actualizar.');
}

/**
 * Config: pestaña con dos columnas "clave | valor".
 * Las listas (cliente, prioridad) van una por fila con la misma clave.
 */
function getConfig_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('config');
  if (hit) return JSON.parse(hit);
  const vals = hoja_(SHEET_CONFIG).getDataRange().getValues().slice(1);
  const cfg = { clientes: [], prioridades: [] };
  vals.forEach(function (r) {
    const k = String(r[0] || '').trim().toLowerCase();
    const v = String(r[1] == null ? '' : r[1]).trim();
    if (!k || !v) return;
    if (k === 'cliente') cfg.clientes.push(v);
    else if (k === 'prioridad') cfg.prioridades.push(v);
    else cfg[k] = v;
  });
  ['equipo', 'subtitulo', 'zona_horaria', 'dominio_permitido'].forEach(function (k) {
    if (cfg[k] == null) cfg[k] = DEFAULT_CONFIG[k];
  });
  if (!cfg.prioridades.length) cfg.prioridades = DEFAULT_CONFIG.prioridades.slice();
  cache.put('config', JSON.stringify(cfg), 60);
  return cfg;
}

/** Cuando alguien edita Config a mano, se limpia la caché. */
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === SHEET_CONFIG) {
    CacheService.getScriptCache().remove('config');
  }
}

function validarCliente_(cfg, c) {
  if (cfg.clientes.indexOf(c) < 0) throw new Error('Cliente no válido: ' + c);
}
function validarPrioridad_(cfg, p) {
  if (cfg.prioridades.indexOf(p) < 0) throw new Error('Prioridad no válida: ' + p);
}

function usuario_() {
  return Session.getActiveUser().getEmail() || '';
}

function checkAccess_() {
  const dom = getConfig_().dominio_permitido;
  if (!dom) return;
  const email = usuario_();
  if (!email || email.split('@')[1].toLowerCase() !== dom.toLowerCase()) {
    throw new Error('Esta app es solo para cuentas @' + dom);
  }
}

function withLock_(fn) {
  checkAccess_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Otra persona está guardando. Intenta de nuevo.');
  try {
    const out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    lock.releaseLock();
  }
}

function ss_() {
  // Script vinculado a la hoja. Si se usa como script independiente,
  // guardar el ID en Propiedades del script con la clave SHEET_ID.
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function hoja_(nombre) {
  const sh = ss_().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja "' + nombre + '". Ejecuta setup.');
  return sh;
}

// ================================================================
// ==========================  Setup  =============================
// ================================================================

/** Crea las pestañas que falten. Seguro de ejecutar varias veces. */
function setup() { setup_(); }

function setup_() {
  const ss = ss_();
  if (!ss.getSheetByName(SHEET_RQS)) {
    const sh = ss.insertSheet(SHEET_RQS);
    sh.getRange(1, 1, 1, RQ_HEADERS.length).setValues([RQ_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange('H:H').setNumberFormat('yyyy-mm-dd hh:mm');
  }
  if (!ss.getSheetByName(SHEET_ESTADO)) {
    const sh = ss.insertSheet(SHEET_ESTADO);
    sh.getRange(1, 1, 2, 4).setValues([
      ['turno_indice', 'orden', 'actualizado_por', 'actualizado_en'],
      [0, DEFAULT_CONFIG.miembros.join(','), '', new Date()]
    ]);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_CONFIG)) {
    const sh = ss.insertSheet(SHEET_CONFIG);
    const rows = [['clave', 'valor']];
    ['equipo', 'subtitulo', 'zona_horaria', 'dominio_permitido'].forEach(function (k) {
      rows.push([k, DEFAULT_CONFIG[k]]);
    });
    DEFAULT_CONFIG.prioridades.forEach(function (p) { rows.push(['prioridad', p]); });
    DEFAULT_CONFIG.clientes.forEach(function (c) { rows.push(['cliente', c]); });
    sh.getRange(1, 1, rows.length, 2).setValues(rows);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold');
    sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 320);
  }
}

/** Inserta otro archivo HTML del proyecto (se usa para Marca.html). */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}
