/* Office Chair QB — app shell, home, routing */
const App = {
  tab: 'home', liveTimer: null,
  tabs: { home: renderHome, scores: renderScores, team: renderMyTeam, players: renderPlayers, more: renderMore },
  go(tab) {
    clearInterval(this.liveTimer);
    this.tab = tab; LS.set('tab', tab);
    qsa('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const view = qs('#view');
    view.onclick = null; view.innerHTML = loadingHTML();
    view.scrollTop = 0; window.scrollTo(0, 0);
    if (needsSignup()) return renderSignup(view);
    Promise.resolve(this.tabs[tab](view)).catch(e => { view.innerHTML = errHTML(e); });
  }
};

async function renderHome(view) {
  const p = Prefs.get(), favs = p.favs;
  const hr = new Date().getHours();
  const hello = (hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : 'Evening') + (fanName() ? ', ' + fanName() : '');
  if (!favs.length) {
    view.innerHTML = `<div class="hero-empty welcome"><img src="icons/icon-192.png" alt="" class="app-mark"><h2>Welcome to ${esc(CONFIG.APP_NAME)}</h2>
      <p>Pick your teams and the whole app takes on your team's colors. Scores, stats, recruiting, pros from your school, trading cards and the office pick'em — all in one spot.</p>
      <button class="btn" id="pick">Pick my teams</button></div>`;
    qs('#pick', view).onclick = () => openTeamPicker({ title: 'Pick Your Teams' });
    return;
  }
  const th = p.theme;
  view.innerHTML = `<div id="gdHero"></div><div class="home-hero" ${th ? `style="--tc:#${th.c};--ta:#${th.a};--tl:url('${esc(th.logo)}')"` : ''}>
      ${th ? img(th.logo, 'logo hero-logo') : ''}<div><h2 class="hello">${esc(hello)} 👋</h2>${th ? `<small>${esc(th.dn)} · ${LEAGUES[th.lg].short}</small>` : ''}</div></div>
    <div id="gameDay"></div>
    <div id="rivalCard"></div>
    <div id="thisDay"></div>
    <h3 class="sec-h">My Teams</h3><div class="my-teams" id="myTeams">${favs.map(f => `<button class="mt-card" data-k="${f.lg}:${f.id}" style="--tc:#${f.c};--ta:#${f.a}">${img(f.logo, 'logo lg')}<b>${esc(f.ab || f.dn)}</b><small>${LEAGUES[f.lg].short}</small><span class="mt-next">…</span></button>`).join('')}</div>
    <div id="homeClips"></div>
    <h3 class="sec-h">Live & Today</h3><div id="liveNow">${loadingHTML()}</div>
    <h3 class="sec-h">The Clubhouse</h3>${homeTilesHTML(p)}
    <h3 class="sec-h">Jump to a league</h3><div class="lg-grid">${LEAGUE_ORDER.map(k => `<button class="lg-tile" data-lgo="${k}">${lgIcon(k, 'lg-big')}<b>${LEAGUES[k].short}</b><small>${LEAGUES[k].college ? LEAGUES[k].icon + ' NCAA' : 'Pro'}</small></button>`).join('')}</div>`;
  bindGameClicks(qs('#liveNow', view));
  homeRivalryCard(qs('#rivalCard', view));
  homeThisDay(qs('#thisDay', view));
  homeClips(qs('#homeClips', view));
  GameDay.renderHero(qs('#gdHero', view));
  view.onclick = e => {
    const c = e.target.closest('.mt-card');
    if (c) { const [lg, id] = c.dataset.k.split(':'); LS.set('myTeamCur', { lg, id }); return App.go('team'); }
    const q = e.target.closest('[data-go]');
    if (q) return runTile(q.dataset.go, p);
    const lgo = e.target.closest('[data-lgo]');
    if (lgo) { ScoreState.lg = lgo.dataset.lgo; ScoreState.date = new Date(); ScoreState.week = null; ScoreState.seasontype = null; return App.go('scores'); }
    const gd = e.target.closest('[data-gd]');
    if (gd) { const [lg, ev] = gd.dataset.gd.split(':'); openGame(lg, ev); }
  };

  // favorite teams' next/live game
  const gameDay = [];
  pool(favs, 4, async f => {
    const d = await getJSON(`${SITE}${LEAGUES[f.lg].path}/teams/${f.id}`, 120);
    const t = d.team || {}, ev = (t.nextEvent || [])[0];
    const card = qs(`.mt-card[data-k="${f.lg}:${f.id}"] .mt-next`, view); if (!card) return;
    const rec = (t.record?.items || [])[0]?.summary;
    if (!ev) { card.textContent = rec || 'Off-season'; return; }
    const { away, home } = sides(ev), st = statusOf(ev);
    const opp = String(home.team?.id) === String(f.id) ? away : home;
    const at = String(home.team?.id) === String(f.id) ? 'vs' : '@';
    const me = String(home.team?.id) === String(f.id) ? home : away;
    if (st.state === 'in') card.innerHTML = `<i class="dot"></i>${esc(scoreVal(me.score))}-${esc(scoreVal(opp.score))}`;
    else if (st.state === 'post') card.textContent = `${me.winner ? 'W' : 'L'} ${scoreVal(me.score)}-${scoreVal(opp.score)}`;
    else card.textContent = `${at} ${opp.team?.abbreviation || ''} · ${sameDay(ev.date, new Date()) ? fmtTime(ev.date) : fmtDay(ev.date)}`;
    const isTheme = p.theme && p.theme.lg === f.lg && String(p.theme.id) === String(f.id); // theme team gets the big Game Day hero instead
    if (!isTheme && (st.state === 'in' || (st.state !== 'in' && sameDay(ev.date, new Date())))) gameDay.push({ f, ev, opp, me, at, st });
  }).then(() => {
    const g = qs('#gameDay', view); if (!g || !gameDay.length) return;
    qs('#nav [data-tab="team"]').classList.add('badge');
    gameDay.sort((a, b) => ({ in: 0, pre: 1, post: 2 }[a.st.state] ?? 1) - ({ in: 0, pre: 1, post: 2 }[b.st.state] ?? 1));
    g.innerHTML = gameDay.map(({ f, ev, opp, me, at, st }) => {
      const ms = Number(scoreVal(me.score)), os = Number(scoreVal(opp.score)), started = st.state !== 'pre';
      const res = st.state === 'post' ? (me.winner ? 'won' : opp.winner ? 'lost' : '') : '';
      const sc = started ? `<span class="gd-sc ${res}"><span class="gd-sc-row ${ms > os ? 'lead' : ''}"><i>${esc(f.ab || me.team?.abbreviation || '')}</i><b>${esc(scoreVal(me.score))}</b></span>
        <span class="gd-sc-row ${os > ms ? 'lead' : ''}"><i>${esc(opp.team?.abbreviation || '')}</i><b>${esc(scoreVal(opp.score))}</b></span></span>` : '';
      return `<button class="gameday ${started ? 'has-sc' : ''}" data-gd="${f.lg}:${ev.id}" style="--tc:#${f.c};--ta:#${f.a}">
      <span class="gd-tag">${st.state === 'in' ? '<i class="dot"></i> LIVE' : st.state === 'post' ? (res === 'won' ? '✅ FINAL · W' : res === 'lost' ? 'FINAL · L' : 'FINAL') : '🔥 GAME DAY'}</span>
      ${img(f.logo, 'logo lg')}<b>${esc(f.dn)}</b><span>${at} ${esc(opp.team?.displayName || '')}</span><small>${started ? esc(st.shortDetail || '') : esc(fmtTime(ev.date) + (broadcastOf(ev) ? ' · ' + broadcastOf(ev) : ''))}</small>${sc}</button>`; }).join('');
  });

  // live across leagues
  const live = qs('#liveNow', view);
  const results = await pool(LEAGUE_ORDER, 5, async lg => ({ lg, ...(await fetchScoreboard(lg, {})) }));
  if (!live.isConnected) return;
  const liveGames = [], todayCounts = [];
  results.filter(Boolean).forEach(r => {
    const today = r.events.filter(e => sameDay(e.date, new Date()) || statusOf(e).state === 'in');
    r.events.filter(e => statusOf(e).state === 'in').forEach(e => liveGames.push({ lg: r.lg, e }));
    if (today.length) todayCounts.push({ lg: r.lg, n: today.length });
  });
  const favIds = new Set(favs.map(f => f.lg + ':' + f.id));
  liveGames.sort((a, b) => {
    const fa = Object.values(sides(a.e)).some(c => favIds.has(a.lg + ':' + c.team?.id)), fb = Object.values(sides(b.e)).some(c => favIds.has(b.lg + ':' + c.team?.id));
    return fb - fa;
  });
  live.innerHTML = (liveGames.length ? `<div class="games">${liveGames.slice(0, 8).map(x => gameCardHTML(x.e, x.lg)).join('')}</div>` : '')
    + (todayCounts.length ? `<div class="chips today">${todayCounts.map(c => `<button data-lg="${c.lg}">${lgIcon(c.lg)}${LEAGUES[c.lg].short}${LEAGUES[c.lg].college ? ' ' + LEAGUES[c.lg].icon : ''} <b>${c.n}</b></button>`).join('')}</div>` : '')
    + (!liveGames.length && !todayCounts.length ? emptyHTML('Quiet day. Check the schedule in Scores.') : '');
  qsa('.chips.today button', live).forEach(b => b.onclick = ev => { ev.stopPropagation(); ScoreState.lg = b.dataset.lg; ScoreState.date = new Date(); ScoreState.week = null; App.go('scores'); });
  clearInterval(App.liveTimer);
  if (liveGames.length) App.liveTimer = setInterval(() => { if (App.tab === 'home' && !Sheets.stack.length) { clearMem(); renderHome(view); } }, 60000);
}

/* ---------- home tiles ---------- */
function collegeFav(p) { return [p.theme, ...p.favs].find(f => f && LEAGUES[f.lg].college); }
function homeTilesHTML(p) {
  const cf = collegeFav(p), cfb = [p.theme, ...p.favs].find(f => f && f.lg === 'cfb');
  const ffl = LS.get('ffl', null), pk = LS.get('pickem', null);
  const tiles = [
    ['ffl', '🏈', 'Fantasy', ffl ? 'My league' : 'Connect league', 'hot'],
    ['pickem', '🏆', "Pick'em", pk ? 'Make picks' : 'Join league', 'hot'],
    ['rival', '⚔️', 'Office Rivalry', 'Board · trash talk', 'hot'],
    ['clips', '🎬', 'Highlights', 'Swipe through clips', 'hot'],
    ['stats', '📈', 'Stat Center', 'NFL & NBA leaders', 'hot'],
    cf ? ['pros', cf.logo, PRO_NICK[cf.loc] || 'Pros', cf.loc + ' in the pros', 'logo'] : null,
    cfb ? ['recruit', cfb.logo, 'Recruiting', cfb.loc + ' commits', 'logo'] : null,
    ['myteam', p.theme?.logo || '⭐', 'My Team', p.theme ? p.theme.ab || p.theme.dn : 'Pick a team', p.theme ? 'logo' : ''],
    ['stand', '📊', 'Standings', 'SEC & every league'],
    ['rank', '🔢', 'Polls', 'AP · Coaches · CFP'],
    ['news', '📰', 'News', 'Your teams'],
    ['brief', '📬', 'Morning Brief', LS.get('brief', {}).on ? 'You\'re signed up' : 'Daily email', LS.get('brief', {}).on ? '' : 'hot'],
    ['trivia', '🧠', 'Trivia', 'Best: ' + LS.get('triviaBest', 0) + '/10'],
    ['teams', '🎨', 'Teams & Colors', 'Follow · theme']
  ].filter(Boolean);
  return `<div class="tiles">${tiles.map(([k, ic, l, sub, kind]) => `<button class="tile ${kind || ''}" data-go="${k}">
    <span class="tile-ico">${kind === 'logo' ? img(ic, 'tile-logo') : ic}</span><b>${esc(l)}</b><small>${esc(sub)}</small></button>`).join('')}</div>`;
}
function runTile(k, p) {
  const cf = collegeFav(p), cfb = [p.theme, ...p.favs].find(f => f && f.lg === 'cfb');
  const map = {
    rival: () => openRivalry(), stats: () => openStats(), clips: () => openClipFeed(), brief: openBrief, ffl: openFantasy, pickem: openPickem, stand: openStandings, rank: openRankings, news: openNews, trivia: openTrivia,
    teams: () => openTeamPicker(), settings: openSettings,
    scores: () => App.go('scores'), players: () => App.go('players'), myteam: () => App.go('team'),
    pros: () => cf && openTeam(cf.lg, cf.id, 'pros'), recruit: () => cfb && openTeam('cfb', cfb.id, 'recruit')
  };
  (map[k] || (() => { }))();
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // mouse wheel scrolls any sideways row (chips, team strips) that still overflows
  document.addEventListener('wheel', e => {
    const row = e.target.closest('.chips,.my-teams,.seg,.rv-strip');
    if (!row || row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    row.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  Look.apply();
  qs('#nav').onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) App.go(b.dataset.tab); };
  qs('#hdrTheme').onclick = () => openTeamPicker();
  qs('#hdrSearch').onclick = () => App.go('players');
  qs('#hdrGear').onclick = () => openSettings();
  qs('#hdrLook').onclick = () => { const next = Look.resolved() === 'light' ? 'dark' : 'light'; Look.set(next); toast(next === 'light' ? '☀️ Light mode' : '🌙 Dark mode'); };
  const t0 = LS.get('tab', 'home'); App.go(App.tabs[t0] && t0 !== 'more' ? t0 : 'home');
  GameDay.check();
  checkIn();
  Ticker.init();
  Sync.check();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { GameDay.check(); checkIn(); Sync.check(); } else if (_raw.get('syncDirty')) Sync.push(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
});
