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
