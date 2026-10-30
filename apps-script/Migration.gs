/**
 * Migration from the Streamlit app
 * ------------------------------------------------------------------
 * The Streamlit app stored its data in a Google Sheet with two tabs:
 *   historial → member | client | priority | time   (e.g. "05 oct 14:30", no year)
 *   estado    → turn_index | order                   (e.g. "Ana,Luis,...")
 *
 * This migration:
 *   1. Makes a backup copy of the whole old sheet in your Drive.
 *   2. Converts each row into the new RQs tab (with a full date and an id).
 *   3. Copies the rotation order and whose turn it is.
 * The old sheet is never modified.
 *
 * About the year: Streamlit saved "day month time" with no year. Rows were
 * stored newest first, so we walk them in that order and subtract a year
 * every time the month "goes up" (e.g. Jan → Dec).
 * The old app wrote Spanish month abbreviations (ene, abr, ago, dic…);
 * English ones are accepted too.
 */

const MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6,
                 jul: 7, ago: 8, aug: 8, sep: 9, oct: 10, nov: 11, dic: 12, dec: 12 };

/** From the sheet menu: asks for the URL, shows a preview and migrates. */
function migrateFromStreamlitUI() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Migrate from Streamlit',
    'Paste the URL of the Google Sheet the Streamlit app used:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const url = r.getResponseText().trim();

  const prev = readStreamlit_(url);
  const ok = ui.alert('Preview',
    prev.rows.length + ' RQs found' +
    (prev.rows.length ? ' (from ' + prev.from + ' to ' + prev.to + ')' : '') + '.\n' +
    'Rotation order: ' + prev.order.join(', ') + '\n' +
    'Current turn: ' + (prev.order[prev.index % prev.order.length] || '—') + '\n\n' +
    'A backup copy of the old sheet will be made. Continue?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  const res = migrateFromStreamlit(url);
  ui.alert('Migration done',
    res.migrated + ' RQs migrated.\nBackup: ' + res.backupUrl, ui.ButtonSet.OK);
}

/**
 * Migrates. Can also be run from the editor:
 *   migrateFromStreamlit('https://docs.google.com/spreadsheets/d/...')
 * @param {string} urlOrId  URL or ID of the old sheet.
 * @param {boolean=} force  true to migrate even if migrated rows already exist.
 */
function migrateFromStreamlit(urlOrId, force) {
  setup_();
  const src = openSpreadsheet_(urlOrId);
  const data = readStreamlit_(urlOrId);

  const rqs = sheet_(SHEET_RQS);
  if (!force && rqs.getLastRow() > 1) {
    const sources = rqs.getRange(2, COL.source + 1, rqs.getLastRow() - 1, 1).getValues();
    if (sources.some(function (s) { return s[0] === 'streamlit'; })) {
      throw new Error('RQs were already migrated. To repeat, delete those rows or pass force = true.');
    }
  }

  // 1. Full backup of the old sheet.
  const tz = getConfig_().timezone;
  const copy = DriveApp.getFileById(src.getId())
    .makeCopy('Streamlit RQ backup ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH-mm'));

  // 2. History → RQs (chronological order).
  const rows = data.rows.slice().reverse().map(function (x) {
    return [Utilities.getUuid(), x.date, x.member, x.client, x.priority,
            'migrated', '', '', 'streamlit'];
  });
  if (rows.length) {
    rqs.getRange(rqs.getLastRow() + 1, 1, rows.length, RQ_HEADERS.length).setValues(rows);
  }

  // 3. State (order and turn).
  if (data.order.length) saveState_(data.index % data.order.length, data.order);

  // 4. Clients found in the history but missing from Config.
  const cfg = getConfig_();
  const missing = [];
  data.rows.forEach(function (x) {
    if (cfg.clients.indexOf(x.client) < 0 && missing.indexOf(x.client) < 0) missing.push(x.client);
  });
  if (missing.length) {
    const sh = sheet_(SHEET_CONFIG);
    sh.getRange(sh.getLastRow() + 1, 1, missing.length, 2)
      .setValues(missing.map(function (c) { return ['client', c]; }));
  }
  CacheService.getScriptCache().remove('config');

  return { migrated: rows.length, backupUrl: copy.getUrl(), clientsAdded: missing };
}

/** Reads and normalizes the Streamlit sheet without writing anything. */
function readStreamlit_(urlOrId) {
  setup_();
  const src = openSpreadsheet_(urlOrId);
  const tz = getConfig_().timezone;

  const shH = src.getSheetByName('historial');
  if (!shH) throw new Error('The sheet has no "historial" tab.');
  const vals = shH.getDataRange().getValues();
  const head = vals.shift().map(function (h) { return String(h).trim().toLowerCase(); });
  const ix = function (n) {
    const i = head.indexOf(n);
    if (i < 0) throw new Error('Column "' + n + '" is missing in historial.');
    return i;
  };
  const iM = ix('member'), iC = ix('client'), iP = ix('priority'), iT = ix('time');

  const now = new Date();
  let year = Number(Utilities.formatDate(now, tz, 'yyyy'));
  const thisMonth = Number(Utilities.formatDate(now, tz, 'M'));
  let prevMonth = null;

  const rows = [];
  vals.forEach(function (r) {
    if (!r[iM] && !r[iC]) return;                     // empty row
    let date;
    const t = r[iT];
    if (t instanceof Date) {
      // Sheets converted the text into a date on its own: keep it.
      date = t;
      year = Number(Utilities.formatDate(t, tz, 'yyyy'));
      prevMonth = Number(Utilities.formatDate(t, tz, 'M'));
    } else {
      const m = String(t).trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})\.?\s+(\d{1,2}):(\d{2})$/);
      if (!m || !MONTHS[m[2]]) throw new Error('Could not read the date "' + t + '"');
      const month = MONTHS[m[2]];
      if (prevMonth === null && month > thisMonth) year--;   // newest row can't be in the future
      if (prevMonth !== null && month > prevMonth) year--;   // crossed into the previous year
      prevMonth = month;
      const txt = year + '-' + pad_(month) + '-' + pad_(m[1]) + ' ' + pad_(m[3]) + ':' + m[4];
      date = Utilities.parseDate(txt, tz, 'yyyy-MM-dd HH:mm');
    }
    rows.push({
      date: date,
      member: String(r[iM]).trim(),
      client: String(r[iC]).trim(),
      priority: String(r[iP]).trim()
    });
  });

  let index = 0, order = [];
  const shS = src.getSheetByName('estado');
  if (shS && shS.getLastRow() >= 2) {
    const e = shS.getRange(1, 1, 2, shS.getLastColumn()).getValues();
    const h = e[0].map(function (x) { return String(x).trim().toLowerCase(); });
    index = parseInt(e[1][h.indexOf('turn_index')], 10) || 0;
    const io = h.indexOf('order');
    if (io >= 0) order = String(e[1][io] || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  }
  if (!order.length) order = DEFAULT_CONFIG.members.slice();

  const fmt = function (d) { return Utilities.formatDate(d, tz, 'MMM d, yyyy'); };
  return {
    rows: rows, index: index, order: order,
    from: rows.length ? fmt(rows[rows.length - 1].date) : '',
    to: rows.length ? fmt(rows[0].date) : ''
  };
}

function openSpreadsheet_(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (!s) throw new Error('The sheet URL is missing.');
  return /^https?:/.test(s) ? SpreadsheetApp.openByUrl(s) : SpreadsheetApp.openById(s);
}

function pad_(n) { return ('0' + n).slice(-2); }
