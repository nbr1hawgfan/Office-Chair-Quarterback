/* Office Chair QB — postseason centers
   • CFP & Bowls: live 12-team College Football Playoff bracket, a projected bracket from the current CFP rankings
     before Selection Day, every bowl game, and each conference's bowl record.
   • Road to OKC / Road to Omaha: softball & college baseball regionals, super regionals and the College World Series. */

const PS_HEAD = ev => compOf(ev).notes?.[0]?.headline || ev.name || '';
const dayList = (a, b) => { const out = []; for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) out.push(new Date(d)); return out; };
const firstSunday = (y, m, from = 1) => { const d = new Date(y, m, from); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); return d; };

/* Pull a run of daily scoreboards and keep the games that match */
async function fetchDays(lg, dates, keep, ttl = 600) {
  const res = await pool(dates, 6, d => getJSON(scoreboardUrl(lg, { date: d }), ttl));
  const seen = new Set(), out = [];
  res.forEach(r => (r?.events || []).forEach(e => { if (!seen.has(e.id) && (!keep || keep(e))) { seen.add(e.id); out.push(e); } }));
  return out.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* ---------- conference lookup for football (incl. Group of 5, used for projections & bowl records) ---------- */
const PROJ_CONF = {
  mwc: { name: 'Mountain West', schools: ['Air Force', "Hawai'i", 'Hawaii', 'Nevada', 'New Mexico', 'San José State', 'San Jose State', 'UNLV', 'Wyoming', 'Northern Illinois', 'UTEP', 'North Dakota State'] },
  sbc: { name: 'Sun Belt', schools: ['App State', 'Arkansas State', 'Coastal Carolina', 'Georgia Southern', 'Georgia State', 'James Madison', 'Marshall', 'Old Dominion', 'South Alabama', 'Southern Miss', 'Troy', 'Louisiana', 'UL Monroe', 'Louisiana Tech'] },
  mac: { name: 'MAC', schools: ['Akron', 'Ball State', 'Bowling Green', 'Buffalo', 'Central Michigan', 'Eastern Michigan', 'Kent State', 'Miami (OH)', 'Ohio', 'Toledo', 'Western Michigan', 'Massachusetts', 'UMass', 'Sacramento State'] },
  cusa: { name: 'Conference USA', schools: ['Delaware', 'FIU', 'Jacksonville State', 'Kennesaw State', 'Liberty', 'Middle Tennessee', 'Missouri State', 'New Mexico State', 'Sam Houston', 'Western Kentucky'] }
};
function cfbConfOf(loc) {
  const k = CONF_ORDER.find(k => confSchools(k, 'cfb').includes(loc)); if (k) return k;
  return Object.keys(PROJ_CONF).find(k => PROJ_CONF[k].schools.includes(loc)) || null;
}
const confName = k => CONFERENCES[k]?.name || PROJ_CONF[k]?.name || 'Independent';

/* ================= CFP & BOWLS ================= */
async function cfbPostseason() {
  const base = await getJSON(scoreboardUrl('cfb', { filter: 'all' }), 900);
  const cal = (base.leagues?.[0]?.calendar || []).find(c => String(c.value) === '3');
  const weeks = (cal?.entries || []).map(e => e.value).filter(Boolean);
  if (!weeks.length) weeks.push(1);
  const res = await pool(weeks, 3, w => getJSON(scoreboardUrl('cfb', { week: w, seasontype: 3, filter: 'all' }), 600));
  const seen = new Set(), evs = [];
  res.forEach(d => (d?.events || []).forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); evs.push(e); } }));
  return { events: evs.sort((a, b) => new Date(a.date) - new Date(b.date)), season: base.season?.year };
}
const isCFP = ev => /playoff|cfp/i.test(PS_HEAD(ev));
function cfpRound(ev) {
  const h = PS_HEAD(ev);
  if (/first round/i.test(h)) return 'r1';
  if (/quarterfinal/i.test(h)) return 'qf';
  if (/semifinal/i.test(h)) return 'sf';
  if (/championship/i.test(h)) return 'ncg';
  return 'r1';
}
const bowlName = ev => { const h = PS_HEAD(ev); const p = h.split(/\s[-–]\s/); return /playoff|cfp/i.test(p[0]) && p[1] ? p[1] : p[0]; };

function openCFP() {
  Sheets.open('🏟️ CFP & Bowls', async ctx => {
    const now = new Date(), y = now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
    const selDay = firstSunday(y, 11);
    const preSel = now < selDay;
    const { events } = await cfbPostseason().catch(() => ({ events: [] }));
    const cfp = events.filter(isCFP), bowls = events;
    const realBracket = cfp.some(ev => Object.values(sides(ev)).some(c => c.team?.id && !/tbd/i.test(c.team?.displayName || '')));
    ctx.body.innerHTML = '';
    const tabs = [{ k: 'bracket', label: realBracket ? '🏆 Playoff Bracket' : '🔮 Projected Bracket' }, { k: 'bowls', label: '🏈 Bowl Games' }, { k: 'rec', label: '📊 Conf. Records' }];
    subTabs(ctx.body, tabs, (k, body) => {
      if (k === 'bracket') return realBracket ? cfpBracket(body, cfp) : cfpProjected(body, selDay, preSel);
      if (k === 'bowls') return bowlList(body, bowls, selDay);
      return bowlRecords(body, bowls, selDay);
    });
  });
}

function miniTeam(c, done, score) {
  const t = c.team || {}, tbd = !t.id || /tbd/i.test(t.displayName || '');
  const seed = c.seed || rankOf(c);
  return `<div class="bk-tm ${done && c.winner ? 'win' : ''} ${done && !c.winner ? 'lose' : ''}">${tbd ? '<span class="logo xs ph"></span>' : img(logoOf(t), 'logo xs')}
    <span>${seed ? `<i class="bk-seed">${esc(seed)}</i>` : ''}${esc(tbd ? 'TBD' : t.shortDisplayName || t.abbreviation || '')}</span><b>${esc(score)}</b></div>`;
}
function miniGame(ev, lg, label) {
  const { away, home } = sides(ev), st = statusOf(ev), done = st.state === 'post', live = st.state === 'in';
  const row = c => miniTeam(c, done, st.state === 'pre' ? '' : scoreVal(c.score));
  return `<button class="bk-game ${live ? 'live' : ''}" data-ev="${ev.id}" data-lg="${lg}">
    ${label ? `<small class="bk-lbl">${esc(label)}</small>` : ''}${row(away)}${row(home)}
    <small class="bk-st">${live ? '<i class="dot"></i>' : ''}${esc(st.state === 'pre' ? fmtDay(ev.date) + ' · ' + fmtTime(ev.date) + (broadcastOf(ev) ? ' · ' + broadcastOf(ev) : '') : st.shortDetail || '')}</small></button>`;
}

function cfpBracket(body, cfp) {
  const cols = [['r1', 'First Round'], ['qf', 'Quarterfinals'], ['sf', 'Semifinals'], ['ncg', 'National Championship']];
  const by = {}; cfp.forEach(ev => (by[cfpRound(ev)] = by[cfpRound(ev)] || []).push(ev));
  const champ = (by.ncg || []).map(ev => Object.values(sides(ev)).find(c => statusOf(ev).state === 'post' && c.winner)).find(Boolean);
  body.innerHTML = `${champ ? `<div class="sv-win">🏆 ${esc(champ.team?.displayName || '')} — National Champions!</div>` : ''}
    <div class="bk-wrap"><div class="bk">${cols.map(([k, l]) => `<div class="bk-col"><h5>${l}</h5>${(by[k] || []).map(ev => miniGame(ev, 'cfb', bowlName(ev))).join('') || '<p class="hint">TBD</p>'}</div>`).join('')}</div></div>
    <p class="src">Tap any game for the Game Center. Swipe sideways to follow the bracket.</p>`;
  body.onclick = e => { const g = e.target.closest('.bk-game[data-ev]'); if (g) openGame(g.dataset.lg, g.dataset.ev); };
}

async function cfpProjected(body, selDay, preSel) {
  const d = await getJSON(`${SITE}football/college-football/rankings`, 900);
  const polls = (d.rankings || []).filter(p => (p.ranks || []).length);
  const poll = polls.find(p => /playoff|cfp/i.test(p.name + ' ' + (p.shortName || ''))) || polls.find(p => /\bap\b/i.test(p.name + ' ' + (p.shortName || ''))) || polls[0];
  if (!poll) { body.innerHTML = emptyHTML('No rankings yet this season.'); return; }
  const isCfpPoll = /playoff|cfp/i.test(poll.name + ' ' + (poll.shortName || ''));
  const ranks = poll.ranks.map(r => ({ rk: r.current, t: r.team || {}, rec: r.recordSummary || '', conf: cfbConfOf(r.team?.location) }));
  const champs = {}; ranks.forEach(r => { if (r.conf && !champs[r.conf]) champs[r.conf] = r; });
  const auto = Object.values(champs).sort((a, b) => a.rk - b.rk).slice(0, 5);
  const field = ranks.slice(0, 12);
  auto.forEach(c => {
    if (field.includes(c)) return;
    for (let i = field.length - 1; i >= 0; i--) if (!auto.includes(field[i])) { field.splice(i, 1); break; }
    field.push(c);
  });
  field.sort((a, b) => a.rk - b.rk).forEach((f, i) => { f.seed = i + 1; });
  const S = n => field[n - 1];
  const out = ranks.filter(r => !field.includes(r)).slice(0, 4);
  const fav = r => Prefs.favs().some(f => f.lg === 'cfb' && (String(f.id) === String(r.t.id) || f.loc === r.t.location));
  const tm = r => r ? `<div class="bk-tm ${fav(r) ? 'win' : ''}" data-team="${r.t.id}">${img(r.t.logo || logoOf(r.t), 'logo xs')}<span><i class="bk-seed">${r.seed}</i>${esc(r.t.location || r.t.nickname || '')}${auto.includes(r) ? ' <i class="badge">AQ</i>' : ''}</span><b><small>${esc(r.rec)}</small></b></div>` : '';
  const g = (a, b, lbl) => `<div class="bk-game">${lbl ? `<small class="bk-lbl">${lbl}</small>` : ''}${tm(S(b))}${tm(S(a))}</div>`;
  const bye = (a, lbl) => `<div class="bk-game"><small class="bk-lbl">${lbl}</small>${tm(S(a))}<div class="bk-tm"><span class="logo xs ph"></span><span class="mut">Winner of ${lbl.split('vs ')[1] || ''}</span><b></b></div></div>`;
  body.innerHTML = `<div class="st-note">🔮 <b>If the season ended today</b>, based on the ${esc(poll.name)}${isCfpPoll ? '' : ' (the CFP rankings take over once they\'re released)'}. The five highest-ranked conference champions get in — here the top-ranked team in each conference stands in as its champ (<i class="badge">AQ</i>). Seeds go straight by ranking. The real bracket drops in on Selection Day, ${fmtDay(selDay)}.</div>
    <div class="bk-wrap"><div class="bk">
      <div class="bk-col"><h5>First Round</h5>${g(5, 12, 'at #5 (campus)')}${g(8, 9, 'at #8 (campus)')}${g(6, 11, 'at #6 (campus)')}${g(7, 10, 'at #7 (campus)')}</div>
      <div class="bk-col"><h5>Quarterfinals</h5>${bye(4, '#4 vs 5/12')}${bye(1, '#1 vs 8/9')}${bye(3, '#3 vs 6/11')}${bye(2, '#2 vs 7/10')}</div>
      <div class="bk-col"><h5>Semifinals</h5><div class="bk-game tbd"><p class="hint">#1/#4 side</p></div><div class="bk-game tbd"><p class="hint">#2/#3 side</p></div></div>
      <div class="bk-col"><h5>Title Game</h5><div class="bk-game tbd"><p class="hint">🏆</p></div></div>
    </div></div>
    ${out.length ? `<div class="card"><h4>First Four Out</h4>${out.map(r => `<div class="bk-tm" data-team="${r.t.id}">${img(r.t.logo || logoOf(r.t), 'logo xs')}<span><i class="bk-seed">${r.rk}</i>${esc(r.t.location || '')} <small>${esc(confName(r.conf))}</small></span><b><small>${esc(r.rec)}</small></b></div>`).join('')}</div>` : ''}`;
  body.onclick = e => { const t = e.target.closest('[data-team]'); if (t && t.dataset.team !== 'undefined') openTeam('cfb', t.dataset.team); };
}

function bowlList(body, bowls, selDay) {
  if (!bowls.length) { body.innerHTML = emptyHTML(`Bowl matchups are announced on Selection Day, ${fmtDay(selDay)}. Check back then! 🏈`); return; }
  const mine = myConf();
  const favLocs = new Set(Prefs.favs().filter(f => f.lg === 'cfb').map(f => f.loc));
  let filt = LS.get('bowlFilt', 'all');
  const opts = [['all', 'All'], ['cfp', '🏆 CFP'], ['mine', '⭐ My Teams'], ...CONF_ORDER.map(k => [k, CONFERENCES[k].name + (k === mine ? ' ★' : '')])];
  const draw = () => {
    const show = bowls.filter(ev => {
      if (filt === 'all') return true;
      if (filt === 'cfp') return isCFP(ev);
      const locs = Object.values(sides(ev)).map(c => c.team?.location);
      if (filt === 'mine') return locs.some(l => favLocs.has(l));
      return locs.some(l => confSchools(filt, 'cfb').includes(l));
    });
    body.innerHTML = `<div class="chips" id="bwF">${opts.map(([k, l]) => `<button data-k="${k}" class="${k === filt ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      ${show.length ? `<div class="games">${show.map(ev => `<div class="bowl"><small class="bowl-nm">${isCFP(ev) ? '🏆 ' : ''}${esc(PS_HEAD(ev))}</small>${gameCardHTML(ev, 'cfb')}</div>`).join('')}</div>` : emptyHTML('No bowl games for that filter.')}`;
    qs('#bwF', body).onclick = e => { const b = e.target.closest('button'); if (!b) return; filt = b.dataset.k; LS.set('bowlFilt', filt); draw(); };
  };
  body.onclick = e => { const g = e.target.closest('.game[data-ev]'); if (g) openGame('cfb', g.dataset.ev); };
  draw();
}

function bowlRecords(body, bowls, selDay) {
  const rec = {};
  bowls.forEach(ev => {
    if (statusOf(ev).state !== 'post') return;
    Object.values(sides(ev)).forEach(c => {
      const k = cfbConfOf(c.team?.location) || 'ind';
      const r = rec[k] || (rec[k] = { w: 0, l: 0 }); c.winner ? r.w++ : r.l++;
    });
  });
  const scheduled = {};
  bowls.forEach(ev => Object.values(sides(ev)).forEach(c => { const k = cfbConfOf(c.team?.location); if (k) scheduled[k] = (scheduled[k] || 0) + 1; }));
  const keys = [...new Set([...CONF_ORDER, ...Object.keys(PROJ_CONF), ...Object.keys(rec)])].filter(k => rec[k] || scheduled[k]);
  if (!keys.length) { body.innerHTML = emptyHTML(`Conference bowl records start once bowl games are played (matchups set ${fmtDay(selDay)}).`); return; }
  const mine = myConf();
  keys.sort((a, b) => ((rec[b]?.w || 0) - (rec[b]?.l || 0)) - ((rec[a]?.w || 0) - (rec[a]?.l || 0)) || (scheduled[b] || 0) - (scheduled[a] || 0));
  body.innerHTML = `<div class="card"><h4>Bowl Records by Conference</h4><table class="stats stand"><tr><th>Conference</th><th>W</th><th>L</th><th>Bowls</th></tr>
    ${keys.map(k => `<tr class="${k === mine ? 'favrow' : ''}"><td class="rl">${CONFERENCES[k] ? `<img class="conf-ico" src="${CONF_LOGO(k)}" alt="" onerror="this.remove()">` : ''}${esc(confName(k))}${k === mine ? ' ★' : ''}</td><td>${rec[k]?.w || 0}</td><td>${rec[k]?.l || 0}</td><td>${scheduled[k] || 0}</td></tr>`).join('')}</table>
    <p class="src">Includes CFP games. Bragging rights for the break room.</p></div>`;
}

/* ================= ROAD TO OKC / ROAD TO OMAHA ================= */
const CWS = {
  soft: { title: 'Road to OKC', ws: "Women's College World Series", city: 'Oklahoma City', icon: '🥎', win: [4, 13, 5, 9], finals: [4, 26, 5, 9] },
  cbase: { title: 'Road to Omaha', ws: "Men's College World Series", city: 'Omaha', icon: '⚾', win: [4, 27, 5, 26], finals: [5, 10, 5, 26] }
};
const cwsRange = (y, w) => dayList(new Date(y, w[0], w[1]), new Date(y, w[2], w[3]));
const cwsKind = ev => { const h = PS_HEAD(ev); return /world series/i.test(h) ? 'cws' : /super regional/i.test(h) ? 'super' : /regional/i.test(h) ? 'reg' : null; };
const cwsSite = ev => { const h = PS_HEAD(ev); const m = /([A-Z][\w.' &-]+?)\s+(Super\s+)?Regional/i.exec(h); return m ? m[1].replace(/^.*-\s*/, '').trim() : 'Bracket'; };

function openCWS(lg) {
  lg = CWS[lg] ? lg : LS.get('cwsLg', [Prefs.get().theme, ...Prefs.favs()].some(f => f && f.lg === 'cbase') && ![Prefs.get().theme, ...Prefs.favs()].some(f => f && f.lg === 'soft') ? 'cbase' : 'soft');
  Sheets.open(CWS[lg].title, ctx => {
    const draw = async () => {
      const C = CWS[lg], now = new Date(), y = now.getFullYear();
      ctx.setTitle(`${C.icon} ${C.title}`);
      ctx.body.innerHTML = `<div class="chips" id="cwLg">${Object.entries(CWS).map(([k, c]) => `<button data-k="${k}" class="${k === lg ? 'on' : ''}">${c.icon} ${k === 'soft' ? 'Softball · WCWS' : 'Baseball · MCWS'}</button>`).join('')}</div><div id="cwBody">${loadingHTML('Checking every regional…')}</div>`;
      qs('#cwLg', ctx.body).onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.k !== lg) { lg = b.dataset.k; LS.set('cwsLg', lg); draw(); } };
      const body = qs('#cwBody', ctx.body);
      const start = new Date(y, C.win[0], C.win[1]), end = new Date(y, C.win[2], C.win[3], 23);
      const wsStart = new Date(y, C.finals[0], C.finals[1]);
      const live = now >= start && now <= new Date(end.getTime() + 3 * 864e5);
      const yr = live || now > end ? y : y - 1;
      const dates = live ? cwsRange(y, C.win).filter(d => d <= new Date(now.getTime() + 2 * 864e5)) : cwsRange(yr, C.finals);
      try {
        const evs = await fetchDays(lg, dates, ev => !!cwsKind(ev), live ? 90 : 21600);
        renderCWS(body, lg, C, evs, { live, yr, nextStart: now > end ? new Date(y + 1, C.win[0], C.win[1]) : start, wsStart });
      } catch (e) { body.innerHTML = errHTML(e); }
      if (live && !ctx.timers.length) ctx.timers.push(setInterval(() => { if (ctx.alive && !document.hidden) { clearMem(); draw(); } }, 120000));
    };
    draw();
  });
}

function renderCWS(body, lg, C, evs, o) {
  const finals = evs.filter(ev => cwsKind(ev) === 'cws' && /final|championship/i.test(PS_HEAD(ev)));
  const wins = {}; finals.forEach(ev => Object.values(sides(ev)).forEach(c => { if (statusOf(ev).state === 'post' && c.winner) wins[c.team?.id] = { n: (wins[c.team?.id]?.n || 0) + 1, t: c.team }; }));
  const champ = Object.values(wins).find(x => x.n >= 2);
  let html = '';
  if (!o.live) {
    html += `<div class="cws-hero"><span>${C.icon}</span><div><b>${esc(C.ws)}</b><small>${esc(C.city)} · next postseason starts in about <b>${countdown(o.nextStart)}</b></small></div></div>`;
    html += `<p class="hint">Off-season for now. When the postseason starts this page goes live with every regional, super regional and the World Series in ${esc(C.city)}. Below is how last year ended.</p>`;
  }
  if (champ) html += `<div class="sv-win">🏆 ${o.yr} champions: ${img(logoOf(champ.t), 'logo xs')} ${esc(champ.t.displayName || '')}</div>`;
  if (!evs.length) { body.innerHTML = html + emptyHTML(o.live ? 'Postseason games will show up here as they\'re scheduled.' : `Couldn't find the ${o.yr} World Series games.`); return; }
  const kinds = [['cws', '🏟️ World Series'], ['super', 'Super Regionals'], ['reg', 'Regionals']].filter(([k]) => evs.some(ev => cwsKind(ev) === k));
  let k = LS.get('cwsTab', kinds[0][0]); if (!kinds.some(x => x[0] === k)) k = kinds[0][0];
  const favLocs = new Set(Prefs.favs().filter(f => f.lg === lg).map(f => f.loc));
  const draw = () => {
    const list = evs.filter(ev => cwsKind(ev) === k);
    const groups = {};
    list.forEach(ev => { const g = k === 'cws' ? fmtDayLong(new Date(ev.date)) : cwsSite(ev); (groups[g] = groups[g] || []).push(ev); });
    const order = Object.keys(groups);
    if (k !== 'cws') order.sort((a, b) => (groups[b].some(ev => Object.values(sides(ev)).some(c => favLocs.has(c.team?.location))) - groups[a].some(ev => Object.values(sides(ev)).some(c => favLocs.has(c.team?.location)))) || a.localeCompare(b));
    else order.reverse();
    body.innerHTML = html + `<div class="seg small" id="cwK">${kinds.map(([x, l]) => `<button data-k="${x}" class="${x === k ? 'on' : ''}">${l}</button>`).join('')}</div>` +
      order.map(g => `<h3 class="sec-h">${esc(g)}${k !== 'cws' ? ' ' + esc(k === 'super' ? 'Super Regional' : 'Regional') : ''} <small>${groups[g].length}</small></h3><div class="games">${groups[g].map(ev => gameCardHTML(ev, lg)).join('')}</div>`).join('');
    qs('#cwK', body).onclick = e => { const b = e.target.closest('button'); if (!b) return; k = b.dataset.k; LS.set('cwsTab', k); draw(); };
  };
  body.onclick = e => { const g = e.target.closest('.game[data-ev]'); if (g) openGame(lg, g.dataset.ev); };
  draw();
}
