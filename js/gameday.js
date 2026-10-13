/* Office Chair QB — Game Day Mode: countdown hero, live score bar, win confetti */
const GameDay = {
  s: null, timer: null, tick: null,

  async check() {
    clearTimeout(this.timer);
    const t = Prefs.get().theme;
    if (!t) return this.set(null);
    let next = 600000;
    try {
      const d = await getJSON(`${SITE}${LEAGUES[t.lg].path}/teams/${t.id}`, 25);
      const ev = (d.team?.nextEvent || [])[0];
      if (!ev) { this.set(null); }
      else {
        const { away, home } = sides(ev), st = statusOf(ev);
        const isHome = String(home.team?.id) === String(t.id), me = isHome ? home : away, opp = isHome ? away : home;
        const today = sameDay(ev.date, new Date());
        const recentFinal = st.state === 'post' && Date.now() - new Date(ev.date) < 14 * 3600e3;
        this.set({ t, ev, st, me, opp, at: isHome ? 'vs' : '@', today, live: st.state === 'in', pre: st.state === 'pre' && today, final: recentFinal });
        next = st.state === 'in' ? 30000 : today ? 60000 : 600000;
      }
    } catch (e) { }
    this.timer = setTimeout(() => this.check(), next);
  },

  set(s) {
    this.s = s;
    const on = !!(s && (s.pre || s.live || s.final));
    document.body.classList.toggle('gd-mode', on);
    document.body.classList.toggle('gd-live', !!(s && s.live));
    this.liveBar();
    this.tabTitle();
    if (s && s.final && s.me.winner) this.celebrate();
    const hero = qs('#gdHero'); if (hero) this.renderHero(hero);
  },

  liveBar() {
    let bar = qs('#liveBar');
    const s = this.s;
    if (!s || !s.live) { if (bar) bar.remove(); document.body.classList.remove('has-livebar'); return; }
    if (!bar) { bar = document.createElement('button'); bar.id = 'liveBar'; document.body.appendChild(bar); bar.onclick = () => openGame(this.s.t.lg, this.s.ev.id); }
    bar.style.cssText = `--tc:#${s.t.c};--ta:#${s.t.a}`;
    bar.innerHTML = `<i class="dot"></i>${img(s.t.logo, 'logo sm')}<b>${esc(scoreVal(s.me.score))}</b><span>–</span><b>${esc(scoreVal(s.opp.score))}</b>${img(logoOf(s.opp.team), 'logo sm')}
      <small>${esc(s.st.shortDetail || 'LIVE')}</small><em>Game Center ›</em>`;
    document.body.classList.add('has-livebar');
  },

  tabTitle() {
    const s = this.s;
    if (s && s.live) document.title = `🔴 ${s.t.ab} ${scoreVal(s.me.score)}-${scoreVal(s.opp.score)} ${s.opp.team?.abbreviation || ''}`;
    else if (s && s.pre) document.title = `🔥 Game Day · ${s.t.ab} ${s.at} ${s.opp.team?.abbreviation || ''}`;
    else document.title = 'Office Chair QB';
  },

  renderHero(el) {
    const s = this.s;
    clearInterval(this.tick);
    if (!s || !(s.pre || s.live || s.final)) { el.innerHTML = ''; qs('.home-hero')?.classList.remove('hide'); return; }
    qs('.home-hero')?.classList.add('hide');
    const oppLogo = logoOf(s.opp.team), tv = broadcastOf(s.ev), venue = compOf(s.ev).venue?.fullName || '';
    const won = s.final && s.me.winner;
    const tag = s.live ? '<i class="dot"></i> LIVE NOW' : s.final ? (won ? '🎉 VICTORY' : 'FINAL') : '🔥 IT\'S GAME DAY';
    const mid = s.pre
      ? `<div class="gd-count" id="gdCount">${this.clock(s.ev.date)}</div><small>${esc(fmtTime(s.ev.date))}${tv ? ' · 📺 ' + esc(tv) : ''}</small>`
      : `<div class="gd-score">${esc(scoreVal(s.me.score))}<span>–</span>${esc(scoreVal(s.opp.score))}</div><small>${esc(s.st.shortDetail || '')}</small>`;
    el.innerHTML = `<button class="gd-hero ${won ? 'won' : ''}" data-gd="${s.t.lg}:${s.ev.id}" style="--tc:#${s.t.c};--ta:#${s.t.a};--tl:url('${esc(s.t.logo)}')">
      <span class="gd-banner">${tag}</span>
      <div class="gd-row">
        <div class="gd-side">${img(s.t.logo, 'logo gd-logo')}<b>${esc(s.t.ab || s.t.dn)}</b></div>
        <div class="gd-mid">${mid}</div>
        <div class="gd-side">${img(oppLogo, 'logo gd-logo')}<b>${esc(s.opp.team?.abbreviation || '')}</b></div>
      </div>
      <small class="gd-foot">${s.at === 'vs' ? '🏟️ Home' : '✈️ Away'}${venue ? ' · ' + esc(venue) : ''} · Tap for Game Center</small></button>`;
    if (s.pre) this.tick = setInterval(() => { const c = qs('#gdCount'); if (!c) return clearInterval(this.tick); c.textContent = this.clock(s.ev.date); }, 1000);
  },

  clock(date) {
    const ms = Math.max(0, new Date(date) - Date.now());
    const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), sec = Math.floor(ms % 6e4 / 1e3);
    return ms === 0 ? 'Kickoff!' : `${h}:${pad(m)}:${pad(sec)}`;
  },

  celebrate(force) {
    const id = this.s?.ev?.id; if (!id) return;
    const seen = LS.get('celebrated', []);
    if (!force && seen.includes(id)) return;
    LS.set('celebrated', [id, ...seen].slice(0, 20));
    confetti([`#${this.s.t.c}`, `#${this.s.t.a}`, '#ffffff']);
    toast(`🎉 ${this.s.t.dn} win ${scoreVal(this.s.me.score)}-${scoreVal(this.s.opp.score)}!`, 4000);
  }
};

/* Lightweight canvas confetti in team colors */
function confetti(colors) {
  const cv = document.createElement('canvas');
  cv.className = 'confetti'; document.body.appendChild(cv);
  const ctx = cv.getContext('2d'), W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  const N = 180, ps = Array.from({ length: N }, () => ({
    x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 26 * devicePixelRatio, vy: (-Math.random() * 22 - 8) * devicePixelRatio,
    w: (6 + Math.random() * 8) * devicePixelRatio, h: (4 + Math.random() * 6) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[Math.floor(Math.random() * colors.length)]
  }));
  const t0 = performance.now();
  const frame = t => {
    const el = t - t0; ctx.clearRect(0, 0, W, H);
    ps.forEach(p => { p.vy += .55 * devicePixelRatio; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - el / 4200); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); });
    if (el < 4200) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}
