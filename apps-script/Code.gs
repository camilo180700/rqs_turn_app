/**
 * RQ Rotation — Google Apps Script version
 * ------------------------------------------------------------------
 * Web app bound to a Google Sheet (a "container-bound" script).
 * The sheet stores everything:
 *   - RQs     → history of taken requests (one row per RQ)
 *   - State   → whose turn it is and the rotation order
 *   - Config  → team name, clients, priorities, allowed domain
 *
 * To reuse it for another team, copy the sheet (the script travels with
 * it), edit the Config tab and deploy it as a web app.
 * See SETUP_GUIDE.md.
 */

// ---------------- Sheet and column names ----------------
const SHEET_RQS = 'RQs';
const SHEET_STATE = 'State';
const SHEET_CONFIG = 'Config';

const RQ_HEADERS = ['id', 'date', 'member', 'client', 'priority',
                    'created_by', 'edited_by', 'edited_at', 'source'];
const COL = { id: 0, date: 1, member: 2, client: 3, priority: 4,
              created_by: 5, edited_by: 6, edited_at: 7, source: 8 };

// Defaults: only used the first time the Config tab is created.
const DEFAULT_CONFIG = {
  team: 'RQ Rotation',
  subtitle: 'Team rotation · shared data',
  timezone: 'America/Bogota',
  allowed_domain: '',               // e.g. "company.com"; empty = no restriction
  members: ['Ana', 'Luis', 'Sofia', 'Diego', 'Valeria'],
  clients: ['Client A', 'Client B', 'Client C', 'Client D', 'Support (other accounts)'],
  priorities: ['Low', 'Medium', 'High']
};

// ================================================================
// =======================  Web entry point  ======================
// ================================================================
function doGet() {
  setup_();
  const cfg = getConfig_();
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.team = cfg.team;
  return tpl.evaluate()
    .setTitle(cfg.team)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Sheet menu for admin tasks. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('RQ Rotation')
    .addItem('Prepare sheets (setup)', 'setup')
    .addItem('Migrate from the Streamlit app…', 'migrateFromStreamlitUI')
    .addToUi();
}

// ================================================================
// ======================  API called by the UI  ==================
// ================================================================
// Every call returns the full state so the UI can repaint.

function getState() {
  checkAccess_();
  return buildState_();
}

function takeRq(client, priority) {
  return withLock_(function () {
    const cfg = getConfig_();
    validateClient_(cfg, client);
    validatePriority_(cfg, priority);
    const st = readState_();
    if (!st.order.length) throw new Error('There are no members in the rotation.');
    const member = st.order[st.index % st.order.length];
    sheet_(SHEET_RQS).appendRow([
      Utilities.getUuid(), new Date(), member, client, priority,
      currentUser_(), '', '', 'app'
    ]);
    saveState_((st.index + 1) % st.order.length, st.order);
    return { state: buildState_(), msg: client + ' RQ logged for ' + member };
  });
}

function editRq(id, member, client, priority) {
  return withLock_(function () {
    const cfg = getConfig_();
    validateClient_(cfg, client);
    validatePriority_(cfg, priority);
    const row = findRow_(id);
    const sh = sheet_(SHEET_RQS);
    sh.getRange(row, COL.member + 1, 1, 3).setValues([[member, client, priority]]);
    sh.getRange(row, COL.edited_by + 1, 1, 2).setValues([[currentUser_(), new Date()]]);
    return { state: buildState_(), msg: 'RQ updated' };
  });
}

function deleteRq(id) {
  return withLock_(function () {
    sheet_(SHEET_RQS).deleteRow(findRow_(id));
    return { state: buildState_(), msg: 'RQ deleted' };
  });
}

function skipTurn() {
  return withLock_(function () {
    const st = readState_();
    saveState_((st.index + 1) % st.order.length, st.order);
    return { state: buildState_(), msg: 'Turn skipped' };
  });
}

function saveOrder(order) {
  return withLock_(function () {
    const st = readState_();
    const clean = order.map(String).map(function (s) { return s.trim(); }).filter(String);
    if (clean.length !== st.order.length ||
        clean.slice().sort().join('|') !== st.order.slice().sort().join('|')) {
      throw new Error('The order changed while you were editing. Refresh and try again.');
    }
    // Keep the turn on the same person even if their position changes.
    const current = st.order[st.index % st.order.length];
    saveState_(clean.indexOf(current), clean);
    return { state: buildState_(), msg: 'Order updated for the whole team' };
  });
}

function addMember(name) {
  return withLock_(function () {
    name = String(name || '').trim();
    if (!name) throw new Error('Type a name.');
    const st = readState_();
    if (st.order.indexOf(name) >= 0) throw new Error(name + ' is already on the team.');
    saveState_(st.index, st.order.concat([name]));
    return { state: buildState_(), msg: name + ' added to the team' };
  });
}

function removeMember(name) {
  return withLock_(function () {
    const st = readState_();
    if (st.order.length <= 1) throw new Error('At least one person must remain.');
    const pos = st.order.indexOf(name);
    if (pos < 0) throw new Error(name + ' is not on the team.');
    const current = st.order[st.index % st.order.length];
    const next = st.order.filter(function (m) { return m !== name; });
    // If the person whose turn it was is removed, the turn moves to the next one.
    const idx = current === name ? pos % next.length : next.indexOf(current);
    saveState_(idx, next);
    return { state: buildState_(), msg: name + ' removed from the team' };
  });
}

/** CSV with the whole history (for the "Export" button). */
function exportCsv() {
  checkAccess_();
  const cfg = getConfig_();
  const rows = readRqs_(cfg);
  const head = ['date', 'member', 'client', 'priority', 'created_by', 'source'];
  const esc = function (v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const lines = [head.join(',')].concat(rows.map(function (r) {
    return [r.dateIso, r.member, r.client, r.priority, r.createdBy, r.source]
      .map(esc).join(',');
  }));
  return lines.join('\n');
}

// ================================================================
// ==========================  Internals  =========================
// ================================================================

function buildState_() {
  const cfg = getConfig_();
  const st = readState_();
  return {
    config: {
      team: cfg.team, subtitle: cfg.subtitle,
      clients: cfg.clients, priorities: cfg.priorities
    },
    order: st.order,
    index: st.order.length ? st.index % st.order.length : 0,
    rqs: readRqs_(cfg),
    user: currentUser_()
  };
}

function readRqs_(cfg) {
  const sh = sheet_(SHEET_RQS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const tz = cfg.timezone;
  return sh.getRange(2, 1, n, RQ_HEADERS.length).getValues()
    .filter(function (r) { return r[COL.id]; })
    .map(function (r) {
      const d = r[COL.date] instanceof Date ? r[COL.date] : new Date(r[COL.date]);
      return {
        id: String(r[COL.id]),
        ts: d.getTime(),
        dateIso: Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm"),
        date: Utilities.formatDate(d, tz, 'MMM d, yyyy HH:mm'),
        month: Utilities.formatDate(d, tz, 'yyyy-MM'),
        member: String(r[COL.member]),
        client: String(r[COL.client]),
        priority: String(r[COL.priority]),
        createdBy: String(r[COL.created_by] || ''),
        source: String(r[COL.source] || '')
      };
    })
    .sort(function (a, b) { return b.ts - a.ts; });   // newest first
}

function readState_() {
  const sh = sheet_(SHEET_STATE);
  const v = sh.getRange(2, 1, 1, 2).getValues()[0];
  const order = String(v[1] || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  return { index: parseInt(v[0], 10) || 0, order: order };
}

function saveState_(index, order) {
  sheet_(SHEET_STATE).getRange(2, 1, 1, 4)
    .setValues([[Math.max(0, index), order.join(','), currentUser_(), new Date()]]);
}

function findRow_(id) {
  const sh = sheet_(SHEET_RQS);
  const n = sh.getLastRow() - 1;
  if (n >= 1) {
    const ids = sh.getRange(2, 1, n, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  }
  throw new Error('Could not find that RQ. Click Refresh.');
}

/**
 * Config: a tab with two columns "key | value".
 * Lists (client, priority) go one per row, repeating the key.
 */
function getConfig_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('config');
  if (hit) return JSON.parse(hit);
  const vals = sheet_(SHEET_CONFIG).getDataRange().getValues().slice(1);
  const cfg = { clients: [], priorities: [] };
  vals.forEach(function (r) {
    const k = String(r[0] || '').trim().toLowerCase();
    const v = String(r[1] == null ? '' : r[1]).trim();
    if (!k || !v) return;
    if (k === 'client') cfg.clients.push(v);
    else if (k === 'priority') cfg.priorities.push(v);
    else cfg[k] = v;
  });
  ['team', 'subtitle', 'timezone', 'allowed_domain'].forEach(function (k) {
    if (cfg[k] == null) cfg[k] = DEFAULT_CONFIG[k];
  });
  if (!cfg.priorities.length) cfg.priorities = DEFAULT_CONFIG.priorities.slice();
  cache.put('config', JSON.stringify(cfg), 60);
  return cfg;
}

/** When someone edits Config by hand, clear the cache. */
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === SHEET_CONFIG) {
    CacheService.getScriptCache().remove('config');
  }
}

function validateClient_(cfg, c) {
  if (cfg.clients.indexOf(c) < 0) throw new Error('Invalid client: ' + c);
}
function validatePriority_(cfg, p) {
  if (cfg.priorities.indexOf(p) < 0) throw new Error('Invalid priority: ' + p);
}

function currentUser_() {
  return Session.getActiveUser().getEmail() || '';
}

function checkAccess_() {
  const dom = getConfig_().allowed_domain;
  if (!dom) return;
  const email = currentUser_();
  if (!email || email.split('@')[1].toLowerCase() !== dom.toLowerCase()) {
    throw new Error('This app is only for @' + dom + ' accounts');
  }
}

function withLock_(fn) {
  checkAccess_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Someone else is saving. Try again.');
  try {
    const out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    lock.releaseLock();
  }
}

function ss_() {
  // Bound to the sheet. If used as a standalone script, store the sheet ID
  // in Script Properties under the key SHEET_ID.
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet "' + name + '". Run setup.');
  return sh;
}

// ================================================================
// ============================  Setup  ===========================
// ================================================================

/** Creates any missing tabs. Safe to run more than once. */
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
  if (!ss.getSheetByName(SHEET_STATE)) {
    const sh = ss.insertSheet(SHEET_STATE);
    sh.getRange(1, 1, 2, 4).setValues([
      ['turn_index', 'order', 'updated_by', 'updated_at'],
      [0, DEFAULT_CONFIG.members.join(','), '', new Date()]
    ]);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_CONFIG)) {
    const sh = ss.insertSheet(SHEET_CONFIG);
    const rows = [['key', 'value']];
    ['team', 'subtitle', 'timezone', 'allowed_domain'].forEach(function (k) {
      rows.push([k, DEFAULT_CONFIG[k]]);
    });
    DEFAULT_CONFIG.priorities.forEach(function (p) { rows.push(['priority', p]); });
    DEFAULT_CONFIG.clients.forEach(function (c) { rows.push(['client', c]); });
    sh.getRange(1, 1, rows.length, 2).setValues(rows);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold');
    sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 320);
  }
}

/** Inlines another HTML file from the project (used for Brand.html). */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
