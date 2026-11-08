/* Office Chair QB — standings, rankings, news, trivia, settings */

function lgChipsHTML(keys, cur, id) {
  return `<div class="chips" id="${id}">${keys.map(k => `<button data-k="${k}" class="${k === cur ? 'on' : ''}">${LEAGUES[k].short}</button>`).join('')}</div>`;
}
function bindChips(root, id, fn) {
  qs('#' + id, root).onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    qsa('#' + id + ' button', root).forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.k);
  };
}

/* ---------- Standings ---------- */
const STAND_COLS = {
  football: ['wins', 'losses', 'ties', 'winPercent', 'pointsFor', 'pointsAgainst', 'streak'],
  basketball: ['wins', 'losses', 'winPercent', 'gamesBehind', 'streak'],
  baseball: ['wins', 'losses', 'winPercent', 'gamesBehind', 'streak'],
  hockey: ['gamesPlayed', 'wins', 'losses', 'otLosses', 'points', 'streak']
};
function flattenStandings(node, out = []) {
  if (node.standings?.entries?.length) out.push({ name: node.name || node.abbreviation, entries: node.standings.entries });
  (node.children || []).forEach(c => flattenStandings(c, out));
  return out;
}
/* Past seasons: ESPN names NBA/NHL/college hoops seasons by the year they end */
const ENDS_LATER = ['nba', 'nhl', 'mbb', 'wbb'];
function seasonLabel(lg, y) { return ENDS_LATER.includes(lg) ? `${y - 1}-${String(y).slice(2)}` : String(y); }
function lastFullSeason(lg) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  if (lg === 'nfl' || lg === 'cfb') return m === 0 && d.getDate() < 10 ? y - 2 : y - 1;
  if (ENDS_LATER.includes(lg)) return m >= 4 ? y : y - 1;
  if (lg === 'wnba') return m >= 9 ? y : y - 1;
  return m >= 9 ? y : y - 1; // MLB, college baseball & softball
}
const DIV_LG = ['nfl', 'nba', 'mlb', 'nhl'];
async function fetchStandings(lg, season, level) {
  const base = `${STAND}${LEAGUES[lg].path}/standings`, lv = level ? `level=${level}` : '';
  if (!season) return getJSON(base + (lv ? '?' + lv : ''), 600);
  const d = await getJSON(`${base}?season=${season}${lv ? '&' + lv : ''}`, 86400);
  if (flattenStandings(d).length) return d;
  return getJSON(`${base}?season=${season}&seasontype=2${lv ? '&' + lv : ''}`, 86400);
}
const stOf = (e, n) => (e.stats || []).find(x => x.name === n);
const stNumOf = (e, n) => { const v = Number(stOf(e, n)?.value); return isNaN(v) ? null : v; };
/* Division order: hockey by points, everyone else by win % (then wins) */
function sortStanding(entries, sport) {
  const key = sport === 'hockey' ? 'points' : 'winPercent';
  if (!entries.some(e => stNumOf(e, key) != null)) return entries;
  return entries.map((e, i) => ({ e, i })).sort((a, b) => (stNumOf(b.e, key) ?? -1) - (stNumOf(a.e, key) ?? -1) || (stNumOf(b.e, 'wins') ?? 0) - (stNumOf(a.e, 'wins') ?? 0) || a.i - b.i).map(x => x.e);
}
function recordOf(e, sport) {
  const w = stOf(e, 'wins')?.displayValue, l = stOf(e, 'losses')?.displayValue;
  if (w == null || l == null) return stOf(e, 'overall')?.displayValue || '';
  const t = sport === 'hockey' ? stOf(e, 'otLosses')?.displayValue : stOf(e, 'ties')?.displayValue;
  return `${w}-${l}${t && t !== '0' ? '-' + t : sport === 'hockey' && t ? '-' + t : ''}`;
}
/* Share a division/conference table as an image */
function shareStandings(lg, g, sport, season) {
  const cols = sport === 'hockey' ? ['REC', 'PTS'] : sport === 'football' ? ['REC', 'PCT', 'STRK'] : ['REC', 'PCT', 'GB'];
  const rows = g.entries.map(e => {
    const t = e.team || {};
    const vals = sport === 'hockey' ? [recordOf(e, sport), stOf(e, 'points')?.displayValue]
      : sport === 'football' ? [recordOf(e, sport), stOf(e, 'winPercent')?.displayValue, stOf(e, 'streak')?.displayValue]
      : [recordOf(e, sport), stOf(e, 'winPercent')?.displayValue, stOf(e, 'gamesBehind')?.displayValue];
    return { logo: logoOf(t), ab: t.abbreviation || '', name: t.shortDisplayName || t.displayName || '', color: t.color, vals, fav: Prefs.isFav(lg, t.id) };
  }).slice(0, 12);
  const lead = rows[0]?.name || '';
  ShareCard.shareTable({ title: g.name, sub: `${LEAGUES[lg].short} STANDINGS · ${season ? seasonLabel(lg, season) + ' FINAL' : fmtDay(new Date()).toUpperCase()}`, cols, rows,
    by: Prefs.get().fan || '', file: g.name, text: lead ? `👑 The ${lead} sit on top of the ${g.name}` : g.name, away: { ab: '' }, home: { ab: '' } });
}
function openStandings() {
  Sheets.open('Standings', ctx => {
    let lg = LS.get('standLg', 'cfb'), season = '', groups = [], sport = '';
    ctx.body.innerHTML = lgChipsHTML(LEAGUE_ORDER, lg, 'stLg') + '<div id="stSeason"></div><div id="stBody"></div>';
    const body = qs('#stBody', ctx.body), seasonEl = qs('#stSeason', ctx.body);
    const drawSeasons = () => {
      const last = lastFullSeason(lg), years = []; for (let y = last; y > last - 30; y--) years.push(y);
      seasonEl.innerHTML = `<select class="sel" id="stYr"><option value="">📅 This season (live)</option>${years.map(y => `<option value="${y}" ${String(y) === String(season) ? 'selected' : ''}>${seasonLabel(lg, y)} final standings</option>`).join('')}</select>`;
      qs('#stYr', seasonEl).onchange = e => { season = e.target.value; load(); };
    };
    const load = async () => {
      body.innerHTML = loadingHTML();
      try {
        const L = LEAGUES[lg];
        const hasDiv = DIV_LG.includes(lg);
        let view = hasDiv ? LS.get('standView:' + lg, 'div') : 'conf';
        let d = await fetchStandings(lg, season, view === 'div' ? 3 : 0);
        groups = flattenStandings(d);
        if (view === 'div' && groups.length <= 2) { // ESPN didn't split into divisions — show conferences instead
          const conf = await fetchStandings(lg, season, 0); const cg = flattenStandings(conf);
          if (cg.length) { d = conf; groups = cg; view = 'conf'; }
        }
        if (!groups.length) { body.innerHTML = emptyHTML(season ? `ESPN doesn't have ${seasonLabel(lg, season)} ${L.short} standings — try a more recent year.` : 'Standings not available yet this season.'); return; }
        sport = L.path.split('/')[0];
        if (view === 'div') groups.forEach(g => { g.entries = sortStanding(g.entries, sport); });
        const myIdx = groups.map((g, i) => g.entries.some(e => Prefs.isFav(lg, e.team?.id)) ? i : -1).filter(i => i >= 0);
        const gKey = 'standGroup:' + lg + ':' + view;
        let gi = LS.get(gKey, null);
        if (gi == null || (gi >= 0 && !groups[gi]) || (gi === -2 && !myIdx.length)) { gi = L.college ? Math.max(0, groups.findIndex(g => /southeastern|sec/i.test(g.name))) : myIdx.length && view === 'div' ? -2 : -1; }
        const drawGroup = () => {
          const show = gi === -1 ? groups : gi === -2 ? myIdx.map(i => groups[i]) : [groups[gi]];
          body.innerHTML = (hasDiv ? `<div class="seg small" id="stView"><button data-v="div" class="${view === 'div' ? 'on' : ''}">🏆 Divisions</button><button data-v="conf" class="${view === 'conf' ? 'on' : ''}">Conferences</button></div>` : '') +
            `<select class="sel" id="stG">${myIdx.length && !L.college ? `<option value="-2" ${gi === -2 ? 'selected' : ''}>⭐ My teams' ${view === 'div' ? 'divisions' : 'conferences'}</option>` : ''}${!L.college ? `<option value="-1" ${gi === -1 ? 'selected' : ''}>All</option>` : ''}${groups.map((g, i) => `<option value="${i}" ${i === gi ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>` +
            show.map(g => {
              const sample = g.entries[0]?.stats || [];
              let cols = (STAND_COLS[sport] || []).map(n => sample.find(s => s.name === n)).filter(Boolean);
              if (L.college) { const conf = sample.find(s => /conf/i.test(s.name || '') || /CONF/i.test(s.abbreviation || '')); if (conf) cols.splice(2, 0, conf); }
              if (!cols.length) cols = sample.slice(0, 5);
              const sorted = [...g.entries];
              return `<h3 class="sec-h st-h">${esc(g.name)}<button class="icon-btn st-share" data-share="${groups.indexOf(g)}" title="Share this table">📤</button></h3><div class="tbl-wrap"><table class="stats stand"><tr><th>Team</th>${cols.map(c => `<th>${esc(c.abbreviation || c.shortDisplayName || c.name)}</th>`).join('')}</tr>
                ${sorted.map(e => { const t = e.team || {}; const fav = Prefs.isFav(lg, t.id);
                  return `<tr class="${fav ? 'favrow' : ''}" data-team="${t.id}"><td class="rl">${img(logoOf(t), 'logo xs')}${esc(t.shortDisplayName || t.displayName || '')}</td>${cols.map(c => { const s = (e.stats || []).find(x => x.name === c.name) || {}; return `<td>${esc(s.displayValue ?? '')}</td>`; }).join('')}</tr>`; }).join('')}</table></div>`;
            }).join('');
          qs('#stG', body).onchange = ev => { gi = Number(ev.target.value); LS.set(gKey, gi); drawGroup(); };
        };
        drawGroup();
        body.onclick = e => {
          const v = e.target.closest('#stView button'); if (v) { if (v.dataset.v !== view) { LS.set('standView:' + lg, v.dataset.v); load(); } return; }
          const sh = e.target.closest('[data-share]'); if (sh) return shareStandings(lg, groups[sh.dataset.share], sport, season);
          const r = e.target.closest('tr[data-team]'); if (r) openTeam(lg, r.dataset.team);
        };
      } catch (e) { body.innerHTML = errHTML(e); }
    };
    bindChips(ctx.body, 'stLg', k => { lg = k; LS.set('standLg', k); season = ''; drawSeasons(); load(); });
    drawSeasons(); load();
  });
}

/* ---------- Rankings / polls ---------- */
function openRankings() {
  Sheets.open('Polls & Rankings', ctx => {
    const keys = LEAGUE_ORDER.filter(k => LEAGUES[k].rank);
    let lg = 'cfb';
    ctx.body.innerHTML = lgChipsHTML(keys, lg, 'rkLg') + '<div id="rkBody"></div>';
    const body = qs('#rkBody', ctx.body);
    const load = async () => {
      body.innerHTML = loadingHTML();
      try {
        const d = await getJSON(`${SITE}${LEAGUES[lg].path}/rankings`, 900);
        const polls = (d.rankings || []).filter(p => (p.ranks || []).length);
        if (!polls.length) { body.innerHTML = emptyHTML('No polls released right now.'); return; }
        let pi = 0;
        const draw = () => {
          const p = polls[pi];
          body.innerHTML = `<div class="seg small">${polls.map((x, i) => `<button data-p="${i}" class="${i === pi ? 'on' : ''}">${esc(x.shortName || x.name)}</button>`).join('')}</div>
            <div class="ranks">${p.ranks.map(r => { const t = r.team || {}; const mv = (r.previous || 0) && r.previous !== r.current ? r.previous - r.current : 0;
              const fav = Prefs.favs().some(f => f.lg === lg && (String(f.id) === String(t.id) || f.loc === t.location));
              return `<button class="rk-row ${fav ? 'favrow' : ''} ${SEC_SCHOOLS.includes(t.location) ? 'sec' : ''}" data-team="${t.id}"><b class="rk-n">${r.current}</b>${img(t.logo || logoOf(t), 'logo sm')}
                <span>${esc(t.location || t.nickname || t.name || '')}<small>${esc(r.recordSummary || '')}${r.firstPlaceVotes ? ` · ${r.firstPlaceVotes} 1st` : ''}</small></span>
                <i class="mv ${mv > 0 ? 'up' : mv < 0 ? 'dn' : ''}">${mv > 0 ? '▲' + mv : mv < 0 ? '▼' + (-mv) : ''}</i></button>`; }).join('')}</div>
            ${p.others?.length ? `<p class="hint">Others receiving votes: ${p.others.map(o => esc(o.team?.location || '') + ' ' + o.points).join(', ')}</p>` : ''}`;
        };
        body.onclick = e => {
          const b = e.target.closest('[data-p]'); if (b) { pi = Number(b.dataset.p); return draw(); }
          const t = e.target.closest('[data-team]'); if (t && t.dataset.team !== 'undefined') openTeam(lg, t.dataset.team);
        };
        draw();
      } catch (e) { body.innerHTML = errHTML(e); }
    };
    bindChips(ctx.body, 'rkLg', k => { lg = k; load(); });
    load();
  });
}

/* ---------- News ---------- */
function openNews() {
  Sheets.open('News', ctx => {
    let lg = 'mine';
    ctx.body.innerHTML = `<div class="chips" id="nwLg"><button data-k="mine" class="on">⭐ My Teams</button>${LEAGUE_ORDER.map(k => `<button data-k="${k}">${LEAGUES[k].short}</button>`).join('')}</div><div id="nwBody"></div>`;
    const body = qs('#nwBody', ctx.body);
    const load = async () => {
      body.innerHTML = loadingHTML();
      try {
        if (lg !== 'mine') return newsList(body, `${SITE}${LEAGUES[lg].path}/news?limit=25`);
        const favs = Prefs.favs();
        if (!favs.length) { body.innerHTML = emptyHTML('Follow some teams to build your feed.'); return; }
        const res = await pool(favs, 4, f => getJSON(`${SITE}${LEAGUES[f.lg].path}/news?team=${f.id}&limit=8`, 300));
        const seen = new Set(), arts = [];
        res.forEach(r => (r?.articles || []).forEach(a => { const k = a.headline; if (!seen.has(k)) { seen.add(k); arts.push(a); } }));
        arts.sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
        await newsList(body, null, arts);
      } catch (e) { body.innerHTML = errHTML(e); }
    };
    bindChips(ctx.body, 'nwLg', k => { lg = k; load(); });
    load();
  });
}
// allow newsList(body, null, articles)
const _newsList = newsList;
newsList = async function (body, url, arts) {
  if (url) return _newsList(body, url);
  if (!arts?.length) { body.innerHTML = emptyHTML('No recent news.'); return; }
  body.innerHTML = `<div class="news">${arts.slice(0, 40).map(a => `<a class="art" href="${esc(a.links?.web?.href || '#')}" target="_blank" rel="noopener">
    ${a.images?.[0]?.url ? `<img src="${esc(a.images[0].url)}" loading="lazy" alt="">` : ''}<div><b>${esc(a.headline)}</b><p>${esc(a.description || '')}</p><small>${a.published ? timeAgo(a.published) : ''}</small></div></a>`).join('')}</div>`;
};

/* ---------- Trivia ---------- */
function openTrivia() {
  Sheets.open('Break Room Trivia', async ctx => {
    const best = LS.get('triviaBest', 0);
    ctx.body.innerHTML = loadingHTML('Shuffling questions…');
    const tb = await throwbackQuestions();
    const deck = [...TRIVIA].sort(() => Math.random() - .5).slice(0, 10 - tb.length).concat(tb).sort(() => Math.random() - .5);
    let i = 0, score = 0;
    const draw = () => {
      if (i >= deck.length) {
        const nb = Math.max(best, score); LS.set('triviaBest', nb);
        ctx.body.innerHTML = `<div class="hero-empty"><h2>${score}/10</h2><p>${score >= 9 ? 'Hall of Famer. 🏆' : score >= 7 ? 'All-Conference. 💪' : score >= 5 ? 'Solid starter.' : 'Back to the film room. 📼'}</p><p class="hint">Personal best: ${nb}/10</p><button class="btn" id="again">Play again</button></div>`;
        qs('#again', ctx.body).onclick = () => { history.back(); setTimeout(openTrivia, 350); };
        return;
      }
      const q = deck[i];
      const order = q.a.map((t, k) => ({ t, k })).sort(() => Math.random() - .5);
      ctx.body.innerHTML = `<div class="trivia"><small>Question ${i + 1} of ${deck.length} · Score ${score}</small>${q.tb ? '<span class="tb-tag">📜 Throwback</span>' : ''}<h3>${esc(q.q)}</h3>
        ${order.map(o => `<button class="ans" data-k="${o.k}">${esc(o.t)}</button>`).join('')}</div>`;
      ctx.body.onclick = e => {
        const b = e.target.closest('.ans'); if (!b || ctx.body.dataset.lock) return;
        ctx.body.dataset.lock = 1;
        const right = Number(b.dataset.k) === q.c; if (right) score++;
        qsa('.ans', ctx.body).forEach(x => x.classList.add(Number(x.dataset.k) === q.c ? 'right' : x === b ? 'wrong' : 'dim'));
        setTimeout(() => { delete ctx.body.dataset.lock; i++; draw(); }, 1100);
      };
    };
    draw();
  });
}

/* ---------- Settings ---------- */
function openSettings() {
  Sheets.open('Settings', ctx => {
    const draw = () => {
      const p = Prefs.get();
      ctx.body.innerHTML = `
        <div class="card"><h4>Profile</h4>
          <label class="lbl">Your name<input class="search" id="sName" value="${esc(p.name || '')}" placeholder="First & last name"></label>
          <label class="lbl">Fan name<input class="search" id="sFan" value="${esc(p.fan || '')}" maxlength="24" placeholder="e.g. nbr1hawgfan"></label>
          <p class="hint">Pick'em & rivalry use your sign-in name${pickemCreds() ? `: <b>${esc(pickemCreds().name)}</b>` : ''}.</p></div>
        <div class="card"><h4>🔔 Score alerts</h4><p class="hint">${Alerts.on() ? 'On for this phone.' : 'Off for this phone.'}</p><button class="btn ghost" id="sAlerts">${Alerts.on() ? 'Alert settings' : 'Turn on alerts'}</button></div>
        <div class="card"><h4>☁️ Backup & sync</h4>${Sync.ready()
          ? `<p class="hint">Your teams, colors and settings are saved to <b>${esc(pickemCreds().name)}</b>. Sign in with the same fan name and PIN on any phone or computer and everything comes with you. Last saved: <b id="sSyncAt">${esc(Sync.lastSavedText())}</b></p><p class="hint sync-err" id="sSyncErr">${Sync.lastError ? '⚠️ ' + esc(Sync.lastError) : ''}</p><button class="btn ghost" id="sSync">Sync now</button>`
          : `<p class="hint">Sign in with your fan name and PIN to back up your teams and use them on other devices.</p>`}</div>
        <div class="card"><h4>Look</h4><div class="seg" id="sLook">${[['dark', '🌙 Dark'], ['light', '☀️ Light'], ['auto', '📱 Match phone']].map(([k, l]) => `<button data-look="${k}" class="${Look.get() === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="card"><h4>Score ticker</h4><label class="chk"><input type="checkbox" id="sTicker" ${LS.get('tickerOn', true) ? 'checked' : ''}> Show the scrolling score ticker</label></div>
        <div class="card"><h4>Teams & colors</h4>
          ${p.favs.map(f => `<div class="tp-row" style="--tc:#${f.c};--ta:#${f.a}"><span class="swatch"></span>${img(f.logo)}<span class="tp-name">${esc(f.dn)}<small>${LEAGUES[f.lg].short}</small></span>
            <button class="icon-btn ${p.theme && p.theme.lg === f.lg && String(p.theme.id) === String(f.id) ? 'on' : ''}" data-theme="${f.lg}:${f.id}">🎨</button>
            <button class="icon-btn" data-rm="${f.lg}:${f.id}">✕</button></div>`).join('') || '<p class="hint">No teams yet.</p>'}
          <button class="btn" id="sAdd">＋ Add teams</button></div>
        <div class="card"><h4>Morning Brief</h4><p class="hint">${LS.get('brief', {}).on ? '✅ Signed up' : 'Get your teams in your inbox every morning.'}</p><button class="btn ghost" id="sBrief">📬 Morning Brief settings</button>
          <button class="btn ghost" id="sParty">🎉 Test the win celebration</button></div>
        <div class="card"><h4>Backend (Apps Script URL)</h4><p class="hint">Powers the office pick'em, pros-from-your-school and recruiting.</p>
          <input class="search" id="sGas" value="${esc(gasUrl())}" placeholder="https://script.google.com/macros/s/…/exec">
          <button class="btn ghost" id="sTest">Save & test</button></div>
        <div class="card"><h4>Data</h4><button class="btn ghost" id="sClear">Refresh team lists & cache</button></div>
        <p class="src">Scores & stats: ESPN public feeds · Recruiting: CollegeFootballData.com · Not affiliated with any league or school.</p>`;
    };
    draw();
    ctx.body.onclick = async e => {
      const t = e.target;
      if (t.id === 'sAdd') return openTeamPicker();
      const lk = t.closest('[data-look]'); if (lk) { Look.set(lk.dataset.look); qsa('#sLook button', ctx.body).forEach(b => b.classList.toggle('on', b === lk)); return; }
      if (t.id === 'sBrief') return openBrief();
      if (t.id === 'sAlerts') return openAlerts();
      if (t.id === 'sSync') {
        t.textContent = 'Syncing…'; t.disabled = true; Sync.lastError = '';
        // Newest change wins: if this device has unsaved changes, save them; otherwise bring down the latest saved copy
        let ok = true, changed = false;
        if (_raw.get('syncDirty')) ok = await Sync.push();
        if (ok && !Sync.lastError) { changed = await Sync.pull(true); if (!Sync.lastError && !changed) ok = await Sync.push(); }
        ok = ok && !Sync.lastError;
        t.disabled = false; t.textContent = 'Sync now';
        if (changed) { Sync.refreshUI(); draw(); }
        const at = qs('#sSyncAt', ctx.body); if (at) at.textContent = Sync.lastSavedText();
        const why = qs('#sSyncErr', ctx.body); if (why) why.textContent = ok ? '' : '⚠️ ' + Sync.lastError;
        return toast(ok ? (changed ? '☁️ Pulled your latest teams & colors' : '☁️ All synced') : '⚠️ Sync failed — see Settings for why', ok ? 2400 : 4000);
      }
      if (t.id === 'sParty') { const th = Prefs.get().theme; return confetti(th ? [`#${th.c}`, `#${th.a}`, '#ffffff'] : ['#1f6feb', '#f2c94c', '#fff']); }
      if (t.dataset.theme) { const [lg, id] = t.dataset.theme.split(':'); const f = Prefs.favs().find(x => x.lg === lg && String(x.id) === id); if (f) Prefs.setTheme(f); return draw(); }
      if (t.dataset.rm) { const [lg, id] = t.dataset.rm.split(':'); const f = Prefs.favs().find(x => x.lg === lg && String(x.id) === id); if (f) Prefs.toggleFav(f); return draw(); }
      if (t.id === 'sTest') {
        LS.set('gasUrl', qs('#sGas', ctx.body).value.trim());
        try {
          const r = await gasGet({ action: 'ping' });
          if (!r.version || r.version < CONFIG.BACKEND_VERSION) toast('⚠️ Connected, but the Apps Script is out of date (' + (r.version || 'before Oct 25') + '). Paste the latest gas/Code.gs and deploy a New version — sync, Survivor and the bracket need it.', 7000);
          else toast('Connected ✔ ' + (r.app || '') + ' · backend ' + r.version);
        } catch (er) { toast('Could not reach backend: ' + er.message, 4000); }
      }
      if (t.id === 'sClear') {
        Object.keys(localStorage).filter(k => k.startsWith('ocq_teams:')).forEach(k => localStorage.removeItem(k));
        clearMem(); toast('Cache cleared');
      }
    };
    ctx.body.oninput = e => {
      const p = Prefs.get();
      if (e.target.id === 'sName') { p.name = e.target.value; Prefs.save(p); }
      if (e.target.id === 'sFan' && e.target.value.trim().length >= 3) { p.fan = e.target.value.trim(); Prefs.save(p); Theme.apply(p.theme); }
    };
    ctx.body.onchange = e => { if (e.target.id === 'sTicker') { LS.set('tickerOn', e.target.checked); Ticker.init(); } };
  });
}

/* ---------- More tab ---------- */
function renderMore(view) {
  const items = [
    ['🏆', 'Office Pick\'em', 'Weekly NFL + college picks & leaderboard', openPickem],
    ['🏈', 'Fantasy Football', 'Your ESPN league: matchups, standings, rosters', openFantasy],
    ['🔔', 'Score Alerts', 'Phone notifications for your teams: kickoffs, scores, close games, finals, fantasy TDs', openAlerts],
    ['🔗', 'My Links', 'Your group chats, fan blogs & Discords — follows you to every device', () => openMyLinks()],
    ['▶️', 'Watch Now', 'Every game on TV now or soon, with official stream links', openWatchNow],
    ['📺', 'My Weekend', 'Your teams\' games through Monday, TV & spreads, add to calendar', openWeekend],
    ['💀', 'Survivor Pool', 'NFL: one team a week, last one standing wins', openSurvivor],
    ['🏟️', 'CFP & Bowls', 'Playoff bracket (projected until Selection Day), bowls, conference records', openCFP],
    ['🏁', 'Conference Race', 'Conference standings, games left, who\'s still alive', () => openRace()],
    ['🏆', 'Award Watch', 'Heisman, NFL MVP & NBA MVP watch lists + office vote', () => openAwards()],
    ['🏀', 'Bracket Challenge', 'Office March Madness, round by round', openBracket],
    ['🥎', 'Road to OKC / Omaha', 'Softball & baseball regionals, supers, College World Series', () => openCWS()],
    ['📈', 'Stat Center', 'NFL, CFB, NBA, MLB & NHL leaders, team ranks, FPI/BPI, injuries', () => openStats()],
    ['📊', 'Standings', 'Every league, SEC first for college', openStandings],
    ['🔢', 'Polls & Rankings', 'AP, Coaches, CFP, softball & baseball polls', openRankings],
    ['📰', 'News', 'Your teams or any league', openNews],
    ['🧠', 'Break Room Trivia', '10 quick questions', openTrivia],
    ['🎨', 'Teams & Colors', 'Follow teams, change your theme', () => openTeamPicker()],
    ['⚙️', 'Settings', 'Name, backend URL, cache', openSettings]
  ];
  view.innerHTML = `<div class="menu">${items.map((it, i) => `<button class="menu-item" data-i="${i}"><span class="mi-ico">${it[0]}</span><span><b>${esc(it[1])}</b><small>${esc(it[2])}</small></span><i>›</i></button>`).join('')}</div>`;
  view.onclick = e => { const b = e.target.closest('[data-i]'); if (b) items[b.dataset.i][3](); };
}

/* 🏆 Division tab on pro team pages: just this team's division, sorted, with a share button */
async function teamDivisionTab(body, lg, t) {
  const sport = LEAGUES[lg].path.split('/')[0];
  const groups = flattenStandings(await fetchStandings(lg, '', 3));
  const g = groups.find(x => x.entries.some(e => String(e.team?.id) === String(t.id)));
  if (!g) { body.innerHTML = emptyHTML('Division standings aren\'t available right now.'); return; }
  g.entries = sortStanding(g.entries, sport);
  const sample = g.entries[0]?.stats || [];
  const cols = (STAND_COLS[sport] || []).map(n => sample.find(s => s.name === n)).filter(Boolean);
  const me = g.entries.findIndex(e => String(e.team?.id) === String(t.id));
  const leader = g.entries[0]?.team || {};
  const gb = stOf(g.entries[me], 'gamesBehind')?.displayValue;
  body.innerHTML = `<div class="ti-hero ${me === 0 ? '' : 'dry'}"><small>${esc(g.name)}</small><b>${me === 0 ? '👑 1st' : ordinal(me + 1)}</b><span>${me === 0 ? 'Leading the division' : `${esc(leader.shortDisplayName || '')} lead${gb && gb !== '-' && gb !== '0' ? ` · ${esc(gb)} GB` : ''}`} · ${esc(recordOf(g.entries[me], sport))}</span></div>
    <h3 class="sec-h st-h">${esc(g.name)}<button class="icon-btn st-share" data-share="1" title="Share this table">📤</button></h3>
    <div class="tbl-wrap"><table class="stats stand"><tr><th>Team</th>${cols.map(c => `<th>${esc(c.abbreviation || c.shortDisplayName || c.name)}</th>`).join('')}</tr>
    ${g.entries.map((e, i) => { const tm = e.team || {};
      return `<tr class="${String(tm.id) === String(t.id) || Prefs.isFav(lg, tm.id) ? 'favrow' : ''}" data-team="${tm.id}"><td class="rl">${i === 0 ? '👑 ' : ''}${img(logoOf(tm), 'logo xs')}${esc(tm.shortDisplayName || tm.displayName || '')}</td>${cols.map(c => `<td>${esc(stOf(e, c.name)?.displayValue ?? '')}</td>`).join('')}</tr>`; }).join('')}</table></div>`;
  body.onclick = e => {
    if (e.target.closest('[data-share]')) return shareStandings(lg, g, sport, '');
    const r = e.target.closest('tr[data-team]'); if (r && r.dataset.team !== String(t.id)) openTeam(lg, r.dataset.team);
  };
}
