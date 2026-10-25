/* Office Chair QB — teams: picker, team page, recruiting, pros-from-your-school */

/* ---------- Team picker (favorites + theme) ---------- */
function openTeamPicker(opts = {}) {
  Sheets.open(opts.title || 'Pick Your Teams', ctx => {
    let lg = opts.lg || 'cfb';
    ctx.body.innerHTML = `
      <p class="hint">Tap ⭐ to follow a team. Tap 🎨 to make it your app colors.</p>
      <div class="chips" id="tpLg">${LEAGUE_ORDER.map(k => `<button data-k="${k}" class="${k === lg ? 'on' : ''}">${LEAGUES[k].short}</button>`).join('')}</div>
      <input class="search" id="tpQ" placeholder="Search teams…" autocomplete="off">
      <div id="tpList">${loadingHTML()}</div>`;
    const list = qs('#tpList', ctx.body), q = qs('#tpQ', ctx.body);
    let teams = [];
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const theme = Prefs.get().theme;
      const shown = teams.filter(t => !term || (t.dn + ' ' + t.ab + ' ' + t.loc).toLowerCase().includes(term));
      // float SEC + favorites to top for college
      if (LEAGUES[lg].college && !term) shown.sort((a, b) => (SEC_SCHOOLS.includes(b.loc) - SEC_SCHOOLS.includes(a.loc)) || a.dn.localeCompare(b.dn));
      list.innerHTML = shown.slice(0, 250).map(t => {
        const fav = Prefs.isFav(lg, t.id), th = theme && theme.lg === lg && String(theme.id) === String(t.id);
        return `<div class="tp-row" style="--tc:#${t.c};--ta:#${t.a}">
          <span class="swatch"></span>${img(t.logo)}<span class="tp-name">${esc(t.dn)}${SEC_SCHOOLS.includes(t.loc) && LEAGUES[lg].college ? '<small>SEC</small>' : ''}</span>
          <button class="icon-btn ${fav ? 'on' : ''}" data-fav="${t.id}" aria-label="Follow">⭐</button>
          <button class="icon-btn ${th ? 'on' : ''}" data-theme="${t.id}" aria-label="Use colors">🎨</button></div>`;
      }).join('') || emptyHTML('No teams match.');
    };
    const load = async () => {
      list.innerHTML = loadingHTML();
      try { teams = await teamsFor(lg); draw(); } catch (e) { list.innerHTML = errHTML(e); }
    };
    qs('#tpLg', ctx.body).onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      lg = b.dataset.k; qsa('#tpLg button', ctx.body).forEach(x => x.classList.toggle('on', x === b)); load();
    };
    q.oninput = draw;
    list.onclick = async e => {
      const f = e.target.closest('[data-fav]'), th = e.target.closest('[data-theme]');
      const id = (f || th)?.dataset.fav || (f || th)?.dataset.theme; if (!id) return;
      const t = teams.find(x => String(x.id) === String(id)); if (!t) return;
      const fav = await completeTeam({ lg, id: String(t.id), loc: t.loc, name: t.name, dn: t.dn, ab: t.ab, c: t.c, a: t.a, logo: t.logo, nc: t.nc });
      delete fav.nc;
      if (f) toast(Prefs.toggleFav(fav) ? `Following ${t.dn}` : `Unfollowed ${t.dn}`);
      else { Prefs.setTheme(fav); toast(`${t.dn} colors applied`); }
      draw(); if (App.tab === 'home' || App.tab === 'team') App.go(App.tab);
    };
    load();
  });
}

/* ---------- Team page ---------- */
function openTeam(lg, id, tab) {
  Sheets.open('Team', ctx => renderTeamPage(ctx.body, lg, id, t => ctx.setTitle(t), tab));
}

async function renderTeamPage(root, lg, id, setTitle, startTab) {
  const L = LEAGUES[lg];
  const d = await getJSON(`${SITE}${L.path}/teams/${id}`, 120);
  const t = d.team || {};
  setTitle && setTitle(t.displayName || 'Team');
  const rec = (t.record?.items || []).find(i => i.type === 'total') || (t.record?.items || [])[0];
  const next = (t.nextEvent || [])[0];
  const fav = Prefs.isFav(lg, t.id);
  root.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'team-hero';
  head.style.cssText = `--tc:#${t.color || '333'};--ta:#${t.alternateColor || 'fff'};--tl:url('${logoOf(t)}')`;
  let nextHTML = '';
  if (next) {
    const { away, home } = sides(next), st = statusOf(next);
    const opp = String(home.team?.id) === String(t.id) ? away : home;
    const vs = String(home.team?.id) === String(t.id) ? 'vs' : '@';
    nextHTML = `<button class="next-game game-link" data-ev="${next.id}">
      <small>${st.state === 'in' ? '<i class="dot"></i> LIVE' : st.state === 'post' ? 'Last game' : 'Next game · ' + countdown(next.date)}</small>
      <span>${vs} ${img(logoOf(opp.team), 'logo sm')} ${esc(opp.team?.displayName || opp.team?.shortDisplayName || '')}</span>
      <small>${st.state === 'pre' ? esc(fmtDay(next.date) + ' · ' + fmtTime(next.date) + (broadcastOf(next) ? ' · ' + broadcastOf(next) : '')) : esc(`${scoreVal(away.score)}-${scoreVal(home.score)} · ${st.shortDetail || ''}`)}</small></button>`;
  }
  head.innerHTML = `
    <div class="th-top">${img(logoOf(t), 'logo xxl')}
      <div><h2>${esc(t.displayName || '')}</h2><p>${esc([rec?.summary, t.standingSummary].filter(Boolean).join(' · '))}</p>
      <div class="th-btns"><button class="pill" id="tFav">${fav ? '★ Following' : '☆ Follow'}</button><button class="pill" id="tTheme">🎨 Use colors</button></div></div></div>
    ${nextHTML}`;
  root.appendChild(head);
  const myLinks = Links.forTeam(lg, t);
  const linkRow = document.createElement('div');
  linkRow.className = 'ml-team';
  linkRow.innerHTML = myLinks.length
    ? `<div class="ml-pills">${myLinks.map(l => `<a class="ml-pill" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${Links.icon(l.url)}<span>${esc(l.kind || '')} ${esc(l.name)}</span></a>`).join('')}<button class="ml-pill add" data-addlink="1">＋</button></div>`
    : `<button class="ml-pill add solo" data-addlink="1">🔗 Add a link for ${esc(t.location || t.shortDisplayName || 'this team')} (group chat, blog…)</button>`;
  linkRow.onclick = e => { if (e.target.closest('[data-addlink]')) { if (!Prefs.isFav(lg, t.id)) { toast('Follow this team first to tie links to it'); return; } openMyLinks(Links.tagFor(lg, t)); } };
  root.appendChild(linkRow);
  const favObj = favFromTeam(lg, { ...t, logo: logoOf(t) });
  qs('#tFav', head).onclick = e => { const on = Prefs.toggleFav(favObj); e.target.textContent = on ? '★ Following' : '☆ Follow'; };
  qs('#tTheme', head).onclick = () => { Prefs.setTheme(favObj); toast('Colors applied'); };
  head.onclick = e => { const g = e.target.closest('.game-link'); if (g) openGame(lg, g.dataset.ev); };

  // Other sports at the same school
  if (L.college) {
    const other = document.createElement('div');
    other.className = 'chips other-sports';
    other.innerHTML = COLLEGE_SPORTS.filter(k => k !== lg).map(k => `<button data-k="${k}">${LEAGUES[k].icon} ${LEAGUES[k].short}</button>`).join('');
    other.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      const list = await teamsFor(b.dataset.k).catch(() => []);
      const match = list.find(x => x.loc === t.location) || list.find(x => x.dn === t.displayName);
      if (match) openTeam(b.dataset.k, match.id); else toast(`No ${LEAGUES[b.dataset.k].short} team found for ${t.location}`);
    };
    root.appendChild(other);
  }

  const tabs = [{ k: 'sched', label: 'Schedule' }, { k: 'roster', label: 'Roster' }, { k: 'news', label: 'News' }];
  if (L.recruiting) tabs.push({ k: 'recruit', label: 'Recruiting' });
  if (L.college) tabs.push({ k: 'pros', label: PRO_NICK[t.location] || 'Pros' });
  if (lg === 'cfb') tabs.push({ k: 'history', label: '📜 History' }, { k: 'draft', label: '🏈 Draft' });
  if (L.college) tabs.push({ k: 'nil', label: '💰 NIL' });
  if (TITLE_LG.includes(lg)) tabs.splice(lg === 'cfb' ? tabs.findIndex(x => x.k === 'history') + 1 || tabs.length : 1, 0, { k: 'titles', label: '🏆 Titles' });
  if (STATS_LG.includes(lg)) tabs.splice(1, 0, { k: 'ranks', label: '📈 Stat Ranks' });
  const wrap = document.createElement('div'); root.appendChild(wrap);
  subTabs(wrap, tabs, (k, body) => {
    if (k === 'sched') return teamSchedule(body, lg, t);
    if (k === 'roster') return teamRoster(body, lg, t);
    if (k === 'news') return newsList(body, `${SITE}${L.path}/news?team=${t.id}&limit=20`);
    if (k === 'recruit') return teamRecruiting(body, t);
    if (k === 'pros') return teamPros(body, lg, t);
    if (k === 'history') return teamHistory(body, t);
    if (k === 'draft') return teamDraft(body, t);
    if (k === 'nil') return teamNIL(body, lg, t);
    if (k === 'ranks') return teamRanks(body, lg, t);
    if (k === 'titles') return teamTitlesTab(body, lg, t);
  }, tabs.some(x => x.k === startTab) ? startTab : null);
}

async function teamSchedule(body, lg, t) {
  const d = await getJSON(`${SITE}${LEAGUES[lg].path}/teams/${t.id}/schedule`, 120);
  const evs = d.events || [];
  if (!evs.length) { body.innerHTML = emptyHTML('No schedule posted yet.'); return; }
  body.innerHTML = `<div class="sched">${evs.map(ev => {
    const { away, home } = sides(ev), st = statusOf(ev);
    const isHome = String(home.team?.id) === String(t.id);
    const me = isHome ? home : away, opp = isHome ? away : home;
    let res = '';
    if (st.state === 'post' || st.completed) {
      const w = me.winner === true ? 'W' : me.winner === false ? 'L' : '';
      res = `<b class="${w === 'W' ? 'w' : 'l'}">${w}</b> ${esc(scoreVal(me.score))}-${esc(scoreVal(opp.score))}`;
    } else if (st.state === 'in') res = `<b class="livetxt">LIVE</b> ${esc(scoreVal(me.score))}-${esc(scoreVal(opp.score))}`;
    else res = esc(fmtTime(ev.date));
    const r = rankOf(opp);
    return `<button class="sc-row game-link" data-ev="${ev.id}"><span class="sc-date">${esc(fmtDay(ev.date))}</span>
      <span class="sc-opp">${isHome ? 'vs' : '@'} ${img(logoOf(opp.team), 'logo sm')}${r ? `<b class="rk">${r}</b>` : ''}${esc(opp.team?.shortDisplayName || opp.team?.displayName || '')}</span>
      <span class="sc-res">${res}</span></button>`;
  }).join('')}</div>`;
  body.onclick = e => { const g = e.target.closest('.game-link'); if (g) openGame(lg, g.dataset.ev); };
}

async function teamRoster(body, lg, t) {
  const d = await getJSON(`${SITE}${LEAGUES[lg].path}/teams/${t.id}/roster`, 600);
  let groups = d.athletes || [];
  if (groups.length && !groups[0].items) groups = [{ position: 'Roster', items: groups }];
  if (!groups.length) { body.innerHTML = emptyHTML('Roster not available.'); return; }
  body.innerHTML = groups.map(g => `<h3 class="sec-h">${esc(String(g.position || '').replace(/^\w/, c => c.toUpperCase()))}</h3>
    <div class="roster">${(g.items || []).map(a => {
      const inj = (a.injuries || [])[0]?.status;
      return `<button class="ro" data-ath="${a.id}">${img(a.headshot?.href, 'hs')}<span><b>${a.jersey ? '#' + esc(a.jersey) + ' ' : ''}${esc(a.displayName)}</b>
        <small>${esc([a.position?.abbreviation, a.experience?.displayValue || a.class?.displayValue, a.displayHeight, a.displayWeight].filter(Boolean).join(' · '))}</small></span>
        ${inj ? `<i class="inj">${esc(inj)}</i>` : ''}</button>`;
    }).join('')}</div>`).join('');
  body.onclick = e => { const a = e.target.closest('[data-ath]'); if (a) openPlayer(lg, a.dataset.ath); };
}

async function newsList(body, url) {
  const d = await getJSON(url, 300);
  const arts = d.articles || [];
  if (!arts.length) { body.innerHTML = emptyHTML('No recent news.'); return; }
  body.innerHTML = `<div class="news">${arts.map(a => `<a class="art" href="${esc(a.links?.web?.href || '#')}" target="_blank" rel="noopener">
    ${a.images?.[0]?.url ? `<img src="${esc(a.images[0].url)}" loading="lazy" alt="">` : ''}
    <div><b>${esc(a.headline)}</b><p>${esc(a.description || '')}</p><small>${a.published ? timeAgo(a.published) : ''}</small></div></a>`).join('')}</div>`;
}

/* ---------- Recruiting (CollegeFootballData via Apps Script) ---------- */
async function teamRecruiting(body, t) {
  const thisYear = new Date().getFullYear();
  let year = new Date().getMonth() >= 1 ? thisYear + 1 : thisYear; // Feb onward → next class
  let mode = 'class';
  const draw = async () => {
    body.innerHTML = `<div class="seg small"><button data-m="class" class="${mode === 'class' ? 'on' : ''}">Recruiting Class</button><button data-m="portal" class="${mode === 'portal' ? 'on' : ''}">Transfer Portal</button></div>
      <div class="nav-row"><button class="icon-btn" data-y="-1">‹</button><span>${mode === 'class' ? 'Class of ' + year : year + ' Portal'}</span><button class="icon-btn" data-y="1">›</button></div><div id="rcBody">${loadingHTML()}</div>`;
    const rb = qs('#rcBody', body);
    try {
      if (mode === 'class') {
        const d = await gasGet({ action: 'recruits', team: t.location, year });
        const r = d.rank;
        const ps = d.players || [];
        rb.innerHTML = `${r ? `<div class="stat-strip"><div><b>#${esc(r.rank)}</b><small>National class</small></div><div><b>${esc(Math.round(r.points || 0))}</b><small>Points</small></div><div><b>${ps.length}</b><small>Commits</small></div></div>` : ''}
          ${ps.length ? `<div class="recruits">${ps.map(p => `<div class="rc"><span class="stars">${'★'.repeat(p.stars || 0)}</span>
            <div><b>${esc(p.name)}</b><small>${esc([p.position, p.height ? Math.floor(p.height / 12) + "'" + (p.height % 12) + '"' : '', p.weight ? p.weight + ' lbs' : ''].filter(Boolean).join(' · '))}</small>
            <small>${esc([p.school, [p.city, p.stateProvince].filter(Boolean).join(', ')].filter(Boolean).join(' — '))}</small></div>
            <span class="rating">${p.rating ? esc(Number(p.rating).toFixed(4)) : ''}${p.ranking ? `<small>#${esc(p.ranking)} natl</small>` : ''}</span></div>`).join('')}</div>` : emptyHTML('No commits listed for this class yet.')}`;
      } else {
        const d = await gasGet({ action: 'portal', team: t.location, year });
        const row = p => `<div class="rc"><span class="stars">${p.stars ? '★'.repeat(p.stars) : ''}</span><div><b>${esc(p.firstName + ' ' + p.lastName)}</b>
          <small>${esc([p.position, p.eligibility].filter(Boolean).join(' · '))}</small><small>${esc(p.origin || '?')} → ${esc(p.destination || 'Undecided')}</small></div>
          <span class="rating">${p.rating ? esc(Number(p.rating).toFixed(2)) : ''}</span></div>`;
        rb.innerHTML = `<h3 class="sec-h">Incoming <small>${d.incoming.length}</small></h3>${d.incoming.length ? `<div class="recruits">${d.incoming.map(row).join('')}</div>` : emptyHTML('None yet.')}
          <h3 class="sec-h">Outgoing <small>${d.outgoing.length}</small></h3>${d.outgoing.length ? `<div class="recruits">${d.outgoing.map(row).join('')}</div>` : emptyHTML('None yet.')}`;
      }
      rb.insertAdjacentHTML('beforeend', '<p class="src">Data: CollegeFootballData.com</p>');
    } catch (e) { rb.innerHTML = errHTML(e); }
  };
  body.onclick = e => {
    const m = e.target.closest('[data-m]'), y = e.target.closest('[data-y]');
    if (m) { mode = m.dataset.m; if (mode === 'portal') year = thisYear; draw(); }
    if (y) { year += Number(y.dataset.y); draw(); }
  };
  await draw();
}

/* ---------- Pros from your school (ProHawgs) ---------- */
async function teamPros(body, lg, t) {
  const d = await gasGet({ action: 'pros', college: t.location, collegeId: t.id });
  const players = d.players || [];
  const nick = PRO_NICK[t.location] || `Pro ${t.name || t.location}`;
  if (!players.length) { body.innerHTML = emptyHTML(`No active pros found from ${t.location} yet.`); return; }
  const byLg = {};
  players.forEach(p => (byLg[p.league] = byLg[p.league] || []).push(p));
  body.innerHTML = `<div class="stat-strip">${Object.keys(byLg).map(k => `<div><b>${byLg[k].length}</b><small>${esc(LEAGUES[k]?.short || k.toUpperCase())}</small></div>`).join('')}</div>
    <p class="hint">${esc(nick)} on active pro rosters. Updated ${d.updated ? timeAgo(d.updated) : 'recently'}.</p>
    ${Object.keys(byLg).map(k => `<h3 class="sec-h">${esc(LEAGUES[k]?.name || k)}</h3><div class="pros">${byLg[k].map(p => `
      <button class="pro" data-ath="${p.athleteId}" data-lg="${p.league}">${img(p.headshot, 'hs')}
        <span><b>${esc(p.name)}</b><small>${esc([p.position, p.teamName].filter(Boolean).join(' · '))}${p.injury ? ` · <i class="inj">${esc(p.injury)}</i>` : ''}</small>
        <span class="pro-line" id="pl-${p.league}-${p.athleteId}"></span></span></button>`).join('')}</div>`).join('')}`;
  body.onclick = e => { const b = e.target.closest('[data-ath]'); if (b) openPlayer(b.dataset.lg, b.dataset.ath); };
  // Season line for each pro (lazy, a few at a time)
  pool(players, 4, async p => {
    if (!body.isConnected) return;
    const L = LEAGUES[p.league]; if (!L) return;
    const o = await getJSON(`${WEB}${L.path}/athletes/${p.athleteId}/overview`, 3600);
    const s = o.statistics; if (!s?.labels) return;
    const split = (s.splits || [])[0]; if (!split) return;
    const pairs = s.labels.map((l, i) => [l, split.stats?.[i]]).filter(([, v]) => v != null && v !== '' && v !== '0' && v !== '0.0').slice(0, 4);
    const el = document.getElementById(`pl-${p.league}-${p.athleteId}`);
    if (el && pairs.length) el.innerHTML = `<em>${esc(s.displayName || split.displayName || '')}</em> ` + pairs.map(([l, v]) => `<b>${esc(v)}</b> ${esc(l)}`).join(' · ');
  });
}

/* ---------- My Team tab ---------- */
async function renderMyTeam(view) {
  const favs = Prefs.favs();
  if (!favs.length) {
    view.innerHTML = `<div class="hero-empty"><h2>No teams yet</h2><p>Follow your teams to get schedules, rosters, recruiting and pros from your school.</p><button class="btn" id="pick">Pick teams</button></div>`;
    qs('#pick', view).onclick = () => openTeamPicker();
    return;
  }
  let cur = LS.get('myTeamCur', null);
  if (!cur || !favs.some(f => f.lg === cur.lg && String(f.id) === String(cur.id))) cur = Prefs.get().theme || favs[0];
  view.innerHTML = `<div class="chips fav-chips">${favs.map(f => `<button data-k="${f.lg}:${f.id}" class="${f.lg === cur.lg && String(f.id) === String(cur.id) ? 'on' : ''}">${img(f.logo, 'logo xs')}${esc(f.ab || f.dn)} <small>${LEAGUES[f.lg].short}</small></button>`).join('')}
    <button id="addTeam">＋ Add</button></div><div id="tBody">${loadingHTML()}</div>`;
  qs('.fav-chips', view).onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'addTeam') return openTeamPicker();
    const [lg, id] = b.dataset.k.split(':'); LS.set('myTeamCur', { lg, id }); renderMyTeam(view);
  };
  const tb = qs('#tBody', view);
  try { await renderTeamPage(tb, cur.lg, cur.id); } catch (e) { tb.innerHTML = errHTML(e); }
}
