/* Office Chair QB — Stat Center (NFL & NBA): league leaders, full player tables,
   team stat rankings, ESPN Power Index (FPI / BPI) and the league injury report.
   All data comes from ESPN's free public stat feeds (same as the rest of the app). */

const STATS_LG = ['nfl', 'nba'];
const STAT_BASE = (lg, kind) => `${WEB}${LEAGUES[lg].path}/statistics/${kind}?region=us&lang=en&contentorigin=espn&`;
const PI_URL = lg => `https://site.web.api.espn.com/apis/fitt/v3/sports/${LEAGUES[lg].path}/powerindex?limit=100`;
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const SORT_CAT = { defensiveinterceptions: 'defensiveInterceptions' };

/* ---------- leader cards ---------- */
const LEADER_CARDS = {
  nfl: [
    { t: 'Passing Yards', c: 'passing', n: 'passingYards', q: 'offense:passing' },
    { t: 'Passing TDs', c: 'passing', n: 'passingTouchdowns', q: 'offense:passing' },
    { t: 'Passer Rating', c: 'passing', n: 'QBRating', q: 'offense:passing' },
    { t: 'Rushing Yards', c: 'rushing', n: 'rushingYards', q: 'offense:rushing' },
    { t: 'Rushing TDs', c: 'rushing', n: 'rushingTouchdowns', q: 'offense:rushing' },
    { t: 'Receiving Yards', c: 'receiving', n: 'receivingYards', q: 'offense:receiving' },
    { t: 'Receptions', c: 'receiving', n: 'receptions', q: 'offense:receiving' },
    { t: 'Receiving TDs', c: 'receiving', n: 'receivingTouchdowns', q: 'offense:receiving' },
    { t: 'Sacks', c: 'defensive', n: 'sacks' },
    { t: 'Total Tackles', c: 'defensive', n: 'totalTackles' },
    { t: 'Interceptions', c: 'defensiveinterceptions', n: 'interceptions' },
    { t: 'Total Touchdowns', c: 'scoring', n: 'totalTouchdowns' }
  ],
  nba: [
    { t: 'Points Per Game', c: 'offensive', n: 'avgPoints' },
    { t: 'Rebounds Per Game', c: 'general', n: 'avgRebounds' },
    { t: 'Assists Per Game', c: 'offensive', n: 'avgAssists' },
    { t: 'Steals Per Game', c: 'defensive', n: 'avgSteals' },
    { t: 'Blocks Per Game', c: 'defensive', n: 'avgBlocks' },
    { t: '3-Pointers Made', c: 'offensive', n: 'threePointFieldGoalsMade' },
    { t: 'Field Goal %', c: 'offensive', n: 'fieldGoalPct' },
    { t: 'Free Throw %', c: 'offensive', n: 'freeThrowPct' },
    { t: 'Double-Doubles', c: 'general', n: 'doubleDouble' },
    { t: 'Minutes Per Game', c: 'general', n: 'avgMinutes' }
  ]
};

/* ---------- full player tables ---------- */
const PLAYER_TABLES = {
  nfl: [
    { k: 'pass', label: 'Passing', q: 'offense:passing', sort: 'passing.passingYards', cols: [['general', 'gamesPlayed'], ['passing', 'completions'], ['passing', 'passingAttempts'], ['passing', 'completionPct'], ['passing', 'passingYards'], ['passing', 'passingYardsPerGame'], ['passing', 'yardsPerPassAttempt'], ['passing', 'passingTouchdowns'], ['passing', 'interceptions'], ['passing', 'sacks'], ['passing', 'QBRating']] },
    { k: 'rush', label: 'Rushing', q: 'offense:rushing', sort: 'rushing.rushingYards', cols: [['general', 'gamesPlayed'], ['rushing', 'rushingAttempts'], ['rushing', 'rushingYards'], ['rushing', 'yardsPerRushAttempt'], ['rushing', 'rushingYardsPerGame'], ['rushing', 'longRushing'], ['rushing', 'rushingTouchdowns'], ['rushing', 'rushingFumblesLost']] },
    { k: 'rec', label: 'Receiving', q: 'offense:receiving', sort: 'receiving.receivingYards', cols: [['general', 'gamesPlayed'], ['receiving', 'receptions'], ['receiving', 'receivingTargets'], ['receiving', 'receivingYards'], ['receiving', 'yardsPerReception'], ['receiving', 'receivingYardsPerGame'], ['receiving', 'longReception'], ['receiving', 'receivingTouchdowns'], ['receiving', 'receivingYardsAfterCatch']] },
    { k: 'def', label: 'Defense', sort: 'defensive.totalTackles', cols: [['general', 'gamesPlayed'], ['defensive', 'totalTackles'], ['defensive', 'soloTackles'], ['defensive', 'sacks'], ['defensive', 'tacklesForLoss'], ['defensive', 'passesDefended'], ['defensiveinterceptions', 'interceptions'], ['general', 'fumblesForced'], ['general', 'fumblesRecovered']] },
    { k: 'kick', label: 'Kicking', sort: 'kicking.fieldGoalsMade', cols: [['general', 'gamesPlayed'], ['kicking', 'fieldGoalsMade'], ['kicking', 'fieldGoalAttempts'], ['kicking', 'fieldGoalPct'], ['kicking', 'longFieldGoalMade'], ['kicking', 'fieldGoalsMade50'], ['kicking', 'extraPointsMade'], ['kicking', 'extraPointPct']] }
  ],
  nba: [
    { k: 'all', label: 'Per Game', sort: 'offensive.avgPoints', cols: [['general', 'gamesPlayed'], ['general', 'avgMinutes'], ['offensive', 'avgPoints'], ['general', 'avgRebounds'], ['offensive', 'avgAssists'], ['defensive', 'avgSteals'], ['defensive', 'avgBlocks'], ['offensive', 'avgTurnovers'], ['offensive', 'fieldGoalPct'], ['offensive', 'threePointFieldGoalPct'], ['offensive', 'freeThrowPct']] },
    { k: 'shoot', label: 'Shooting', sort: 'offensive.avgThreePointFieldGoalsMade', cols: [['general', 'gamesPlayed'], ['offensive', 'avgFieldGoalsMade'], ['offensive', 'avgFieldGoalsAttempted'], ['offensive', 'fieldGoalPct'], ['offensive', 'avgThreePointFieldGoalsMade'], ['offensive', 'avgThreePointFieldGoalsAttempted'], ['offensive', 'threePointFieldGoalPct'], ['offensive', 'avgFreeThrowsMade'], ['offensive', 'avgFreeThrowsAttempted'], ['offensive', 'freeThrowPct']] },
    { k: 'tot', label: 'Season Totals', sort: 'offensive.points', cols: [['general', 'gamesPlayed'], ['general', 'minutes'], ['offensive', 'points'], ['general', 'rebounds'], ['offensive', 'assists'], ['defensive', 'steals'], ['defensive', 'blocks'], ['offensive', 'threePointFieldGoalsMade'], ['general', 'doubleDouble'], ['general', 'tripleDouble']] }
  ]
};

/* ---------- team stat rankings (low: true = smaller is better) ---------- */
const TEAM_STATS = {
  nfl: {
    Offense: [
      { t: 'Points / Game', c: 'passing', n: 'totalPointsPerGame', s: '0' },
      { t: 'Total Yards / Game', c: 'passing', n: 'yardsPerGame', s: '0' },
      { t: 'Passing Yards / Game', c: 'passing', n: 'netPassingYardsPerGame', s: '0' },
      { t: 'Rushing Yards / Game', c: 'rushing', n: 'rushingYardsPerGame', s: '0' },
      { t: '3rd Down %', c: 'miscellaneous', n: 'thirdDownConvPct', s: '0' },
      { t: 'Giveaways', c: 'miscellaneous', n: 'totalGiveaways', s: '0', low: true }
    ],
    Defense: [
      { t: 'Points Allowed / Game', c: 'passing', n: 'totalPointsPerGame', s: '900', low: true },
      { t: 'Yards Allowed / Game', c: 'passing', n: 'yardsPerGame', s: '900', low: true },
      { t: 'Pass Yards Allowed / Game', c: 'passing', n: 'netPassingYardsPerGame', s: '900', low: true },
      { t: 'Rush Yards Allowed / Game', c: 'rushing', n: 'rushingYardsPerGame', s: '900', low: true },
      { t: 'Sacks', c: 'passing', n: 'sacks', s: '900' },
      { t: 'Takeaways', c: 'miscellaneous', n: 'totalTakeaways', s: '0' }
    ],
    Other: [
      { t: 'Turnover Margin', c: 'miscellaneous', n: 'turnOverDifferential', s: '0' },
      { t: 'Penalty Yards', c: 'miscellaneous', n: 'totalPenaltyYards', s: '0', low: true },
      { t: 'Field Goal %', c: 'kicking', n: 'fieldGoalPct', s: '0' },
      { t: 'Net Punt Average', c: 'punting', n: 'netAvgPuntYards', s: '0' }
    ]
  },
  nba: {
    Offense: [
      { t: 'Points / Game', c: 'offensive', n: 'avgPoints', s: '0' },
      { t: 'Field Goal %', c: 'offensive', n: 'fieldGoalPct', s: '0' },
      { t: '3-Point %', c: 'offensive', n: 'threePointFieldGoalPct', s: '0' },
      { t: '3-Pointers Made / Game', c: 'offensive', n: 'avgThreePointFieldGoalsMade', s: '0' },
      { t: 'Assists / Game', c: 'offensive', n: 'avgAssists', s: '0' },
      { t: 'Turnovers / Game', c: 'offensive', n: 'avgTurnovers', s: '0', low: true }
    ],
    Defense: [
      { t: 'Points Allowed / Game', c: 'offensive', n: 'avgPoints', s: '900', low: true },
      { t: 'Opponent FG %', c: 'offensive', n: 'fieldGoalPct', s: '900', low: true },
      { t: 'Opponent 3-Point %', c: 'offensive', n: 'threePointFieldGoalPct', s: '900', low: true },
      { t: 'Steals / Game', c: 'defensive', n: 'avgSteals', s: '0' },
      { t: 'Blocks / Game', c: 'defensive', n: 'avgBlocks', s: '0' }
    ],
    Other: [
      { t: 'Point Differential', c: 'differential', n: 'avgPointsDifferential' },
      { t: 'Rebounds / Game', c: 'general', n: 'avgRebounds', s: '0' },
      { t: 'Rebound Margin', c: 'differential', n: 'avgReboundsDifferential' },
      { t: 'Free Throw %', c: 'offensive', n: 'freeThrowPct', s: '0' }
    ]
  }
};

/* ---------- generic readers for ESPN stat payloads ---------- */
function defIdx(defs, cat, name) {
  const d = (defs || []).find(x => String(x.name).toLowerCase() === String(cat).toLowerCase());
  return d ? (d.names || []).indexOf(name) : -1;
}
function defLabel(defs, cat, name) {
  const d = (defs || []).find(x => String(x.name).toLowerCase() === String(cat).toLowerCase());
  const i = d ? (d.names || []).indexOf(name) : -1;
  return i >= 0 ? (d.labels || [])[i] || name : name;
}
function defDesc(defs, cat, name) {
  const d = (defs || []).find(x => String(x.name).toLowerCase() === String(cat).toLowerCase());
  const i = d ? (d.names || []).indexOf(name) : -1;
  return i >= 0 ? (d.displayNames || d.descriptions || [])[i] || '' : '';
}
function statOf(entry, defs, cat, name, split) {
  const i = defIdx(defs, cat, name); if (i < 0) return null;
  const c = (entry.categories || []).find(x => String(x.name).toLowerCase() === String(cat).toLowerCase() && (split == null || String(x.splitId ?? '0') === split));
  if (!c) return null;
  const v = (c.values || [])[i], t = (c.totals || [])[i];
  if (t == null && v == null) return null;
  return { v: typeof v === 'number' ? v : parseFloat(String(t).replace(/[,%+]/g, '')), t: t ?? (v == null ? '' : String(v)) };
}
function athTeam(a) {
  const t = (a.teams || [])[0] || {};
  return { id: a.teamId || t.id, ab: a.teamShortName || t.abbreviation || '', logo: (a.teamLogos || [])[0]?.href || logoOf(t) };
}

/* Season handling: ESPN serves last season's numbers until the new one has games.
   Ask for the current season first; fall back to the most recent one with stats. */
const _statSeason = {};
async function statSeason(lg) {
  if (_statSeason[lg]) return _statSeason[lg];
  const base = STAT_BASE(lg, 'byteam') + 'limit=40';
  const d = await getJSON(base, 1800);
  const cur = d.currentSeason || {}, req = d.requestedSeason || {};
  const played = x => (x.teams || []).some(t => (statOf(t, x.categories, 'general', 'gamesPlayed', '0')?.v || 0) > 0);
  let out = { year: req.year, label: req.displayName || String(req.year || ''), fallback: false };
  if (cur.year && cur.year !== req.year) {
    try {
      const d2 = await getJSON(base + `&season=${cur.year}&seasontype=2`, 1800);
      if (played(d2)) out = { year: cur.year, label: cur.displayName || String(cur.year), fallback: false };
      else out.fallback = cur.displayName || String(cur.year);
    } catch (e) { out.fallback = cur.displayName || String(cur.year); }
  }
  return (_statSeason[lg] = out);
}
const seasonQS = s => s.year ? `&season=${s.year}&seasontype=2` : '';
function seasonNote(s, lg) {
  return s.fallback
    ? `<div class="st-note">🗓️ The ${esc(s.fallback)} ${LEAGUES[lg].short} season hasn't logged stats yet — showing the final <b>${esc(s.label)}</b> numbers until it does.</div>`
    : `<div class="st-note">${LEAGUES[lg].short} · ${esc(s.label)} regular season · updates through the latest games</div>`;
}

async function fetchAthletes(lg, { sort, q, limit = 50, page = 1 }) {
  const s = await statSeason(lg);
  const p = new URLSearchParams({ isqualified: 'true', page, limit, sort: sort + ':desc' });
  if (q) p.set('category', q);
  return getJSON(STAT_BASE(lg, 'byathlete') + p + seasonQS(s), 600);
}
async function fetchTeamStats(lg) {
  const s = await statSeason(lg);
  return getJSON(STAT_BASE(lg, 'byteam') + 'limit=40' + seasonQS(s), 600);
}
async function fetchPowerIndex(lg) {
  const d = await getJSON(PI_URL(lg), 1800);
  const cur = d.currentSeason || {}, req = d.requestedSeason || {};
  if (cur.year && cur.year !== req.year && cur.type?.id === '2') {
    try { const d2 = await getJSON(PI_URL(lg) + `&season=${cur.year}`, 1800); if ((d2.teams || []).length) return d2; } catch (e) { }
  }
  return d;
}

/* ---------- Stat Center sheet ---------- */
function openStats(lg, tab) {
  lg = STATS_LG.includes(lg) ? lg : LS.get('statsLg', STATS_LG.includes(Prefs.get().theme?.lg) ? Prefs.get().theme.lg : 'nfl');
  Sheets.open('Stat Center', ctx => {
    const draw = () => {
      ctx.setTitle(`${LEAGUES[lg].short} Stat Center`);
      ctx.body.innerHTML = `<div class="st-top">${lgChipsHTML(STATS_LG, lg, 'stcLg')}</div><div id="stcBody"></div>`;
      bindChips(ctx.body, 'stcLg', k => { lg = k; LS.set('statsLg', k); tab = null; draw(); });
      const tabs = [{ k: 'leaders', label: '🏅 Leaders' }, { k: 'players', label: '📋 Player Stats' }, { k: 'teams', label: '📊 Team Ranks' },
        { k: 'power', label: lg === 'nfl' ? '⚡ FPI' : '⚡ BPI' }, { k: 'inj', label: '🩹 Injuries' }];
      const st = subTabs(qs('#stcBody', ctx.body), tabs, (k, body) => {
        LS.set('statsTab', k);
        if (k === 'leaders') return statLeaders(body, lg, (t, sort) => { tab = 'players'; LS.set('statsTable:' + lg, { t, sort }); st.pick('players'); });
        if (k === 'players') return statPlayers(body, lg);
        if (k === 'teams') return statTeams(body, lg);
        if (k === 'power') return statPower(body, lg);
        if (k === 'inj') return statInjuries(body, lg);
      }, tab || LS.get('statsTab', 'leaders'));
    };
    draw();
  });
}

function playerRowHTML(a, rank, val, lg) {
  const tm = athTeam(a), fav = Prefs.isFav(lg, tm.id);
  return `<button class="ld-row ${fav ? 'fav' : ''}" data-ath="${a.id}"><i class="ld-rk">${rank}</i>${img(a.headshot?.href, 'hs')}
    <span class="ld-nm"><b>${esc(a.shortName || a.displayName || '')}</b><small>${img(tm.logo, 'logo xs')}${esc(tm.ab)} · ${esc(a.position?.abbreviation || '')}</small></span>
    <span class="ld-val">${esc(val)}</span></button>`;
}

async function statLeaders(body, lg, openTable) {
  const s = await statSeason(lg);
  const cards = LEADER_CARDS[lg];
  body.innerHTML = seasonNote(s, lg) + `<div class="st-grid">${cards.map((c, i) => `<div class="card ld-card" id="ldc${i}"><h4>${esc(c.t)}</h4><div class="ld-list">${loadingHTML('')}</div>
    <button class="ld-more" data-i="${i}">Full list ›</button></div>`).join('')}</div><p class="src">Stats: ESPN · tap a player for his card</p>`;
  body.onclick = e => {
    const a = e.target.closest('[data-ath]'); if (a) return openPlayer(lg, a.dataset.ath);
    const m = e.target.closest('.ld-more'); if (!m) return;
    const c = cards[m.dataset.i], tbl = PLAYER_TABLES[lg].find(t => t.cols.some(([cc, n]) => cc === c.c && n === c.n)) || PLAYER_TABLES[lg][0];
    openTable(tbl.k, `${SORT_CAT[c.c] || c.c}.${c.n}`);
  };
  await pool(cards.map((c, i) => [c, i]), 4, async ([c, i]) => {
    const el = qs(`#ldc${i} .ld-list`, body); if (!el) return;
    try {
      const d = await fetchAthletes(lg, { sort: `${SORT_CAT[c.c] || c.c}.${c.n}`, q: c.q, limit: 5 });
      const rows = (d.athletes || []).map(x => ({ a: x.athlete || x, st: statOf(x.athlete?.categories ? x.athlete : x, d.categories, c.c, c.n) })).filter(r => r.st && r.st.t !== '-');
      el.innerHTML = rows.length ? rows.map((r, k) => playerRowHTML(r.a, k + 1, r.st.t, lg)).join('') : emptyHTML('No leaders yet.');
    } catch (e) { el.innerHTML = errHTML(e); }
  });
}

async function statPlayers(body, lg) {
  const tables = PLAYER_TABLES[lg];
  const saved = LS.get('statsTable:' + lg, {});
  let tbl = tables.find(t => t.k === saved.t) || tables[0];
  let sort = saved.sort || tbl.sort, page = 1, rows = [], defs = [], total = 0;
  const s = await statSeason(lg);
  body.innerHTML = seasonNote(s, lg) + `<div class="seg small" id="ptSeg">${tables.map(t => `<button data-k="${t.k}" class="${t === tbl ? 'on' : ''}">${esc(t.label)}</button>`).join('')}</div>
    <input class="search" id="ptFind" placeholder="Filter by player or team (e.g. Chiefs, KC, Mahomes)"><div id="ptTbl">${loadingHTML()}</div>`;
  const out = qs('#ptTbl', body), find = qs('#ptFind', body);
  const render = () => {
    const f = find.value.trim().toLowerCase();
    const show = rows.filter(x => !f || [x.a.displayName, x.a.shortName, athTeam(x.a).ab, x.a.teamName].some(v => String(v || '').toLowerCase().includes(f)));
    out.innerHTML = `<div class="tbl-wrap st-tbl"><table class="stats wide"><tr><th>#</th><th class="pl">Player</th>${tbl.cols.map(([c, n]) => {
      const key = `${SORT_CAT[c] || c}.${n}`;
      return `<th class="sortable ${key === sort ? 'on' : ''}" data-sort="${key}" title="${esc(defDesc(defs, c, n))}">${esc(defLabel(defs, c, n))}${key === sort ? ' ▼' : ''}</th>`; }).join('')}</tr>
      ${show.map(x => { const tm = athTeam(x.a);
        return `<tr class="${Prefs.isFav(lg, tm.id) ? 'favrow' : ''}"><td>${x.rk}</td><td class="pl"><button class="lnk pl-cell" data-ath="${x.a.id}">${img(x.a.headshot?.href, 'hs sm')}<span><b>${esc(x.a.shortName || x.a.displayName)}</b><small>${img(tm.logo, 'logo xs')}${esc(tm.ab)} · ${esc(x.a.position?.abbreviation || '')}</small></span></button></td>
          ${tbl.cols.map(([c, n]) => { const v = statOf(x.src, defs, c, n); return `<td class="${`${SORT_CAT[c] || c}.${n}` === sort ? 'hi' : ''}">${esc(v ? v.t : '')}</td>`; }).join('')}</tr>`; }).join('')}</table></div>
      ${!show.length ? emptyHTML(f ? 'Nobody on this page matches that filter.' : 'No stats yet.') : ''}
      ${rows.length < total ? `<button class="btn ghost" id="ptMore">Load more (${rows.length} of ${total})</button>` : ''}`;
  };
  const load = async (reset) => {
    if (reset) { page = 1; rows = []; out.innerHTML = loadingHTML(); }
    const d = await fetchAthletes(lg, { sort, q: tbl.q, limit: 50, page });
    defs = d.categories || defs; total = d.pagination?.count || 0;
    (d.athletes || []).forEach(x => rows.push({ a: x.athlete || x, src: x.athlete?.categories ? x.athlete : x, rk: rows.length + 1 }));
    render();
  };
  qs('#ptSeg', body).onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    tbl = tables.find(t => t.k === b.dataset.k); sort = tbl.sort;
    qsa('#ptSeg button', body).forEach(x => x.classList.toggle('on', x === b));
    LS.set('statsTable:' + lg, { t: tbl.k, sort }); load(true).catch(er => { out.innerHTML = errHTML(er); });
  };
  find.oninput = render;
  out.onclick = e => {
    const a = e.target.closest('[data-ath]'); if (a) return openPlayer(lg, a.dataset.ath);
    const h = e.target.closest('[data-sort]');
    if (h && h.dataset.sort !== sort) { sort = h.dataset.sort; LS.set('statsTable:' + lg, { t: tbl.k, sort }); return load(true).catch(er => { out.innerHTML = errHTML(er); }); }
    if (e.target.closest('#ptMore')) { page++; e.target.textContent = 'Loading…'; load(false).catch(er => toast('Couldn\'t load more')); }
  };
  await load(true);
}

/* Rank every team for one stat */
function rankTeams(d, st) {
  const list = (d.teams || []).map(e => ({ team: e.team || {}, s: statOf(e, d.categories, st.c, st.n, st.s) })).filter(x => x.s && !isNaN(x.s.v));
  list.sort((a, b) => st.low ? a.s.v - b.s.v : b.s.v - a.s.v);
  list.forEach((x, i) => { x.rk = i && list[i - 1].s.v === x.s.v ? list[i - 1].rk : i + 1; });
  return list;
}
const rankClass = (rk, n) => rk <= Math.ceil(n / 4) ? 'good' : rk > n - Math.ceil(n / 4) ? 'bad' : '';

async function statTeams(body, lg) {
  const [s, d] = await Promise.all([statSeason(lg), fetchTeamStats(lg)]);
  const groups = TEAM_STATS[lg];
  let g = LS.get('teamStatG:' + lg, 'Offense'), i = LS.get('teamStatI:' + lg, 0);
  if (!groups[g]) g = 'Offense'; if (!groups[g][i]) i = 0;
  const draw = () => {
    const st = groups[g][i], list = rankTeams(d, st);
    const vals = list.map(x => x.s.v), mx = Math.max(...vals), mn = Math.min(...vals, 0);
    body.innerHTML = seasonNote(s, lg) + `<div class="seg small" id="tsG">${Object.keys(groups).map(k => `<button data-k="${k}" class="${k === g ? 'on' : ''}">${k}</button>`).join('')}</div>
      <div class="chips" id="tsI">${groups[g].map((x, k) => `<button data-k="${k}" class="${k === i ? 'on' : ''}">${esc(x.t)}</button>`).join('')}</div>
      <div class="card"><h4>${esc(st.t)} <small class="st-sub">${st.low ? 'lower is better' : 'higher is better'}</small></h4>
      <div class="bars">${list.map(x => { const w = mx === mn ? 100 : Math.max(4, ((x.s.v - mn) / (mx - mn)) * 100);
        return `<button class="bar-row ${Prefs.isFav(lg, x.team.id) ? 'fav' : ''}" data-team="${x.team.id}"><i class="ld-rk ${rankClass(x.rk, list.length)}">${x.rk}</i>${img(logoOf(x.team), 'logo sm')}
          <span class="bar-nm">${esc(x.team.shortDisplayName || x.team.displayName || '')}</span><span class="bar"><span style="width:${(st.low ? 104 - w : w).toFixed(1)}%"></span></span><b class="bar-v">${esc(x.s.t)}</b></button>`; }).join('')}</div></div>`;
    qs('#tsG', body).onclick = e => { const b = e.target.closest('button'); if (!b) return; g = b.dataset.k; i = 0; LS.set('teamStatG:' + lg, g); LS.set('teamStatI:' + lg, 0); draw(); };
    qs('#tsI', body).onclick = e => { const b = e.target.closest('button'); if (!b) return; i = Number(b.dataset.k); LS.set('teamStatI:' + lg, i); draw(); };
  };
  body.onclick = e => { const t = e.target.closest('[data-team]'); if (t) openTeam(lg, t.dataset.team); };
  draw();
}

/* Power index (FPI for NFL, BPI for NBA) — columns found by name so both leagues share one renderer */
function piCols(d) {
  const all = [];
  (d.categories || []).forEach(c => (c.names || []).forEach((n, i) => all.push({ c: c.name, n, lab: (c.labels || [])[i] || n, dn: (c.displayNames || [])[i] || '' })));
  const find = re => all.find(x => re.test(x.n) || re.test(x.dn) || re.test(x.lab));
  return {
    rating: find(/^(fpi|bpi)$/i), w: find(/^(numwins|num wins)$/i), l: find(/^(numlosses|num losses)$/i),
    pw: find(/^(projectedw|proj wins|projw)$/i), pl: find(/^(projectedl|proj losses|projl)$/i),
    po: find(/^(probmakeplayoffs|prob make playoffs)$/i), div: find(/^(probwindiv|prob win div)$/i),
    title: find(/^(probwintitle|prob win title)$/i), off: find(/^(epaoffense|bpi offense|bpioffense)$/i), def: find(/^(epadefense|bpi defense|bpidefense)$/i)
  };
}
function piVal(e, d, col) { if (!col) return ''; const v = statOf(e, d.categories, col.c, col.n); return v ? v.t : ''; }

async function statPower(body, lg) {
  const d = await fetchPowerIndex(lg);
  const cols = piCols(d), nm = lg === 'nfl' ? 'FPI' : 'BPI';
  const list = (d.teams || []).map(e => ({ e, r: statOf(e, d.categories, cols.rating?.c, cols.rating?.n) })).filter(x => x.r).sort((a, b) => b.r.v - a.r.v);
  const head = [['Team'], [nm, cols.rating], ['Off', cols.off], ['Def', cols.def], ['Rec'], ['Proj', 'proj'], ['Playoffs', cols.po], ['Win Div', cols.div], [lg === 'nfl' ? 'Win SB' : 'Win Title', cols.title]].filter(h => h.length === 1 || h[1]);
  const sea = d.requestedSeason?.displayName || '';
  body.innerHTML = `<div class="st-note">ESPN ${lg === 'nfl' ? 'Football' : 'Basketball'} Power Index${sea ? ' · ' + esc(sea) : ''}. The rating is how many points better than an average team on a neutral field; the odds come from 10,000 season simulations.</div>
    <div class="tbl-wrap st-tbl"><table class="stats wide pi"><tr><th>#</th>${head.map(h => `<th class="${h[0] === 'Team' ? 'pl' : ''}">${h[0]}</th>`).join('')}</tr>
    ${list.map((x, k) => { const t = x.e.team || {};
      return `<tr class="${Prefs.isFav(lg, t.id) ? 'favrow' : ''}" data-team="${t.id}"><td>${k + 1}</td>${head.map(h => {
        if (h[0] === 'Team') return `<td class="pl rl">${img(logoOf(t), 'logo xs')}${esc(t.shortDisplayName || t.displayName || '')}</td>`;
        if (h[0] === 'Rec') return `<td>${esc(piVal(x.e, d, cols.w))}-${esc(piVal(x.e, d, cols.l))}</td>`;
        if (h[1] === 'proj') return `<td>${cols.pw ? `${esc(piVal(x.e, d, cols.pw))}-${esc(piVal(x.e, d, cols.pl))}` : ''}</td>`;
        return `<td class="${h[0] === nm ? 'hi' : ''}">${esc(piVal(x.e, d, h[1]))}</td>`; }).join('')}</tr>`; }).join('')}</table></div>
    ${!list.length ? emptyHTML('Power Index isn\'t posted yet this season.') : ''}<p class="src">Source: ESPN ${nm}</p>`;
  body.onclick = e => { const t = e.target.closest('[data-team]'); if (t) openTeam(lg, t.dataset.team); };
}

/* League-wide injury report */
const INJ_ORDER = ['Out', 'Injured Reserve', 'Doubtful', 'Questionable', 'Day-To-Day', 'Probable'];
const injClass = s => /out|reserve|suspen/i.test(s) ? 'out' : /doubt/i.test(s) ? 'dbt' : /quest|day/i.test(s) ? 'q' : 'ok';
function injAthId(a) { const h = (a.links || []).map(l => l.href).find(x => /\/id\/\d+/.test(x || '')); const m = /\/id\/(\d+)/.exec(h || ''); return m ? m[1] : ''; }
function injRowHTML(x) {
  const a = x.athlete || {}, det = x.details || {}, id = injAthId(a);
  const what = [det.side && det.side !== 'Not Specified' ? det.side : '', det.type, det.detail].filter(v => v && v !== 'Not Specified').join(' · ');
  return `<button class="inj-row" ${id ? `data-ath="${id}"` : ''}>${img(a.headshot?.href, 'hs')}<span class="inj-main"><b>${esc(a.displayName || '')}</b> <small>${esc(a.position?.abbreviation || '')}</small>
    <small class="inj-what">${esc(what || 'Undisclosed')}${det.returnDate ? ' · est. return ' + esc(fmtDay(det.returnDate)) : ''}</small>
    ${x.shortComment ? `<small class="inj-note">${esc(x.shortComment)}</small>` : ''}</span><i class="inj-st ${injClass(x.status || '')}">${esc(x.status || '')}</i></button>`;
}
async function fetchInjuries(lg) { return getJSON(`${SITE}${LEAGUES[lg].path}/injuries`, 900); }

async function statInjuries(body, lg) {
  const d = await fetchInjuries(lg);
  const favIds = new Set(Prefs.get().favs.filter(f => f.lg === lg).map(f => String(f.id)));
  let filt = LS.get('injFilt', 'all'), q = '';
  const teams = (d.injuries || []).filter(t => (t.injuries || []).length).sort((a, b) => (favIds.has(String(b.id)) - favIds.has(String(a.id))) || String(a.displayName).localeCompare(b.displayName));
  body.innerHTML = `<div class="chips" id="injF">${[['all', 'All'], ['out', 'Out / IR'], ['dbt', 'Doubtful'], ['q', 'Questionable']].map(([k, l]) => `<button data-k="${k}" class="${k === filt ? 'on' : ''}">${l}</button>`).join('')}</div>
    <input class="search" id="injQ" placeholder="Find a team or player"><div id="injList"></div>`;
  const list = qs('#injList', body);
  const draw = () => {
    const html = teams.map(t => {
      const rows = (t.injuries || []).filter(x => (filt === 'all' || injClass(x.status || '') === filt) && (!q || (t.displayName + ' ' + (x.athlete?.displayName || '')).toLowerCase().includes(q)))
        .sort((a, b) => INJ_ORDER.indexOf(a.status) - INJ_ORDER.indexOf(b.status));
      if (!rows.length) return '';
      const tm = rows[0].athlete?.team || {};
      return `<details class="card inj-team" ${favIds.has(String(t.id)) || q ? 'open' : ''}><summary>${img(logoOf(tm), 'logo sm')}<h4>${esc(t.displayName)}</h4><small class="st-sub">${rows.length}</small>${favIds.has(String(t.id)) ? '<i class="badge">MY TEAM</i>' : ''}</summary>${rows.map(injRowHTML).join('')}</details>`;
    }).join('');
    list.innerHTML = html ? `<div class="inj-grid">${html}</div>` : emptyHTML('No injuries match.');
  };
  qs('#injF', body).onclick = e => { const b = e.target.closest('button'); if (!b) return; filt = b.dataset.k; LS.set('injFilt', filt); qsa('#injF button', body).forEach(x => x.classList.toggle('on', x === b)); draw(); };
  qs('#injQ', body).oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  body.onclick = e => { const a = e.target.closest('[data-ath]'); if (a) openPlayer(lg, a.dataset.ath); };
  draw();
}

/* ---------- Team page tab: where this team ranks + power index + injuries ---------- */
async function teamRanks(body, lg, t) {
  const [s, d] = await Promise.all([statSeason(lg), fetchTeamStats(lg)]);
  const groups = TEAM_STATS[lg];
  let html = seasonNote(s, lg);
  Object.entries(groups).forEach(([g, list]) => {
    html += `<h3 class="sec-h">${g}</h3><div class="rank-tiles">${list.map(st => {
      const all = rankTeams(d, st), me = all.find(x => String(x.team.id) === String(t.id));
      if (!me) return '';
      return `<div class="rank-tile ${rankClass(me.rk, all.length)}"><small>${esc(st.t)}</small><b>${esc(me.s.t)}</b><span>${ordinal(me.rk)} of ${all.length}</span></div>`;
    }).join('')}</div>`;
  });
  html += `<div id="trPower"></div><div id="trInj"></div><button class="btn ghost" id="trOpen">Open the full ${LEAGUES[lg].short} Stat Center</button>`;
  body.innerHTML = html;
  qs('#trOpen', body).onclick = () => openStats(lg, 'leaders');
  // power index card
  fetchPowerIndex(lg).then(pd => {
    const el = qs('#trPower', body); if (!el) return;
    const e = (pd.teams || []).find(x => String(x.team?.id) === String(t.id)); if (!e) return;
    const c = piCols(pd), nm = lg === 'nfl' ? 'FPI' : 'BPI';
    const ranked = (pd.teams || []).map(x => statOf(x, pd.categories, c.rating?.c, c.rating?.n)?.v).filter(v => v != null).sort((a, b) => b - a);
    const mine = statOf(e, pd.categories, c.rating?.c, c.rating?.n);
    const rk = mine ? ranked.indexOf(mine.v) + 1 : 0;
    const stat = (lab, col) => col ? `<div><small>${lab}</small><b>${esc(piVal(e, pd, col))}</b></div>` : '';
    el.innerHTML = `<div class="card"><h4>⚡ ESPN ${nm}</h4><div class="pi-strip">
      ${mine ? `<div><small>${nm} rating</small><b>${esc(mine.t)}</b>${rk ? `<span>${ordinal(rk)}</span>` : ''}</div>` : ''}
      ${c.pw ? `<div><small>Projected record</small><b>${esc(piVal(e, pd, c.pw))}-${esc(piVal(e, pd, c.pl))}</b></div>` : ''}
      ${stat('Make playoffs', c.po)}${stat('Win division', c.div)}${stat(lg === 'nfl' ? 'Win Super Bowl' : 'Win title', c.title)}</div></div>`;
  }).catch(() => { });
  // injuries card
  fetchInjuries(lg).then(id => {
    const el = qs('#trInj', body); if (!el) return;
    const mine = (id.injuries || []).find(x => String(x.id) === String(t.id));
    const rows = (mine?.injuries || []).sort((a, b) => INJ_ORDER.indexOf(a.status) - INJ_ORDER.indexOf(b.status));
    el.innerHTML = `<div class="card"><h4>🩹 Injury Report <small class="st-sub">${rows.length}</small></h4>${rows.length ? rows.map(injRowHTML).join('') : '<p class="hint">Nobody on the injury report. 🙌</p>'}</div>`;
    el.onclick = e => { const a = e.target.closest('[data-ath]'); if (a) openPlayer(lg, a.dataset.ath); };
  }).catch(() => { });
}
