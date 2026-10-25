/* Office Chair QB — scores + live game center */
const ScoreState = LS.get('scoreState', { lg: 'cfb', filter: 'top' });
ScoreState.date = new Date();
ScoreState.week = null; ScoreState.seasontype = null;

function scoreboardUrl(lg, o = {}) {
  const L = LEAGUES[lg], p = new URLSearchParams();
  if (L.mode === 'week') { if (o.week) { p.set('week', o.week); if (o.seasontype) p.set('seasontype', o.seasontype); } }
  else if (o.date) p.set('dates', ymd(o.date));
  if (L.college && o.filter) {
    const g = L.groups || {}, conf = CONFERENCES[o.filter];
    if (o.filter === 'all' && g.all) p.set('groups', g.all);
    if (conf) p.set('groups', conf.groups?.[lg] || g.all || '');
    if (!p.get('groups')) p.delete('groups');
  }
  p.set('limit', '400');
  return SITE + L.path + '/scoreboard?' + p;
}

async function fetchScoreboard(lg, o = {}) {
  let d = await getJSON(scoreboardUrl(lg, o), 20);
  let events = d.events || [];
  const conf = LEAGUES[lg].college && CONFERENCES[o.filter];
  if (conf) {
    events = events.filter(e => inConf(e, o.filter, lg));
    // Safety net: if ESPN's conference feed came back empty/wrong, pull all D-I and filter by school list
    if (!events.length && conf.groups?.[lg] && LEAGUES[lg].groups?.all) {
      const d2 = await getJSON(scoreboardUrl(lg, { ...o, filter: 'all' }), 20);
      const ev2 = (d2.events || []).filter(e => inConf(e, o.filter, lg));
      if (ev2.length) { d = d2; events = ev2; }
    }
  }
  return { data: d, events };
}

/* Conference membership — football has a few football-only / non-football members */
function confSchools(key, lg) {
  const c = CONFERENCES[key]; if (!c) return [];
  if (lg !== 'cfb') return c.schools;
  return c.schools.filter(x => !(c.noFootball || []).includes(x)).concat(c.footballOnly || []);
}
function inConf(ev, key, lg) {
  const list = confSchools(key, lg), { away, home } = sides(ev);
  return [away, home].some(c => list.includes(c.team?.location));
}
/* The conference of the user's first followed college team (gets a ★ and goes first) */
function myConf() {
  for (const f of Prefs.favs()) {
    if (!COLLEGE_SPORTS.includes(f.lg)) continue;
    const k = CONF_ORDER.find(k => confSchools(k, f.lg).includes(f.loc));
    if (k) return k;
  }
  return null;
}

function gameCardHTML(ev, lg) {
  const { away, home } = sides(ev), st = statusOf(ev);
  const live = st.state === 'in', done = st.state === 'post';
  const favIds = new Set(Prefs.favs().filter(f => f.lg === lg).map(f => String(f.id)));
  const favSide = favIds.has(String(home.team?.id)) ? home : favIds.has(String(away.team?.id)) ? away : null;
  const isFavGame = !!favSide;
  const row = c => {
    const t = c.team || {}, r = rankOf(c), rec = (c.records || [])[0]?.summary || '';
    const win = done && c.winner;
    return `<div class="tm-row ${win ? 'win' : ''} ${done && !c.winner ? 'lose' : ''}">
      ${img(logoOf(t))}
      <span class="tm-name">${r ? `<b class="rk">${r}</b>` : ''}${esc(t.shortDisplayName || t.displayName || '')}<small>${esc(rec)}</small></span>
      <span class="tm-score">${st.state === 'pre' ? '' : esc(scoreVal(c.score))}</span></div>`;
  };
  const tv = broadcastOf(ev);
  const odds = (compOf(ev).odds || [])[0]?.details;
  const sit = compOf(ev).situation;
  const extra = live && sit ? (sit.downDistanceText || sit.shortDownDistanceText || (sit.balls != null ? `${sit.balls}-${sit.strikes}, ${sit.outs} out` : '')) : '';
  const wm = favSide ? ` style="--fl:url('${esc(logoOf(favSide.team))}')"` : '';
  return `<button class="game ${live ? 'live' : ''} ${isFavGame ? 'fav' : ''}" data-ev="${ev.id}" data-lg="${lg}"${wm}>
    ${row(away)}${row(home)}
    <div class="g-meta"><span class="g-status">${live ? '<i class="dot"></i>' : ''}${esc(st.state === 'pre' ? fmtDay(ev.date) + ' · ' + fmtTime(ev.date) : st.shortDetail || st.detail || '')}</span>
      <span>${esc(extra || (st.state === 'pre' ? [tv, odds].filter(Boolean).join(' · ') : tv))}${watchChipHTML(ev)}</span></div>
  </button>`;
}

function bindGameClicks(root) {
  root.addEventListener('click', e => {
    const g = e.target.closest('.game[data-ev]');
    if (g) openGame(g.dataset.lg, g.dataset.ev);
  });
}

async function renderScores(view) {
  const s = ScoreState, L = () => LEAGUES[s.lg];
  view.innerHTML = `
    <div class="chips" id="lgChips">${LEAGUE_ORDER.map(k => `<button data-k="${k}" class="${k === s.lg ? 'on' : ''}">${lgIcon(k)}${LEAGUES[k].short}</button>`).join('')}</div>
    <div id="sFilter"></div>
    <div class="nav-row"><button class="icon-btn" id="sPrev">‹</button><span id="sLabel"></span><button class="icon-btn" id="sNext">›</button></div>
    <div id="sList">${loadingHTML()}</div>`;
  const list = qs('#sList', view);
  bindGameClicks(list);

  const drawFilter = () => {
    const f = qs('#sFilter', view);
    if (!L().college) { f.innerHTML = ''; return; }
    const mine = myConf(), confs = mine ? [mine, ...CONF_ORDER.filter(k => k !== mine)] : CONF_ORDER;
    const btn = (k, inner) => `<button data-f="${k}" class="${s.filter === k ? 'on' : ''}">${inner}</button>`;
    const confImg = k => `<img class="conf-ico" src="${CONF_LOGO(k)}" alt="" loading="lazy" onerror="this.remove()">`;
    f.innerHTML = `<div class="chips conf-chips">
      ${btn('top', L().rank ? '🏆 Top 25' : '⭐ Featured')}
      ${confs.map(k => btn(k, `${confImg(k)}${CONFERENCES[k].name}${k === mine ? ' <small>★</small>' : ''}`)).join('')}
      ${btn('all', `${lgIcon(s.lg)}All D-I`)}</div>`;
    const on = qs('.conf-chips button.on', f); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  };

  const load = async (quiet) => {
    if (!quiet) list.innerHTML = loadingHTML();
    const o = { filter: L().college ? s.filter : null };
    if (L().mode === 'week') { o.week = s.week; o.seasontype = s.seasontype; } else o.date = s.date;
    try {
      const { data, events } = await fetchScoreboard(s.lg, o);
      if (L().mode === 'week') {
        s.week = data.week?.number || s.week; s.seasontype = data.season?.type || s.seasontype;
        const cal = (data.leagues?.[0]?.calendar || []).find(c => String(c.value) === String(s.seasontype));
        const ent = cal?.entries?.find(e => String(e.value) === String(s.week));
        qs('#sLabel', view).textContent = ent ? `${ent.label}${ent.detail ? ' · ' + ent.detail : ''}` : `Week ${s.week || ''}`;
      } else {
        const today = sameDay(s.date, new Date());
        qs('#sLabel', view).textContent = today ? 'Today · ' + fmtDay(s.date) : fmtDayLong(s.date);
      }
      if (!events.length) { list.innerHTML = emptyHTML('No games on this slate.'); return; }
      const groups = { in: [], pre: [], post: [] };
      events.forEach(e => (groups[statusOf(e).state] || groups.pre).push(e));
      list.innerHTML = [['in', 'Live'], ['pre', 'Upcoming'], ['post', 'Final']].filter(([k]) => groups[k].length)
        .map(([k, l]) => `<h3 class="sec-h">${l} <small>${groups[k].length}</small></h3><div class="games">${groups[k].map(e => gameCardHTML(e, s.lg)).join('')}</div>`).join('');
      clearInterval(App.liveTimer);
      if (groups.in.length) App.liveTimer = setInterval(() => App.tab === 'scores' && load(true), 30000);
    } catch (e) { list.innerHTML = errHTML(e); }
  };

  qs('#lgChips', view).onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    s.lg = b.dataset.k; s.week = null; s.seasontype = null; s.date = new Date();
    qsa('#lgChips button', view).forEach(x => x.classList.toggle('on', x === b));
    LS.set('scoreState', { lg: s.lg, filter: s.filter });
    drawFilter(); load();
  };
  qs('#sFilter', view).onclick = e => {
    const b = e.target.closest('button[data-f]'); if (!b) return;
    s.filter = b.dataset.f; LS.set('scoreState', { lg: s.lg, filter: s.filter }); drawFilter(); load();
  };
  const step = d => {
    if (L().mode === 'week') { if (!s.week) return; s.week = Math.max(1, s.week + d); }
    else { s.date = new Date(s.date); s.date.setDate(s.date.getDate() + d); }
    load();
  };
  qs('#sPrev', view).onclick = () => step(-1);
  qs('#sNext', view).onclick = () => step(1);
  qs('#sLabel', view).onclick = () => { s.date = new Date(); s.week = null; s.seasontype = null; load(); };
  drawFilter(); load();
}

/* ---------- Game center ---------- */
function openGame(lg, eventId) {
  Sheets.open('Game Center', async ctx => {
    const L = LEAGUES[lg];
    let seriesHTML = null;
    const draw = async () => {
      const d = await getJSON(`${SITE}${L.path}/summary?event=${eventId}`, 15);
      if (!ctx.alive) return;
      const comp = d.header?.competitions?.[0] || {};
      const cs = comp.competitors || [];
      const away = cs.find(c => c.homeAway === 'away') || cs[0] || {}, home = cs.find(c => c.homeAway === 'home') || cs[1] || {};
      const st = comp.status?.type || {};
      ctx.setTitle(`${away.team?.abbreviation || ''} @ ${home.team?.abbreviation || ''}`);
      const big = c => `<button class="gc-team" data-team="${c.team?.id}">${img(logoOf(c.team), 'logo xl')}<b>${rankOf(c) ? `<i class="rk">${rankOf(c)}</i>` : ''}${esc(c.team?.shortDisplayName || c.team?.displayName || '')}</b><small>${esc((c.record || [])[0]?.summary || '')}</small></button>`;
      let html = `<div class="gc-head" style="--tc:#${away.team?.color || '333'};--tc2:#${home.team?.color || '333'}">
        ${big(away)}
        <div class="gc-mid"><div class="gc-score">${st.state === 'pre' ? 'vs' : `${esc(scoreVal(away.score))}<span>–</span>${esc(scoreVal(home.score))}`}</div>
          <div class="gc-st ${st.state === 'in' ? 'live' : ''}">${st.state === 'in' ? '<i class="dot"></i>' : ''}${esc(st.state === 'pre' ? fmtDay(comp.date) + ' ' + fmtTime(comp.date) : st.shortDetail || '')}</div></div>
        ${big(home)}</div>`;

      const info = [];
      const venue = d.gameInfo?.venue?.fullName; if (venue) info.push('📍 ' + venue);
      const tv = (comp.broadcasts || []).map(b => b.media?.shortName).filter(Boolean).join(', '); if (tv) info.push('📺 ' + tv);
      const pc = (d.pickcenter || [])[0]; if (pc?.details) info.push(`📈 ${pc.details}${pc.overUnder ? ' · O/U ' + pc.overUnder : ''}`);
      const ss = (d.seasonseries || [])[0]; if (ss?.summary) info.push('🔁 ' + ss.summary);
      if (info.length) html += `<div class="gc-info">${info.map(i => `<span>${esc(i)}</span>`).join('')}</div>`;
      html += watchCardHTML({ competitions: [comp], status: comp.status, date: comp.date });
      html += linkPillsHTML(Links.forGame(lg, cs), '🔗 Your links for this game');
      const gclips = clipsFrom(d, { lg, ev: eventId });
      if (gclips.length) html += `<div class="card"><h4>🎬 Highlights</h4>${clipRowHTML(gclips, 'g' + eventId)}</div>`;
      if (lg === 'cfb' && gasUrl()) html += `<div id="gcSeries">${seriesHTML || ''}</div>`;

      // win probability
      const wp = (d.winprobability || []).map(x => x.homeWinPercentage).filter(v => v != null);
      if (wp.length > 2) {
        const last = wp[wp.length - 1];
        html += `<div class="card"><h4>Win Probability</h4><div class="wp-lbl"><span>${esc(home.team?.abbreviation)} ${Math.round(last * 100)}%</span><span>${esc(away.team?.abbreviation)} ${Math.round((1 - last) * 100)}%</span></div>${sparkline(wp)}</div>`;
      }
      // leaders
      const leaders = d.leaders || [];
      if (leaders.length) {
        html += `<div class="card"><h4>Game Leaders</h4><div class="leaders">${leaders.map(tl => `<div><div class="ld-team">${img(logoOf(tl.team), 'logo sm')}${esc(tl.team?.abbreviation || '')}</div>
          ${(tl.leaders || []).slice(0, 3).map(cat => { const a = (cat.leaders || [])[0]; if (!a) return '';
            return `<button class="ld" data-ath="${a.athlete?.id}">${img(a.athlete?.headshot?.href, 'hs')}<div><small>${esc(cat.displayName)}</small><b>${esc(a.athlete?.shortName || a.athlete?.displayName || '')}</b><span>${esc(a.displayValue || '')}</span></div></button>`; }).join('')}</div>`).join('')}</div></div>`;
      }
      // scoring plays
      const sp = d.scoringPlays || [];
      if (sp.length) html += `<div class="card"><h4>Scoring</h4>${sp.map(p => `<div class="play">${img(logoOf(p.team), 'logo sm')}<div><small>Q${p.period?.number || ''} ${esc(p.clock?.displayValue || '')} · ${esc(p.awayScore)}-${esc(p.homeScore)}</small><p>${esc(p.text)}</p></div></div>`).join('')}</div>`;
      // recent plays (non-football)
      const plays = d.plays || [];
      if (plays.length && !sp.length) html += `<div class="card"><h4>Recent Plays</h4>${plays.slice(-12).reverse().map(p => `<div class="play"><div><small>${esc(p.period?.displayValue || '')} ${esc(p.clock?.displayValue || '')}</small><p>${esc(p.text)}</p></div></div>`).join('')}</div>`;
      // team stats
      const bt = d.boxscore?.teams || [];
      if (bt.length === 2 && bt[0].statistics?.length) {
        const a = bt.find(t => t.homeAway === 'away') || bt[0], h = bt.find(t => t.homeAway === 'home') || bt[1];
        html += `<div class="card"><h4>Team Stats</h4><table class="cmp"><tr><th>${esc(a.team?.abbreviation)}</th><th></th><th>${esc(h.team?.abbreviation)}</th></tr>
          ${a.statistics.map((s, i) => { const hs = h.statistics[i] || {}; return `<tr><td>${esc(s.displayValue)}</td><td class="lbl">${esc(s.label || s.abbreviation || s.name)}</td><td>${esc(hs.displayValue)}</td></tr>`; }).join('')}</table></div>`;
      }
      // player box
      const bp = d.boxscore?.players || [];
      if (bp.length) {
        html += `<div class="card"><h4>Box Score</h4>${bp.map(tp => `<details><summary>${img(logoOf(tp.team), 'logo sm')} ${esc(tp.team?.displayName || '')}</summary>
          ${(tp.statistics || []).map(cat => `<div class="tbl-wrap"><table class="stats"><tr><th>${esc(cat.text || cat.name || '')}</th>${(cat.labels || []).map(l => `<th>${esc(l)}</th>`).join('')}</tr>
          ${(cat.athletes || []).map(a => `<tr><td><button class="lnk" data-ath="${a.athlete?.id}">${esc(a.athlete?.shortName || a.athlete?.displayName || '')}</button></td>${(a.stats || []).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></div>`).join('')}
          </details>`).join('')}</div>`;
      }
      if (lg === 'nfl' && bp.length) html += fantasyBoxHTML(bp);
      if (!leaders.length && !bt.length && st.state === 'pre') html += emptyHTML('Box score shows up once the game starts.');
      ctx.body.innerHTML = html;
      if (lg === 'cfb' && gasUrl() && seriesHTML === null) { seriesHTML = ''; const el = qs('#gcSeries', ctx.body); gameSeriesCard(el, away, home).then(() => { seriesHTML = el.innerHTML; }); }
      ctx.body.onclick = e => {
        const fs = e.target.closest('[data-fs]');
        if (fs) { LS.set('fflScoring', fs.dataset.fs); const box = qs('#fbox', ctx.body); if (box) box.outerHTML = fantasyBoxHTML(bp); return; }
        const a = e.target.closest('[data-ath]'); if (a && a.dataset.ath && a.dataset.ath !== 'undefined') return openPlayer(lg, a.dataset.ath);
        const t = e.target.closest('[data-team]'); if (t) return openTeam(lg, t.dataset.team);
      };
      if (st.state === 'in' && !ctx.timers.length) ctx.timers.push(setInterval(() => draw().catch(() => { }), 30000));
    };
    await draw();
  });
}

/* Fantasy points from an NFL box score (PPR / Half / Standard) */
function fantasyBoxHTML(bp) {
  const mode = LS.get('fflScoring', 'ppr'), recPts = { ppr: 1, half: 0.5, std: 0 }[mode];
  const players = {};
  bp.forEach(tp => (tp.statistics || []).forEach(cat => {
    const L = (cat.labels || []).map(x => x.toUpperCase());
    const col = (a, n) => { const i = L.indexOf(n); return i < 0 ? 0 : parseFloat(String(a.stats[i]).split('/')[0]) || 0; };
    (cat.athletes || []).forEach(a => {
      const id = a.athlete?.id; if (!id) return;
      const p = players[id] || (players[id] = { id, name: a.athlete.shortName || a.athlete.displayName, team: tp.team?.abbreviation, logo: logoOf(tp.team), pts: 0, line: [] });
      if (cat.name === 'passing') { const y = col(a, 'YDS'), td = col(a, 'TD'), int = col(a, 'INT'); p.pts += y * 0.04 + td * 4 - int * 2; p.line.push(`${y} pass yds${td ? `, ${td} TD` : ''}${int ? `, ${int} INT` : ''}`); }
      if (cat.name === 'rushing') { const y = col(a, 'YDS'), td = col(a, 'TD'); p.pts += y * 0.1 + td * 6; if (y || td) p.line.push(`${y} rush${td ? `, ${td} TD` : ''}`); }
      if (cat.name === 'receiving') { const r = col(a, 'REC'), y = col(a, 'YDS'), td = col(a, 'TD'); p.pts += r * recPts + y * 0.1 + td * 6; p.line.push(`${r}-${y} rec${td ? `, ${td} TD` : ''}`); }
      if (cat.name === 'fumbles') { const l = col(a, 'LOST'); p.pts -= l * 2; if (l) p.line.push(`${l} fum lost`); }
      if (cat.name === 'kicking') { const k = col(a, 'PTS'); p.pts += k; p.line.push(`${a.stats[L.indexOf('FG')] || ''} FG`); }
    });
  }));
  const top = Object.values(players).filter(p => p.pts).sort((a, b) => b.pts - a.pts).slice(0, 15);
  if (!top.length) return '';
  return `<div class="card" id="fbox"><h4>Fantasy Points</h4>
    <div class="seg small">${[['ppr', 'PPR'], ['half', 'Half PPR'], ['std', 'Standard']].map(([k, l]) => `<button data-fs="${k}" class="${k === mode ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${top.map((p, i) => `<button class="fp-row" data-ath="${p.id}"><b class="fp-rk">${i + 1}</b>${img(p.logo, 'logo xs')}<span><b>${esc(p.name)}</b><small>${esc(p.line.join(' · '))}</small></span><b class="fp-pts">${p.pts.toFixed(1)}</b></button>`).join('')}
    <p class="src">Calculated from the box score; your league's scoring may differ slightly.</p></div>`;
}
