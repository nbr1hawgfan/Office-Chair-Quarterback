/* Office Chair QB — Fantasy matchup live view
   • Win probability: live points + what's still projected to come, with uncertainty for players who haven't
     finished (about ±60% of a player's remaining projection). Same idea as ESPN's in-app win %.
   • Win-probability graph for the week: rebuilt from each NFL game's kickoff and your players' points
     (points are spread across each game, so it's exact at kickoffs and finals, smooth in between).
   • "On the field now": every starter whose game is live, with their points and the game situation.
   ESPN fantasy player / pro team IDs are the same as ESPN's NFL IDs, so games line up exactly. */

const FFL_GAME_MS = 3.3 * 36e5; // a typical NFL game, kickoff to final
const FFL_SD = 0.6;             // player uncertainty = 60% of remaining projection

function normCdf(z) { // Abramowitz–Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
/* P(A beats B) from points so far, expected points still to come, and variance */
function winProb(aPts, aRem, aVar, bPts, bRem, bVar) {
  const mean = (aPts + aRem) - (bPts + bRem), sd = Math.sqrt(aVar + bVar);
  if (sd < 0.01) return mean > 0 ? 1 : mean < 0 ? 0 : 0.5;
  return normCdf(mean / sd);
}
/* Quick team-level version for the matchup list (no player detail needed) */
function teamWinProb(a, b) {
  const pts = s => Number(s?.totalPointsLive ?? s?.totalPoints ?? 0);
  const rem = s => Math.max(0, Number(s?.totalProjectedPointsLive ?? pts(s)) - pts(s));
  const v = r => (2.4 * Math.sqrt(r)) ** 2; // team-level spread
  return winProb(pts(a), rem(a), v(rem(a)), pts(b), rem(b), v(rem(b)));
}
const clockSec = c => { const m = /(\d+):(\d+)/.exec(c || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
/* NFL games for the week, keyed by team id: { start, state, frac (0..1 of game played), detail, ev } */
async function nflWeekGames(week) {
  const d = await fetchScoreboard('nfl', { week, seasontype: 2 }).catch(() => fetchScoreboard('nfl', {}));
  const map = new Map();
  (d.events || []).forEach(ev => {
    const c = compOf(ev), st = c.status || ev.status || {}, s = st.type?.state || 'pre';
    const per = Number(st.period) || 0, f = s === 'post' ? 1 : s === 'in' ? Math.min(1, Math.max(0, ((Math.min(per, 4) - 1) * 900 + (900 - clockSec(st.displayClock))) / 3600)) : 0;
    (c.competitors || []).forEach(cp => map.set(Number(cp.team?.id || cp.id), { start: new Date(ev.date).getTime(), state: s, frac: per > 4 ? 0.98 : f, detail: st.type?.shortDetail || '', ev, me: cp, opp: (c.competitors || []).find(x => x !== cp) }));
  });
  return map;
}
/* Each starter: points so far, projection, game info */
function fflStarters(entries, week, games) {
  return (entries || []).filter(e => ![20, 21].includes(e.lineupSlotId)).map(e => {
    const p = e.playerPoolEntry?.player || {};
    const pts = Number(fflPts(e, week, 0) ?? 0), proj = Number(fflPts(e, week, 1) ?? 0);
    const g = games.get(Number(p.proTeamId)) || null;
    const left = !g ? 0 : g.state === 'post' ? 0 : g.state === 'pre' ? proj : Math.max(0, proj * (1 - g.frac));
    return { e, p, pts, proj, g, left, slot: FFL_SLOTS[e.lineupSlotId] || '' };
  });
}
const sideState = list => ({ pts: list.reduce((a, x) => a + x.pts, 0), rem: list.reduce((a, x) => a + x.left, 0), v: list.reduce((a, x) => a + (FFL_SD * x.left) ** 2, 0) });

/* Win probability at time t, rebuilt from game times (points spread evenly through each game) */
function wpAt(t, A, B, now) {
  const at = list => list.reduce((acc, x) => {
    if (!x.g) return acc;
    const end = x.g.state === 'post' ? x.g.start + FFL_GAME_MS : now;
    const played = t <= x.g.start ? 0 : x.g.state === 'pre' ? 0 : Math.min(1, (t - x.g.start) / Math.max(1, end - x.g.start));
    const fracGame = x.g.state === 'post' ? played : played * x.g.frac;
    const pts = x.pts * played, left = x.proj * (1 - fracGame);
    acc.pts += pts; acc.rem += left; acc.v += (FFL_SD * left) ** 2; return acc;
  }, { pts: 0, rem: 0, v: 0 });
  const a = at(A), b = at(B);
  return winProb(a.pts, a.rem, a.v, b.pts, b.rem, b.v);
}
function wpTimeline(A, B) {
  const now = Date.now();
  const starts = [...new Set([...A, ...B].filter(x => x.g).map(x => x.g.start))].sort((a, b) => a - b);
  if (!starts.length || starts[0] > now) return [];
  // sample every 15 minutes inside game windows only (skip the gaps between days)
  const windows = [];
  starts.forEach(s => { const e = Math.min(now, s + FFL_GAME_MS); if (s > now) return; const w = windows[windows.length - 1]; if (w && s <= w[1] + 30 * 60e3) w[1] = Math.max(w[1], e); else windows.push([s, e]); });
  const pts = [];
  windows.forEach(([s, e]) => { for (let t = s; t <= e; t += 15 * 60e3) pts.push(t); if (pts[pts.length - 1] !== e) pts.push(e); });
  return pts.map(t => ({ t, p: wpAt(t, A, B, now) }));
}
function wpChartSVG(series, colorA, colorB, nameA, nameB) {
  if (series.length < 2) return '';
  const W = 640, H = 170, pad = 18, n = series.length;
  const x = i => pad + (i / (n - 1)) * (W - pad * 2), y = p => pad + (1 - p) * (H - pad * 2);
  const line = series.map((s, i) => `${x(i).toFixed(1)},${y(s.p).toFixed(1)}`).join(' ');
  const area = `${pad},${y(0.5)} ${line} ${x(n - 1).toFixed(1)},${y(0.5)}`;
  // day/slot labels where the date or the window changes
  const labels = []; let last = '';
  series.forEach((s, i) => { const d = new Date(s.t), k = d.toDateString(); if (k !== last) { labels.push([i, d.toLocaleDateString([], { weekday: 'short' })]); last = k; } });
  const lastP = series[n - 1].p;
  return `<svg class="wp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Win probability over the week">
    <defs><clipPath id="wpTop"><rect x="0" y="0" width="${W}" height="${y(0.5)}"/></clipPath><clipPath id="wpBot"><rect x="0" y="${y(0.5)}" width="${W}" height="${H}"/></clipPath></defs>
    <polygon points="${area}" fill="${colorA}" opacity=".35" clip-path="url(#wpTop)"/><polygon points="${area}" fill="${colorB}" opacity=".35" clip-path="url(#wpBot)"/>
    <line x1="${pad}" x2="${W - pad}" y1="${y(0.5)}" y2="${y(0.5)}" class="wp-mid"/>
    ${labels.map(([i, l]) => `<line x1="${x(i)}" x2="${x(i)}" y1="${pad}" y2="${H - pad}" class="wp-day"/><text x="${x(i) + 4}" y="${H - 4}" class="wp-lbl">${l}</text>`).join('')}
    <polyline points="${line}" fill="none" class="wp-line"/>
    <circle cx="${x(n - 1)}" cy="${y(lastP)}" r="5" class="wp-dot"/>
    <text x="${pad + 2}" y="${pad + 12}" class="wp-lbl">${esc(nameA)} ↑</text><text x="${pad + 2}" y="${H - pad - 6}" class="wp-lbl">${esc(nameB)} ↓</text>
  </svg>`;
}

/* Top of the matchup screen: win %, graph, and who's on the field now */
async function fflLiveHTML(aEntries, bEntries, week, aTeam, bTeam, mine) {
  const games = await nflWeekGames(week);
  const A = fflStarters(aEntries, week, games), B = fflStarters(bEntries, week, games);
  const sa = sideState(A), sb = sideState(B);
  const p = winProb(sa.pts, sa.rem, sa.v, sb.pts, sb.rem, sb.v);
  const nameA = fflTeamName(aTeam), nameB = fflTeamName(bTeam);
  const pa = Math.round(p * 100), pb = 100 - pa;
  const live = [...A.map(x => ({ ...x, side: 'a' })), ...B.map(x => ({ ...x, side: 'b' }))].filter(x => x.g && x.g.state === 'in').sort((x, y) => y.pts - x.pts);
  const series = wpTimeline(A, B);
  const done = [...A, ...B].every(x => !x.g || x.g.state === 'post');
  const yet = list => list.filter(x => x.g && x.g.state === 'pre').length, playing = list => list.filter(x => x.g && x.g.state === 'in').length;
  const gameTxt = x => { const g = x.g; if (!g) return 'no game'; const o = g.opp?.team?.abbreviation || '';
    if (g.state === 'pre') return `${fmtDay(g.ev.date)} ${fmtTime(g.ev.date)}`;
    const sc = `${scoreVal(g.me?.score)}-${scoreVal(g.opp?.score)}`;
    return g.state === 'post' ? `Final ${g.me?.winner ? 'W' : 'L'} ${sc} vs ${o}` : `${g.detail} · ${sc} vs ${o}`; };
  const colorA = mine === 'b' ? '#888' : 'var(--a)', colorB = mine === 'b' ? 'var(--a)' : '#888';
  return {
    games, A, B,
    html: `<div class="card fw-card"><h4>📊 Win Probability${done ? ' · Final' : ''}</h4>
      <div class="fw-bar"><span><b>${pa}%</b>${esc(nameA)}</span><div class="fw-track"><i style="width:${pa}%"></i></div><span class="r">${esc(nameB)}<b>${pb}%</b></span></div>
      <div class="fw-sub"><span>${sa.pts.toFixed(1)} pts · ${(sa.pts + sa.rem).toFixed(1)} proj · ${playing(A)} playing, ${yet(A)} to play</span><span>${playing(B)} playing, ${yet(B)} to play · ${(sb.pts + sb.rem).toFixed(1)} proj · ${sb.pts.toFixed(1)} pts</span></div>
      ${series.length > 1 ? wpChartSVG(series, colorA, colorB, nameA, nameB) + '<p class="src">How the odds moved this week (estimated from game times — exact at each kickoff and final).</p>' : '<p class="hint">The graph starts once the first game kicks off.</p>'}</div>
      ${live.length ? `<div class="card fw-live"><h4><i class="dot"></i> On the Field Now <small class="st-sub">${live.length}</small></h4>${live.map(x => {
        const hs = x.p.id > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${x.p.id}.png` : '';
        return `<button class="fw-row ${x.side}" data-ev="${x.g.ev.id}">${img(hs, 'hs sm')}<span><b>${esc(x.p.fullName || '')}</b><small>${esc(x.slot)} · ${esc(x.side === 'a' ? nameA : nameB)}</small><small class="fw-game">🏈 ${esc(gameTxt(x))}</small></span><span class="fw-pts"><b>${x.pts.toFixed(1)}</b><small>proj ${x.proj.toFixed(1)}</small></span></button>`; }).join('')}</div>` : ''}`,
    gameTxt
  };
}
