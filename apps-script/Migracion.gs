/**
 * Migración desde la app de Streamlit
 * ------------------------------------------------------------------
 * La app de Streamlit guardaba en una Google Sheet con dos pestañas:
 *   historial → member | client | priority | time   (ej. "05 oct 14:30", sin año)
 *   estado    → turn_index | order                   (ej. "Fer,Camilo,...")
 *
 * Esta migración:
 *   1. Hace una copia de respaldo de toda la hoja vieja en tu Drive.
 *   2. Convierte cada fila a la nueva pestaña RQs (con fecha completa e id).
 *   3. Copia el orden de rotación y a quién le toca.
 * La hoja vieja no se modifica.
 *
 * Sobre el año: Streamlit guardaba "día mes hora" sin año. Las filas
 * venían de la más reciente a la más vieja, así que se recorre en ese
 * orden y se resta un año cada vez que el mes "sube" (ej. ene → dic).
 */

const MESES_ES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
                   jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };

/** Desde el menú de la hoja: pide la URL, muestra vista previa y migra. */
function migrarDesdeStreamlitUI() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Migrar desde Streamlit',
    'Pega la URL de la Google Sheet que usaba la app de Streamlit:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const url = r.getResponseText().trim();

  const prev = leerStreamlit_(url);
  const ok = ui.alert('Vista previa',
    prev.filas.length + ' RQs encontradas' +
    (prev.filas.length ? ' (de ' + prev.desde + ' a ' + prev.hasta + ')' : '') + '.\n' +
    'Orden de rotación: ' + prev.orden.join(', ') + '\n' +
    'Le toca a: ' + (prev.orden[prev.indice % prev.orden.length] || '—') + '\n\n' +
    'Se hará una copia de respaldo de la hoja vieja. ¿Continuar?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  const res = migrarDesdeStreamlit(url);
  ui.alert('Migración lista',
    res.migradas + ' RQs migradas.\nRespaldo: ' + res.respaldoUrl, ui.ButtonSet.OK);
}

/**
 * Migra. Se puede correr también desde el editor:
 *   migrarDesdeStreamlit('https://docs.google.com/spreadsheets/d/...')
 * @param {string} urlOId  URL o ID de la hoja vieja.
 * @param {boolean=} forzar  true para migrar aunque ya haya filas migradas.
 */
function migrarDesdeStreamlit(urlOId, forzar) {
  setup_();
  const src = abrirHoja_(urlOId);
  const datos = leerStreamlit_(urlOId);

  const rqs = hoja_(SHEET_RQS);
  if (!forzar && rqs.getLastRow() > 1) {
    const origenes = rqs.getRange(2, COL.origen + 1, rqs.getLastRow() - 1, 1).getValues();
    if (origenes.some(function (o) { return o[0] === 'streamlit'; })) {
      throw new Error('Ya hay RQs migradas. Para repetir, borra esas filas o usa forzar = true.');
    }
  }

  // 1. Respaldo completo de la hoja vieja.
  const tz = getConfig_().zona_horaria;
  const copia = DriveApp.getFileById(src.getId())
    .makeCopy('Respaldo turnos Streamlit ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH-mm'));

  // 2. Historial → RQs (en orden cronológico).
  const filas = datos.filas.slice().reverse().map(function (f) {
    return [Utilities.getUuid(), f.fecha, f.miembro, f.cliente, f.prioridad,
            'migrado', '', '', 'streamlit'];
  });
  if (filas.length) {
    rqs.getRange(rqs.getLastRow() + 1, 1, filas.length, RQ_HEADERS.length).setValues(filas);
  }

  // 3. Estado (orden y turno).
  if (datos.orden.length) guardarEstado_(datos.indice % datos.orden.length, datos.orden);

  // 4. Clientes que existían en el historial pero no en Config.
  const cfg = getConfig_();
  const faltan = [];
  datos.filas.forEach(function (f) {
    if (cfg.clientes.indexOf(f.cliente) < 0 && faltan.indexOf(f.cliente) < 0) faltan.push(f.cliente);
  });
  if (faltan.length) {
    const sh = hoja_(SHEET_CONFIG);
    sh.getRange(sh.getLastRow() + 1, 1, faltan.length, 2)
      .setValues(faltan.map(function (c) { return ['cliente', c]; }));
  }
  CacheService.getScriptCache().remove('config');

  return { migradas: filas.length, respaldoUrl: copia.getUrl(), clientesAgregados: faltan };
}

/** Lee y normaliza la hoja de Streamlit sin escribir nada. */
function leerStreamlit_(urlOId) {
  setup_();
  const src = abrirHoja_(urlOId);
  const tz = getConfig_().zona_horaria;

  const shH = src.getSheetByName('historial');
  if (!shH) throw new Error('La hoja no tiene la pestaña "historial".');
  const vals = shH.getDataRange().getValues();
  const head = vals.shift().map(function (h) { return String(h).trim().toLowerCase(); });
  const ix = function (n) {
    const i = head.indexOf(n);
    if (i < 0) throw new Error('Falta la columna "' + n + '" en historial.');
    return i;
  };
  const iM = ix('member'), iC = ix('client'), iP = ix('priority'), iT = ix('time');

  const hoy = new Date();
  let anio = Number(Utilities.formatDate(hoy, tz, 'yyyy'));
  const mesHoy = Number(Utilities.formatDate(hoy, tz, 'M'));
  let mesPrev = null;

  const filas = [];
  vals.forEach(function (r) {
    if (!r[iM] && !r[iC]) return;                     // fila vacía
    let fecha;
    const t = r[iT];
    if (t instanceof Date) {
      // Sheets convirtió el texto a fecha por su cuenta: se respeta.
      fecha = t;
      anio = Number(Utilities.formatDate(t, tz, 'yyyy'));
      mesPrev = Number(Utilities.formatDate(t, tz, 'M'));
    } else {
      const m = String(t).trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})\.?\s+(\d{1,2}):(\d{2})$/);
      if (!m || !MESES_ES[m[2]]) throw new Error('No pude leer la fecha "' + t + '"');
      const mes = MESES_ES[m[2]];
      if (mesPrev === null && mes > mesHoy) anio--;   // la más reciente no puede estar en el futuro
      if (mesPrev !== null && mes > mesPrev) anio--;  // cruzamos hacia el año anterior
      mesPrev = mes;
      const txt = anio + '-' + pad_(mes) + '-' + pad_(m[1]) + ' ' + pad_(m[3]) + ':' + m[4];
      fecha = Utilities.parseDate(txt, tz, 'yyyy-MM-dd HH:mm');
    }
    filas.push({
      fecha: fecha,
      miembro: String(r[iM]).trim(),
      cliente: String(r[iC]).trim(),
      prioridad: String(r[iP]).trim()
    });
  });

  let indice = 0, orden = [];
  const shE = src.getSheetByName('estado');
  if (shE && shE.getLastRow() >= 2) {
    const e = shE.getRange(1, 1, 2, shE.getLastColumn()).getValues();
    const h = e[0].map(function (x) { return String(x).trim().toLowerCase(); });
    indice = parseInt(e[1][h.indexOf('turn_index')], 10) || 0;
    const io = h.indexOf('order');
    if (io >= 0) orden = String(e[1][io] || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  }
  if (!orden.length) orden = DEFAULT_CONFIG.miembros.slice();

  const fmt = function (d) { return Utilities.formatDate(d, tz, 'dd MMM yyyy'); };
  return {
    filas: filas, indice: indice, orden: orden,
    desde: filas.length ? fmt(filas[filas.length - 1].fecha) : '',
    hasta: filas.length ? fmt(filas[0].fecha) : ''
  };
}

function abrirHoja_(urlOId) {
  const s = String(urlOId || '').trim();
  if (!s) throw new Error('Falta la URL de la hoja.');
  return /^https?:/.test(s) ? SpreadsheetApp.openByUrl(s) : SpreadsheetApp.openById(s);
}

function pad_(n) { return ('0' + n).slice(-2); }
