/**
 * RQ Rotation — Google Apps Script version (multi-team)
 * ------------------------------------------------------------------
 * Web app bound to a Google Sheet (a "container-bound" script).
 * The sheet stores everything:
 *   - Teams   → one row per team: senior manager, manager, rotation
 *               order, whose turn it is and the team's clients
 *   - RQs     → history of taken requests (one row per RQ, with its team)
 *   - Config  → app title, subtitle, priorities, timezone, allowed domain
 *
 * Upgrading from the single-team version is automatic: the first time the
 * new code runs it creates the Teams tab with one team built from the old
 * State tab (order and turn) and the old Config clients, and tags every
 * existing RQ with that team. Old tabs are left as they are.
 * See SETUP_GUIDE.md.
 */

// ---------------- Sheet and column names ----------------
const SHEET_RQS = 'RQs';
const SHEET_TEAMS = 'Teams';
const SHEET_CONFIG = 'Config';
const SHEET_STATE = 'State';          // legacy (single-team); only read when upgrading

const RQ_HEADERS = ['id', 'date', 'member', 'client', 'priority',
                    'created_by', 'edited_by', 'edited_at', 'source', 'team'];
const COL = { id: 0, date: 1, member: 2, client: 3, priority: 4,
              created_by: 5, edited_by: 6, edited_at: 7, source: 8, team: 9 };

const TEAM_HEADERS = ['team', 'senior_manager', 'manager', 'members', 'turn_index',
                      'clients', 'updated_by', 'updated_at'];
const TCOL = { name: 0, sm: 1, manager: 2, members: 3, index: 4, clients: 5,
               updated_by: 6, updated_at: 7 };

// Defaults: only used the first time a tab is created.
const DEFAULT_CONFIG = {
  title: 'RQ Rotation',
  subtitle: 'Team rotation · shared data',
  timezone: 'America/Bogota',
  allowed_domain: '',               // e.g. "company.com"; empty = no restriction
  team: 'My team',                  // name of the first team
  members: ['Ana', 'Diego', 'Luis', 'Sofia', 'Valeria'],
  clients: ['Client A', 'Client B', 'Client C', 'Client D', 'Support (other accounts)'],
  priorities: ['Low', 'Medium', 'High']
};

// ================================================================
// =======================  Web entry point  ======================
// ================================================================
function doGet(e) {
  setup_();
  const cfg = getConfig_();
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.title = cfg.title;
  // Optional deep link: .../exec?team=Team%20Name
  tpl.initialTeam = (e && e.parameter && e.parameter.team) || '';
  return tpl.evaluate()
    .setTitle(cfg.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // ALLOWALL so the app can be embedded in another site (e.g. an internal portal).
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
// Every call takes the team name first and returns the full state for
// that team (plus a summary of every team) so the UI can repaint.
// An empty team name means "All teams" (overview only).

function getState(team) {
  checkAccess_();
  return buildState_(team);
}

function takeRq(team, client, priority) {
  return withLock_(function () {
    const cfg = getConfig_();
    const t = findTeam_(team);
    validateClient_(t, client);
    validatePriority_(cfg, priority);
    if (!t.order.length) throw new Error('There are no members in this rotation.');
    const member = t.order[t.index];
    sheet_(SHEET_RQS).appendRow([
      Utilities.getUuid(), new Date(), member, client, priority,
      currentUser_(), '', '', 'app', t.name
    ]);
    t.index = (t.index + 1) % t.order.length;
    saveTeam_(t);
    return { state: buildState_(t.name), msg: client + ' RQ logged for ' + member };
  });
}

function editRq(team, id, member, client, priority) {
  return withLock_(function () {
    const cfg = getConfig_();
    const t = findTeam_(team);
    const row = findRow_(id);
    const sh = sheet_(SHEET_RQS);
    const old = sh.getRange(row, COL.client + 1).getValue();
    if (client !== old) validateClient_(t, client);   // a removed client can stay on old RQs
    validatePriority_(cfg, priority);
    sh.getRange(row, COL.member + 1, 1, 3).setValues([[member, client, priority]]);
    sh.getRange(row, COL.edited_by + 1, 1, 2).setValues([[currentUser_(), new Date()]]);
    return { state: buildState_(t.name), msg: 'RQ updated' };
  });
}

function deleteRq(team, id) {
  return withLock_(function () {
    sheet_(SHEET_RQS).deleteRow(findRow_(id));
    return { state: buildState_(team), msg: 'RQ deleted' };
  });
}

function skipTurn(team) {
  return withLock_(function () {
    const t = findTeam_(team);
    if (!t.order.length) throw new Error('There are no members in this rotation.');
    t.index = (t.index + 1) % t.order.length;
    saveTeam_(t);
    return { state: buildState_(t.name), msg: 'Turn skipped' };
  });
}

function saveOrder(team, order) {
  return withLock_(function () {
    const t = findTeam_(team);
    const clean = order.map(String).map(function (s) { return s.trim(); }).filter(String);
    if (clean.length !== t.order.length ||
        clean.slice().sort().join('|') !== t.order.slice().sort().join('|')) {
      throw new Error('The order changed while you were editing. Refresh and try again.');
    }
    // Keep the turn on the same person even if their position changes.
    const current = t.order[t.index];
    t.order = clean;
    t.index = Math.max(0, clean.indexOf(current));
    saveTeam_(t);
    return { state: buildState_(t.name), msg: 'Order updated for the whole team' };
  });
}

function addMember(team, name) {
  return withLock_(function () {
    const t = findTeam_(team);
    name = cleanName_(name, 'name');
    if (t.order.some(function (m) { return same_(m, name); })) throw new Error(name + ' is already on the team.');
    t.order = t.order.concat([name]);
    saveTeam_(t);
    return { state: buildState_(t.name), msg: name + ' added to ' + t.name };
  });
}

function removeMember(team, name) {
  return withLock_(function () {
    const t = findTeam_(team);
    if (t.order.length <= 1) throw new Error('At least one person must remain.');
    const pos = t.order.indexOf(name);
    if (pos < 0) throw new Error(name + ' is not on the team.');
    const current = t.order[t.index];
    const next = t.order.filter(function (m) { return m !== name; });
    // If the person whose turn it was is removed, the turn moves to the next one.
    t.index = current === name ? pos % next.length : next.indexOf(current);
    t.order = next;
    saveTeam_(t);
    return { state: buildState_(t.name), msg: name + ' removed from ' + t.name };
  });
}

function addClient(team, name) {
  return withLock_(function () {
    const t = findTeam_(team);
    name = cleanName_(name, 'client name');
    if (t.clients.some(function (c) { return same_(c, name); })) throw new Error(name + ' is already on the list.');
    t.clients = t.clients.concat([name]);
    saveTeam_(t);
    return { state: buildState_(t.name), msg: name + ' added to clients' };
  });
}

function removeClient(team, name) {
  return withLock_(function () {
    const t = findTeam_(team);
    if (t.clients.length <= 1) throw new Error('At least one client must remain.');
    if (t.clients.indexOf(name) < 0) throw new Error(name + ' is not on the list.');
    // Past RQs keep the client name; it just stops appearing in the list.
    t.clients = t.clients.filter(function (c) { return c !== name; });
    saveTeam_(t);
    return { state: buildState_(t.name), msg: name + ' removed from clients' };
  });
}

/**
 * Creates a team.
 * @param {{name:string, sm:string, manager:string, members:(string|string[]), clients:(string|string[])}} d
 */
function addTeam(d) {
  return withLock_(function () {
    d = d || {};
    const name = cleanName_(d.name, 'team name');
    if (readTeams_().some(function (t) { return same_(t.name, name); })) {
      throw new Error('There is already a team called ' + name + '.');
    }
    const members = splitList_(d.members, /[\n,]/);
    const clients = splitList_(d.clients, /[\n;]/);
    if (!members.length) throw new Error('Add at least one person.');
    if (!clients.length) throw new Error('Add at least one client.');
    members.forEach(function (m) { cleanName_(m, 'name'); });
    clients.forEach(function (c) { cleanName_(c, 'client name'); });
    const t = { name: name, sm: String(d.sm || '').trim(), manager: String(d.manager || '').trim(),
                order: members, index: 0, clients: clients };
    sheet_(SHEET_TEAMS).appendRow(teamRow_(t));
    return { state: buildState_(name), msg: 'Team ' + name + ' created' };
  });
}

/** Renames a team and/or changes its senior manager and manager. */
function updateTeam(team, d) {
  return withLock_(function () {
    d = d || {};
    const t = findTeam_(team);
    const name = cleanName_(d.name, 'team name');
    if (!same_(name, t.name) && readTeams_().some(function (x) { return same_(x.name, name); })) {
      throw new Error('There is already a team called ' + name + '.');
    }
    const oldName = t.name;
    t.name = name;
    t.sm = String(d.sm || '').trim();
    t.manager = String(d.manager || '').trim();
    saveTeam_(t);
    if (name !== oldName) retagRqs_(oldName, name);
    return { state: buildState_(name), msg: 'Team ' + name + ' updated' };
  });
}

/** Deletes a team from the Teams tab. Its RQs stay in the RQs tab. */
function removeTeam(team) {
  return withLock_(function () {
    const teams = readTeams_();
    if (teams.length <= 1) throw new Error('At least one team must remain.');
    const t = findTeam_(team);
    sheet_(SHEET_TEAMS).deleteRow(t.row);
    return { state: buildState_(''), msg: 'Team ' + t.name + ' deleted (its RQs are kept in the sheet)' };
  });
}

/** CSV with the team's history, or every team's if team is empty. */
function exportCsv(team) {
  checkAccess_();
  const cfg = getConfig_();
  let rows = readRqs_(cfg, defaultTeam_());
  if (team) rows = rows.filter(function (r) { return r.team === team; });
  const head = ['date', 'team', 'member', 'client', 'priority', 'created_by', 'source'];
  const esc = function (v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const lines = [head.join(',')].concat(rows.map(function (r) {
    return [r.dateIso, r.team, r.member, r.client, r.priority, r.createdBy, r.source]
      .map(esc).join(',');
  }));
  return lines.join('\n');
}

// ================================================================
// ==========================  Internals  =========================
// ================================================================

function buildState_(teamName) {
  const cfg = getConfig_();
  const teams = readTeams_();
  const all = readRqs_(cfg, teams.length ? teams[0].name : '');
  const month = Utilities.formatDate(new Date(), cfg.timezone, 'yyyy-MM');

  const stats = {};
  teams.forEach(function (t) { stats[t.name] = { total: 0, month: 0, last: null }; });
  all.forEach(function (r) {   // newest first
    const s = stats[r.team];
    if (!s) return;
    s.total++;
    if (r.month === month) s.month++;
    if (!s.last) s.last = { client: r.client, member: r.member, date: r.date };
  });

  const summaries = teams.map(function (t) {
    const n = t.order.length;
    return {
      name: t.name, sm: t.sm, manager: t.manager, members: n, people: t.order,
      upNext: n ? t.order[t.index] : '', then: n > 1 ? t.order[(t.index + 1) % n] : '',
      total: stats[t.name].total, month: stats[t.name].month, last: stats[t.name].last
    };
  });

  const t = teams.filter(function (x) { return x.name === teamName; })[0] || null;
  return {
    config: { title: cfg.title, subtitle: cfg.subtitle, priorities: cfg.priorities },
    month: month,
    teams: summaries,
    team: t && { name: t.name, sm: t.sm, manager: t.manager, order: t.order,
                 index: t.index, clients: t.clients },
    rqs: t ? all.filter(function (r) { return r.team === t.name; }) : [],
    user: currentUser_()
  };
}

function readTeams_() {
  const sh = sheet_(SHEET_TEAMS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, TEAM_HEADERS.length).getValues()
    .map(function (r, i) {
      const order = splitList_(r[TCOL.members], /,/);
      const idx = parseInt(r[TCOL.index], 10) || 0;
      return {
        row: i + 2,
        name: String(r[TCOL.name] || '').trim(),
        sm: String(r[TCOL.sm] || '').trim(),
        manager: String(r[TCOL.manager] || '').trim(),
        order: order,
        index: order.length ? ((idx % order.length) + order.length) % order.length : 0,
        clients: splitList_(r[TCOL.clients], /;/)
      };
    })
    .filter(function (t) { return t.name; });
}

function findTeam_(name) {
  const t = readTeams_().filter(function (x) { return x.name === name; })[0];
  if (!t) throw new Error('Could not find the team "' + name + '". Click Refresh.');
  return t;
}

function teamRow_(t) {
  return [t.name, t.sm, t.manager, t.order.join(', '), t.index, t.clients.join('; '),
          currentUser_(), new Date()];
}

function saveTeam_(t) {
  sheet_(SHEET_TEAMS).getRange(t.row, 1, 1, TEAM_HEADERS.length).setValues([teamRow_(t)]);
}

function defaultTeam_() {
  const teams = readTeams_();
  return teams.length ? teams[0].name : '';
}

/** Moves every RQ of a renamed team to the new name. */
function retagRqs_(from, to) {
  const sh = sheet_(SHEET_RQS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  const rng = sh.getRange(2, COL.team + 1, n, 1);
  const vals = rng.getValues();
  let changed = false;
  vals.forEach(function (v) { if (String(v[0]).trim() === from) { v[0] = to; changed = true; } });
  if (changed) rng.setValues(vals);
}

/** RQs of every team, newest first. Rows with no team go to the first team. */
function readRqs_(cfg, fallbackTeam) {
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
        source: String(r[COL.source] || ''),
        team: String(r[COL.team] || '').trim() || fallbackTeam
      };
    })
    .sort(function (a, b) { return b.ts - a.ts; });   // newest first
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
 * Priorities go one per row, repeating the key. (Rows with the key
 * "client" are from the single-team version and are only read when upgrading.)
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
  if (!cfg.title) cfg.title = DEFAULT_CONFIG.title;
  ['subtitle', 'timezone', 'allowed_domain'].forEach(function (k) {
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

function validateClient_(team, c) {
  if (team.clients.indexOf(c) < 0) throw new Error('Invalid client for ' + team.name + ': ' + c);
}
function validatePriority_(cfg, p) {
  if (cfg.priorities.indexOf(p) < 0) throw new Error('Invalid priority: ' + p);
}

/** Trims a name and rejects the characters used as list separators. */
function cleanName_(s, what) {
  s = String(s == null ? '' : s).trim();
  if (!s) throw new Error('Type a ' + what + '.');
  if (/[,;\n]/.test(s)) throw new Error('A ' + what + ' cannot contain commas or semicolons: ' + s);
  return s;
}

function splitList_(v, sep) {
  const list = Array.isArray(v) ? v : String(v == null ? '' : v).split(sep);
  const out = [];
  list.map(function (s) { return String(s).trim(); }).filter(String).forEach(function (s) {
    if (!out.some(function (x) { return same_(x, s); })) out.push(s);
  });
  return out;
}

function same_(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }

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

/** Creates any missing tabs and upgrades a single-team sheet. Safe to run more than once. */
function setup() { setup_(); }

function setup_() {
  const ss = ss_();

  if (!ss.getSheetByName(SHEET_CONFIG)) {
    const sh = ss.insertSheet(SHEET_CONFIG);
    const rows = [['key', 'value']];
    ['title', 'subtitle', 'timezone', 'allowed_domain'].forEach(function (k) {
      rows.push([k, DEFAULT_CONFIG[k]]);
    });
    DEFAULT_CONFIG.priorities.forEach(function (p) { rows.push(['priority', p]); });
    sh.getRange(1, 1, rows.length, 2).setValues(rows);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold');
    sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 320);
  }

  let firstTeam = null;
  if (!ss.getSheetByName(SHEET_TEAMS)) {
    // New sheet → default team. Single-team sheet → its State and Config clients.
    const cfg = getConfig_();
    let order = DEFAULT_CONFIG.members.slice(), index = 0;
    const st = ss.getSheetByName(SHEET_STATE);
    if (st && st.getLastRow() >= 2) {
      const v = st.getRange(2, 1, 1, 2).getValues()[0];
      const o = splitList_(v[1], /,/);
      if (o.length) { order = o; index = (parseInt(v[0], 10) || 0) % o.length; }
    }
    firstTeam = {
      name: cfg.team || DEFAULT_CONFIG.team, sm: '', manager: '',
      order: order, index: index,
      clients: cfg.clients.length ? cfg.clients : DEFAULT_CONFIG.clients.slice()
    };
    const sh = ss.insertSheet(SHEET_TEAMS, 0);
    sh.getRange(1, 1, 2, TEAM_HEADERS.length).setValues([TEAM_HEADERS, teamRow_(firstTeam)]);
    sh.getRange(1, 1, 1, TEAM_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('D:D').setNumberFormat('@');
    sh.getRange('F:F').setNumberFormat('@');
    sh.getRange('H:H').setNumberFormat('yyyy-mm-dd hh:mm');
    sh.setColumnWidth(1, 200); sh.setColumnWidth(4, 360); sh.setColumnWidth(6, 420);
  }

  const rq = ss.getSheetByName(SHEET_RQS);
  if (!rq) {
    const sh = ss.insertSheet(SHEET_RQS);
    sh.getRange(1, 1, 1, RQ_HEADERS.length).setValues([RQ_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange('H:H').setNumberFormat('yyyy-mm-dd hh:mm');
  } else if (String(rq.getRange(1, COL.team + 1).getValue()).trim() !== 'team') {
    // Single-team sheet: add the "team" column and tag every RQ with the first team.
    rq.getRange(1, COL.team + 1).setValue('team').setFontWeight('bold');
    const name = firstTeam ? firstTeam.name : defaultTeam_();
    const n = rq.getLastRow() - 1;
    if (n >= 1 && name) {
      const rng = rq.getRange(2, COL.team + 1, n, 1);
      rng.setValues(rng.getValues().map(function (v) { return [String(v[0]).trim() || name]; }));
    }
  }
}

/** Inlines another HTML file from the project (used for Brand.html). */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
