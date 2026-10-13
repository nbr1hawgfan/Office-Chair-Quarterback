/* Office Chair QB — scrolling score ticker under the header */
const Ticker = {
  el: null, timer: null,
  on() { return LS.get('tickerOn', true); },
  async init() {
    clearTimeout(this.timer);
    if (!this.on()) { this.el?.remove(); this.el = null; document.body.classList.remove('has-ticker'); return; }
    if (!this.el) {
      this.el = document.createElement('div'); this.el.id = 'ticker';
      qs('.app-hdr').after(this.el);
      const setH = () => document.documentElement.style.setProperty('--hdr-h', qs('.app-hdr').offsetHeight + 'px');
      setH(); addEventListener('resize', setH);
      this.el.addEventListener('click', e => { const b = e.target.closest('[data-ev]'); if (b) openGame(b.dataset.lg, b.dataset.ev); });
      document.body.classList.add('has-ticker');
    }
    let next = 120000;
    try {
      const res = await pool(LEAGUE_ORDER, 5, async lg => ({ lg, ...(await fetchScoreboard(lg, {})) }));
      const favIds = new Set(Prefs.favs().map(f => f.lg + ':' + f.id));
      const items = [];
      res.filter(Boolean).forEach(r => r.events.forEach(ev => {
        const st = statusOf(ev);
        const recent = st.state === 'in' || sameDay(ev.date, new Date()) || (st.state === 'post' && Date.now() - new Date(ev.date) < 18 * 3600e3);
        if (!recent) return;
        const { away, home } = sides(ev);
        const fav = [away, home].some(c => favIds.has(r.lg + ':' + c.team?.id));
        items.push({ lg: r.lg, ev, st, away, home, fav, rank: (st.state === 'in' ? 0 : st.state === 'pre' ? 1 : 2) - (fav ? 3 : 0) });
      }));
      items.sort((a, b) => a.rank - b.rank || new Date(a.ev.date) - new Date(b.ev.date));
      if (items.some(i => i.st.state === 'in')) next = 45000;
      this.render(items.slice(0, 45));
    } catch (e) { }
    this.timer = setTimeout(() => this.init(), next);
  },
  render(items) {
    if (!this.el) return;
    if (!items.length) { this.el.innerHTML = `<div class="tk-track still"><span class="tk-msg">No games today — check Scores for the schedule</span></div>`; return; }
    let lastLg = '';
    const html = items.map(i => {
      const side = c => {
        const won = i.st.state === 'post' && c.winner;
        return `<span class="tk-tm ${won ? 'won' : ''}">${img(logoOf(c.team), 'tk-logo')}${esc(c.team?.abbreviation || '')}${i.st.state !== 'pre' ? ` <b>${esc(scoreVal(c.score))}</b>` : ''}</span>`;
      };
      const tag = i.lg !== lastLg ? `<span class="tk-lg">${lgIcon(i.lg, 'tk-lgi')}${LEAGUES[i.lg].short}</span>` : '';
      lastLg = i.lg;
      const status = i.st.state === 'pre' ? fmtTime(i.ev.date) : i.st.state === 'in' ? (i.st.shortDetail || 'LIVE') : 'F';
      return `${tag}<button class="tk ${i.fav ? 'fav' : ''} ${i.st.state === 'in' ? 'live' : ''}" data-lg="${i.lg}" data-ev="${i.ev.id}">${side(i.away)}${side(i.home)}<span class="tk-st">${i.st.state === 'in' ? '<i class="dot"></i>' : ''}${esc(status)}</span></button>`;
    }).join('');
    // two copies so the loop is seamless
    this.el.innerHTML = `<div class="tk-track"><div class="tk-run">${html}</div><div class="tk-run" aria-hidden="true">${html}</div></div>`;
    const run = qs('.tk-run', this.el);
    requestAnimationFrame(() => { const w = run.scrollWidth; this.el.style.setProperty('--tk-dur', Math.max(20, w / 55) + 's'); });
  }
};
