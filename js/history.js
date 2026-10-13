/* Office Chair QB — program history, head-to-head, draft history, This Day in History, NIL links */
const histName = t => t.location || t.loc || '';
const firstTimeHint = '<p class="hint">First look at a school builds its history (about 30 seconds); after that it\'s instant.</p>';

async function histFetch(params, ttlMin) {
  const key = 'hist:' + JSON.stringify(params), hit = LS.get(key);
  if (hit && Date.now() - hit.t < ttlMin * 60000) return hit.d;
  const d = await gasGet(params);
  try { LS.set(key, { t: Date.now(), d }); } catch (e) { }
  return d;
}

/* ---------- History tab ---------- */
async function teamHistory(body, t) {
  body.innerHTML = loadingHTML('Loading program history…') + firstTimeHint;
  const h = await histFetch({ action: 'history', team: histName(t) }, 720);
  const s = h.seasons || [];
  if (!s.length) { body.innerHTML = emptyHTML('No history found for this school.'); return; }
  const best = [...s].sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)) || b.w - a.w).slice(0, 3);
  const bowls = s.filter(x => x.bowl), bw = bowls.filter(x => x.bowl.r === 'W').length;
  const top10 = s.filter(x => x.ap && x.ap <= 10).length;
  const pct = h.total.w / Math.max(1, h.total.w + h.total.l + h.total.t);
  body.innerHTML = `
    <div class="stat-strip"><div><b>${h.total.w}-${h.total.l}${h.total.t ? '-' + h.total.t : ''}</b><small>All-time</small></div><div><b>${(pct * 100).toFixed(1)}%</b><small>Win pct</small></div>
      <div><b>${top10}</b><small>AP top-10 finishes</small></div>${bowls.length ? `<div><b>${bw}-${bowls.length - bw}</b><small>Bowls since ${h.gamesFrom}</small></div>` : ''}</div>
    <div class="seg small" id="hSeg"><button data-h="seasons" class="on">Seasons</button><button data-h="h2h">Head-to-Head</button><button data-h="coaches">Coaches</button></div>
    <div id="hBody"></div>`;
  const hb = qs('#hBody', body);
  const views = {
    seasons: () => {
      hb.innerHTML = `<div class="card best"><h4>Best seasons</h4>${best.map(x => `<div class="best-row"><b>${x.y}</b><span>${x.w}-${x.l}${x.t ? '-' + x.t : ''}${x.ap ? ` · AP #${x.ap}` : ''}</span><small>${esc(x.coach)}</small></div>`).join('')}</div>
        <div class="seasons">${s.map(x => `<div class="sn ${x.ap && x.ap <= 25 ? 'ranked' : ''}"><b class="sn-y">${x.y}</b>
          <span class="sn-r">${x.w}-${x.l}${x.t ? '-' + x.t : ''}${x.cw != null && x.conf ? `<small> (${x.cw}-${x.cl} ${esc(x.conf)})</small>` : ''}</span>
          <span class="sn-c">${esc(x.coach || '')}</span>
          <span class="sn-x">${x.ap ? `<i class="ap">AP ${x.ap}</i>` : ''}${x.bowl ? `<i class="bowl ${x.bowl.r === 'W' ? 'w' : 'l'}" title="${esc(x.bowl.n)} vs ${esc(x.bowl.o)}">${x.bowl.r} ${esc(x.bowl.n.replace(/ Bowl.*/, '').slice(0, 14))}</i>` : ''}</span></div>`).join('')}</div>
        <p class="src">Data: CollegeFootballData.com</p>`;
    },
    coaches: () => {
      hb.innerHTML = `<div class="coaches">${(h.coaches || []).map(c => `<div class="co"><b>${esc(c.name)}</b><small>${c.from}${c.to !== c.from ? '–' + c.to : ''}</small><span>${c.w}-${c.l}${c.t ? '-' + c.t : ''}</span></div>`).join('')}</div>`;
    },
    h2h: async () => {
      const opts = await teamsFor('cfb').catch(() => []);
      const rivals = ((await loadRivals().catch(() => null)) || []).filter(r => r.lg === 'cfb' && r.loc !== histName(t)).map(r => r.loc);
      const quick = [...new Set([...rivals, ...SEC_SCHOOLS.filter(x => x !== histName(t))])].slice(0, 18);
      hb.innerHTML = `<input class="search" id="h2hQ" list="h2hL" placeholder="Type any opponent…"><datalist id="h2hL">${opts.map(o => `<option value="${esc(o.loc)}">`).join('')}</datalist>
        <div class="chips wrap">${quick.map(q => `<button data-opp="${esc(q)}">${esc(q)}</button>`).join('')}</div><div id="h2hOut"></div>`;
      const show = async opp => { const o = qs('#h2hOut', hb); o.innerHTML = loadingHTML(); try { o.innerHTML = h2hHTML(await histFetch({ action: 'h2h', team1: histName(t), team2: opp }, 720), true); } catch (e) { o.innerHTML = errHTML(e); } };
      hb.onclick = e => { const b = e.target.closest('[data-opp]'); if (b) show(b.dataset.opp); };
      qs('#h2hQ', hb).onchange = e => e.target.value && show(e.target.value);
    }
  };
  qs('#hSeg', body).onclick = e => { const b = e.target.closest('[data-h]'); if (!b) return; qsa('#hSeg button', body).forEach(x => x.classList.toggle('on', x === b)); hb.onclick = null; Promise.resolve(views[b.dataset.h]()).catch(er => hb.innerHTML = errHTML(er)); };
  views.seasons();
}

function h2hHTML(m, full) {
  if (!m || !m.games?.length) return emptyHTML('These two have never played.');
  const gs = [...m.games].sort((a, b) => b.y - a.y);
  const margin = g => { const us = g.ht === m.t1 ? g.hs : g.as, them = g.ht === m.t1 ? g.as : g.hs; return us - them; };
  const last10 = gs.slice(0, 10), l10w = last10.filter(g => g.w === m.t1).length;
  const big = [...gs].sort((a, b) => margin(b) - margin(a))[0], worst = [...gs].sort((a, b) => margin(a) - margin(b))[0];
  let streak = 0; const sw = gs[0].w; for (const g of gs) { if (g.w === sw) streak++; else break; }
  const line = g => { const us = g.ht === m.t1 ? g.hs : g.as, them = g.ht === m.t1 ? g.as : g.hs, w = g.w === m.t1;
    return `<div class="h2h-g"><b>${g.y}</b><i class="${w ? 'w' : g.w ? 'l' : ''}">${w ? 'W' : g.w ? 'L' : 'T'}</i><span>${us}-${them}</span><small>${g.n ? 'Neutral' : g.ht === m.t1 ? 'Home' : 'Away'}${g.post ? ' · Bowl' : ''}</small></div>`; };
  return `<div class="card h2h"><h4>${esc(m.t1)} vs ${esc(m.t2)} · all-time</h4>
    <div class="h2h-big"><div><b>${m.w1}</b><small>${esc(m.t1)}</small></div><span>${m.ties ? `${m.ties} T` : '–'}</span><div><b>${m.w2}</b><small>${esc(m.t2)}</small></div></div>
    <p class="hint">Since ${m.start} · last ${last10.length}: ${l10w}-${last10.length - l10w} · ${sw ? `${esc(sw)} has won ${streak} straight` : 'last game tied'}<br>
      Biggest win: ${big.y} (${margin(big) > 0 ? '+' + margin(big) : '—'}) · Worst loss: ${worst.y} (${margin(worst) < 0 ? margin(worst) : '—'})</p>
    ${(full ? gs : gs.slice(0, 5)).map(line).join('')}</div>`;
}

/* ---------- Draft tab ---------- */
async function teamDraft(body, t) {
  body.innerHTML = loadingHTML('Loading draft history…');
  const d = await histFetch({ action: 'draft', team: histName(t) }, 1440);
  const picks = d.picks || [];
  if (!picks.length) { body.innerHTML = emptyHTML('No NFL draft picks found.'); return; }
  const r1 = picks.filter(p => p.r === 1), years = [...new Set(picks.map(p => p.y))];
  const top = [...picks].sort((a, b) => a.o - b.o)[0];
  body.innerHTML = `<div class="stat-strip"><div><b>${picks.length}</b><small>Players drafted</small></div><div><b>${r1.length}</b><small>1st-rounders</small></div><div><b>#${top.o}</b><small>Highest (${top.y})</small></div></div>
    <p class="hint">Tap a player to look up his pro career.</p>
    ${years.map(y => { const ps = picks.filter(p => p.y === y); return `<h3 class="sec-h">${y} <small>${ps.length}</small></h3><div class="draft">${ps.map(p => `
      <button class="dp ${p.r === 1 ? 'r1' : ''}" data-name="${esc(p.n)}"><i>R${p.r}</i><span><b>${esc(p.n)}</b><small>${esc(p.pos || '')} · #${p.o} overall · ${esc(p.nfl || '')}</small></span></button>`).join('')}</div>`; }).join('')}
    <p class="src">Data: CollegeFootballData.com</p>`;
  body.onclick = e => { const b = e.target.closest('[data-name]'); if (b) openPlayerByName(b.dataset.name, 'nfl'); };
}

async function openPlayerByName(name, prefer) {
  try {
    const d = await getJSON(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=10&type=player`, 600);
    const items = ((d.results || []).find(r => r.type === 'player')?.contents || []).map(it => ({ lg: leagueFromSearch(it), id: athleteIdFromUid(it.uid), it })).filter(x => x.lg && x.id);
    const hit = items.find(x => x.lg === prefer && x.it.displayName.toLowerCase() === name.toLowerCase()) || items.find(x => x.it.displayName.toLowerCase() === name.toLowerCase()) || items.find(x => x.lg === prefer) || items[0];
    if (hit) openPlayer(hit.lg, hit.id); else toast(`No ESPN profile found for ${name}`);
  } catch (e) { toast('Search failed'); }
}

/* ---------- Game center: all-time series (college football) ---------- */
async function gameSeriesCard(el, away, home) {
  try {
    const m = await histFetch({ action: 'h2h', team1: away.team?.location, team2: home.team?.location }, 720);
    if (el.isConnected) el.innerHTML = h2hHTML(m, false);
  } catch (e) { if (el.isConnected) el.innerHTML = ''; }
}

/* ---------- Home: This Day in History ---------- */
async function homeThisDay(el) {
  const p = Prefs.get();
  const teams = [p.theme, ...p.favs].filter((f, i, a) => f && f.lg === 'cfb' && a.findIndex(x => x && x.lg === f.lg && x.id === f.id) === i).slice(0, 2);
  if (!teams.length || !gasUrl()) { el.innerHTML = ''; return; }
  const md = `${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;
  const cards = await pool(teams, 2, async f => {
    const d = await histFetch({ action: 'thisday', team: f.loc, md }, 720);
    if (!d.games?.length) return '';
    const g = d.games[0], w = g.us > g.them;
    const more = d.games.slice(1, 3).map(x => `${x.y}: ${x.us > x.them ? 'W' : 'L'} ${x.us}-${x.them} ${x.h === 1 ? 'vs' : x.h === -1 ? '@' : 'vs'} ${esc(x.o)}`).join(' · ');
    return `<div class="thisday" style="--tc:#${f.c};--ta:#${f.a};--tl:url('${esc(f.logo)}')">
      <small>📜 ${d.exact ? 'ON THIS DATE' : 'THIS WEEK'} IN ${esc((f.loc || '').toUpperCase())} HISTORY</small>
      <p><b>${g.y}:</b> ${esc(f.loc)} ${w ? 'beat' : g.us === g.them ? 'tied' : 'fell to'} ${esc(g.o)} <b>${g.us}-${g.them}</b>${g.post ? ` in the ${esc(g.n || 'bowl game')}` : ''}${g.h === -1 ? ' on the road' : ''}.</p>
      ${more ? `<small class="td-more">${more}</small>` : ''}</div>`;
  });
  if (el.isConnected) el.innerHTML = cards.filter(Boolean).join('');
}

/* ---------- Throwback trivia from real program history ---------- */
async function throwbackQuestions() {
  const t = [Prefs.get().theme, ...Prefs.favs()].find(f => f && f.lg === 'cfb');
  if (!t || !gasUrl()) return [];
  try {
    const h = await Promise.race([histFetch({ action: 'history', team: t.loc }, 720), new Promise((_, r) => setTimeout(() => r(), 5000))]);
    const s = (h.seasons || []).filter(x => x.coach);
    if (s.length < 8) return [];
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
    const qs4 = (correct, pool) => { const wrong = shuffle([...new Set(pool.filter(x => x !== correct))]).slice(0, 3); return wrong.length === 3 ? [correct, ...wrong] : null; };
    const out = [];
    const coaches = [...new Set(s.map(x => x.coach))];
    for (let i = 0; i < 2; i++) { const x = rnd(s.filter(y => y.y < new Date().getFullYear())); const a = qs4(x.coach, coaches); if (a) out.push({ q: `Who coached ${t.loc} in ${x.y}?`, a, c: 0 }); }
    const winners = s.filter(x => x.w >= 10); if (winners.length) { const x = rnd(winners); const a = qs4(String(x.y), s.map(y => String(y.y)).filter(y => Math.abs(y - x.y) < 25)); if (a) out.push({ q: `In which season did ${t.loc} go ${x.w}-${x.l}?`, a, c: 0 }); }
    const bowls = s.filter(x => x.bowl && x.bowl.r === 'W'); if (bowls.length >= 2) { const x = rnd(bowls); const a = qs4(x.bowl.o, s.filter(y => y.bowl).map(y => y.bowl.o)); if (a) out.push({ q: `${t.loc} won the ${x.y} ${x.bowl.n} over…`, a, c: 0 }); }
    return out.map(o => ({ ...o, tb: true }));
  } catch (e) { return []; }
}

/* ---------- NIL ---------- */
const NIL_RE = /\bNIL\b|name, image|collective|revenue[- ]shar|House settlement|College Sports Commission|pay-for-play/i;
async function teamNIL(body, lg, t) {
  const g = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const sport = LEAGUES[lg].name.replace(/^Men's |^Women's /, '');
  body.innerHTML = `<div class="card nil"><h4>💰 NIL</h4>
    <p class="hint">Actual NIL deal amounts are private. These open the best public estimates and the latest NIL news for ${esc(t.location)}.</p>
    <div class="cards-links">
      <a href="${g(`site:on3.com ${t.location} ${t.name} NIL valuation`)}" target="_blank" rel="noopener"><span>📈</span>On3 NIL valuations</a>
      <a href="${g(`site:on3.com ${t.location} ${sport} roster value NIL`)}" target="_blank" rel="noopener"><span>🏦</span>Team roster value</a>
      <a href="${g(`${t.location} ${t.name} NIL collective`)}" target="_blank" rel="noopener"><span>🤝</span>Collective</a>
      <a href="${g(`${t.location} ${sport} revenue sharing NIL ${new Date().getFullYear()}`)}" target="_blank" rel="noopener"><span>💵</span>Revenue sharing</a>
    </div></div><h3 class="sec-h">NIL news</h3><div id="nilNews">${loadingHTML()}</div>`;
  const nb = qs('#nilNews', body);
  try {
    const [teamNews, search] = await Promise.all([
      getJSON(`${SITE}${LEAGUES[lg].path}/news?team=${t.id}&limit=40`, 600).catch(() => ({})),
      getJSON(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(t.location + ' ' + t.name + ' NIL')}&limit=15&type=article`, 900).catch(() => ({}))
    ]);
    const arts = [];
    (teamNews.articles || []).filter(a => NIL_RE.test(a.headline + ' ' + (a.description || ''))).forEach(a => arts.push({ h: a.headline, d: a.description, u: a.links?.web?.href, img: a.images?.[0]?.url, t: a.published }));
    ((search.results || []).find(r => r.type === 'article')?.contents || []).filter(a => NIL_RE.test(a.displayName || '')).forEach(a => arts.push({ h: a.displayName, u: a.link?.web, img: a.images?.find(i => i.url && !/stitcher/.test(i.url))?.url, t: a.date }));
    const seen = new Set(), list = arts.filter(a => a.h && !seen.has(a.h) && seen.add(a.h)).sort((a, b) => new Date(b.t || 0) - new Date(a.t || 0));
    nb.innerHTML = list.length ? `<div class="news">${list.slice(0, 15).map(a => `<a class="art" href="${esc(a.u || '#')}" target="_blank" rel="noopener">${a.img ? `<img src="${esc(a.img)}" loading="lazy" alt="">` : ''}<div><b>${esc(a.h)}</b>${a.d ? `<p>${esc(a.d)}</p>` : ''}<small>${a.t ? timeAgo(a.t) : ''}</small></div></a>`).join('')}</div>`
      : emptyHTML('No recent NIL headlines for this team.');
  } catch (e) { nb.innerHTML = errHTML(e); }
}
