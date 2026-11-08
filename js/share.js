/* Office Chair QB — Share cards
   Turns any game into a square image in team colors (logos, score, status, network) that people can
   text or drop in a group chat. Uses the phone's share sheet when it can, otherwise downloads the PNG. */

const ShareCard = {
  // ESPN logos load straight from their CDN; if a browser blocks that for canvas use, retry through a public image relay
  async loadImg(src) {
    if (!src) return null;
    return (await this.loadOne(src)) || this.loadOne('https://images.weserv.nl/?w=400&url=' + encodeURIComponent(src.replace(/^https?:\/\//, '')));
  },
  loadOne(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const im = new Image(); im.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 4000);
      im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); res(null); };
      im.src = src;
    });
  },
  hex(c, fb) { c = String(c || '').replace('#', ''); return /^[0-9a-f]{6}$/i.test(c) ? '#' + c : fb; },
  dark(hex, f = 0.55) { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) * f, g = ((n >> 8) & 255) * f, b = (n & 255) * f; return `rgb(${r | 0},${g | 0},${b | 0})`; },
  fit(ctx, text, max, size, weight = 800, family = 'Oswald, Inter, Arial, sans-serif') {
    let s = size; do { ctx.font = `${weight} ${s}px ${family}`; s -= 2; } while (ctx.measureText(text).width > max && s > 12); return ctx.font;
  },
  async draw(o) {
    const W = 1080, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    try { await document.fonts?.load?.('800 40px Oswald'); } catch (e) { }
    const ac = this.hex(o.away.color, '#444'), hc = this.hex(o.home.color, '#666');
    // background: diagonal split in team colors
    let g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, this.dark(ac, .9)); g.addColorStop(1, this.dark(ac, .45));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.beginPath(); c.moveTo(W * .62, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(W * .38, H); c.closePath(); c.clip();
    g = c.createLinearGradient(W, 0, 0, H); g.addColorStop(0, this.dark(hc, .9)); g.addColorStop(1, this.dark(hc, .45));
    c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(0, 0, W, H);
    // top line: league + date
    c.fillStyle = 'rgba(255,255,255,.85)'; c.textAlign = 'center';
    c.font = '700 34px Inter, Arial, sans-serif'; c.fillText(o.top, W / 2, 92);
    if (o.note) { c.font = '700 30px Inter, Arial, sans-serif'; c.fillStyle = '#ffd400'; c.fillText(o.note, W / 2, 140); }
    // teams
    const [la, lh] = await Promise.all([this.loadImg(o.away.logo), this.loadImg(o.home.logo)]);
    const team = (t, im, x, win, faded) => {
      c.save(); c.globalAlpha = faded ? .55 : 1;
      if (im) { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 24; c.drawImage(im, x - 150, 220, 300, 300); c.shadowBlur = 0; }
      else { c.fillStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.arc(x, 370, 140, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = this.fit(c, t.ab, 240, 110); c.fillText(t.ab, x, 410); }
      c.fillStyle = '#fff'; c.font = this.fit(c, (t.rank ? '#' + t.rank + ' ' : '') + t.name, 440, 54);
      c.fillText((t.rank ? '#' + t.rank + ' ' : '') + t.name, x, 590);
      if (t.rec) { c.font = '600 30px Inter, Arial, sans-serif'; c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText(t.rec, x, 635); }
      if (o.showScore) {
        c.fillStyle = '#fff'; c.font = '800 190px Oswald, Inter, Arial, sans-serif'; c.fillText(t.score, x, 840);
        if (win) { c.font = '800 46px Inter, Arial, sans-serif'; c.fillStyle = '#ffd400'; c.fillText('WIN', x, 900); }
      }
      c.restore();
    };
    team(o.away, la, W * .25, o.winner === 'away', o.winner === 'home');
    team(o.home, lh, W * .75, o.winner === 'home', o.winner === 'away');
    // middle
    c.fillStyle = '#fff'; c.textAlign = 'center';
    if (o.showScore) { c.font = '800 80px Oswald, Inter, Arial, sans-serif'; c.fillStyle = 'rgba(255,255,255,.6)'; c.fillText('–', W / 2, 800); }
    else { c.font = '800 120px Oswald, Inter, Arial, sans-serif'; c.fillText(o.vs || '@', W / 2, 420); }
    // status pill
    c.font = '800 44px Inter, Arial, sans-serif';
    const sw = Math.min(W - 120, c.measureText(o.status).width + 80);
    c.fillStyle = o.live ? '#e53935' : 'rgba(0,0,0,.55)';
    this.round(c, W / 2 - sw / 2, o.showScore ? 935 : 700, sw, 76, 38); c.fill();
    c.fillStyle = '#fff'; c.font = this.fit(c, o.status, sw - 50, 44, 800, 'Inter, Arial, sans-serif'); c.fillText(o.status, W / 2, (o.showScore ? 935 : 700) + 52);
    if (!o.showScore && o.sub) { c.font = '600 36px Inter, Arial, sans-serif'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(o.sub, W / 2, 850); }
    // footer brand
    c.font = '800 28px Inter, Arial, sans-serif'; c.fillStyle = 'rgba(255,255,255,.7)'; c.textAlign = 'right';
    c.fillText('🏈 OFFICE CHAIR QB', W - 40, H - 30);
    if (o.by) { c.textAlign = 'left'; c.fillText('via ' + o.by, 40, H - 30); }
    return cv;
  },
  round(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); },
  fromGame(lg, comp, away, home) {
    const st = comp.status?.type || {}, done = st.state === 'post', live = st.state === 'in';
    const T = cp => ({ name: cp.team?.shortDisplayName || cp.team?.displayName || '', ab: cp.team?.abbreviation || '', logo: logoOf(cp.team), color: cp.team?.color,
      rank: rankOf(cp), rec: (cp.record || cp.records || [])[0]?.summary || '', score: scoreVal(cp.score) });
    const a = T(away), h = T(home);
    const winner = done ? (away.winner ? 'away' : home.winner ? 'home' : (Number(a.score) > Number(h.score) ? 'away' : Number(h.score) > Number(a.score) ? 'home' : '')) : '';
    const tv = (comp.broadcasts || []).map(b => b.media?.shortName || (b.names || [])[0]).filter(Boolean)[0] || '';
    const note = (comp.notes || [])[0]?.headline || '';
    const p = Prefs.get();
    return {
      away: a, home: h, winner, live, showScore: st.state !== 'pre',
      top: `${LEAGUES[lg].name.toUpperCase()} · ${fmtDay(comp.date)}`, note: note.length < 46 ? note : '',
      status: done ? (st.shortDetail || 'FINAL').toUpperCase() : live ? '● LIVE · ' + (st.shortDetail || '') : fmtTime(comp.date) + (tv ? ' · ' + tv : ''),
      sub: st.state === 'pre' ? fmtDayLong(new Date(comp.date)) : '', by: p.fan || '',
      text: done ? `${a.ab} ${a.score}, ${h.ab} ${h.score} — Final` : live ? `${a.ab} ${a.score}, ${h.ab} ${h.score} — ${st.shortDetail || 'Live'}` : `${a.ab} @ ${h.ab} — ${fmtDay(comp.date)} ${fmtTime(comp.date)}${tv ? ' on ' + tv : ''}`
    };
  },
  /* Division / conference table card. o = { title, sub, cols:[label], rows:[{ logo, ab, name, color, vals:[], fav }], lg, by } */
  async drawTable(o) {
    const W = 1080, top = 250, rowH = Math.max(96, Math.min(150, Math.floor((1080 - top - 150) / Math.max(1, o.rows.length)))), H = Math.max(1080, top + o.rows.length * rowH + 150);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    try { await document.fonts?.load?.('800 40px Oswald'); } catch (e) { }
    const lead = this.hex(o.rows[0]?.color, '#333');
    let g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, this.dark(lead, .75)); g.addColorStop(.55, '#111418'); g.addColorStop(1, '#0b0d10');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.8)'; c.font = '700 32px Inter, Arial, sans-serif'; c.fillText(o.sub, W / 2, 80);
    c.fillStyle = '#fff'; c.font = this.fit(c, o.title.toUpperCase(), W - 120, 76); c.fillText(o.title.toUpperCase(), W / 2, 160);
    // column headers
    const colX = o.cols.map((_, i) => W - 70 - (o.cols.length - 1 - i) * 118);
    c.font = '800 26px Inter, Arial, sans-serif'; c.fillStyle = 'rgba(255,255,255,.6)';
    o.cols.forEach((l, i) => c.fillText(l, colX[i], top - 22));
    const logos = await Promise.all(o.rows.map(r => this.loadImg(r.logo)));
    o.rows.forEach((r, i) => {
      const y = top + i * rowH;
      if (r.fav) { c.fillStyle = 'rgba(255,212,0,.16)'; this.round(c, 30, y + 6, W - 60, rowH - 12, 18); c.fill(); }
      else if (i % 2 === 0) { c.fillStyle = 'rgba(255,255,255,.05)'; this.round(c, 30, y + 6, W - 60, rowH - 12, 18); c.fill(); }
      c.textAlign = 'center'; c.fillStyle = i === 0 ? '#ffd400' : 'rgba(255,255,255,.7)'; c.font = '800 38px Oswald, Inter, Arial, sans-serif';
      c.fillText(i === 0 ? '👑' : String(i + 1), 78, y + rowH / 2 + 13);
      if (logos[i]) c.drawImage(logos[i], 120, y + (rowH - 68) / 2, 68, 68);
      else { c.fillStyle = this.hex(r.color, '#555'); c.beginPath(); c.arc(154, y + rowH / 2, 32, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '800 22px Inter, Arial, sans-serif'; c.fillText(r.ab.slice(0, 4), 154, y + rowH / 2 + 8); }
      c.textAlign = 'left'; c.fillStyle = '#fff';
      c.font = this.fit(c, r.name, colX[0] - 300, 44, r.fav ? 800 : 700, 'Inter, Arial, sans-serif'); c.fillText(r.name, 210, y + rowH / 2 + 15);
      c.textAlign = 'center'; c.font = '700 36px Inter, Arial, sans-serif';
      r.vals.forEach((v, k) => { c.fillStyle = k === 0 ? '#fff' : 'rgba(255,255,255,.85)'; c.fillText(String(v ?? ''), colX[k], y + rowH / 2 + 13); });
    });
    c.font = '800 28px Inter, Arial, sans-serif'; c.fillStyle = 'rgba(255,255,255,.7)'; c.textAlign = 'right';
    c.fillText('🏈 OFFICE CHAIR QB', W - 40, H - 34);
    if (o.by) { c.textAlign = 'left'; c.fillText('via ' + o.by, 40, H - 34); }
    return cv;
  },
  async shareTable(o) { return this.share(o, () => this.drawTable(o)); },
  async share(o, build) {
    toast('Making your share card…');
    const cv = await (build ? build() : this.draw(o));
    let blob = null;
    try { blob = await new Promise(r => cv.toBlob(r, 'image/png')); } catch (e) { blob = null; }
    if (!blob) { toast('Couldn\'t build the image on this device', 3500); return; }
    const name = (o.file || (o.away.ab + '-' + o.home.ab)).replace(/[^\w-]/g, '') + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    const text = o.text + ' 🏈 via Office Chair QB';
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('📸 Saved the share card — send it anywhere');
  }
};
