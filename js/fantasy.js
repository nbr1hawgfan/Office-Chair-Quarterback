/* Office Chair QB — ESPN Fantasy Football (public leagues direct, private via Apps Script relay) */
const FFL_SLOTS = { 0: 'QB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K', 20: 'BE', 21: 'IR', 23: 'FLEX', 7: 'OP' };
const FFL_SLOT_ORDER = [0, 2, 4, 6, 23, 3, 7, 16, 17, 20, 21];
const FFL_POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' };
const FFL_PRO = { 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR',
  15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU' };

const fflCfg = () => LS.get('ffl', null);

async function fflFetch(views, week) {
  const c = fflCfg();
  const q = views.map(v => 'view=' + v).join('&') + (week ? '&scoringPeriodId=' + week : '');
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${c.season}/segments/0/leagues/${c.leagueId}?${q}`;
  const key = 'ffl:' + url, hit = _mem.get(key);
  if (hit && Date.now() - hit.t < 45000) return hit.d;
  let d;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status === 401 ? 'PRIVATE' : 'ESPN returned ' + r.status);
    d = await r.json();
  } catch (e) {
    if (!gasUrl()) throw new Error('This league is private. Ask Tim to add it to the backend.');
    d = await gasGet({ action: 'fantasy', leagueId: c.leagueId, season: c.season, views: views.join(','), week: week || '' });
  }
  _mem.set(key, { t: Date.now(), d });
  return d;
}

const fflTeamName = t => t ? (t.name || `${t.location || ''} ${t.nickname || ''}`.trim() || t.abbrev) : '';
function fflPts(entry, week, source) {
  const p = entry.playerPoolEntry?.player || {};
  const s = (p.stats || []).find(x => x.scoringPeriodId === week && x.statSourceId === source);
  if (source === 0 && s == null && entry.playerPoolEntry?.appliedStatTotal != null) return entry.playerPoolEntry.appliedStatTotal;
  return s ? s.appliedTotal : null;
}

function openFantasy() {
  Sheets.open('Fantasy Football', ctx => {
    const c = fflCfg();
    if (!c) return fflSetup(ctx);
    ctx.act.innerHTML = '<button class="icon-btn" id="fflSet" title="League settings">⚙</button>';
    qs('#fflSet', ctx.act).onclick = () => fflSetup(ctx);
    ctx.body.innerHTML = '';
    subTabs(ctx.body, [{ k: 'match', label: 'Matchups' }, { k: 'stand', label: 'Standings' }, { k: 'roster', label: 'Rosters' }],
      (k, body) => k === 'match' ? fflMatchups(body) : k === 'stand' ? fflStandings(body) : fflRosters(body));
  });
}

function fflSetup(ctx) {
  const c = fflCfg() || { season: new Date().getMonth() < 2 ? new Date().getFullYear() - 1 : new Date().getFullYear() };
  ctx.act.innerHTML = '';
  ctx.body.innerHTML = `<div class="card join"><h4>Connect your ESPN league</h4>
    <p class="hint">Open your league on fantasy.espn.com and copy the number after <b>leagueId=</b> in the address bar.</p>
    <input class="search" id="fId" inputmode="numeric" placeholder="League ID" value="${esc(c.leagueId || '')}">
    <input class="search" id="fSeason" inputmode="numeric" placeholder="Season" value="${esc(c.season)}">
    <button class="btn" id="fGo">Load league</button>
    <p class="hint">Public leagues load right away. Private leagues load through the office backend once Tim adds his ESPN login to it.</p></div>`;
  qs('#fGo', ctx.body).onclick = async () => {
    const leagueId = qs('#fId', ctx.body).value.trim(), season = qs('#fSeason', ctx.body).value.trim();
    if (!/^\d+$/.test(leagueId)) return toast('Enter the numeric league ID');
    LS.set('ffl', { leagueId, season, teamId: c.leagueId === leagueId ? c.teamId : null });
    try { const d = await fflFetch(['mSettings', 'mTeam']); toast(`Loaded ${d.settings?.name || 'league'} ✔`); history.back(); setTimeout(openFantasy, 350); }
    catch (e) { toast(e.message, 5000); }
  };
}

async function fflMatchups(body, week) {
  const base = await fflFetch(['mSettings', 'mTeam', 'mStatus']);
  const cur = base.status?.currentMatchupPeriod || base.scoringPeriodId || 1;
  week = week || cur;
  const d = await fflFetch(['mMatchupScore', 'mTeam', 'mScoreboard'], week);
  const teams = {}; (d.teams || []).forEach(t => teams[t.id] = t);
  const myId = fflCfg().teamId;
  const games = (d.schedule || []).filter(m => m.matchupPeriodId === week);
  const side = s => {
    if (!s) return '<div class="fm-side bye">BYE</div>';
    const t = teams[s.teamId] || {}, pts = s.totalPointsLive ?? s.totalPoints ?? 0, proj = s.totalProjectedPointsLive;
    return `<div class="fm-side ${String(s.teamId) === String(myId) ? 'mine' : ''}">${img(t.logo, 'logo sm')}<span><b>${esc(fflTeamName(t))}</b><small>${esc(t.record?.overall ? `${t.record.overall.wins}-${t.record.overall.losses}` : '')}${proj ? ` · proj ${proj.toFixed(1)}` : ''}</small></span><b class="fm-pts">${Number(pts).toFixed(1)}</b></div>`;
  };
  body.innerHTML = `<div class="nav-row"><button class="icon-btn" data-w="${week - 1}">‹</button><span>${esc(base.settings?.name || '')} · Week ${week}${week === cur ? ' (now)' : ''}</span><button class="icon-btn" data-w="${week + 1}">›</button></div>
    ${!myId ? '<p class="hint">Tip: open Rosters and tap “This is my team” to highlight yours.</p>' : ''}
    <div class="fm-list">${games.map(m => `<button class="fm-card" data-m="${m.id}">${side(m.away)}${side(m.home)}</button>`).join('') || emptyHTML('No matchups this week.')}</div>`;
  body.onclick = e => {
    const w = e.target.closest('[data-w]'); if (w) { const n = Number(w.dataset.w); if (n >= 1) { body.innerHTML = loadingHTML(); fflMatchups(body, n).catch(er => body.innerHTML = errHTML(er)); } return; }
    const c = e.target.closest('[data-m]'); if (c) { const m = games.find(x => String(x.id) === c.dataset.m); if (m) fflMatchupSheet(m, teams, week); }
  };
}

function fflLineupHTML(entries, week) {
  const rows = [...(entries || [])].sort((a, b) => FFL_SLOT_ORDER.indexOf(a.lineupSlotId) - FFL_SLOT_ORDER.indexOf(b.lineupSlotId));
  return rows.map(e => {
    const p = e.playerPoolEntry?.player || {}, pts = fflPts(e, week, 0), proj = fflPts(e, week, 1);
    const bench = e.lineupSlotId === 20 || e.lineupSlotId === 21;
    const inj = p.injuryStatus && p.injuryStatus !== 'ACTIVE' ? p.injuryStatus.replace('_', ' ') : '';
    const hs = p.id > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${p.id}.png` : '';
    return `<button class="ln-row ${bench ? 'bench' : ''}" ${p.id > 0 ? `data-ath="${p.id}"` : ''}><i class="slot">${FFL_SLOTS[e.lineupSlotId] || ''}</i>${img(hs, 'hs sm')}
      <span><b>${esc(p.fullName || '')}</b><small>${esc(FFL_POS[p.defaultPositionId] || '')} · ${esc(FFL_PRO[p.proTeamId] || 'FA')}${inj ? ` · <i class="inj">${esc(inj)}</i>` : ''}</small></span>
      <span class="ln-pts"><b>${pts != null ? Number(pts).toFixed(1) : '–'}</b><small>${proj != null ? Number(proj).toFixed(1) : ''}</small></span></button>`;
  }).join('');
}

function fflMatchupSheet(m, teams, week) {
  const a = teams[m.away?.teamId] || {}, h = teams[m.home?.teamId] || {};
  Sheets.open(`${fflTeamName(a)} vs ${fflTeamName(h)}`, async ctx => {
    let ma = m.away?.rosterForCurrentScoringPeriod?.entries, mh = m.home?.rosterForCurrentScoringPeriod?.entries;
    if (!ma || !mh) { const d = await fflFetch(['mRoster', 'mTeam'], week); const t = {}; (d.teams || []).forEach(x => t[x.id] = x); ma = ma || t[a.id]?.roster?.entries; mh = mh || t[h.id]?.roster?.entries; }
    const pts = s => Number(s?.totalPointsLive ?? s?.totalPoints ?? 0).toFixed(1);
    ctx.body.innerHTML = `<div class="fm-head">${img(a.logo, 'logo lg')}<b>${pts(m.away)}</b><span>–</span><b>${pts(m.home)}</b>${img(h.logo, 'logo lg')}</div>
      <div class="ln-cols"><div><h4>${esc(fflTeamName(a))}</h4>${fflLineupHTML(ma, week)}</div><div><h4>${esc(fflTeamName(h))}</h4>${fflLineupHTML(mh, week)}</div></div>
      <p class="src">Big number = points, small = ESPN projection.</p>`;
    ctx.body.onclick = e => { const b = e.target.closest('[data-ath]'); if (b) openPlayer('nfl', b.dataset.ath); };
  });
}

async function fflStandings(body) {
  const d = await fflFetch(['mTeam', 'mSettings', 'mStandings']);
  const myId = fflCfg().teamId;
  const ts = [...(d.teams || [])].sort((a, b) => (a.playoffSeed || 99) - (b.playoffSeed || 99) || (b.record?.overall?.wins || 0) - (a.record?.overall?.wins || 0));
  body.innerHTML = `<div class="tbl-wrap"><table class="stats stand"><tr><th>Team</th><th>W-L</th><th>PF</th><th>PA</th><th>Strk</th></tr>
    ${ts.map((t, i) => { const r = t.record?.overall || {}; return `<tr class="${String(t.id) === String(myId) ? 'favrow' : ''}"><td class="rl"><b>${i + 1}</b>${img(t.logo, 'logo xs')}${esc(fflTeamName(t))}</td>
      <td>${r.wins || 0}-${r.losses || 0}${r.ties ? '-' + r.ties : ''}</td><td>${Number(r.pointsFor || 0).toFixed(1)}</td><td>${Number(r.pointsAgainst || 0).toFixed(1)}</td>
      <td>${r.streakLength ? (r.streakType === 'WIN' ? 'W' : 'L') + r.streakLength : ''}</td></tr>`; }).join('')}</table></div>`;
}

async function fflRosters(body) {
  const base = await fflFetch(['mStatus', 'mSettings']);
  const week = base.scoringPeriodId || base.status?.currentMatchupPeriod || 1;
  const d = await fflFetch(['mRoster', 'mTeam'], week);
  const teams = d.teams || [];
  let sel = fflCfg().teamId || teams[0]?.id;
  const draw = () => {
    const t = teams.find(x => String(x.id) === String(sel)) || teams[0];
    const mine = String(fflCfg().teamId) === String(t.id);
    body.innerHTML = `<select class="sel" id="fT">${teams.map(x => `<option value="${x.id}" ${String(x.id) === String(t.id) ? 'selected' : ''}>${esc(fflTeamName(x))}</option>`).join('')}</select>
      <button class="pill" id="fMine">${mine ? '★ My team' : '☆ This is my team'}</button>
      <div class="ln-list">${fflLineupHTML(t.roster?.entries, week)}</div>`;
    qs('#fT', body).onchange = e => { sel = e.target.value; draw(); };
    qs('#fMine', body).onclick = () => { const c = fflCfg(); c.teamId = t.id; LS.set('ffl', c); toast('Saved as your team'); draw(); };
  };
  draw();
  body.onclick = e => { const b = e.target.closest('[data-ath]'); if (b) openPlayer('nfl', b.dataset.ath); };
}
