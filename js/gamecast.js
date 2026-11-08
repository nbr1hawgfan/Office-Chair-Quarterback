/* Office Chair QB — 📡 GameCast (live situation + full play-by-play inside the Game Center)
   Football: field graphic (ball spot, first-down line, possession, red zone, timeouts) + every drive and play.
   Baseball/softball: diamond (runners, balls/strikes/outs, batter vs pitcher) + every at-bat with its pitches.
   Basketball/hockey: last play + every play by period with the running score.
   Everything comes from ESPN's game summary feed the Game Center already loads. */

const GC_SPORT = lg => ['nfl', 'cfb'].includes(lg) ? 'fb' : ['mlb', 'cbase', 'soft'].includes(lg) ? 'bb' : 'other';

/* ---------- data helpers ---------- */
function gcTeams(cs) {
  const m = {};
  cs.forEach(c => { const t = c.team || {}; m[String(t.id || c.id)] = { ab: t.abbreviation || t.shortDisplayName || '', logo: logoOf(t), color: t.color || '555', side: c.homeAway }; });
  return m;
}
function gcDrives(d) {
  const prev = d.drives?.previous || [], cur = d.drives?.current;
  const list = prev.slice();
  if (cur && (cur.plays || []).length && !list.some(x => x.id === cur.id)) list.push(cur);
  const curId = cur && (cur.plays || []).length ? cur.id : null;
  return { list, curId };
}
function gcPlays(d, lg) {
  if (GC_SPORT(lg) === 'fb') return gcDrives(d).list.flatMap(dr => (dr.plays || []).map(p => ({ ...p, _team: dr.team?.id })));
  return d.plays || [];
}
const gcIsPitch = p => p.summaryType === 'P' || /^pitch$/i.test(p.type?.type || '') || (p.pitchCount && !p.summaryType && /^(ball|strike|foul)/i.test(p.text || ''));
const gcIsJunk = p => /^(start|end)[- ](inning|half|period|game)/i.test(p.type?.type || '') || /^(start|end) of/i.test(p.text || '') || !p.text;

/* ---------- live situation panels ---------- */
function gcSituation(d, comp) {
  return d.situation || comp.situation || null;
}
function fbBallX(posText, possTeam, teams) {
  // "OU 32" → absolute 0..100 where 0 = away goal line (left), 100 = home goal line (right)
  const m = /^([A-Z&.' -]+?)\s*(\d{1,2})$/i.exec(String(posText || '').trim());
  if (!m) { const n = /(\d{1,2})/.exec(posText || ''); return n && Number(n[1]) === 50 ? 50 : null; }
  const n = Number(m[2]); if (n === 50) return 50;
  const side = Object.values(teams).find(t => t.ab.toUpperCase() === m[1].trim().toUpperCase());
  if (!side) return null;
  return side.side === 'away' ? n : 100 - n;
}
function footballPanel(d, comp, teams, away, home, st) {
  const sit = gcSituation(d, comp);
  const { list, curId } = gcDrives(d);
  const cur = list.find(x => x.id === curId);
  const lastPlay = cur ? cur.plays[cur.plays.length - 1] : null;
  const poss = String(sit?.possession || cur?.team?.id || '');
  const ddText = sit?.downDistanceText || lastPlay?.end?.downDistanceText || '';
  const posText = sit?.possessionText || lastPlay?.end?.possessionText || '';
  const dist = Number(sit?.distance ?? lastPlay?.end?.distance) || 0;
  const pt = teams[poss];
  let x = fbBallX(posText, poss, teams);
  const dir = pt?.side === 'home' ? -1 : 1;
  const fd = x != null && dist ? Math.max(0, Math.min(100, x + dir * dist)) : null;
  const red = sit?.isRedZone || (x != null && (dir === 1 ? x >= 80 : x <= 20));
  const live = st.state === 'in';
  const to = (n, side) => n == null ? '' : `<span class="gc-to" title="${n} timeouts left">${[0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const last = sit?.lastPlay?.text || lastPlay?.text || '';
  const pct = v => `${(4 + v * 0.92).toFixed(1)}%`; // field = 4% end zone + 92% + 4% end zone
  const ez = t => t ? `background:#${t.color}` : '';
  const aT = teams[String(away.team?.id)], hT = teams[String(home.team?.id)];
  if (!live && !last) return '';
  return `<div class="card gc-sit">
    <div class="gc-dd">${live ? '<i class="dot"></i>' : ''}${pt ? `${img(pt.logo, 'logo xs')}<b>${esc(pt.ab)}</b> ball` : ''}${ddText ? ` · <b>${esc(ddText)}</b>` : live ? ' · Between plays' : ''}${red ? ' <i class="badge rz">RED ZONE</i>' : ''}</div>
    <div class="gc-field">
      <div class="ez l" style="${ez(aT)}"><span>${esc(aT?.ab || '')}</span></div><div class="ez r" style="${ez(hT)}"><span>${esc(hT?.ab || '')}</span></div>
      ${[10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => `<i class="yl" style="left:${pct(v)}"><small>${v <= 50 ? v : 100 - v}</small></i>`).join('')}
      ${live && fd != null ? `<i class="fdl" style="left:${pct(fd)}"></i>` : ''}
      ${live && x != null ? `<i class="ball ${dir < 0 ? 'lt' : ''}" style="left:${pct(x)}">🏈</i>` : ''}
    </div>
    <div class="gc-tos"><span>${esc(aT?.ab || '')} ${to(sit?.awayTimeouts)}</span><span>${to(sit?.homeTimeouts)} ${esc(hT?.ab || '')}</span></div>
    ${last ? `<p class="gc-last"><small>Last play</small>${esc(last)}</p>` : ''}
    ${wpBarHTML(d, away, home)}</div>`;
}
function baseballPanel(d, comp, teams, away, home, st) {
  const sit = gcSituation(d, comp);
  if (!sit || st.state !== 'in') {
    const last = (d.plays || []).filter(p => !gcIsPitch(p) && !gcIsJunk(p)).pop();
    return last ? `<div class="card gc-sit"><p class="gc-last"><small>Last play</small>${esc(last.text)}</p>${wpBarHTML(d, away, home)}</div>` : '';
  }
  const on = k => !!(sit[k] && sit[k] !== false);
  const dots = (n, max, cls) => `<span class="gc-cnt ${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const nm = a => a?.athlete?.shortName || a?.athlete?.displayName || a?.shortName || a?.displayName || '';
  const last = sit.lastPlay?.text || (d.plays || []).filter(p => !gcIsJunk(p)).pop()?.text || '';
  return `<div class="card gc-sit gc-bb">
    <div class="gc-dd"><i class="dot"></i><b>${esc(comp.status?.type?.shortDetail || '')}</b></div>
    <div class="gc-bbrow">
      <svg class="gc-diamond" viewBox="0 0 100 100" aria-label="Runners on base">
        <path d="M50 8 L92 50 L50 92 L8 50 Z" class="infield"/>
        <rect x="43" y="1" width="14" height="14" transform="rotate(45 50 8)" class="base ${on('onSecond') ? 'on' : ''}"/>
        <rect x="85" y="43" width="14" height="14" transform="rotate(45 92 50)" class="base ${on('onFirst') ? 'on' : ''}"/>
        <rect x="1" y="43" width="14" height="14" transform="rotate(45 8 50)" class="base ${on('onThird') ? 'on' : ''}"/>
        <path d="M44 86 L56 86 L56 92 L50 98 L44 92 Z" class="plate"/></svg>
      <div class="gc-count"><div><small>B</small>${dots(Number(sit.balls) || 0, 4, 'b')}</div><div><small>S</small>${dots(Number(sit.strikes) || 0, 3, 's')}</div><div><small>O</small>${dots(Number(sit.outs) || 0, 3, 'o')}</div></div>
      <div class="gc-ab">${nm(sit.batter) ? `<p><small>At bat</small><b>${esc(nm(sit.batter))}</b><span>${esc(sit.batter?.summary || '')}</span></p>` : ''}${nm(sit.pitcher) ? `<p><small>Pitching</small><b>${esc(nm(sit.pitcher))}</b><span>${esc(sit.pitcher?.summary || '')}</span></p>` : ''}</div>
    </div>
    ${last ? `<p class="gc-last"><small>Last play</small>${esc(last)}</p>` : ''}
    ${wpBarHTML(d, away, home)}</div>`;
}
function otherPanel(d, comp, teams, away, home, st) {
  const last = (d.plays || []).filter(p => !gcIsJunk(p)).pop();
  if (!last) return '';
  const t = teams[String(last.team?.id || '')];
  return `<div class="card gc-sit">${st.state === 'in' ? `<div class="gc-dd"><i class="dot"></i><b>${esc(comp.status?.type?.shortDetail || '')}</b></div>` : ''}
    <p class="gc-last">${t ? img(t.logo, 'logo xs') : ''}<small>Last play</small>${esc(last.text)}</p>${wpBarHTML(d, away, home)}</div>`;
}
function wpBarHTML(d, away, home) {
  const wp = (d.winprobability || []).map(x => x.homeWinPercentage).filter(v => v != null);
  if (!wp.length) return '';
  const h = Math.round(wp[wp.length - 1] * 100);
  return `<div class="gc-wp"><span>${esc(away.team?.abbreviation || '')} ${100 - h}%</span><div class="gc-wpbar"><i style="width:${100 - h}%;background:#${away.team?.color || '777'}"></i><i style="width:${h}%;background:#${home.team?.color || '999'}"></i></div><span>${h}% ${esc(home.team?.abbreviation || '')}</span></div>`;
}

/* ---------- play-by-play lists ---------- */
function gcScore(p) { return p.awayScore != null && p.homeScore != null ? `${p.awayScore}-${p.homeScore}` : ''; }
function gcPlayRow(p, teams, opts = {}) {
  const t = teams[String(p.team?.id || p._team || '')];
  const typ = p.type?.text || '';
  const cls = p.scoringPlay ? 'sc' : /interception|fumble|turnover|safety|blocked/i.test(typ + ' ' + p.text) ? 'to' : /penalty/i.test(typ) ? 'pen' : '';
  const meta = opts.fb ? (p.start?.downDistanceText || p.start?.shortDownDistanceText || '') : '';
  const yds = opts.fb && p.statYardage != null && !/kickoff|punt|extra point|field goal|timeout|end/i.test(typ) ? `<i class="gc-yds ${p.statYardage < 0 ? 'neg' : ''}">${p.statYardage > 0 ? '+' : ''}${p.statYardage}</i>` : '';
  return `<div class="gc-play ${cls} ${opts.isNew ? 'new' : ''}" data-pid="${esc(p.id || '')}">
    ${t ? img(t.logo, 'logo xs') : '<span class="logo xs ph"></span>'}
    <div><small>${[esc([opts.clock !== false ? [p.period?.number && opts.fb ? 'Q' + p.period.number : '', p.clock?.displayValue].filter(Boolean).join(' ') : '', meta].filter(Boolean).join(' · ')), p.scoringPlay && gcScore(p) ? `<b>${esc(gcScore(p))}</b>` : ''].filter(Boolean).join(' · ')}</small>
      <p>${esc(p.text || typ)}</p>${opts.pitches ? `<div class="gc-pitches">${opts.pitches}</div>` : ''}</div>${yds}</div>`;
}
function footballPBP(d, teams, s) {
  const { list, curId } = gcDrives(d);
  if (!list.length) return '';
  return [...list].reverse().map(dr => {
    const t = teams[String(dr.team?.id || '')], isCur = dr.id === curId, open = isCur || s.open.has(String(dr.id));
    const res = isCur ? '▶ Current drive' : (dr.displayResult || dr.result || '');
    const where = [[dr.start?.period?.number ? 'Q' + dr.start.period.number : '', dr.start?.clock?.displayValue].filter(Boolean).join(' '), dr.start?.text ? 'from ' + dr.start.text : ''].filter(Boolean).join(' · ');
    const plays = [...(dr.plays || [])].reverse();
    return `<details class="gc-drive ${dr.isScore ? 'sc' : ''} ${isCur ? 'cur' : ''}" data-did="${esc(dr.id)}" ${open ? 'open' : ''}>
      <summary>${t ? img(t.logo, 'logo sm') : ''}<span><b>${esc(t?.ab || '')} · ${esc(res)}</b><small>${esc(dr.description || '')}${where ? ' · ' + esc(where) : ''}</small></span>${dr.isScore && plays[0] ? `<em>${esc(gcScore(plays[0]))}</em>` : ''}</summary>
      ${plays.map(p => gcPlayRow({ ...p, _team: dr.team?.id }, teams, { fb: true, isNew: s.isNew(p) })).join('')}</details>`;
  }).join('');
}
function baseballPBP(d, teams, s) {
  const plays = d.plays || [];
  const pitchesBy = {}, rows = [];
  plays.forEach(p => {
    if (gcIsPitch(p)) { if (p.atBatId) (pitchesBy[p.atBatId] = pitchesBy[p.atBatId] || []).push(p); return; }
    if (gcIsJunk(p)) return;
    rows.push(p);
  });
  if (!rows.length) return '';
  const groups = [];
  rows.forEach(p => { const k = p.period?.displayValue || (p.period?.type ? `${p.period.type} ${p.period.number}` : 'Inning ' + (p.period?.number || '')); let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k, plays: [] }); g.plays.push(p); });
  return groups.reverse().map((g, gi) => `<details class="gc-drive" data-did="inn-${esc(g.k)}" ${gi === 0 || s.open.has('inn-' + g.k) ? 'open' : ''}>
    <summary><span><b>${esc(g.k)}</b><small>${g.plays.length} play${g.plays.length === 1 ? '' : 's'}${g.plays.some(p => p.scoringPlay) ? ' · runs scored' : ''}</small></span><em>${esc(gcScore(g.plays[g.plays.length - 1]))}</em></summary>
    ${[...g.plays].reverse().map(p => {
      const pv = s.pitches && p.atBatId ? (pitchesBy[p.atBatId] || []).map(x => `<i title="${esc(x.text)}">${esc((x.text || '').replace(/^Pitch \d+\s*:\s*/i, '').split(/[,(]/)[0].trim())}</i>`).join('') : '';
      return gcPlayRow(p, teams, { clock: false, pitches: pv, isNew: s.isNew(p) });
    }).join('')}</details>`).join('');
}
function otherPBP(d, teams, s, lg) {
  const plays = (d.plays || []).filter(p => !gcIsJunk(p));
  if (!plays.length) return '';
  const groups = [];
  plays.forEach(p => { const k = p.period?.displayValue || (p.period?.number ? (lg === 'nhl' ? 'Period ' : 'Q') + p.period.number : ''); let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k, plays: [] }); g.plays.push(p); });
  return groups.reverse().map((g, gi) => `<details class="gc-drive" data-did="per-${esc(g.k)}" ${gi === 0 || s.open.has('per-' + g.k) ? 'open' : ''}>
    <summary><span><b>${esc(g.k)}</b><small>${g.plays.length} plays</small></span><em>${esc(gcScore(g.plays[g.plays.length - 1]))}</em></summary>
    ${[...g.plays].reverse().map(p => gcPlayRow(p, teams, { isNew: s.isNew(p) })).join('')}</details>`).join('');
}

/* Whole GameCast tab. s = { filter, pitches, open:Set, isNew(p) } */
function gamecastHTML(lg, d, comp, away, home, s) {
  const st = comp.status?.type || {}, teams = gcTeams(comp.competitors || []), sport = GC_SPORT(lg);
  const panel = sport === 'fb' ? footballPanel(d, comp, teams, away, home, st) : sport === 'bb' ? baseballPanel(d, comp, teams, away, home, st) : otherPanel(d, comp, teams, away, home, st);
  const all = gcPlays(d, lg);
  const scoring = all.filter(p => p.scoringPlay);
  let list;
  if (s.filter === 'score') list = scoring.length ? `<div class="card">${[...scoring].reverse().map(p => gcPlayRow(p, teams, { fb: sport === 'fb', clock: sport !== 'bb', isNew: s.isNew(p) })).join('')}</div>` : emptyHTML('No scoring yet.');
  else list = sport === 'fb' ? footballPBP(d, teams, s) : sport === 'bb' ? baseballPBP(d, teams, s) : otherPBP(d, teams, s, lg);
  if (!list) list = emptyHTML(st.state === 'pre' ? 'Play-by-play starts at kickoff.' : 'ESPN hasn\'t posted play-by-play for this game.');
  return `${panel}
    <div class="gc-bar"><div class="seg small" id="gcF"><button data-gcf="all" class="${s.filter !== 'score' ? 'on' : ''}">All plays <small>${all.filter(p => !gcIsPitch(p) && !gcIsJunk(p)).length}</small></button><button data-gcf="score" class="${s.filter === 'score' ? 'on' : ''}">Scoring <small>${scoring.length}</small></button></div>
      ${sport === 'bb' && s.filter !== 'score' ? `<button class="pill ${s.pitches ? 'on' : ''}" data-gcp="1">⚾ Pitches</button>` : ''}
      ${st.state === 'in' ? '<span class="gc-upd"><i class="dot"></i>Live · updates every 15s</span>' : ''}</div>
    <div class="gc-pbp">${list}</div>
    <p class="src">Newest plays on top. From ESPN's play-by-play feed.</p>`;
}
