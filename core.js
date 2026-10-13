/* Office Chair QB — core utilities, data access, theme, sheets */
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/';
const STAND = 'https://site.api.espn.com/apis/v2/sports/';

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LS = {
  get(k, d) { try { const v = localStorage.getItem('ocq_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ocq_' + k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem('ocq_' + k); } catch (e) { } }
};

/* ---------- fetch with in-memory cache + Apps Script fallback ----------
   Some ESPN endpoints don't send CORS headers, so the browser blocks them.
   When a direct call fails, we retry through the Apps Script proxy and remember
   that endpoint pattern so later calls go straight to the proxy. */
const _mem = new Map();
const _route = LS.get('routes2', {}); // endpoint pattern → 'direct' | 'web' | 'proxy'
const urlPattern = u => u.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/#');
async function directJSON(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error('Feed returned ' + r.status);
  return r.json();
}
async function getJSON(url, ttlSec = 30) {
  const now = Date.now();
  const hit = _mem.get(url);
  if (hit && now - hit.t < ttlSec * 1000) return hit.d;
  const isEspn = /^https:\/\/site(\.web)?\.api\.espn\.com\//.test(url);
  if (!isEspn) { const d = await directJSON(url); _mem.set(url, { t: now, d }); return d; }
  // Try the remembered route first, then: direct → ESPN web host → Apps Script proxy
  const pat = urlPattern(url);
  const webUrl = url.replace('https://site.api.espn.com/', 'https://site.web.api.espn.com/');
  const routes = { direct: () => directJSON(url), web: () => directJSON(webUrl), proxy: () => viaProxy(url) };
  const order = ['direct', 'web', 'proxy'].filter(k => k !== 'web' || webUrl !== url).filter(k => k !== 'proxy' || gasUrl());
  if (_route[pat]) order.sort((a, b) => (b === _route[pat]) - (a === _route[pat]));
  let lastErr;
  for (const k of order) {
    try {
      const d = await routes[k]();
      if (_route[pat] !== k) { _route[pat] = k; LS.set('routes2', _route); }
      _mem.set(url, { t: now, d });
      return d;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
async function viaProxy(url) {
  const trim = /\/teams\?/.test(url) || /\/teams$/.test(url.split('?')[0]) ? 'teams' : '';
  const r = await fetch(gasUrl() + '?' + new URLSearchParams({ action: 'espn', u: url, trim }));
  const d = await r.json();
  if (d && d.error) throw new Error(d.error);
  return d;
}
function clearMem() { _mem.clear(); }

async function pool(items, n, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } }
  });
  await Promise.all(workers);
  return out;
}

/* ---------- formatting ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
const fmtTime = s => new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = s => new Date(s).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtDayLong = d => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const sameDay = (a, b) => ymd(new Date(a)) === ymd(new Date(b));
function timeAgo(s) {
  const m = Math.round((Date.now() - new Date(s)) / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}
function countdown(s) {
  const ms = new Date(s) - Date.now(); if (ms <= 0) return 'Now';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function logoOf(t) {
  if (!t) return '';
  if (t.logo) return t.logo;
  const l = t.logos || [];
  const dark = l.find(x => (x.rel || []).includes('dark'));
  return (dark || l[0] || {}).href || '';
}
const img = (src, cls = 'logo', alt = '') => src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="${cls} ph"></span>`;

/* League logo with emoji fallback if the image is missing */
function lgIcon(k, cls = 'lg-ico') {
  const L = LEAGUES[k];
  return `<img class="${cls}" src="${LEAGUE_LOGO(k)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;${cls} em&quot;>${L.icon}</span>'">`;
}

/* ---------- UI helpers ---------- */
function toast(msg, ms = 2400) {
  const t = qs('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
const loadingHTML = (txt = 'Loading…') => Theme.logo
  ? `<div class="loading"><img class="spin-logo" src="${esc(Theme.logo)}" alt="">${esc(txt)}</div>`
  : `<div class="loading"><span class="spin"></span>${esc(txt)}</div>`;
const emptyHTML = txt => `<div class="empty">${esc(txt)}</div>`;
function errHTML(e) {
  const msg = e && e.message === 'GAS_NOT_SET'
    ? 'This feature needs the Apps Script backend. Add the Web App URL in More → Settings.'
    : 'Couldn\'t load that right now. ' + esc(e && e.message || '');
  return `<div class="empty err">${msg}</div>`;
}

/* Full-screen stacked sheets (team pages, players, games) with phone back-button support */
const Sheets = {
  stack: [],
  open(title, render) {
    const el = document.createElement('section');
    el.className = 'sheet';
    el.innerHTML = `<header class="sheet-hd"><button class="icon-btn back" aria-label="Back">‹</button><h2>${esc(title)}</h2><span class="sheet-act"></span></header><div class="sheet-bd">${loadingHTML()}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    const ctx = { el, body: el.querySelector('.sheet-bd'), act: el.querySelector('.sheet-act'), alive: true, timers: [],
      setTitle(t) { el.querySelector('h2').textContent = t; } };
    el.querySelector('.back').onclick = () => history.back();
    this.stack.push(ctx);
    history.pushState({ sheet: this.stack.length }, '');
    Promise.resolve().then(() => render(ctx)).catch(e => { ctx.body.innerHTML = errHTML(e); });
    return ctx;
  },
  closeTop() {
    const ctx = this.stack.pop(); if (!ctx) return;
    ctx.alive = false; ctx.timers.forEach(clearInterval);
    ctx.el.classList.remove('open');
    setTimeout(() => ctx.el.remove(), 260);
  }
};
window.addEventListener('popstate', () => { if (Sheets.stack.length) Sheets.closeTop(); });

/* Segmented sub-tabs inside a container */
function subTabs(container, tabs, onPick, active) {
  const bar = document.createElement('div');
  bar.className = 'seg';
  bar.innerHTML = tabs.map(t => `<button data-k="${t.k}">${esc(t.label)}</button>`).join('');
  const body = document.createElement('div');
  container.append(bar, body);
  const pick = k => {
    qsa('button', bar).forEach(b => b.classList.toggle('on', b.dataset.k === k));
    body.innerHTML = loadingHTML();
    Promise.resolve(onPick(k, body)).catch(e => { body.innerHTML = errHTML(e); });
  };
  bar.onclick = e => { const b = e.target.closest('button'); if (b) pick(b.dataset.k); };
  pick(active || tabs[0].k);
  return { pick };
}

/* Tiny SVG line for win probability */
function sparkline(vals, w = 320, h = 70) {
  if (!vals.length) return '';
  const step = w / Math.max(vals.length - 1, 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - v * h).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none">
    <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" class="mid"/>
    <polyline points="${pts}" fill="none"/></svg>`;
}

/* ---------- Apps Script backend ---------- */
const gasUrl = () => (LS.get('gasUrl', '') || CONFIG.GAS_URL || '').trim();
async function gasGet(params) {
  const u = gasUrl(); if (!u) throw new Error('GAS_NOT_SET');
  const r = await fetch(u + '?' + new URLSearchParams(params));
  const d = await r.json(); if (d.error) throw new Error(d.error); return d;
}
async function gasPost(body) {
  const u = gasUrl(); if (!u) throw new Error('GAS_NOT_SET');
  const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const d = await r.json(); if (d.error) throw new Error(d.error); return d;
}

/* ---------- preferences / favorites ---------- */
const Prefs = {
  get() { return LS.get('prefs', { name: '', favs: [], theme: null }); },
  save(p) { LS.set('prefs', p); },
  favs() { return this.get().favs; },
  isFav(lg, id) { return this.favs().some(f => f.lg === lg && String(f.id) === String(id)); },
  toggleFav(t) {
    const p = this.get();
    const i = p.favs.findIndex(f => f.lg === t.lg && String(f.id) === String(t.id));
    if (i >= 0) p.favs.splice(i, 1); else p.favs.push(t);
    if (!p.theme && p.favs.length) p.theme = p.favs[0];
    if (p.theme && !p.favs.some(f => f.lg === p.theme.lg && f.id === p.theme.id)) p.theme = p.favs[0] || null;
    this.save(p); Theme.apply(p.theme); this.changed();
    return i < 0;
  },
  setTheme(t) { const p = this.get(); p.theme = t; if (!this.isFav(t.lg, t.id)) p.favs.push(t); this.save(p); Theme.apply(t); this.changed(); },
  changed() { if (typeof briefSync === 'function') briefSync(); if (typeof GameDay === 'object') GameDay.check(); }
};

/* Team list per league, trimmed + cached 7 days */
async function teamsFor(lg) {
  const key = 'teams:' + lg, c = LS.get(key);
  if (c && Date.now() - c.t < 7 * 864e5 && c.d.length) return c.d;
  let raw = [], hasColors = true;
  try {
    const d = await getJSON(SITE + LEAGUES[lg].path + '/teams?limit=1000', 3600);
    raw = (d.sports?.[0]?.leagues?.[0]?.teams || []).map(x => x.team);
  } catch (e) {
    // Fallback: pull teams out of the standings feed (no colors there; filled in when picked)
    const s = await getJSON(STAND + LEAGUES[lg].path + '/standings', 3600);
    const seen = new Set();
    const walk = n => { (n.standings?.entries || []).forEach(en => { const t = en.team; if (t && !seen.has(t.id)) { seen.add(t.id); raw.push(t); } }); (n.children || []).forEach(walk); };
    walk(s); hasColors = false;
    if (!raw.length) throw e;
  }
  const arr = raw.map(t => ({
    lg, id: String(t.id), loc: t.location, name: t.name, dn: t.displayName, ab: t.abbreviation,
    c: t.color || '444444', a: t.alternateColor || 'ffffff', logo: logoOf(t), nc: !hasColors || !t.color
  })).filter(t => t.dn).sort((a, b) => a.dn.localeCompare(b.dn));
  if (arr.length) LS.set(key, { t: Date.now(), d: arr });
  return arr;
}
/* Fill in a team's real colors/logo when the list came without them */
async function completeTeam(fav) {
  if (!fav.nc) return fav;
  try {
    const d = await getJSON(`${SITE}${LEAGUES[fav.lg].path}/teams/${fav.id}`, 3600);
    const t = d.team || {};
    return { ...fav, c: t.color || fav.c, a: t.alternateColor || fav.a, logo: logoOf(t) || fav.logo, loc: t.location || fav.loc, nc: false };
  } catch (e) { return fav; }
}
function favFromTeam(lg, t) {
  return { lg, id: String(t.id), loc: t.location || t.loc, name: t.name, dn: t.displayName || t.dn,
    ab: t.abbreviation || t.ab, c: t.color || t.c || '444444', a: t.alternateColor || t.a || 'ffffff', logo: t.logo || logoOf(t) };
}

/* ---------- Team color theme ---------- */
const Theme = {
  logo: '',
  rgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h || '555555', 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; },
  lum([r, g, b]) { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); },
  mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); },
  hex(c) { return '#' + c.map(v => pad(v.toString(16)).slice(-2)).join(''); },
  apply(t) {
    const root = document.documentElement.style;
    const defP = '1f6feb', defA = 'f2c94c';
    let p = this.rgb(t ? t.c : defP), a = this.rgb(t ? t.a : defA);
    if (this.lum(p) < 0.004) p = this.mix(p, [60, 60, 60], .5); // pure black primaries
    // readable accent text on the dark background: lighten primary until contrast is OK
    let txt = p, k = 0;
    while (this.lum(txt) < 0.16 && k < 10) { txt = this.mix(txt, [255, 255, 255], .14); k++; }
    if (this.lum(p) < 0.02 && this.lum(a) > 0.16) txt = a;
    root.setProperty('--p', this.hex(p));
    root.setProperty('--p-dark', this.hex(this.mix(p, [8, 10, 14], .55)));
    root.setProperty('--p-ink', this.lum(p) > 0.4 ? '#101114' : '#ffffff');
    root.setProperty('--a', this.hex(a));
    root.setProperty('--accent', this.hex(txt));
    root.setProperty('--p-rgb', p.join(','));
    const meta = qs('meta[name=theme-color]'); if (meta) meta.content = this.hex(this.mix(p, [8, 10, 14], .55));
    const lg = qs('#hdrLogo');
    if (lg) { lg.src = t && t.logo ? t.logo : 'icons/icon-192.png'; }
    const fan = this.fan || LS.get('prefs', {}).fan;
    const tt = qs('#hdrTeam'); if (tt) tt.textContent = [fan, t ? t.dn : 'Pick your team'].filter(Boolean).join(' · ');
    // team logo everywhere: header/sheet watermarks, loader, My Team tab icon, browser tab icon
    this.logo = t && t.logo ? t.logo : '';
    root.setProperty('--logo', this.logo ? `url("${this.logo}")` : 'none');
    const navIco = qs('#nav [data-tab="team"] span');
    if (navIco) navIco.innerHTML = this.logo ? `<img src="${esc(this.logo)}" alt="" class="nav-logo">` : '⭐';
    const fav = qs('link[rel=icon]'); if (fav) fav.href = this.logo || 'icons/icon-192.png';
  }
};

/* ---------- shared data helpers ---------- */
function compOf(ev) { return (ev.competitions || [])[0] || {}; }
function sides(ev) {
  const c = compOf(ev).competitors || [];
  return { away: c.find(x => x.homeAway === 'away') || c[0] || {}, home: c.find(x => x.homeAway === 'home') || c[1] || {} };
}
function scoreVal(s) { return s == null ? '' : typeof s === 'object' ? (s.displayValue ?? s.value ?? '') : s; }
function rankOf(cmp) { const r = cmp.curatedRank?.current; return r && r <= 25 ? r : null; }
function isSEC(ev) { const { away, home } = sides(ev); return [away, home].some(c => SEC_SCHOOLS.includes(c.team?.location)); }
function statusOf(ev) { return (ev.status || compOf(ev).status || {}).type || {}; }
function broadcastOf(ev) {
  const b = compOf(ev).broadcasts || [];
  const names = b.flatMap(x => x.names || []);
  if (names.length) return names.join(', ');
  const g = compOf(ev).geoBroadcasts || [];
  return g.map(x => x.media?.shortName).filter(Boolean).join(', ');
}
function leagueFromSearch(item) {
  const slug = item.defaultLeagueSlug;
  const map = { 'nfl': 'nfl', 'college-football': 'cfb', 'nba': 'nba', 'mens-college-basketball': 'mbb', 'womens-college-basketball': 'wbb',
    'mlb': 'mlb', 'college-baseball': 'cbase', 'college-softball': 'soft', 'nhl': 'nhl', 'wnba': 'wnba' };
  return map[slug] || null;
}
function athleteIdFromUid(uid) { const m = /a:(\d+)/.exec(uid || ''); return m ? m[1] : null; }
