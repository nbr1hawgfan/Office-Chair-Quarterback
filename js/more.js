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
function openStandings() {
  Sheets.open('Standings', ctx => {
    let lg = LS.get('standLg', 'cfb');
    ctx.body.innerHTML = lgChipsHTML(LEAGUE_ORDER, lg, 'stLg') + '<div id="stBody"></div>';
    const body = qs('#stBody', ctx.body);
    const load = async () => {
      body.innerHTML = loadingHTML();
      try {
        const L = LEAGUES[lg];
        const d = await getJSON(`${STAND}${L.path}/standings`, 600);
        const groups = flattenStandings(d);
        if (!groups.length) { body.innerHTML = emptyHTML('Standings not available yet this season.'); return; }
        const sport = L.path.split('/')[0];
        let gi = LS.get('standGroup:' + lg, null);
        if (gi == null || !groups[gi]) { gi = L.college ? Math.max(0, groups.findIndex(g => /southeastern|sec/i.test(g.name))) : -1; }
        const drawGroup = () => {
          const show = gi === -1 ? groups : [groups[gi]];
          body.innerHTML = `<select class="sel" id="stG">${!L.college ? `<option value="-1">All</option>` : ''}${groups.map((g, i) => `<option value="${i}" ${i === gi ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>` +
            show.map(g => {
              const sample = g.entries[0]?.stats || [];
              let cols = (STAND_COLS[sport] || []).map(n => sample.find(s => s.name === n)).filter(Boolean);
              if (L.college) { const conf = sample.find(s => /conf/i.test(s.name || '') || /CONF/i.test(s.abbreviation || '')); if (conf) cols.splice(2, 0, conf); }
              if (!cols.length) cols = sample.slice(0, 5);
              const sorted = [...g.entries];
              return `<h3 class="sec-h">${esc(g.name)}</h3><div class="tbl-wrap"><table class="stats stand"><tr><th>Team</th>${cols.map(c => `<th>${esc(c.abbreviation || c.shortDisplayName || c.name)}</th>`).join('')}</tr>
                ${sorted.map(e => { const t = e.team || {}; const fav = Prefs.isFav(lg, t.id);
                  return `<tr class="${fav ? 'favrow' : ''}" data-team="${t.id}"><td class="rl">${img(logoOf(t), 'logo xs')}${esc(t.shortDisplayName || t.displayName || '')}</td>${cols.map(c => { const s = (e.stats || []).find(x => x.name === c.name) || {}; return `<td>${esc(s.displayValue ?? '')}</td>`; }).join('')}</tr>`; }).join('')}</table></div>`;
            }).join('');
          qs('#stG', body).onchange = ev => { gi = Number(ev.target.value); LS.set('standGroup:' + lg, gi); drawGroup(); };
        };
        drawGroup();
        body.onclick = e => { const r = e.target.closest('tr[data-team]'); if (r) openTeam(lg, r.dataset.team); };
      } catch (e) { body.innerHTML = errHTML(e); }
    };
    bindChips(ctx.body, 'stLg', k => { lg = k; LS.set('standLg', k); load(); });
    load();
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
  Sheets.open('Break Room Trivia', ctx => {
    const best = LS.get('triviaBest', 0);
    const deck = [...TRIVIA].sort(() => Math.random() - .5).slice(0, 10);
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
      ctx.body.innerHTML = `<div class="trivia"><small>Question ${i + 1} of ${deck.length} · Score ${score}</small><h3>${esc(q.q)}</h3>
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
        <div class="card"><h4>Your name</h4><input class="search" id="sName" value="${esc(p.name || '')}" placeholder="Shown on the home screen"></div>
        <div class="card"><h4>Teams & colors</h4>
          ${p.favs.map(f => `<div class="tp-row" style="--tc:#${f.c};--ta:#${f.a}"><span class="swatch"></span>${img(f.logo)}<span class="tp-name">${esc(f.dn)}<small>${LEAGUES[f.lg].short}</small></span>
            <button class="icon-btn ${p.theme && p.theme.lg === f.lg && String(p.theme.id) === String(f.id) ? 'on' : ''}" data-theme="${f.lg}:${f.id}">🎨</button>
            <button class="icon-btn" data-rm="${f.lg}:${f.id}">✕</button></div>`).join('') || '<p class="hint">No teams yet.</p>'}
          <button class="btn" id="sAdd">＋ Add teams</button></div>
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
      if (t.dataset.theme) { const [lg, id] = t.dataset.theme.split(':'); const f = Prefs.favs().find(x => x.lg === lg && String(x.id) === id); if (f) Prefs.setTheme(f); return draw(); }
      if (t.dataset.rm) { const [lg, id] = t.dataset.rm.split(':'); const f = Prefs.favs().find(x => x.lg === lg && String(x.id) === id); if (f) Prefs.toggleFav(f); return draw(); }
      if (t.id === 'sTest') {
        LS.set('gasUrl', qs('#sGas', ctx.body).value.trim());
        try { const r = await gasGet({ action: 'ping' }); toast('Connected ✔ ' + (r.app || '')); } catch (er) { toast('Could not reach backend: ' + er.message, 4000); }
      }
      if (t.id === 'sClear') {
        Object.keys(localStorage).filter(k => k.startsWith('ocq_teams:')).forEach(k => localStorage.removeItem(k));
        clearMem(); toast('Cache cleared');
      }
    };
    ctx.body.oninput = e => { if (e.target.id === 'sName') { const p = Prefs.get(); p.name = e.target.value; Prefs.save(p); } };
  });
}

/* ---------- More tab ---------- */
function renderMore(view) {
  const items = [
    ['🏆', 'Office Pick\'em', 'Weekly NFL + college picks & leaderboard', openPickem],
    ['🏈', 'Fantasy Football', 'Your ESPN league: matchups, standings, rosters', openFantasy],
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
