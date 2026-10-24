/* Office Chair QB — My Weekend TV guide
   Every game for the teams you follow from today through Monday night, with time, channel and spread,
   plus the big games worth flipping to. One tap adds your games to your phone's calendar. */

function weekendWindow() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(s); do { e.setDate(e.getDate() + 1); } while (e.getDay() !== 1);
  e.setHours(23, 59, 59, 999);
  return { s, e };
}

async function weekendGames() {
  const { s, e } = weekendWindow(), favs = Prefs.favs();
  const favKeys = new Set(favs.map(f => f.lg + ':' + f.id));
  const leagues = [...new Set(['nfl', 'cfb', ...favs.map(f => f.lg)])];
  const days = dayList(s, e);
  const inWin = ev => { const d = new Date(ev.date); return d >= s && d <= e; };
  const res = await pool(leagues, 4, async lg => {
    const L = LEAGUES[lg];
    let evs = [];
    if (L.mode === 'week') {
      const cur = await fetchScoreboard(lg, { filter: L.college ? 'all' : null });
      evs = cur.events;
      if (evs.length && !evs.some(ev => new Date(ev.date) > e) && cur.data.week?.number) {
        const nx = await fetchScoreboard(lg, { filter: L.college ? 'all' : null, week: cur.data.week.number + 1, seasontype: cur.data.season?.type }).catch(() => ({ events: [] }));
        evs = evs.concat(nx.events);
      }
    } else if (favs.some(f => f.lg === lg)) {
      const r = await pool(days, 4, d => fetchScoreboard(lg, { date: d, filter: L.college ? 'all' : null }));
      r.forEach(x => { if (x) evs = evs.concat(x.events); });
    }
    return evs.filter(inWin).map(ev => ({ lg, ev }));
  });
  const seen = new Set(), mine = [], big = [];
  res.flat().filter(Boolean).forEach(x => {
    const k2 = x.lg + '|' + x.ev.date + '|' + Object.values(sides(x.ev)).map(c => c.team?.id).join('-');
    if (seen.has(x.ev.id) || seen.has(k2)) return; seen.add(x.ev.id); seen.add(k2);
    const { away, home } = sides(x.ev);
    const fav = [away, home].some(c => favKeys.has(x.lg + ':' + c.team?.id));
    if (fav) return mine.push(x);
    const ra = rankOf(away), rh = rankOf(home), hr = new Date(x.ev.date).getHours();
    if (x.lg === 'cfb' && ((ra && rh) || (ra && ra <= 8) || (rh && rh <= 8))) big.push(x);
    else if (x.lg === 'nfl' && (hr >= 19 || hr < 4)) big.push(x);
  });
  const byDate = (a, b) => new Date(a.ev.date) - new Date(b.ev.date);
  return { mine: mine.sort(byDate), big: big.sort(byDate), s, e };
}

function tvRowHTML(x, favKeys) {
  const { ev, lg } = x, { away, home } = sides(ev), st = statusOf(ev);
  const odds = (compOf(ev).odds || [])[0];
  const team = c => { const t = c.team || {}, f = favKeys.has(lg + ':' + t.id);
    return `<span class="tv-tm ${f ? 'fav' : ''} ${st.state === 'post' && c.winner ? 'win' : ''}">${img(logoOf(t), 'logo sm')}${rankOf(c) ? `<i class="rk">${rankOf(c)}</i>` : ''}<b>${esc(t.shortDisplayName || t.abbreviation || '')}</b>${st.state !== 'pre' ? `<em>${esc(scoreVal(c.score))}</em>` : ''}</span>`; };
  const venue = compOf(ev).venue?.fullName;
  return `<button class="tv-row ${st.state === 'in' ? 'live' : ''}" data-ev="${ev.id}" data-lg="${lg}">
    <span class="tv-time">${st.state === 'in' ? '<i class="dot"></i>LIVE' : st.state === 'post' ? 'FINAL' : esc(fmtTime(ev.date))}<small>${lgIcon(lg)}</small></span>
    <span class="tv-match">${team(away)}<i class="at">@</i>${team(home)}
      <small>${[st.state === 'in' ? st.shortDetail : '', broadcastOf(ev) ? '📺 ' + broadcastOf(ev) : '', st.state === 'pre' && odds?.details ? '📈 ' + odds.details + (odds.overUnder ? ' · O/U ' + odds.overUnder : '') : '', venue ? '📍 ' + venue : ''].filter(Boolean).map(esc).join(' &nbsp; ')}</small></span></button>`;
}

function openWeekend() {
  Sheets.open('📺 My Weekend', async ctx => {
    if (!Prefs.favs().length) { ctx.body.innerHTML = emptyHTML('Follow some teams first and this becomes your personal TV guide.'); return; }
    ctx.body.innerHTML = loadingHTML('Building your TV guide…');
    const favKeys = new Set(Prefs.favs().map(f => f.lg + ':' + f.id));
    const { mine, big, s, e } = await weekendGames();
    const dayGroups = list => {
      const g = {}; list.forEach(x => { const k = ymd(new Date(x.ev.date)); (g[k] = g[k] || []).push(x); });
      return Object.keys(g).sort().map(k => `<h3 class="sec-h">${sameDay(g[k][0].ev.date, new Date()) ? 'Today · ' : ''}${esc(fmtDayLong(new Date(g[k][0].ev.date)))} <small>${g[k].length}</small></h3><div class="tv-list">${g[k].map(x => tvRowHTML(x, favKeys)).join('')}</div>`).join('');
    };
    const upcoming = mine.filter(x => statusOf(x.ev).state !== 'post');
    ctx.act.innerHTML = upcoming.length ? `<button class="icon-btn" id="wkCal" title="Add my games to calendar">📅</button>` : '';
    ctx.body.innerHTML = `<div class="st-note">Your games from ${esc(fmtDay(s))} through Monday night (${esc(fmtDay(e))}). Times are on your phone's clock.</div>
      ${mine.length ? dayGroups(mine) : emptyHTML('None of your teams play between now and Monday. 😴 Big games below.')}
      ${upcoming.length ? '<button class="btn ghost" id="wkCal2">📅 Add my games to my calendar</button>' : ''}
      ${big.length ? `<h3 class="sec-h">Also worth a look 👀</h3><p class="hint">Ranked college matchups and NFL prime time.</p>${dayGroups(big)}` : ''}`;
    const cal = () => downloadICS(upcoming);
    const c1 = qs('#wkCal', ctx.act), c2 = qs('#wkCal2', ctx.body);
    if (c1) c1.onclick = cal; if (c2) c2.onclick = cal;
    ctx.body.onclick = ev => { const r = ev.target.closest('.tv-row[data-ev]'); if (r) openGame(r.dataset.lg, r.dataset.ev); };
  });
}

/* Calendar file (.ics) for the user's upcoming games */
function downloadICS(list) {
  const stamp = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escI = s => String(s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const hours = { nfl: 3.25, cfb: 3.5, nba: 2.5, mbb: 2.25, wbb: 2.25, mlb: 3, cbase: 3, soft: 2, nhl: 2.75, wnba: 2.25 };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Office Chair QB//EN', 'CALSCALE:GREGORIAN'];
  list.forEach(({ ev, lg }) => {
    const { away, home } = sides(ev), start = new Date(ev.date), end = new Date(start.getTime() + (hours[lg] || 3) * 36e5);
    const tv = broadcastOf(ev), venue = compOf(ev).venue?.fullName || '';
    lines.push('BEGIN:VEVENT', `UID:ocq-${ev.id}@officechairqb`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${escI(`${LEAGUES[lg].icon} ${away.team?.shortDisplayName || ''} @ ${home.team?.shortDisplayName || ''}`)}`,
      `DESCRIPTION:${escI([tv ? 'TV: ' + tv : '', 'Open in Office Chair QB'].filter(Boolean).join('\n'))}`, venue ? `LOCATION:${escI(venue)}` : '', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-games.ics';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`📅 ${list.length} game${list.length === 1 ? '' : 's'} ready for your calendar`);
}
