/* Office Chair QB — highlight clips: swipe feed, game-center clips, player videos */

/* Pull every playable clip (mp4) out of any ESPN JSON blob */
function clipsFrom(obj, meta = {}) {
  const out = [], seen = new Set();
  const walk = o => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    const src = o.links?.source?.HD?.href || o.links?.source?.href || o.links?.source?.full?.href || o.links?.mobile?.source?.href;
    if (src && /\.mp4(\?|$)/.test(src) && (o.headline || o.title)) {
      const id = String(o.id || src);
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ id, title: o.headline || o.title, desc: o.description || o.caption || '', dur: o.duration || 0,
          thumb: o.thumbnail || o.posterImages?.default?.href || o.images?.[0]?.url || '', src, web: o.links?.web?.href || '',
          date: o.originalPublishDate || o.lastModified || o.published || '', ...meta });
      }
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(obj);
  return out;
}
const durTxt = s => s ? `${Math.floor(s / 60)}:${pad(s % 60)}` : '';

/* Gather recent highlights: your teams' games first, then the biggest games across leagues */
async function gatherClips() {
  const favs = Prefs.favs(), favKeys = new Set(favs.map(f => f.lg + ':' + f.id));
  const lgs = [...new Set([...favs.map(f => f.lg), 'nfl', 'cfb', 'nba'])].filter(k => LEAGUES[k]);
  const reqs = [];
  lgs.forEach(lg => {
    if (LEAGUES[lg].mode === 'week') reqs.push({ lg, o: {} });
    else for (let i = 0; i < 3; i++) { const d = new Date(); d.setDate(d.getDate() - i); reqs.push({ lg, o: { date: d } }); }
  });
  const boards = await pool(reqs, 5, async r => ({ lg: r.lg, ...(await fetchScoreboard(r.lg, r.o)) }));
  // previous week for football leagues (Tuesday-Thursday the "current" week has few finals)
  const wk = boards.filter(b => b && LEAGUES[b.lg].mode === 'week' && b.data?.week?.number > 1);
  const prev = await pool(wk, 3, async b => ({ lg: b.lg, ...(await fetchScoreboard(b.lg, { week: b.data.week.number - 1, seasontype: b.data.season?.type })) }));
  const all = [], favEvents = [];
  [...boards, ...prev].filter(Boolean).forEach(b => b.events.forEach(ev => {
    if (statusOf(ev).state !== 'post') return;
    const { away, home } = sides(ev);
    const fav = [away, home].some(c => favKeys.has(b.lg + ':' + c.team?.id));
    const meta = { lg: b.lg, ev: ev.id, fav, logos: [logoOf(away.team), logoOf(home.team)], match: `${away.team?.abbreviation || ''} ${scoreVal(away.score)} – ${scoreVal(home.score)} ${home.team?.abbreviation || ''}`, gameDate: ev.date };
    all.push(...clipsFrom(compOf(ev).highlights || [], meta));
    if (fav) favEvents.push({ lg: b.lg, ev, meta });
  }));
  // extra clips for your teams' games from the game summary
  const extra = await pool(favEvents.slice(0, 8), 4, async f => clipsFrom(await getJSON(`${SITE}${LEAGUES[f.lg].path}/summary?event=${f.ev.id}`, 600), f.meta));
  extra.filter(Boolean).forEach(a => all.push(...a));
  const seen = new Set();
  return all.filter(c => !seen.has(c.id) && seen.add(c.id))
    .sort((a, b) => (b.fav - a.fav) || new Date(b.gameDate || b.date) - new Date(a.gameDate || a.date)).slice(0, 50);
}

/* ---------- Full-screen swipe feed ---------- */
function openClipFeed(clips, start = 0, title = 'Highlights') {
  Sheets.open(title, async ctx => {
    ctx.el.classList.add('clip-sheet');
    if (!clips) { ctx.body.innerHTML = loadingHTML('Finding highlights…'); clips = await gatherClips(); }
    if (!clips.length) { ctx.body.innerHTML = emptyHTML('No highlight clips posted yet — they show up a few hours after games end.'); return; }
    let muted = LS.get('clipMuted', true);
    ctx.body.innerHTML = `<div class="feed">${clips.map((c, i) => `<section class="clip" data-i="${i}">
      <video playsinline loop preload="${Math.abs(i - start) < 2 ? 'metadata' : 'none'}" poster="${esc(c.thumb)}" data-src="${esc(c.src)}"></video>
      <div class="clip-ui">
        ${c.fav ? '<span class="clip-fav">⭐ Your team</span>' : ''}
        ${c.match ? `<div class="clip-match">${c.logos?.map(l => img(l, 'logo sm')).join('') || ''}<b>${esc(c.match)}</b></div>` : ''}
        <h3>${esc(c.title)}</h3>${c.desc && c.desc !== c.title ? `<p>${esc(c.desc)}</p>` : ''}
        <div class="clip-btns">${c.ev ? `<button class="pill" data-game="${c.lg}:${c.ev}">📺 Game Center</button>` : ''}<button class="pill" data-share="${i}">↗ Share</button><span class="clip-dur">${durTxt(c.dur)}</span></div>
      </div>
      <button class="clip-mute" aria-label="Sound">${muted ? '🔇' : '🔊'}</button>
      <div class="clip-prog"><i></i></div></section>`).join('')}</div>`;
    const feed = qs('.feed', ctx.body), vids = qsa('video', feed);
    const play = v => { if (!v.src) v.src = v.dataset.src; v.muted = muted; v.play().catch(() => { v.muted = true; v.play().catch(() => { }); }); };
    const io = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target.querySelector('video'), i = Number(e.target.dataset.i);
      if (e.isIntersecting && e.intersectionRatio > .6) {
        play(v);
        [i + 1, i + 2].forEach(k => { const n = vids[k]; if (n && !n.src) { n.preload = 'metadata'; n.src = n.dataset.src; } });
      } else v.pause();
    }), { root: feed, threshold: [0, .6, 1] });
    qsa('.clip', feed).forEach(s => io.observe(s));
    vids.forEach(v => v.addEventListener('timeupdate', () => { const bar = v.parentElement.querySelector('.clip-prog i'); if (v.duration) bar.style.width = (v.currentTime / v.duration * 100) + '%'; }));
    feed.onclick = e => {
      const g = e.target.closest('[data-game]'); if (g) { const [lg, ev] = g.dataset.game.split(':'); vids.forEach(v => v.pause()); return openGame(lg, ev); }
      const sh = e.target.closest('[data-share]'); if (sh) { const c = clips[sh.dataset.share], url = c.web || c.src;
        if (navigator.share) navigator.share({ title: c.title, url }).catch(() => { }); else { navigator.clipboard?.writeText(url); toast('Link copied'); } return; }
      if (e.target.closest('.clip-mute')) { muted = !muted; LS.set('clipMuted', muted); vids.forEach(v => v.muted = muted); qsa('.clip-mute', feed).forEach(b => b.textContent = muted ? '🔇' : '🔊'); return; }
      const sec = e.target.closest('.clip'); if (sec && !e.target.closest('.clip-ui button')) { const v = sec.querySelector('video'); v.paused ? play(v) : v.pause(); }
    };
    requestAnimationFrame(() => { feed.children[start]?.scrollIntoView({ block: 'start' }); });
    // stop videos when the sheet closes
    const t = setInterval(() => { if (!ctx.alive) { vids.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); io.disconnect(); clearInterval(t); } }, 500);
  });
}

/* Thumbnail row used in Game Center, player cards and Home */
function clipRowHTML(clips, key) {
  if (!clips.length) return '';
  window._clipSets = window._clipSets || {}; window._clipSets[key] = clips;
  return `<div class="clip-row" data-set="${key}">${clips.map((c, i) => `<button class="clip-th" data-ci="${i}">
    <span class="th-img" style="background-image:url('${esc(c.thumb)}')"><i>▶</i>${c.dur ? `<em>${durTxt(c.dur)}</em>` : ''}</span><small>${esc(c.title)}</small></button>`).join('')}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.clip-th'); if (!b) return;
  const set = b.closest('.clip-row')?.dataset.set, clips = window._clipSets?.[set];
  if (clips) { e.stopPropagation(); openClipFeed(clips, Number(b.dataset.ci), 'Highlights'); }
}, true);

async function homeClips(el) {
  if (!el) return;
  try {
    const clips = await gatherClips();
    const mine = clips.filter(c => c.fav), show = (mine.length >= 3 ? mine : clips).slice(0, 10);
    if (!show.length || !el.isConnected) return;
    el.innerHTML = `<h3 class="sec-h">🎬 ${mine.length ? 'Your team highlights' : 'Latest highlights'} <button class="sec-more" id="allClips">Watch all ›</button></h3>${clipRowHTML(show, 'home')}`;
    qs('#allClips', el).onclick = () => openClipFeed(clips);
  } catch (e) { }
}
