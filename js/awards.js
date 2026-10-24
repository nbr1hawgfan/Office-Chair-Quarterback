/* Office Chair QB — Award Watch: Heisman, NFL MVP, NBA MVP
   A stat-based watch list (our own "Chair Score", not betting odds), the latest award headlines,
   and an office vote so everyone can put their name on a pick. */

const AWARDS = {
  heisman: { lg: 'cfb', name: 'Heisman', icon: '🏆', pools: [
    { c: 'passing', n: 'passingYards', q: 'offense:passing', limit: 15 },
    { c: 'rushing', n: 'rushingYards', q: 'offense:rushing', limit: 15 },
    { c: 'receiving', n: 'receivingYards', q: 'offense:receiving', limit: 10 }] },
  nflmvp: { lg: 'nfl', name: 'NFL MVP', icon: '🏈', pools: [
    { c: 'passing', n: 'passingYards', q: 'offense:passing', limit: 12 },
    { c: 'rushing', n: 'rushingYards', q: 'offense:rushing', limit: 8 },
    { c: 'receiving', n: 'receivingYards', q: 'offense:receiving', limit: 6 }] },
  nbamvp: { lg: 'nba', name: 'NBA MVP', icon: '🏀', pools: [{ c: 'offensive', n: 'avgPoints', limit: 30 }] }
};
const AWARD_NEWS = { heisman: /heisman/i, nflmvp: /\bmvp\b/i, nbamvp: /\bmvp\b/i };

async function teamWinPct(lg) {
  const d = await getJSON(`${STAND}${LEAGUES[lg].path}/standings`, 1800);
  const m = new Map();
  flattenStandings(d).forEach(g => g.entries.forEach(e => {
    const s = (e.stats || []).find(x => /^winpercent$/i.test(x.name || '')) || {};
    const v = Number(s.value); if (e.team?.id && !isNaN(v)) m.set(String(e.team.id), v);
  }));
  return m;
}

async function awardCandidates(key) {
  const A = AWARDS[key], lg = A.lg;
  const found = new Map();
  await pool(A.pools, 3, async p => {
    const c = await resolveCard(lg, p); if (!c) return;
    const d = await fetchAthletes(lg, { sort: `${c.c}.${c.n}`, q: c.q, limit: p.limit });
    (d.athletes || []).forEach(x => { const a = x.athlete || x; if (!found.has(String(a.id))) found.set(String(a.id), { a, src: x.athlete?.categories ? x.athlete : x, defs: d.categories || [] }); });
  });
  const [wp, ranks] = await Promise.all([teamWinPct(lg).catch(() => new Map()),
    lg === 'cfb' ? getJSON(`${SITE}football/college-football/rankings`, 1800).catch(() => ({})) : Promise.resolve({})]);
  const ap = ((ranks.rankings || []).find(p => /\bap\b/i.test(p.name + ' ' + (p.shortName || ''))) || (ranks.rankings || [])[0] || {}).ranks || [];
  const apRank = new Map(ap.map(r => [String(r.team?.id), r.current]));
  const list = [...found.values()].map(x => {
    const get = (c, n) => { const h = pickStat(x.defs, c, n); const v = h ? statOf(x.src, x.defs, h.c, h.n) : null; return v && !isNaN(v.v) ? v : { v: 0, t: '' }; };
    let score = 0, line = [];
    if (lg === 'nba') {
      const pts = get('offensive', 'avgPoints'), reb = get('general', 'avgRebounds'), ast = get('offensive', 'avgAssists'), stl = get('defensive', 'avgSteals'), blk = get('defensive', 'avgBlocks');
      score = pts.v + 1.2 * reb.v + 1.5 * ast.v + 2 * (stl.v + blk.v);
      line = [`${pts.t} PPG`, `${reb.t} RPG`, `${ast.t} APG`];
    } else {
      const py = get('passing', 'passingYards'), ptd = get('passing', 'passingTouchdowns'), pi = get('passing', 'interceptions');
      const ry = get('rushing', 'rushingYards'), rtd = get('rushing', 'rushingTouchdowns');
      const cy = get('receiving', 'receivingYards'), ctd = get('receiving', 'receivingTouchdowns'), rec = get('receiving', 'receptions');
      score = py.v * 0.04 + ptd.v * 4 - pi.v * 2 + ry.v * 0.1 + rtd.v * 6 + cy.v * 0.1 + ctd.v * 6 + rec.v * 0.5;
      if (py.v > 300) line.push(`${py.t} pass yds`, `${ptd.t || 0} TD`, `${pi.t || 0} INT`);
      if (ry.v > 150) line.push(`${ry.t} rush yds`, `${rtd.t || 0} rush TD`);
      if (cy.v > 150) line.push(`${rec.t} rec`, `${cy.t} rec yds`, `${ctd.t || 0} rec TD`);
    }
    const tm = athTeam(x.a), w = wp.get(String(tm.id));
    let mult = w == null ? 1 : 0.6 + 0.8 * w;
    const rk = apRank.get(String(tm.id)); if (rk) mult *= rk <= 10 ? 1.1 : 1.05;
    return { a: x.a, tm, score: score * mult, line, rk, w };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
  return list;
}

function openAwards(key) {
  key = AWARDS[key] ? key : LS.get('awardKey', 'heisman');
  Sheets.open('🏆 Award Watch', ctx => {
    const draw = async () => {
      const A = AWARDS[key];
      ctx.body.innerHTML = `<div class="chips" id="awK">${Object.entries(AWARDS).map(([k, a]) => `<button data-k="${k}" class="${k === key ? 'on' : ''}">${a.icon} ${a.name}</button>`).join('')}</div><div id="awBody">${loadingHTML('Sizing up the field…')}</div>`;
      qs('#awK', ctx.body).onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.k !== key) { key = b.dataset.k; LS.set('awardKey', key); draw(); } };
      const body = qs('#awBody', ctx.body);
      try {
        const [list, s] = await Promise.all([awardCandidates(key), statSeason(A.lg)]);
        const season = String(s.year || new Date().getFullYear()), creds = pickemCreds();
        let votes = { tally: [], mine: '', total: 0 };
        if (creds && gasUrl()) votes = await gasGet({ action: 'votes', code: creds.code, award: key, season, name: creds.name }).catch(() => votes);
        const render = () => {
          const vt = new Map(votes.tally.map(t => [t.athleteId, t])), max = list[0]?.score || 1;
          body.innerHTML = seasonNote(s, A.lg) + `<div class="st-note">📊 <b>Chair Score</b> — our stat formula${A.lg === 'nba' ? ' (points, boards, dimes, stocks)' : ' (yards and touchdowns, minus picks)'}, bumped for team winning${A.lg === 'cfb' ? ' and a Top 25 ranking' : ''}. It's a watch list, not betting odds.</div>
            ${list.length ? `<div class="aw-list">${list.map((x, i) => { const v = vt.get(String(x.a.id));
              return `<div class="aw-row ${Prefs.isFav(A.lg, x.tm.id) ? 'fav' : ''}"><b class="aw-rk">${i + 1}</b><button class="aw-main" data-ath="${x.a.id}">${img(x.a.headshot?.href, 'hs')}
                <span><b>${esc(x.a.displayName || x.a.shortName || '')}</b><small>${img(x.tm.logo, 'logo xs')}${esc(x.tm.ab)} · ${esc(x.a.position?.abbreviation || '')}${x.rk ? ` · #${x.rk}` : ''}</small><small>${esc(x.line.join(' · '))}</small>
                <span class="bar"><span style="width:${Math.max(6, x.score / max * 100).toFixed(0)}%"></span></span></span></button>
                ${creds ? `<button class="aw-vote ${votes.mine === String(x.a.id) ? 'on' : ''}" data-v="${x.a.id}" data-nm="${esc(x.a.displayName || '')}" data-tm="${esc(x.tm.ab)}">🗳️<small>${v ? v.n : ''}</small></button>` : ''}</div>`; }).join('')}</div>` : emptyHTML('Not enough games played yet to build a watch list.')}
            ${creds ? `<div class="card"><h4>🗳️ Office Vote <small class="st-sub">${votes.total} vote${votes.total === 1 ? '' : 's'}</small></h4>${votes.tally.length ? votes.tally.slice(0, 6).map(t => `<div class="aw-tally"><b>${esc(t.athlete)}</b> <small>${esc(t.team)}</small><span>${t.n}</span><small class="aw-voters">${t.voters.map(esc).join(', ')}</small></div>`).join('') : '<p class="hint">No votes yet. Tap 🗳️ next to your pick.</p>'}</div>` : '<p class="hint">Sign in to Pick\'em to vote in the office poll.</p>'}
            <div id="awNews"></div>`;
          newsCard();
        };
        const newsCard = () => getJSON(`${SITE}${LEAGUES[A.lg].path}/news?limit=50`, 900).then(n => {
          const el = qs('#awNews', body); if (!el) return;
          const arts = (n.articles || []).filter(a => AWARD_NEWS[key].test((a.headline || '') + ' ' + (a.description || ''))).slice(0, 6);
          if (arts.length) el.innerHTML = `<div class="card"><h4>📰 ${esc(A.name)} Headlines</h4>${arts.map(a => `<a class="aw-news" href="${esc(a.links?.web?.href || '#')}" target="_blank" rel="noopener"><b>${esc(a.headline)}</b><small>${a.published ? timeAgo(a.published) : ''}</small></a>`).join('')}</div>`;
        }).catch(() => { });
        render();
        body.onclick = async e => {
          const v = e.target.closest('.aw-vote');
          if (v) {
            v.disabled = true;
            try { votes = await gasPost({ action: 'vote', code: creds.code, name: creds.name, pin: creds.pin, award: key, season, athleteId: v.dataset.v, athlete: v.dataset.nm, team: v.dataset.tm }); toast(`🗳️ Your ${A.name} vote: ${v.dataset.nm}`); render(); }
            catch (er) { toast(er.message, 4000); v.disabled = false; }
            return;
          }
          const a = e.target.closest('[data-ath]'); if (a) openPlayer(A.lg, a.dataset.ath);
        };
      } catch (e) { body.innerHTML = errHTML(e); }
    };
    draw();
  });
}
