/**
 * Office Chair QB — Apps Script backend
 * Powers: office pick'em, "pros from your school" (ProHawgs), recruiting + transfer portal (CollegeFootballData).
 *
 * SETUP (one time):
 *  1. Create a new Google Sheet → Extensions → Apps Script → paste this file.
 *  2. Project Settings → Script Properties → add:
 *       LEAGUE_CODE = your pick'em invite code (e.g. HOGS2026)
 *       CFBD_KEY    = free API key from collegefootballdata.com/key   (recruiting tab only)
 *  3. Run setup() once from the editor and approve permissions.
 *     (creates the tabs, loads pro rosters, schedules a daily refresh)
 *  4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → copy the /exec URL
 *     into the app (More → Settings) or js/config.js.
 */

const APP = 'Office Chair QB';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/';
const PATHS = {
  nfl: 'football/nfl', cfb: 'football/college-football', nba: 'basketball/nba', wnba: 'basketball/wnba',
  mlb: 'baseball/mlb', nhl: 'hockey/nhl', mbb: 'basketball/mens-college-basketball'
};
const PRO_LEAGUES = ['nfl', 'nba', 'mlb', 'nhl', 'wnba'];
const SHEETS = {
  Players: ['Name', 'PinHash', 'Joined'],
  Picks: ['Week', 'League', 'Name', 'EventId', 'TeamId', 'Team', 'Updated'],
  Results: ['EventId', 'League', 'WinnerId', 'Updated'],
  ProAlumni: ['League', 'AthleteId', 'Name', 'Position', 'TeamName', 'TeamAbbr', 'CollegeId', 'CollegeName', 'CollegeShort', 'Headshot', 'Injury'],
  Meta: ['Key', 'Value'],
  Rivals: ['Name', 'League', 'TeamId', 'TeamName', 'TeamLoc', 'Abbr', 'Logo', 'Color', 'AltColor', 'Updated'],
  Wall: ['Id', 'Time', 'Name', 'Text', 'Ref', 'Reacts'],
  Users: ['Fan Name', 'Real Name', 'Team', 'Device', 'First Seen', 'Last Seen', 'Opens'],
  Activity: ['Time', 'Fan Name', 'Real Name', 'Team', 'Device'],
  HistoryCache: ['Key', 'Fetched', 'Json1', 'Json2', 'Json3', 'Json4', 'Json5', 'Json6'],
  Brief: ['Email', 'Name', 'Teams', 'Theme', 'Hour', 'Days', 'Fantasy', 'Token', 'Active', 'LastSent', 'Created']
};

/* ---------------- entry points ---------------- */
function doGet(e) {
  const p = e.parameter || {};
  try {
    switch (p.action) {
      case 'ping': return out({ ok: true, app: APP });
      case 'espn': return espnProxy(p.u, p.trim);
      case 'fantasy': return fantasyRelay(p);
      case 'pros': return out(getPros(p.college, p.collegeId));
      case 'recruits': return out(getRecruits(p.team, p.year));
      case 'portal': return out(getPortal(p.team, p.year));
      case 'mypicks': checkUser(p.code, p.name, p.pin); return out({ picks: myPicks(p.name, p.week) });
      case 'weekpicks': checkCode(p.code); return out({ picks: weekPicks(p.week) });
      case 'leaderboard': checkCode(p.code); return out(leaderboard());
      case 'rivals': checkCode(p.code); return out({ rivals: getRivals() });
      case 'wall': checkCode(p.code); return out({ posts: getWall(Number(p.since) || 0) });
      case 'briefUnsub': return briefUnsub(p.token);
      case 'history': return out(historyTeam(p.team));
      case 'thisday': return out(thisDay(p.team, p.md));
      case 'h2h': return out(headToHead(p.team1, p.team2));
      case 'draft': return out(draftHistory(p.team));
      default: return out({ error: 'Unknown action' });
    }
  } catch (err) { return out({ error: String(err.message || err) }); }
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents || '{}');
    if (b.action === 'join') return out(join(b.code, b.name, b.pin));
    if (b.action === 'submitPicks') return out(submitPicks(b));
    if (b.action === 'setRival') return out(setRival(b));
    if (b.action === 'post') return out(addPost(b));
    if (b.action === 'react') return out(react(b));
    if (b.action === 'hello') return out(hello(b));
    if (b.action === 'briefSave') return out(briefSave(b));
    if (b.action === 'briefTest') return out(briefTest(b));
    if (b.action === 'briefStop') return out(briefStop(b));
    return out({ error: 'Unknown action' });
  } catch (err) { return out({ error: String(err.message || err) }); }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }


/* ESPN fetch helpers: browser-like headers, retry 403s on ESPN's web host */
const ESPN_OPTS = { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', 'Accept': 'application/json' } };
const webHost = u => u.replace('https://site.api.espn.com/', 'https://site.web.api.espn.com/');
function espnFetchAll(urls) {
  const resps = UrlFetchApp.fetchAll(urls.map(u => Object.assign({ url: u }, ESPN_OPTS)));
  const retry = [];
  resps.forEach((r, i) => { if (r.getResponseCode() === 403) retry.push(i); });
  if (retry.length) {
    const again = UrlFetchApp.fetchAll(retry.map(i => Object.assign({ url: webHost(urls[i]) }, ESPN_OPTS)));
    retry.forEach((i, k) => { resps[i] = again[k]; });
  }
  return resps;
}
function espnJSON(u) { const r = espnFetchAll([u])[0]; if (r.getResponseCode() !== 200) throw new Error('ESPN returned ' + r.getResponseCode()); return JSON.parse(r.getContentText()); }

/* ---------------- ESPN proxy (for endpoints the browser blocks) ---------------- */
function espnProxy(u, trim) {
  if (!/^https:\/\/site(\.web)?\.api\.espn\.com\//.test(u || '')) return out({ error: 'Only ESPN feeds can be proxied' });
  const cache = CacheService.getScriptCache(), key = 'px:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, u + '|' + trim));
  const hit = cache.get(key);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const r = espnFetchAll([u])[0];
  if (r.getResponseCode() !== 200) return out({ error: 'ESPN returned ' + r.getResponseCode() });
  let text = r.getContentText();
  if (trim === 'teams') {
    // shrink team lists to just what the app uses
    const d = JSON.parse(text);
    const teams = ((((d.sports || [])[0] || {}).leagues || [])[0] || {}).teams || [];
    text = JSON.stringify({ sports: [{ leagues: [{ teams: teams.map(x => {
      const t = x.team || {}, logos = t.logos || [];
      const dark = logos.find(l => (l.rel || []).indexOf('dark') >= 0);
      return { team: { id: t.id, location: t.location, name: t.name, displayName: t.displayName, abbreviation: t.abbreviation,
        color: t.color, alternateColor: t.alternateColor, logo: ((dark || logos[0]) || {}).href || '' } };
    }) }] }] });
  }
  if (text.length < 95000) { try { cache.put(key, text, trim === 'teams' ? 21600 : 60); } catch (e) { } }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- ESPN Fantasy relay (private leagues) ----------------
   Script Properties: ESPN_S2 and SWID (from your fantasy.espn.com cookies).
   Optional FANTASY_LEAGUES = comma list of league IDs allowed through the relay. */
function fantasyRelay(p) {
  if (!/^\d+$/.test(p.leagueId || '') || !/^\d{4}$/.test(p.season || '')) return out({ error: 'Bad league or season' });
  const props = PropertiesService.getScriptProperties();
  const allow = (props.getProperty('FANTASY_LEAGUES') || '').split(',').map(s => s.trim()).filter(String);
  if (allow.length && allow.indexOf(p.leagueId) < 0) return out({ error: 'That league isn\'t set up on the office backend yet.' });
  const views = String(p.views || 'mTeam').split(',').filter(v => /^m[A-Za-z]+$/.test(v)).map(v => 'view=' + v).join('&');
  const u = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/' + p.season + '/segments/0/leagues/' + p.leagueId + '?' + views + (p.week ? '&scoringPeriodId=' + Number(p.week) : '');
  const cache = CacheService.getScriptCache(), key = 'ffl:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, u));
  const hit = cache.get(key); if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const s2 = props.getProperty('ESPN_S2'), swid = props.getProperty('SWID');
  const headers = Object.assign({}, ESPN_OPTS.headers);
  if (s2 && swid) headers.Cookie = 'espn_s2=' + s2 + '; SWID=' + swid;
  const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, headers: headers });
  if (r.getResponseCode() === 401) return out({ error: 'Private league — add ESPN_S2 and SWID cookies to the backend (or they expired).' });
  if (r.getResponseCode() !== 200) return out({ error: 'ESPN Fantasy returned ' + r.getResponseCode() });
  const text = r.getContentText();
  if (text.length < 95000) { try { cache.put(key, text, 45); } catch (e) { } }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- setup ---------------- */
function setup() {
  Object.keys(SHEETS).forEach(sh);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LEAGUE_CODE')) props.setProperty('LEAGUE_CODE', 'CHAIRQB');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'refreshPros').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshPros').timeBased().everyDays(1).atHour(5).create();
  installBriefTrigger();
  refreshPros();
  Logger.log('Setup done. Invite code: ' + props.getProperty('LEAGUE_CODE'));
}

function ss() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sh(name) {
  const book = ss();
  let s = book.getSheetByName(name);
  if (!s) { s = book.insertSheet(name); s.appendRow(SHEETS[name]); s.setFrozenRows(1); }
  return s;
}
function rows(name) {
  const v = sh(name).getDataRange().getValues();
  v.shift();
  return v;
}
function meta(key, val) {
  const s = sh('Meta'), v = s.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === key) { if (val === undefined) return v[i][1]; s.getRange(i + 1, 2).setValue(val); return val; }
  if (val === undefined) return '';
  s.appendRow([key, val]); return val;
}

/* ---------------- pros from your school ---------------- */
function refreshPros() {
  const all = [];
  PRO_LEAGUES.forEach(lg => {
    let teams = [];
    try {
      const d = espnJSON(SITE + PATHS[lg] + '/teams?limit=100');
      teams = ((((d.sports || [])[0] || {}).leagues || [])[0] || {}).teams || [];
    } catch (e) { return; }
    const resps = espnFetchAll(teams.map(t => SITE + PATHS[lg] + '/teams/' + t.team.id + '/roster'));
    resps.forEach((r, i) => {
      if (r.getResponseCode() !== 200) return;
      let d; try { d = JSON.parse(r.getContentText()); } catch (e) { return; }
      const team = teams[i].team;
      let athletes = d.athletes || [];
      if (athletes.length && athletes[0].items) athletes = athletes.reduce((a, g) => a.concat(g.items || []), []);
      athletes.forEach(a => {
        const c = a.college; if (!c || !c.name) return;
        all.push([lg, String(a.id), a.displayName || a.fullName || '', (a.position || {}).abbreviation || '', team.displayName, team.abbreviation,
          String(c.id || ''), c.name || '', c.shortName || '', (a.headshot || {}).href || '', ((a.injuries || [])[0] || {}).status || '']);
      });
    });
  });
  if (!all.length) return;
  const s = sh('ProAlumni');
  s.getRange(2, 1, Math.max(s.getLastRow() - 1, 1), SHEETS.ProAlumni.length).clearContent();
  s.getRange(2, 1, all.length, SHEETS.ProAlumni.length).setValues(all);
  meta('prosUpdated', new Date().toISOString());
  CacheService.getScriptCache().put('prosVer', String(Date.now()));
}

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function getPros(college, collegeId) {
  if (!college) throw new Error('Missing college');
  const cache = CacheService.getScriptCache();
  const key = 'pros:' + (cache.get('prosVer') || '0') + ':' + norm(college);
  const hit = cache.get(key); if (hit) return JSON.parse(hit);
  let data = rows('ProAlumni');
  if (!data.length) { refreshPros(); data = rows('ProAlumni'); }
  const n = norm(college);
  const players = data.filter(r => norm(r[7]) === n || norm(r[8]) === n || (collegeId && String(r[6]) === String(collegeId) && norm(r[7]).indexOf(n.slice(0, 4)) === 0))
    .map(r => ({ league: r[0], athleteId: String(r[1]), name: r[2], position: r[3], teamName: r[4], teamAbbr: r[5], headshot: r[9], injury: r[10] }));
  const res = { updated: meta('prosUpdated'), players };
  try { cache.put(key, JSON.stringify(res), 3600); } catch (e) { }
  return res;
}

/* ---------------- recruiting (CollegeFootballData) ---------------- */
function cfbdKey() {
  const key = PropertiesService.getScriptProperties().getProperty('CFBD_KEY');
  if (!key) throw new Error('Needs a free CFBD_KEY in Script Properties (collegefootballdata.com/key)');
  return key;
}
/* Monthly call budget so the free CFBD tier never runs dry (Script Property CFBD_MONTHLY, default 900) */
function cfbdSpend(n) {
  const k = 'cfbd:' + Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM');
  const used = Number(meta(k)) || 0, cap = Number(PropertiesService.getScriptProperties().getProperty('CFBD_MONTHLY')) || 900;
  if (used + n > cap) throw new Error('History data is resting until next month (free data limit reached).');
  meta(k, used + n);
}
function cfbd(path) {
  const key = cfbdKey(); cfbdSpend(1);
  const r = UrlFetchApp.fetch('https://api.collegefootballdata.com' + path, { headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('CFBD returned ' + r.getResponseCode());
  return JSON.parse(r.getContentText());
}
function cfbdMany(paths) {
  const key = cfbdKey(); cfbdSpend(paths.length);
  return UrlFetchApp.fetchAll(paths.map(p => ({ url: 'https://api.collegefootballdata.com' + p, headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true })))
    .map(r => { try { return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null; } catch (e) { return null; } });
}

function getRecruits(team, year) {
  if (!team) throw new Error('Missing team');
  const cache = CacheService.getScriptCache(), key = 'rec:' + norm(team) + ':' + year;
  const hit = cache.get(key); if (hit) return JSON.parse(hit);
  const t = encodeURIComponent(team);
  const players = cfbd('/recruiting/players?year=' + year + '&team=' + t + '&classification=HighSchool')
    .map(p => ({ name: p.name, position: p.position, height: p.height, weight: p.weight, stars: p.stars, rating: p.rating, ranking: p.ranking,
      city: p.city, stateProvince: p.stateProvince, school: p.school }))
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const rk = (cfbd('/recruiting/teams?year=' + year + '&team=' + t) || [])[0];
  const res = { players, rank: rk ? { rank: rk.rank, points: rk.points } : null };
  try { cache.put(key, JSON.stringify(res), 21600); } catch (e) { }
  return res;
}

function getPortal(team, year) {
  if (!team) throw new Error('Missing team');
  const cache = CacheService.getScriptCache(), key = 'portal:' + norm(team) + ':' + year;
  const hit = cache.get(key); if (hit) return JSON.parse(hit);
  const all = cfbd('/player/portal?year=' + year) || [];
  const n = norm(team);
  const pick = p => ({ firstName: p.firstName, lastName: p.lastName, position: p.position, origin: p.origin, destination: p.destination,
    stars: p.stars, rating: p.rating, eligibility: p.eligibility });
  const res = { incoming: all.filter(p => norm(p.destination) === n).map(pick), outgoing: all.filter(p => norm(p.origin) === n).map(pick) };
  try { cache.put(key, JSON.stringify(res), 10800); } catch (e) { }
  return res;
}

/* ---------------- pick'em ---------------- */
function hashPin(name, pin) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, norm(name) + ':' + pin + ':ocq'));
}
function checkCode(code) {
  const real = PropertiesService.getScriptProperties().getProperty('LEAGUE_CODE') || '';
  if (!code || String(code).trim().toUpperCase() !== real.trim().toUpperCase()) throw new Error('Wrong invite code');
}
function checkUser(code, name, pin) {
  checkCode(code);
  const row = rows('Players').find(r => norm(r[0]) === norm(name));
  if (!row || row[1] !== hashPin(name, pin)) throw new Error('Name or PIN not recognized');
  return row[0];
}

function join(code, name, pin) {
  checkCode(code);
  name = String(name || '').trim().slice(0, 30);
  if (!name || !/^\d{4,6}$/.test(String(pin))) throw new Error('Name and 4–6 digit PIN required');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const row = rows('Players').find(r => norm(r[0]) === norm(name));
    if (row) {
      if (row[1] !== hashPin(name, pin)) throw new Error('That name is taken — wrong PIN');
      return { ok: true, name: row[0], returning: true };
    }
    sh('Players').appendRow([name, hashPin(name, pin), new Date()]);
    return { ok: true, name: name, returning: false };
  } finally { lock.releaseLock(); }
}

/* Game status from ESPN summary, cached briefly; finals are stored in Results */
function eventStatuses(league, ids) {
  const cache = CacheService.getScriptCache(), out = {}, need = [];
  ids.forEach(id => { const c = cache.get('ev:' + id); if (c) out[id] = JSON.parse(c); else need.push(id); });
  for (let i = 0; i < need.length; i += 30) {
    const chunk = need.slice(i, i + 30);
    const resps = espnFetchAll(chunk.map(id => SITE + PATHS[league] + '/summary?event=' + id));
    resps.forEach((r, k) => {
      const id = chunk[k];
      try {
        const d = JSON.parse(r.getContentText());
        const comp = ((d.header || {}).competitions || [])[0] || {};
        const state = ((comp.status || {}).type || {}).state || 'pre';
        const w = (comp.competitors || []).find(c => c.winner === true);
        const info = { state: state, winner: w ? String(w.id || (w.team || {}).id) : '' };
        out[id] = info;
        cache.put('ev:' + id, JSON.stringify(info), state === 'post' ? 21600 : state === 'in' ? 60 : 120);
      } catch (e) { out[id] = { state: 'unknown', winner: '' }; }
    });
  }
  return out;
}

function submitPicks(b) {
  const name = checkUser(b.code, b.name, b.pin);
  if (!PATHS[b.league]) throw new Error('Bad league');
  const picks = (b.picks || []).slice(0, 80);
  const st = eventStatuses(b.league, picks.map(p => String(p.eventId)));
  const ok = [], rejected = [];
  picks.forEach(p => (st[String(p.eventId)] && st[String(p.eventId)].state === 'pre' ? ok : rejected).push(p));
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const s = sh('Picks'), data = s.getDataRange().getValues();
    const idx = {};
    for (let i = 1; i < data.length; i++) idx[data[i][0] + '|' + norm(data[i][2]) + '|' + data[i][3]] = i + 1;
    const now = new Date(), appends = [];
    ok.forEach(p => {
      const row = [b.week, b.league, name, String(p.eventId), String(p.teamId), p.team || '', now];
      const k = b.week + '|' + norm(name) + '|' + String(p.eventId);
      if (idx[k]) s.getRange(idx[k], 1, 1, row.length).setValues([row]); else appends.push(row);
    });
    if (appends.length) s.getRange(s.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('board');
  return { saved: ok.length, rejected: rejected.map(p => p.eventId) };
}

function myPicks(name, week) {
  const outp = {};
  rows('Picks').forEach(r => { if (r[0] === week && norm(r[2]) === norm(name)) outp[String(r[3])] = String(r[4]); });
  return outp;
}

/* Office tallies — only for games that have started, so nobody can copy picks */
function weekPicks(week) {
  const wk = rows('Picks').filter(r => r[0] === week);
  if (!wk.length) return {};
  const league = wk[0][1];
  const ids = [...new Set(wk.map(r => String(r[3])))];
  const st = eventStatuses(league, ids);
  const tally = {};
  wk.forEach(r => {
    const id = String(r[3]); if (!st[id] || st[id].state === 'pre') return;
    tally[id] = tally[id] || {}; tally[id][String(r[4])] = (tally[id][String(r[4])] || 0) + 1;
  });
  return tally;
}

function leaderboard() {
  const cache = CacheService.getScriptCache(), hit = cache.get('board');
  if (hit) return JSON.parse(hit);
  const picks = rows('Picks');
  const results = {};
  rows('Results').forEach(r => { results[String(r[0])] = String(r[2]); });
  // grade any finished games we haven't recorded yet
  const pending = {};
  picks.forEach(r => { const id = String(r[3]); if (!(id in results)) (pending[r[1]] = pending[r[1]] || new Set()).add(id); });
  const newRows = [];
  Object.keys(pending).forEach(lg => {
    const ids = [...pending[lg]].slice(0, 90);
    const st = eventStatuses(lg, ids);
    ids.forEach(id => { if (st[id] && st[id].state === 'post' && st[id].winner) { results[id] = st[id].winner; newRows.push([id, lg, st[id].winner, new Date()]); } });
  });
  if (newRows.length) { const s = sh('Results'); s.getRange(s.getLastRow() + 1, 1, newRows.length, 4).setValues(newRows); }

  const people = {}, weeksByPerson = {};
  rows('Players').forEach(r => { people[r[0]] = { name: r[0], correct: 0, graded: 0 }; });
  picks.forEach(r => {
    const id = String(r[3]); if (!(id in results)) return;
    const p = people[r[2]] || (people[r[2]] = { name: r[2], correct: 0, graded: 0 });
    const right = results[id] === String(r[4]);
    p.graded++; if (right) p.correct++;
    const w = (weeksByPerson[r[2]] = weeksByPerson[r[2]] || {});
    w[r[0]] = w[r[0]] || { c: 0, g: 0, t: r[6] }; w[r[0]].g++; if (right) w[r[0]].c++;
  });
  const rowsOut = Object.values(people).map(p => {
    const ws = weeksByPerson[p.name] || {}, keys = Object.keys(ws).sort((a, b) => new Date(ws[b].t) - new Date(ws[a].t));
    return { name: p.name, correct: p.correct, graded: p.graded, lastWeek: keys[0] ? ws[keys[0]].c + '/' + ws[keys[0]].g : '' };
  }).sort((a, b) => b.correct - a.correct || (b.correct / (b.graded || 1)) - (a.correct / (a.graded || 1)));
  const res = { rows: rowsOut, updated: new Date().toISOString() };
  try { cache.put('board', JSON.stringify(res), 180); } catch (e) { }
  return res;
}

/* Run from the editor to see whether ESPN answers this script (check the Execution log) */
function testESPN() {
  ['football/nfl/scoreboard', 'football/college-football/teams?limit=5', 'football/nfl/teams/8/roster'].forEach(p => {
    const u = SITE + p;
    const a = UrlFetchApp.fetch(u, ESPN_OPTS).getResponseCode(), b = UrlFetchApp.fetch(webHost(u), ESPN_OPTS).getResponseCode();
    Logger.log(p + '  site.api=' + a + '  site.web.api=' + b);
  });
}

/* ---------------- Office Rivalry Board ---------------- */
function getRivals() {
  return rows('Rivals').filter(r => r[0]).map(r => ({ name: r[0], lg: r[1], id: String(r[2]), dn: r[3], loc: r[4], ab: r[5], logo: r[6], c: r[7], a: r[8] }));
}
function setRival(b) {
  const name = checkUser(b.code, b.name, b.pin), t = b.team || {};
  if (!t.lg || !t.id) throw new Error('Pick a team');
  const clean = v => String(v == null ? '' : v).slice(0, 120);
  const row = [name, clean(t.lg), clean(t.id), clean(t.dn), clean(t.loc), clean(t.ab), clean(t.logo), clean(t.c), clean(t.a), new Date()];
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = sh('Rivals'), v = s.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) if (norm(v[i][0]) === norm(name)) { s.getRange(i + 1, 1, 1, row.length).setValues([row]); return { ok: true }; }
    s.appendRow(row); return { ok: true };
  } finally { lock.releaseLock(); }
}
function getWall(since) {
  const v = rows('Wall').filter(r => r[0]);
  return v.slice(-60).map(r => ({ id: String(r[0]), t: new Date(r[1]).toISOString(), name: r[2], text: r[3], ref: r[4] || '', reacts: safeJSON(r[5]) }))
    .filter(p => !since || new Date(p.t).getTime() > since).reverse();
}
function safeJSON(s) { try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; } }
function addPost(b) {
  const name = checkUser(b.code, b.name, b.pin);
  const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!text) throw new Error('Say something!');
  const cache = CacheService.getScriptCache(), k = 'rate:' + norm(name);
  if (cache.get(k)) throw new Error('Easy there — one post every 10 seconds');
  cache.put(k, '1', 10);
  const id = Utilities.getUuid().slice(0, 8);
  sh('Wall').appendRow([id, new Date(), name, text, String(b.ref || '').slice(0, 40), '{}']);
  return { ok: true, id: id };
}
function react(b) {
  const name = checkUser(b.code, b.name, b.pin), emoji = String(b.emoji || '');
  if (['🔥', '😂', '🗑️', '👏'].indexOf(emoji) < 0) throw new Error('Bad reaction');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = sh('Wall'), v = s.getDataRange().getValues();
    for (let i = v.length - 1; i >= 1; i--) if (String(v[i][0]) === String(b.id)) {
      const r = safeJSON(v[i][5]); const list = r[emoji] || [];
      const at = list.indexOf(name); if (at >= 0) list.splice(at, 1); else list.push(name);
      r[emoji] = list; s.getRange(i + 1, 6).setValue(JSON.stringify(r)); return { ok: true, reacts: r };
    }
    throw new Error('Post not found');
  } finally { lock.releaseLock(); }
}

/* ---------------- Morning Brief email ----------------
   Hourly trigger checks who is due (their chosen hour + day, in BRIEF_TZ, default America/Chicago)
   and sends each subscriber a team-themed email. Uses your Gmail (≈100 emails/day on a free account). */
const BRIEF_TZ = () => PropertiesService.getScriptProperties().getProperty('BRIEF_TZ') || 'America/Chicago';
const APP_URL = () => PropertiesService.getScriptProperties().getProperty('APP_URL') || 'https://nbr1hawgfan.github.io/Office-Chair-Quarterback/';

function installBriefTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendBriefs').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendBriefs').timeBased().everyHours(1).nearMinute(2).create();
  sh('Brief');
}

function briefRowIndex(email) {
  const v = sh('Brief').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === String(email).toLowerCase()) return { i: i + 1, row: v[i] };
  return null;
}
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')); }

function briefSave(b) {
  checkCode(b.code);
  if (!validEmail(b.email)) throw new Error('Enter a valid email');
  const teams = (b.teams || []).slice(0, 8).map(t => ({ lg: t.lg, id: String(t.id), dn: t.dn, loc: t.loc, ab: t.ab, logo: t.logo, c: t.c, a: t.a }));
  if (!teams.length) throw new Error('Follow at least one team first');
  const hour = Math.max(0, Math.min(23, Number(b.hour) || 7));
  const days = String(b.days || '1234567').replace(/[^1-7]/g, '') || '1234567';
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const found = briefRowIndex(b.email), s = sh('Brief');
    const token = found ? found.row[7] : Utilities.getUuid();
    const row = [b.email.trim(), String(b.name || '').slice(0, 30), JSON.stringify(teams), JSON.stringify(b.theme || teams[0]), hour, days,
      JSON.stringify(b.fantasy || null), token, true, found ? found.row[9] : '', found ? found.row[10] : new Date()];
    if (found) s.getRange(found.i, 1, 1, row.length).setValues([row]); else s.appendRow(row);
    return { ok: true, token: token };
  } finally { lock.releaseLock(); }
}
function briefStop(b) {
  checkCode(b.code);
  const f = briefRowIndex(b.email); if (f) sh('Brief').getRange(f.i, 9).setValue(false);
  return { ok: true };
}
function briefUnsub(token) {
  const v = sh('Brief').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (token && v[i][7] === token) { sh('Brief').getRange(i + 1, 9).setValue(false); break; }
  return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;padding:40px;text-align:center"><h2>You\'re unsubscribed 👋</h2><p>No more morning briefs. You can turn it back on anytime in Office Chair QB.</p></div>');
}
function briefTest(b) {
  checkCode(b.code);
  const f = briefRowIndex(b.email); if (!f) throw new Error('Save your brief settings first');
  const cache = CacheService.getScriptCache(), k = 'btest:' + b.email.toLowerCase();
  if (cache.get(k)) throw new Error('Test already sent — check your inbox (and spam). Try again in a few minutes.');
  cache.put(k, '1', 300);
  sendBriefTo(f.row, {});
  return { ok: true };
}

function sendBriefs() {
  const tz = BRIEF_TZ(), now = new Date();
  const hour = Number(Utilities.formatDate(now, tz, 'H')), dow = Utilities.formatDate(now, tz, 'u'), today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const s = sh('Brief'), v = s.getDataRange().getValues(), shared = {};
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    if (!r[0] || r[8] !== true || Number(r[4]) !== hour || String(r[5]).indexOf(dow) < 0 || r[9] === today) continue;
    if (MailApp.getRemainingDailyQuota() < 1) break;
    try { sendBriefTo(r, shared); s.getRange(i + 1, 10).setValue(today); } catch (e) { Logger.log('Brief failed for ' + r[0] + ': ' + e); }
  }
}

/* ---- data helpers (shared across subscribers in one run) ---- */
function briefTeamData(t, shared) {
  const key = t.lg + ':' + t.id; if (shared[key]) return shared[key];
  const path = PATHS[t.lg] || ({ wbb: 'basketball/womens-college-basketball', cbase: 'baseball/college-baseball', soft: 'baseball/college-softball' })[t.lg];
  const out = { last: null, today: null, next: null, news: [] };
  if (!path) return (shared[key] = out);
  const [sr, nr] = espnFetchAll([SITE + path + '/teams/' + t.id + '/schedule', SITE + path + '/news?team=' + t.id + '&limit=3']);
  try {
    const evs = (JSON.parse(sr.getContentText()).events || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    const now = Date.now();
    evs.forEach(ev => {
      const c = (ev.competitions || [])[0] || {}, cs = c.competitors || [];
      const me = cs.find(x => String((x.team || {}).id) === String(t.id)) || {}, opp = cs.find(x => x !== me) || {};
      const st = ((c.status || ev.status || {}).type || {});
      const g = { date: new Date(ev.date), at: me.homeAway === 'home' ? 'vs' : '@', opp: (opp.team || {}).displayName || '', oppAb: (opp.team || {}).abbreviation || '',
        oppLogo: (((opp.team || {}).logos || [])[0] || {}).href || '', my: sc(me.score), their: sc(opp.score), win: me.winner === true, done: st.state === 'post' || st.completed,
        tv: ((c.broadcasts || [])[0] || {}).media ? c.broadcasts[0].media.shortName : '', venue: ((c.venue || {}).fullName) || '' };
      if (g.done && now - g.date < 36 * 3600e3) out.last = g;
      if (!g.done && Utilities.formatDate(g.date, BRIEF_TZ(), 'yyyyMMdd') === Utilities.formatDate(new Date(), BRIEF_TZ(), 'yyyyMMdd')) out.today = g;
      if (!g.done && !out.next && g.date > now) out.next = g;
    });
  } catch (e) { }
  try { out.news = (JSON.parse(nr.getContentText()).articles || []).slice(0, 3).map(a => ({ h: a.headline, d: a.description || '', u: ((a.links || {}).web || {}).href || '' })); } catch (e) { }
  return (shared[key] = out);
}
function sc(s) { return s == null ? '' : typeof s === 'object' ? (s.displayValue != null ? s.displayValue : s.value) : s; }
function fmtT(d) { return Utilities.formatDate(d, BRIEF_TZ(), 'h:mm a'); }
function fmtD(d) { return Utilities.formatDate(d, BRIEF_TZ(), 'EEE, MMM d'); }
function h(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function briefFantasy(f) {
  if (!f || !f.leagueId) return null;
  try {
    const props = PropertiesService.getScriptProperties(), s2 = props.getProperty('ESPN_S2'), swid = props.getProperty('SWID');
    const headers = Object.assign({}, ESPN_OPTS.headers); if (s2 && swid) headers.Cookie = 'espn_s2=' + s2 + '; SWID=' + swid;
    const u = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/' + f.season + '/segments/0/leagues/' + f.leagueId + '?view=mMatchupScore&view=mTeam&view=mStatus&view=mSettings';
    const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, headers: headers }); if (r.getResponseCode() !== 200) return null;
    const d = JSON.parse(r.getContentText()), wk = (d.status || {}).currentMatchupPeriod;
    const teams = {}; (d.teams || []).forEach(t => teams[t.id] = t);
    const name = t => t ? (t.name || ((t.location || '') + ' ' + (t.nickname || '')).trim()) : '';
    const out = { league: (d.settings || {}).name || 'Fantasy', week: wk };
    if (f.teamId) {
      const mine = teams[f.teamId]; out.team = name(mine); out.record = mine && mine.record ? mine.record.overall.wins + '-' + mine.record.overall.losses : '';
      const pts = sd => sd ? (sd.totalPointsLive != null ? sd.totalPointsLive : sd.totalPoints) : 0;
      const findM = w => (d.schedule || []).find(m => m.matchupPeriodId === w && ((m.home || {}).teamId == f.teamId || (m.away || {}).teamId == f.teamId));
      const lastM = findM(wk - 1), curM = findM(wk);
      const line = (m, label) => { if (!m) return ''; const meH = m.home.teamId == f.teamId, me = meH ? m.home : m.away, op = meH ? m.away : m.home;
        return label + ': ' + Number(pts(me)).toFixed(1) + ' – ' + Number(pts(op)).toFixed(1) + ' vs ' + name(teams[(op || {}).teamId]); };
      out.lines = [line(lastM, 'Last week'), line(curM, 'This week')].filter(String);
    }
    return out;
  } catch (e) { return null; }
}

function sendBriefTo(r, shared) {
  const email = r[0], name = r[1] || 'there';
  const teams = JSON.parse(r[2] || '[]'), th = JSON.parse(r[3] || 'null') || teams[0] || {};
  const c = '#' + (th.c || '1f6feb'), a = '#' + (th.a || 'f2c94c');
  const data = teams.map(t => ({ t: t, d: briefTeamData(t, shared) }));
  // subject line from the most interesting thing
  const winLast = data.find(x => x.d.last), gameToday = data.find(x => x.d.today);
  let subject = '☕ Your Office Chair QB brief';
  if (gameToday) subject = '🔥 Game day: ' + gameToday.t.ab + ' ' + gameToday.d.today.at + ' ' + gameToday.d.today.oppAb + ' · ' + fmtT(gameToday.d.today.date);
  else if (winLast) subject = (winLast.d.last.win ? '✅ ' : '❌ ') + winLast.t.ab + (winLast.d.last.win ? ' won ' : ' lost ') + winLast.d.last.my + '-' + winLast.d.last.their;

  const card = inner => '<div style="background:#171b22;border-radius:14px;padding:14px 16px;margin:12px 0;border:1px solid #262c37">' + inner + '</div>';
  const label = t => '<div style="font:700 12px Arial;letter-spacing:1.5px;text-transform:uppercase;color:' + a + ';margin-bottom:8px">' + t + '</div>';
  let body = '';
  data.forEach(({ t, d }) => {
    let inner = '<table width="100%" cellpadding="0" cellspacing="0"><tr><td width="44"><img src="' + h(t.logo) + '" width="36" height="36" style="display:block"></td>' +
      '<td style="font:700 17px Arial;color:#fff">' + h(t.dn) + '</td></tr></table>';
    if (d.last) inner += '<p style="margin:10px 0 0;font:15px Arial;color:#eef1f6"><b style="color:' + (d.last.win ? '#3ddc84' : '#ff5d5d') + '">' + (d.last.win ? 'W' : 'L') + ' ' + h(d.last.my) + '-' + h(d.last.their) + '</b> ' + d.last.at + ' ' + h(d.last.opp) + '</p>';
    if (d.today) inner += '<p style="margin:10px 0 0;font:15px Arial;color:#eef1f6">🔥 <b>Today</b> ' + d.today.at + ' ' + h(d.today.opp) + ' · ' + fmtT(d.today.date) + (d.today.tv ? ' · 📺 ' + h(d.today.tv) : '') + '</p>';
    else if (d.next) inner += '<p style="margin:10px 0 0;font:14px Arial;color:#8b93a3">Next: ' + d.next.at + ' ' + h(d.next.opp) + ' · ' + fmtD(d.next.date) + ' ' + fmtT(d.next.date) + (d.next.tv ? ' · ' + h(d.next.tv) : '') + '</p>';
    d.news.slice(0, 2).forEach(n => { inner += '<p style="margin:10px 0 0;font:14px Arial"><a href="' + h(n.u) + '" style="color:#eef1f6;text-decoration:none">📰 ' + h(n.h) + '</a></p>'; });
    body += card(inner);
  });

  // fantasy + pick'em + rivalry
  const ff = briefFantasy(JSON.parse(r[6] || 'null'));
  if (ff && ff.lines && ff.lines.length) body += card(label('🏈 ' + h(ff.league)) + '<p style="margin:0;font:15px Arial;color:#eef1f6"><b>' + h(ff.team) + '</b> (' + h(ff.record) + ')</p>' + ff.lines.map(l => '<p style="margin:6px 0 0;font:14px Arial;color:#c9d1dc">' + h(l) + '</p>').join(''));
  try {
    const lb = (shared.board = shared.board || leaderboard()).rows || [];
    const i = lb.findIndex(x => String(x.name).toLowerCase() === String(name).toLowerCase());
    if (i >= 0) body += card(label("🏆 Office Pick'em") + '<p style="margin:0;font:15px Arial;color:#eef1f6">You\'re <b>#' + (i + 1) + '</b> of ' + lb.length + ' with ' + lb[i].correct + ' correct' + (i > 0 ? ' — ' + (lb[0].correct - lb[i].correct) + ' behind ' + h(lb[0].name) : ' 👑') + '.</p>');
  } catch (e) { }
  try {
    const riv = (shared.riv = shared.riv || getRivals()).filter(x => String(x.name).toLowerCase() !== String(name).toLowerCase());
    const lines = riv.map(x => ({ x: x, d: briefTeamData(x, shared).last })).filter(o => o.d)
      .map(o => '<p style="margin:6px 0 0;font:14px Arial;color:#c9d1dc">' + h(o.x.name) + "'s " + h(o.x.loc || o.x.dn) + ' ' + (o.d.win ? '<b style="color:#3ddc84">W</b>' : '<b style="color:#ff5d5d">L</b> 🗑️') + ' ' + h(o.d.my) + '-' + h(o.d.their) + '</p>');
    if (lines.length) body += card(label('⚔️ Office Rivalry') + lines.join(''));
  } catch (e) { }

  const unsub = ScriptApp.getService().getUrl() + '?action=briefUnsub&token=' + encodeURIComponent(r[7]);
  const hello = Number(Utilities.formatDate(new Date(), BRIEF_TZ(), 'H')) < 12 ? 'Morning' : Number(Utilities.formatDate(new Date(), BRIEF_TZ(), 'H')) < 17 ? 'Afternoon' : 'Evening';
  const html = '<div style="background:#0b0d11;padding:0;margin:0"><div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif">' +
    '<div style="background:' + c + ';background:linear-gradient(135deg,' + c + ',#0b0d11);padding:22px 18px;border-bottom:4px solid ' + a + '">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font:700 13px Arial;letter-spacing:2px;color:rgba(255,255,255,.8)">OFFICE CHAIR QB</div>' +
    '<div style="font:700 24px Arial;color:#fff;margin-top:4px">' + hello + ', ' + h(name) + ' 👋</div>' +
    '<div style="font:13px Arial;color:rgba(255,255,255,.85);margin-top:4px">' + Utilities.formatDate(new Date(), BRIEF_TZ(), 'EEEE, MMMM d') + '</div></td>' +
    '<td width="72" align="right"><img src="' + h(th.logo) + '" width="64" height="64" style="display:block"></td></tr></table></div>' +
    '<div style="padding:4px 14px 10px">' + body +
    '<div style="text-align:center;margin:18px 0 8px"><a href="' + h(APP_URL()) + '" style="display:inline-block;background:' + c + ';color:#fff;font:700 15px Arial;padding:12px 24px;border-radius:12px;text-decoration:none;border:2px solid ' + a + '">Open Office Chair QB</a></div>' +
    '<p style="text-align:center;font:11px Arial;color:#8b93a3;margin:16px 0">Scores &amp; news from ESPN. <a href="' + unsub + '" style="color:#8b93a3">Unsubscribe</a></p></div></div></div>';
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: html, name: 'Office Chair QB' });
}

/* ---------------- Who's using the app ----------------
   Users tab: one row per person (first/last seen, open count). Activity tab: one row per app open (max every 20 min per device). */
function hello(b) {
  checkCode(b.code);
  const fan = String(b.fan || '').slice(0, 30).trim(); if (!fan) return { ok: false };
  const real = String(b.real || '').slice(0, 40), team = String(b.team || '').slice(0, 50), device = String(b.device || '').slice(0, 30), now = new Date();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = sh('Users'), v = s.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < v.length; i++) if (norm(v[i][0]) === norm(fan)) {
      s.getRange(i + 1, 1, 1, 7).setValues([[v[i][0], real || v[i][1], team || v[i][2], device || v[i][3], v[i][4], now, (Number(v[i][6]) || 0) + 1]]);
      found = true; break;
    }
    if (!found) s.appendRow([fan, real, team, device, now, now, 1]);
    sh('Activity').appendRow([now, fan, real, team, device]);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ---------------- Program history (CollegeFootballData, cached in the HistoryCache tab) ---------------- */
const CFBD_NAME = { 'UConn': 'Connecticut', 'UMass': 'Massachusetts', 'Southern Miss': 'Southern Mississippi', 'Sam Houston': 'Sam Houston State', 'App State': 'Appalachian State' };
const cfbName = t => CFBD_NAME[String(t || '').trim()] || String(t || '').trim();

function histGet(key, ttlDays) {
  const c = CacheService.getScriptCache().get('h:' + key); if (c) return JSON.parse(c);
  const v = sh('HistoryCache').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === key) {
    if (ttlDays && Date.now() - new Date(v[i][1]).getTime() > ttlDays * 864e5) return null;
    const json = v[i].slice(2).join('');
    try { const d = JSON.parse(json); try { if (json.length < 95000) CacheService.getScriptCache().put('h:' + key, json, 21600); } catch (e) { } return d; } catch (e) { return null; }
  }
  return null;
}
function histPut(key, data) {
  const json = JSON.stringify(data), parts = [];
  for (let i = 0; i < 6; i++) parts.push(json.slice(i * 45000, (i + 1) * 45000));
  if (json.length > 270000) throw new Error('History too large to cache');
  const s = sh('HistoryCache'), v = s.getDataRange().getValues(), row = [key, new Date()].concat(parts);
  for (let i = 1; i < v.length; i++) if (v[i][0] === key) { s.getRange(i + 1, 1, 1, row.length).setValues([row]); return data; }
  s.appendRow(row);
  try { if (json.length < 95000) CacheService.getScriptCache().put('h:' + key, json, 21600); } catch (e) { }
  return data;
}
function cachedCfbd(key, ttlDays, build) {
  const hit = histGet(key, ttlDays); if (hit) return hit;
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { const again = histGet(key, ttlDays); if (again) return again; return histPut(key, build()); }
  finally { lock.releaseLock(); }
}

/* Every game for a team from HISTORY_FROM (default 1980) on. Past seasons are stored for good; the current season refreshes daily. */
function trimGame(g, team) {
  const home = g.homeTeam === team, us = home ? g.homePoints : g.awayPoints, them = home ? g.awayPoints : g.homePoints;
  return { y: g.season, d: g.startDate, o: home ? g.awayTeam : g.homeTeam, h: home ? 1 : g.neutralSite ? 0 : -1, us: us, them: them, post: g.seasonType === 'postseason' ? 1 : 0, n: g.notes || '' };
}
function gameIndex(team) {
  const from = Number(PropertiesService.getScriptProperties().getProperty('HISTORY_FROM')) || 1980;
  const cur = new Date().getFullYear(), enc = encodeURIComponent(team);
  const past = cachedCfbd('games:' + team + ':' + from, 3650, () => {
    const years = []; for (let y = from; y < cur; y++) years.push(y);
    const out = [];
    for (let i = 0; i < years.length; i += 12) {
      cfbdMany(years.slice(i, i + 12).map(y => '/games?year=' + y + '&team=' + enc + '&seasonType=both')).forEach(arr => (arr || []).forEach(g => {
        if (g.homePoints != null && g.awayPoints != null) out.push(trimGame(g, team));
      }));
      Utilities.sleep(400);
    }
    return out;
  });
  const now = cachedCfbd('games:' + team + ':' + cur, 1, () => (cfbd('/games?year=' + cur + '&team=' + enc + '&seasonType=both') || [])
    .filter(g => g.homePoints != null && g.awayPoints != null).map(g => trimGame(g, team)));
  return past.concat(now);
}

function historyTeam(t) {
  const team = cfbName(t); if (!team) throw new Error('Missing team');
  return cachedCfbd('hist:' + team, 7, () => {
    const enc = encodeURIComponent(team);
    const [records, coaches] = cfbdMany(['/records?team=' + enc, '/coaches?team=' + enc]);
    const coachBy = {}, rankBy = {};
    (coaches || []).forEach(c => (c.seasons || []).forEach(s => {
      if (s.school !== team) return;
      coachBy[s.year] = (c.firstName + ' ' + c.lastName).trim();
      rankBy[s.year] = { pre: s.preseasonRank, post: s.postseasonRank };
    }));
    let games = []; try { games = gameIndex(team); } catch (e) { }
    const bowlBy = {};
    games.filter(g => g.post).forEach(g => { bowlBy[g.y] = { n: g.n || 'Bowl', r: g.us > g.them ? 'W' : g.us < g.them ? 'L' : 'T', s: g.us + '-' + g.them, o: g.o }; });
    const seasons = (records || []).map(r => ({
      y: r.year, w: r.total.wins, l: r.total.losses, t: r.total.ties, cw: (r.conferenceGames || {}).wins, cl: (r.conferenceGames || {}).losses,
      conf: r.conference || '', coach: coachBy[r.year] || '', ap: (rankBy[r.year] || {}).post || null, pre: (rankBy[r.year] || {}).pre || null, bowl: bowlBy[r.year] || null
    })).sort((a, b) => b.y - a.y);
    const tot = seasons.reduce((a, s) => ({ w: a.w + s.w, l: a.l + s.l, t: a.t + (s.t || 0) }), { w: 0, l: 0, t: 0 });
    const coachList = {};
    seasons.forEach(s => { if (!s.coach) return; const c = coachList[s.coach] || (coachList[s.coach] = { name: s.coach, from: s.y, to: s.y, w: 0, l: 0, t: 0 });
      c.from = Math.min(c.from, s.y); c.to = Math.max(c.to, s.y); c.w += s.w; c.l += s.l; c.t += s.t || 0; });
    return { team: team, seasons: seasons, total: tot, coaches: Object.values(coachList).sort((a, b) => b.to - a.to), gamesFrom: games.length ? Math.min.apply(null, games.map(g => g.y)) : null };
  });
}

function thisDay(t, md) {
  const team = cfbName(t); if (!team) throw new Error('Missing team');
  const games = gameIndex(team);
  const tz = BRIEF_TZ();
  const mdOf = d => Utilities.formatDate(new Date(d), tz, 'MM-dd');
  md = md || Utilities.formatDate(new Date(), tz, 'MM-dd');
  const dayNum = s => { const [m, d] = s.split('-').map(Number); return m * 31 + d; };
  const target = dayNum(md), cur = new Date().getFullYear();
  let pick = games.filter(g => g.y < cur && mdOf(g.d) === md), exact = true;
  if (!pick.length) { exact = false; pick = games.filter(g => g.y < cur && Math.abs(dayNum(mdOf(g.d)) - target) <= 3); }
  pick.sort((a, b) => (b.us - b.them) - (a.us - a.them) || a.y - b.y); // most memorable win first
  return { team: team, exact: exact, games: pick.slice(0, 6).map(g => Object.assign({ md: mdOf(g.d) }, g)) };
}

function headToHead(a, b) {
  const t1 = cfbName(a), t2 = cfbName(b); if (!t1 || !t2) throw new Error('Pick two teams');
  const key = 'h2h:' + [t1, t2].sort().join('|');
  const m = cachedCfbd(key, 7, () => {
    const d = cfbd('/teams/matchup?team1=' + encodeURIComponent(t1) + '&team2=' + encodeURIComponent(t2));
    return { t1: d.team1, t2: d.team2, w1: d.team1Wins, w2: d.team2Wins, ties: d.ties, start: d.startYear, end: d.endYear,
      games: (d.games || []).map(g => ({ y: g.season, d: g.date, ht: g.homeTeam, hs: g.homeScore, at: g.awayTeam, as: g.awayScore, w: g.winner, n: g.neutralSite ? 1 : 0, post: g.seasonType === 'postseason' ? 1 : 0, v: g.venue || '' })) };
  });
  // orient to the asking team
  if (m.t1 !== t1) return { t1: t1, t2: t2, w1: m.w2, w2: m.w1, ties: m.ties, start: m.start, end: m.end, games: m.games };
  return m;
}

function draftHistory(t) {
  const team = cfbName(t); if (!team) throw new Error('Missing team');
  return cachedCfbd('draft:' + team, 30, () => ({ team: team, picks: (cfbd('/draft/picks?school=' + encodeURIComponent(team)) || [])
    .map(p => ({ y: p.year, r: p.round, p: p.pick, o: p.overall, n: p.name, pos: p.position, nfl: p.nflTeam }))
    .sort((a, b) => b.y - a.y || a.o - b.o) }));
}
