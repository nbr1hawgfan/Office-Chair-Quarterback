/* Office Chair QB — "▶ Watch" links
   Turns the TV channel ESPN lists for a game into a link to that network's official app / site.
   People sign in with whatever they already have (cable login, YouTube TV, Hulu Live, a streaming sub).
   On phones these links usually open straight into the installed app. Unknown channels just get no button. */

const WATCH_APPS = [
  { re: /\b(ESPN|ESPN2|ESPNU|ESPNEWS|ESPN\+|SECN\+?|SEC Network|ACCN|ACC Network|ABC|Longhorn)\b/i, app: 'ESPN app', url: 'https://www.espn.com/watch/' },
  { re: /\b(FOX|FS1|FS2|BTN|Big Ten Network|FOX One)\b/i, app: 'FOX Sports', url: 'https://www.foxsports.com/live' },
  { re: /\bCBSSN|CBS Sports Network\b/i, app: 'CBS Sports', url: 'https://www.cbssports.com/watch/' },
  { re: /\b(CBS|Paramount\+?)\b/i, app: 'Paramount+', url: 'https://www.paramountplus.com/live-tv/' },
  { re: /\b(NBC|Peacock|USA Net(work)?|NBCSN)\b/i, app: 'Peacock', url: 'https://www.peacocktv.com/sports' },
  { re: /\b(Prime Video|Amazon|Prime)\b/i, app: 'Prime Video', url: 'https://www.primevideo.com/' },
  { re: /\bNetflix\b/i, app: 'Netflix', url: 'https://www.netflix.com/' },
  { re: /\b(YouTube|Sunday Ticket)\b/i, app: 'YouTube TV', url: 'https://tv.youtube.com/' },
  { re: /\b(NFL Net(work)?|NFL\+|NFLN)\b/i, app: 'NFL+', url: 'https://www.nfl.com/plus/' },
  { re: /\b(TNT|TBS|truTV|Max)\b/i, app: 'HBO Max', url: 'https://www.hbomax.com/sports' },
  { re: /\b(NBA TV|League Pass)\b/i, app: 'NBA app', url: 'https://www.nba.com/watch' },
  { re: /\b(MLB Net(work)?|MLB\.TV|MLBN)\b/i, app: 'MLB.TV', url: 'https://www.mlb.com/tv' },
  { re: /\b(NHL Net(work)?|NHLN)\b/i, app: 'NHL', url: 'https://www.nhl.com/' },
  { re: /\bApple TV\b/i, app: 'Apple TV', url: 'https://tv.apple.com/' },
  { re: /\bThe CW|\bCW\b/i, app: 'The CW app', url: 'https://www.cwtv.com/' },
  { re: /\b(FanDuel Sports|FDSN|Bally Sports)\b/i, app: 'FanDuel Sports Network', url: 'https://www.fanduelsportsnetwork.com/' },
  { re: /\bION\b/i, app: 'ION', url: 'https://iontelevision.com/' }
];

/* Every channel name ESPN gives us for a game */
function tvNames(ev) {
  const c = compOf(ev);
  const names = (c.broadcasts || []).flatMap(b => [...(b.names || []), b.media?.shortName, b.market === 'national' ? b.name : null]);
  (c.geoBroadcasts || []).forEach(g => names.push(g.media?.shortName));
  return [...new Set(names.filter(Boolean).map(String))];
}
/* Official places to watch, one per app, in the order ESPN lists the channels */
function watchOptions(ev, extraNames = []) {
  const out = [];
  [...tvNames(ev), ...extraNames].forEach(n => {
    const w = WATCH_APPS.find(x => x.re.test(n));
    if (w && !out.some(o => o.app === w.app)) out.push({ ...w, net: n });
  });
  return out;
}
/* Small chip for score cards / TV guide rows (live games, or games starting within 36 hours) */
function watchChipHTML(ev) {
  const st = statusOf(ev).state;
  if (st === 'post' || (st === 'pre' && new Date(ev.date) - Date.now() > 36 * 36e5)) return '';
  const w = watchOptions(ev)[0]; if (!w) return '';
  return `<span class="watch-chip ${st === 'in' ? 'live' : ''}" role="link" tabindex="0" data-watch="${esc(w.url)}" title="Watch ${esc(w.net)} on ${esc(w.app)}">▶ ${st === 'in' ? 'Watch' : esc(w.app)}</span>`;
}
/* Full card for the Game Center */
function watchCardHTML(ev, extraNames) {
  if (statusOf(ev).state === 'post') return '';
  const opts = watchOptions(ev, extraNames); if (!opts.length) return '';
  return `<div class="card watch-card"><h4>▶ Where to Watch</h4><div class="watch-btns">${opts.map(o => `<a class="watch-btn" href="${esc(o.url)}" target="_blank" rel="noopener">
    <b>${esc(o.app)}</b><small>${esc(o.net)}</small></a>`).join('')}</div>
    <p class="src">Opens the network's official app or site — sign in with your TV provider or streaming subscription.</p></div>`;
}

/* Chips live inside tappable game cards, so catch the tap first and open the link instead of the game */
document.addEventListener('click', e => {
  const w = e.target.closest('[data-watch]'); if (!w) return;
  e.preventDefault(); e.stopPropagation();
  window.open(w.dataset.watch, '_blank', 'noopener');
}, true);

/* ---------- 📺 Watch Now: every game live now or starting in the next few hours, with official stream links ---------- */
function openWatchNow() {
  Sheets.open('📺 Watch Now', ctx => {
    let lgF = 'all';
    const draw = async (quiet) => {
      if (!quiet) ctx.body.innerHTML = loadingHTML('Finding games on right now…');
      const favs = Prefs.favs(), favKeys = new Set(favs.map(f => f.lg + ':' + f.id));
      const res = await pool(LEAGUE_ORDER, 5, async lg => (await fetchScoreboard(lg, { filter: LEAGUES[lg].college ? 'all' : null })).events.map(ev => ({ lg, ev })));
      const soon = Date.now() + 4 * 36e5, seen = new Set();
      const games = res.flat().filter(Boolean).filter(({ ev }) => {
        if (seen.has(ev.id)) return false; seen.add(ev.id);
        const st = statusOf(ev).state;
        return (st === 'in' || (st === 'pre' && new Date(ev.date) <= soon && new Date(ev.date) >= Date.now() - 36e5)) && watchOptions(ev).length;
      });
      const isFav = x => Object.values(sides(x.ev)).some(c => favKeys.has(x.lg + ':' + c.team?.id));
      const top = x => Object.values(sides(x.ev)).some(c => rankOf(c));
      games.sort((a, b) => (statusOf(b.ev).state === 'in') - (statusOf(a.ev).state === 'in') || isFav(b) - isFav(a) || top(b) - top(a) || new Date(a.ev.date) - new Date(b.ev.date));
      const lgs = [...new Set(games.map(x => x.lg))];
      if (lgF !== 'all' && !lgs.includes(lgF)) lgF = 'all';
      const show = games.filter(x => lgF === 'all' || x.lg === lgF);
      const rest = show.filter(x => !isFav(x)), live = rest.filter(x => statusOf(x.ev).state === 'in'), next = rest.filter(x => statusOf(x.ev).state !== 'in');
      const mine = show.filter(isFav);
      ctx.body.innerHTML = `<div class="st-note">Every televised game on now or starting in the next 4 hours. Tap <b>▶</b> to open the network's official app — sign in with your TV provider or streaming subscription. Tap the game for scores & stats.</div>
        ${lgs.length > 1 ? `<div class="chips" id="wnLg"><button data-k="all" class="${lgF === 'all' ? 'on' : ''}">All <small>${games.length}</small></button>${lgs.map(k => `<button data-k="${k}" class="${k === lgF ? 'on' : ''}">${lgIcon(k)}${LEAGUES[k].short} <small>${games.filter(x => x.lg === k).length}</small></button>`).join('')}</div>` : ''}
        ${mine.length ? `<h3 class="sec-h">⭐ My Teams <small>${mine.length}</small></h3><div class="tv-list">${mine.map(x => tvRowHTML(x, favKeys)).join('')}</div>` : ''}
        ${live.length ? `<h3 class="sec-h"><i class="dot"></i>On Now <small>${live.length}</small></h3><div class="tv-list">${live.map(x => tvRowHTML(x, favKeys)).join('')}</div>` : ''}
        ${next.length ? `<h3 class="sec-h">Starting Soon <small>${next.length}</small></h3><div class="tv-list">${next.map(x => tvRowHTML(x, favKeys)).join('')}</div>` : ''}
        ${!show.length ? emptyHTML('Nothing televised on right now or in the next few hours. Check My Weekend for what\'s coming up. 📺') : ''}`;
      const c = qs('#wnLg', ctx.body);
      if (c) c.onclick = e => { const b = e.target.closest('button'); if (b) { lgF = b.dataset.k; draw(true); } };
    };
    ctx.body.onclick = e => { const r = e.target.closest('.tv-row[data-ev]'); if (r) openGame(r.dataset.lg, r.dataset.ev); };
    draw().catch(e => { ctx.body.innerHTML = errHTML(e); });
    ctx.timers.push(setInterval(() => { if (ctx.alive && !document.hidden) { clearMem(); draw(true).catch(() => { }); } }, 60000));
  });
}
