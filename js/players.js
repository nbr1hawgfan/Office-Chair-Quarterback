/* Office Chair QB — player search, player card, trading-card links */

async function renderPlayers(view) {
  const recent = LS.get('recentPlayers', []);
  view.innerHTML = `
    <input class="search big" id="pQ" placeholder="Search any player — NFL, NBA, MLB, NHL, college…" autocomplete="off">
    <div id="pRes"></div>
    ${recent.length ? `<h3 class="sec-h">Recently viewed</h3><div class="pros" id="pRecent">${recent.map(r => `
      <button class="pro" data-ath="${r.id}" data-lg="${r.lg}">${img(r.img, 'hs')}<span><b>${esc(r.name)}</b><small>${esc(r.sub || '')}</small></span></button>`).join('')}</div>` : ''}
    <div id="legends"></div>
    <div class="card tip"><h4>💡 Tip</h4><p>Open a college team from <b>My Team</b> and check the <b>${esc(PRO_NICK.Arkansas)}</b>-style tab to see every pro from that school and how they're doing.</p></div>`;
  const q = qs('#pQ', view), res = qs('#pRes', view);
  let timer;
  q.oninput = () => {
    clearTimeout(timer);
    const term = q.value.trim();
    if (term.length < 3) { res.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      res.innerHTML = loadingHTML('Searching…');
      try {
        const d = await getJSON(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(term)}&limit=20&type=player`, 300);
        const items = (d.results || []).find(r => r.type === 'player')?.contents || [];
        const usable = items.map(it => ({ it, lg: leagueFromSearch(it), id: athleteIdFromUid(it.uid) })).filter(x => x.lg && x.id);
        res.innerHTML = usable.length ? `<div class="pros">${usable.map(({ it, lg, id }) => `
          <button class="pro" data-ath="${id}" data-lg="${lg}">${img(it.image?.default, 'hs')}
            <span><b>${esc(it.displayName)}</b><small><i class="badge">${esc(LEAGUES[lg].short)}</i> ${esc(it.subtitle || '')}</small></span></button>`).join('')}</div>`
          : emptyHTML('No players found in the supported leagues.');
      } catch (e) { res.innerHTML = errHTML(e); }
    }, 350);
  };
  view.onclick = e => { const b = e.target.closest('[data-ath]'); if (b) openPlayer(b.dataset.lg, b.dataset.ath); };
  q.focus();
  playerLegends(qs('#legends', view));
}

function cardLinks(name, college) {
  const n = encodeURIComponent(name);
  const ebay = (extra, sold) => `https://www.ebay.com/sch/i.html?_nkw=${n}${extra ? '+' + encodeURIComponent(extra) : ''}+card&_sacat=${CONFIG.EBAY_CARD_CATEGORY}${sold ? '&LH_Sold=1&LH_Complete=1' : ''}`;
  const g = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const links = [
    ['🛒', 'eBay — for sale', ebay('', false)],
    ['💰', 'eBay — sold prices', ebay('', true)],
    ['⭐', 'Rookie cards (sold)', ebay('rookie', true)],
    ['💎', 'PSA 10 graded (sold)', ebay('PSA 10', true)],
    ['📚', 'Card checklist (TCDB)', g(`site:tcdb.com ${name}`)],
    ['🏷️', 'COMC listings', g(`site:comc.com ${name}`)]
  ];
  if (college) links.push(['🎓', 'College / Bowman cards', ebay('Bowman', false)], ['💰', 'NIL valuation (On3)', g(`site:on3.com ${name} NIL valuation`)]);
  return `<div class="card"><h4>🃏 Trading Cards</h4><div class="cards-links">${links.map(([i, l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener"><span>${i}</span>${esc(l)}</a>`).join('')}</div>
    <p class="src">Opens live listings; prices come from completed eBay sales.</p></div>`;
}

function statTable(labels, rows) {
  return `<div class="tbl-wrap"><table class="stats"><tr><th></th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr>
    ${rows.map(r => `<tr><td class="rl">${esc(r.label)}</td>${r.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

function openPlayer(lg, id) {
  Sheets.open('Player', async ctx => {
    const L = LEAGUES[lg];
    const base = `${WEB}${L.path}/athletes/${id}`;
    const [bio, ov] = await Promise.all([getJSON(base, 3600), getJSON(base + '/overview', 900).catch(() => ({}))]);
    const a = bio.athlete || bio;
    ctx.setTitle(a.displayName || 'Player');
    const team = a.team || {};
    const tc = team.color || '333', ta = team.alternateColor || '666';
    const facts = [
      a.position?.displayName, a.displayHeight && a.displayWeight ? `${a.displayHeight}, ${a.displayWeight}` : a.displayHeight,
      a.age ? `Age ${a.age}` : '', a.displayExperience || (a.experience?.years != null ? `${a.experience.years} yrs exp` : ''),
      a.displayBirthPlace, a.college?.name ? `🎓 ${a.college.name}` : '', a.displayDraft
    ].filter(Boolean);
    let html = `<div class="pl-hero" style="--tc:#${tc};--ta:#${ta};--tl:url('${esc(logoOf(team))}')">
      ${img(a.headshot?.href, 'pl-hs')}
      <div><small>${a.jersey ? '#' + esc(a.jersey) + ' · ' : ''}${esc(team.displayName || L.name)}</small><h2>${esc(a.displayName)}</h2>
      ${a.active === false ? '<i class="legend">🏛️ Legend · Retired</i>' : a.status?.name && a.status.name !== 'Active' ? `<i class="inj">${esc(a.status.name)}</i>` : ''}
      ${(a.injuries || [])[0]?.status ? `<i class="inj">${esc(a.injuries[0].status)}</i>` : ''}</div>
      ${team.id ? `<button class="pill" data-team="${team.id}">${img(logoOf(team), 'logo xs')} Team</button>` : ''}</div>
      <div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>`;

    const s = ov.statistics;
    if (s?.labels && s.splits?.length) html += `<div class="card"><h4>${esc(s.displayName || 'Stats')}</h4>${statTable(s.labels, s.splits.map(x => ({ label: x.displayName, stats: x.stats })))}</div>`;
    html += `<div id="plMore"></div>`;
    html += cardLinks(a.displayName, L.college || !!a.college);
    const news = ov.news || [];
    if (news.length) html += `<div class="card"><h4>News</h4>${news.slice(0, 5).map(n => `<a class="nlink" href="${esc(n.links?.web?.href || '#')}" target="_blank" rel="noopener">${esc(n.headline)}<small>${n.published ? timeAgo(n.published) : ''}</small></a>`).join('')}</div>`;
    ctx.body.innerHTML = html;
    ctx.body.onclick = e => { const t = e.target.closest('[data-team]'); if (t) openTeam(lg, t.dataset.team); };

    // remember
    const rec = LS.get('recentPlayers', []).filter(r => !(r.id === String(id) && r.lg === lg));
    rec.unshift({ id: String(id), lg, name: a.displayName, img: a.headshot?.href || '', sub: `${L.short} · ${team.displayName || ''}` });
    LS.set('recentPlayers', rec.slice(0, 8));

    // career by season + game log (best effort)
    const more = qs('#plMore', ctx.body);
    const parts = [];
    try {
      const st = await getJSON(base + '/stats', 3600);
      (st.categories || []).slice(0, 3).forEach(cat => {
        const rows = (cat.statistics || []).map(r => ({ label: String(r.season?.displayName || r.season?.year || ''), stats: r.stats || [] })).reverse();
        if (cat.totals?.length) rows.push({ label: 'Career', stats: cat.totals });
        if (rows.length && cat.labels?.length) parts.push(`<details class="card"${parts.length ? '' : ' open'}><summary><h4>${esc(cat.displayName || 'Career')} by season</h4></summary>${statTable(cat.labels, rows)}</details>`);
      });
    } catch (e) { }
    try {
      const gl = await getJSON(base + '/gamelog', 900);
      const meta = gl.events || {};
      const seen = new Set(), evs = [];
      (gl.seasonTypes || []).slice(0, 1).forEach(stp => (stp.categories || []).forEach(c => (c.events || []).forEach(ev => {
        if (!seen.has(ev.eventId)) { seen.add(ev.eventId); evs.push(ev); }
      })));
      const sorted = evs.map(ev => ({ ev, m: meta[ev.eventId] || {} })).sort((x, y) => new Date(y.m.gameDate) - new Date(x.m.gameDate)).slice(0, 10);
      if (sorted.length && gl.labels?.length) {
        parts.push(`<details class="card"><summary><h4>Recent games</h4></summary>${statTable(gl.labels, sorted.map(({ ev, m }) => ({
          label: `${m.gameDate ? new Date(m.gameDate).toLocaleDateString([], { month: 'numeric', day: 'numeric' }) : ''} ${m.atVs || ''} ${m.opponent?.abbreviation || ''} ${m.gameResult || ''}`.trim(),
          stats: ev.stats || [] })))}</details>`);
      }
    } catch (e) { }
    if (ctx.alive) more.innerHTML = parts.join('');
  });
}

/* Legends from your school: first-round picks, tap to open their pro career */
async function playerLegends(el) {
  const t = [Prefs.get().theme, ...Prefs.favs()].find(f => f && f.lg === 'cfb');
  if (!el || !t || !gasUrl()) return;
  try {
    const d = await histFetch({ action: 'draft', team: t.loc }, 1440);
    const r1 = (d.picks || []).filter(p => p.r === 1).sort((a, b) => a.y - b.y);
    if (!r1.length || !el.isConnected) return;
    el.innerHTML = `<h3 class="sec-h">🏛️ ${esc(t.loc)} legends <small>1st-round picks</small></h3>
      <div class="chips wrap legends">${r1.slice(-24).reverse().map(p => `<button data-name="${esc(p.n)}">${img(t.logo, 'logo xs')}${esc(p.n)} <small>${p.y}</small></button>`).join('')}</div>`;
    el.onclick = e => { const b = e.target.closest('[data-name]'); if (b) { e.stopPropagation(); openPlayerByName(b.dataset.name, 'nfl'); } };
  } catch (e) { }
}
