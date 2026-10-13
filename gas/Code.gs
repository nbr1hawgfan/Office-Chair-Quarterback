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
  Meta: ['Key', 'Value']
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
      default: return out({ error: 'Unknown action' });
    }
  } catch (err) { return out({ error: String(err.message || err) }); }
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents || '{}');
    if (b.action === 'join') return out(join(b.code, b.name, b.pin));
    if (b.action === 'submitPicks') return out(submitPicks(b));
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
function cfbd(path) {
  const key = PropertiesService.getScriptProperties().getProperty('CFBD_KEY');
  if (!key) throw new Error('Recruiting needs a free CFBD_KEY in Script Properties (collegefootballdata.com/key)');
  const r = UrlFetchApp.fetch('https://api.collegefootballdata.com' + path, { headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('CFBD returned ' + r.getResponseCode());
  return JSON.parse(r.getContentText());
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
