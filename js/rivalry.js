/* Office Chair QB — Office Rivalry Board: everyone's team, bragging rights, trash talk */
const REACTS = ['🔥', '😂', '🗑️', '👏'];

async function loadRivals() {
  const c = pickemCreds(); if (!c || !gasUrl()) return null;
  const key = 'rivals', hit = _mem.get(key);
  if (hit && Date.now() - hit.t < 60000) return hit.d;
  const d = (await gasGet({ action: 'rivals', code: c.code })).rivals || [];
  _mem.set(key, { t: Date.now(), d });
  return d;
}

/* Season form for one team from its schedule */
async function teamForm(r) {
  const L = LEAGUES[r.lg]; if (!L) return null;
  const d = await getJSON(`${SITE}${L.path}/teams/${r.id}/schedule`, 120);
  const evs = (d.events || []).sort((a, b) => new Date(a.date) - new Date(b.date));
  const res = []; let live = null, next = null, last = null;
  evs.forEach(ev => {
    const { away, home } = sides(ev), st = statusOf(ev);
    const isHome = String(home.team?.id) === String(r.id), me = isHome ? home : away, opp = isHome ? away : home;
    const g = { ev, me, opp, at: isHome ? 'vs' : '@', st };
    if (st.state === 'in') live = g;
    else if (st.state === 'post' || st.completed) { if (me.winner === true || me.winner === false) { res.push(me.winner ? 'W' : 'L'); last = g; } }
    else if (!next) next = g;
  });
  const w = res.filter(x => x === 'W').length, l = res.length - w;
  let streak = 0; for (let i = res.length - 1; i >= 0 && res[i] === res[res.length - 1]; i--) streak++;
  return { w, l, pct: res.length ? w / res.length : 0, form: res.slice(-5), streak: res.length ? (res[res.length - 1] === 'W' ? streak : -streak) : 0, live, next, last };
}

function rivalStatus(f, short) {
  if (!f) return '';
  const sc = g => `${scoreVal(g.me.score)}-${scoreVal(g.opp.score)}`;
  const oppAb = g => g.opp.team?.abbreviation || g.opp.team?.shortDisplayName || '';
  if (f.live) return `<i class="dot"></i>LIVE ${sc(f.live)}${short ? '' : ' ' + f.live.at + ' ' + esc(oppAb(f.live))}`;
  if (f.last && sameDay(f.last.ev.date, new Date())) return `${f.last.me.winner ? '<b class="w">W</b>' : '<b class="l">L</b>'} ${sc(f.last)}${short ? '' : ' ' + f.last.at + ' ' + esc(oppAb(f.last))}`;
  if (f.next) return `${f.next.at} ${esc(oppAb(f.next))} · ${sameDay(f.next.ev.date, new Date()) ? fmtTime(f.next.ev.date) : esc(fmtDay(f.next.ev.date))}`;
  if (f.last) return `${f.last.me.winner ? '<b class="w">W</b>' : '<b class="l">L</b>'} ${sc(f.last)} ${f.last.at} ${esc(oppAb(f.last))}`;
  return 'Off-season';
}
const streakIcon = s => s >= 3 ? '🔥🔥' : s >= 2 ? '🔥' : s <= -3 ? '🥶🥶' : s <= -2 ? '🥶' : '';

/* Rivalry games: two co-workers' teams playing each other (live or upcoming) */
function rivalryGames(list) {
  const out = [], seen = new Set();
  list.forEach(({ r, f }) => {
    const g = f && (f.live || f.next); if (!g) return;
    const other = list.find(x => x.r !== r && x.r.lg === r.lg && String(x.r.id) === String(g.opp.team?.id));
    if (!other || seen.has(g.ev.id)) return;
    seen.add(g.ev.id);
    out.push({ a: r, b: other.r, g, lg: r.lg });
  });
  return out.filter(x => x.g.st.state === 'in' || new Date(x.g.ev.date) - Date.now() < 8 * 864e5);
}
function rivalryBannerHTML(x) {
  const live = x.g.st.state === 'in';
  return `<button class="rv-banner" data-gd="${x.lg}:${x.g.ev.id}" style="--tc:#${x.a.c || '333'};--tc2:#${x.b.c || '333'}">
    <span class="rv-tag">${live ? '<i class="dot"></i> LIVE RIVALRY' : '⚔️ RIVALRY GAME'}</span>
    <div class="rv-vs">${img(x.a.logo, 'logo lg')}<div><b>${esc(x.a.name)}</b><small>${esc(x.a.loc || x.a.dn)}</small></div>
      <span class="rv-mid">${live ? `${esc(scoreVal(x.g.me.score))}–${esc(scoreVal(x.g.opp.score))}` : 'vs'}</span>
      <div class="r"><b>${esc(x.b.name)}</b><small>${esc(x.b.loc || x.b.dn)}</small></div>${img(x.b.logo, 'logo lg')}</div>
    <small class="rv-when">${live ? esc(x.g.st.shortDetail || '') : esc(fmtDay(x.g.ev.date) + ' · ' + fmtTime(x.g.ev.date))}</small></button>`;
}

async function rivalsWithForm() {
  const rivals = await loadRivals();
  if (!rivals) return null;
  const forms = await pool(rivals, 4, r => teamForm(r));
  return rivals.map((r, i) => ({ r, f: forms[i] }));
}

/* ---------- Home card ---------- */
async function homeRivalryCard(el) {
  if (!pickemCreds() || !gasUrl()) { el.innerHTML = ''; return; }
  try {
    const list = await rivalsWithForm();
    if (!el.isConnected) return;
    if (!list || !list.length) { el.innerHTML = `<button class="rv-empty" data-go="rival">⚔️ <b>Office Rivalry</b><small>Rep your team — be the first on the board</small></button>`; return; }
    const games = rivalryGames(list);
    const order = list.slice().sort((a, b) => (b.f?.live ? 2 : 0) - (a.f?.live ? 2 : 0) || (b.f?.pct || 0) - (a.f?.pct || 0));
    el.innerHTML = `<h3 class="sec-h">Office Rivalry <small>${list.length}</small></h3>${games.map(rivalryBannerHTML).join('')}
      <div class="rv-strip">${order.map(({ r, f }) => `<button class="rv-mini" data-go="rival" style="--tc:#${r.c || '333'};--ta:#${r.a || 'fff'}">
        ${img(r.logo, 'logo lg')}<b>${esc(r.name)}</b><small>${rivalStatus(f, true)}</small><i>${f ? `${f.w}-${f.l}` : ''} ${streakIcon(f?.streak || 0)}</i></button>`).join('')}</div>`;
  } catch (e) { el.innerHTML = ''; }
}

/* ---------- Full board ---------- */
function openRivalry(startTab) {
  Sheets.open('Office Rivalry ⚔️', ctx => {
    if (!gasUrl()) { ctx.body.innerHTML = errHTML(new Error('GAS_NOT_SET')); return; }
    if (!pickemCreds()) {
      ctx.body.innerHTML = `<div class="hero-empty"><h2>⚔️ Office Rivalry</h2><p>Sign in once with the office league (same name & PIN as Pick'em) to rep your team and talk trash.</p><button class="btn" id="rvJoin">Sign in / join</button></div>`;
      qs('#rvJoin', ctx.body).onclick = () => { history.back(); setTimeout(openPickem, 350); };
      return;
    }
    ctx.body.innerHTML = '';
    subTabs(ctx.body, [{ k: 'board', label: '⚔️ Board' }, { k: 'brag', label: '🏆 Bragging Rights' }, { k: 'wall', label: '🗑️ Trash Talk' }],
      (k, body) => k === 'board' ? rivalBoard(body, ctx) : k === 'brag' ? rivalBrag(body) : rivalWall(body, ctx), startTab);
  });
}

function repBarHTML(me) {
  const favs = Prefs.favs();
  if (!favs.length) return `<div class="card rep"><b>Rep your team</b><p class="hint">Follow a team first (Teams & Colors), then come back.</p></div>`;
  return `<div class="card rep"><b>${me ? 'Repping' : 'Rep your team on the board'}</b>
    <div class="chips">${favs.map(f => `<button data-rep="${f.lg}:${f.id}" class="${me && me.lg === f.lg && String(me.id) === String(f.id) ? 'on' : ''}">${img(f.logo, 'logo xs')}${esc(f.ab || f.dn)} <small>${LEAGUES[f.lg].short}</small></button>`).join('')}</div></div>`;
}

async function rivalBoard(body, ctx) {
  const creds = pickemCreds();
  const list = await rivalsWithForm();
  const me = list.find(x => x.r.name.toLowerCase() === creds.name.toLowerCase())?.r;
  const games = rivalryGames(list);
  const order = list.slice().sort((a, b) => {
    const rank = f => f?.live ? 3 : f?.last && sameDay(f.last.ev.date, new Date()) ? 2 : f?.next && sameDay(f.next.ev.date, new Date()) ? 1 : 0;
    return rank(b.f) - rank(a.f) || (b.f?.pct || 0) - (a.f?.pct || 0);
  });
  body.innerHTML = repBarHTML(me) + games.map(rivalryBannerHTML).join('') + (order.length ? `<div class="rv-list">${order.map(({ r, f }) => {
    const mine = me && r.name === me.name;
    const lostRecently = f?.last && !f.last.me.winner && Date.now() - new Date(f.last.ev.date) < 4 * 864e5;
    return `<div class="rv-row ${mine ? 'mine' : ''}" style="--tc:#${r.c || '333'};--ta:#${r.a || 'fff'}">
      <button class="rv-team" data-team="${r.lg}:${r.id}">${img(r.logo, 'logo lg')}</button>
      <div class="rv-info"><b>${esc(r.name)} ${streakIcon(f?.streak || 0)}</b><small>${esc(r.dn)} · ${f ? `${f.w}-${f.l}` : ''}</small>
        <span class="rv-st">${rivalStatus(f)}</span>
        <span class="form">${(f?.form || []).map(x => `<i class="${x === 'W' ? 'fw' : 'fl'}">${x}</i>`).join('')}</span></div>
      ${!mine && lostRecently ? `<button class="trash-btn" data-trash="${esc(r.name)}" data-team-name="${esc(r.loc || r.dn)}">🗑️</button>` : ''}
      ${(f?.live || f?.last) ? `<button class="icon-btn sm" data-gd="${r.lg}:${(f.live || f.last).ev.id}">📺</button>` : ''}</div>`;
  }).join('')}</div>` : emptyHTML('Nobody on the board yet — rep your team above!'));
  body.onclick = async e => {
    const rep = e.target.closest('[data-rep]');
    if (rep) {
      const [lg, id] = rep.dataset.rep.split(':'); const t = Prefs.favs().find(f => f.lg === lg && String(f.id) === id);
      try { await gasPost({ action: 'setRival', code: creds.code, name: creds.name, pin: creds.pin, team: t }); _mem.delete('rivals'); toast(`Repping ${t.dn} 💪`); body.innerHTML = loadingHTML(); rivalBoard(body, ctx).catch(er => body.innerHTML = errHTML(er)); }
      catch (er) { toast(er.message, 4000); }
      return;
    }
    const tr = e.target.closest('[data-trash]');
    if (tr) { LS.set('wallDraft', `@${tr.dataset.trash} how 'bout them ${tr.dataset.teamName}? 🗑️ `); qsa('.seg button', ctx.body).find(b => b.dataset.k === 'wall')?.click(); return; }
    const gd = e.target.closest('[data-gd]'); if (gd) { const [lg, ev] = gd.dataset.gd.split(':'); return openGame(lg, ev); }
    const tm = e.target.closest('[data-team]'); if (tm) { const [lg, id] = tm.dataset.team.split(':'); return openTeam(lg, id); }
  };
}

async function rivalBrag(body) {
  const list = (await rivalsWithForm()).filter(x => x.f);
  const ranked = list.sort((a, b) => b.f.pct - a.f.pct || b.f.w - a.f.w || a.f.l - b.f.l);
  const me = pickemCreds().name.toLowerCase();
  body.innerHTML = ranked.length ? `<p class="hint">Ranked by your team's win percentage this season. 🔥 = win streak, 🥶 = losing streak.</p>
    <div class="board">${ranked.map(({ r, f }, i) => `<div class="bd-row ${r.name.toLowerCase() === me ? 'me' : ''}" style="--tc:#${r.c || '333'}">
      <b class="bd-rk">${i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</b>${img(r.logo, 'logo')}
      <span>${esc(r.name)} ${streakIcon(f.streak)}<small>${esc(r.dn)} · ${LEAGUES[r.lg]?.short || ''}</small></span>
      <span class="bd-sc"><b>${f.w}-${f.l}</b><small>${(f.pct * 100).toFixed(0)}%${f.streak ? ` · ${f.streak > 0 ? 'W' : 'L'}${Math.abs(f.streak)}` : ''}</small></span></div>`).join('')}</div>
    ${ranked.length > 1 ? `<p class="src">${esc(ranked[ranked.length - 1].r.name)} is buying lunch. 🍔</p>` : ''}` : emptyHTML('No records yet.');
}

async function rivalWall(body, ctx) {
  const creds = pickemCreds();
  const rivals = (await loadRivals()) || [];
  const byName = {}; rivals.forEach(r => byName[r.name.toLowerCase()] = r);
  body.innerHTML = `<div class="composer"><textarea id="wTxt" maxlength="240" rows="2" placeholder="Talk some trash…">${esc(LS.get('wallDraft', ''))}</textarea>
    <div class="comp-row"><span class="quick-trash">${['🐗 WPS!', '🔥 Called it', '😂 Rough day', '🗑️ Overrated'].map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</span><button class="btn post" id="wGo">Post</button></div></div>
    <div id="wList">${loadingHTML()}</div>`;
  LS.del('wallDraft');
  const listEl = qs('#wList', body);
  const draw = async () => {
    const posts = (await gasGet({ action: 'wall', code: creds.code })).posts || [];
    if (!body.isConnected) return;
    listEl.innerHTML = posts.length ? posts.map(p => {
      const r = byName[String(p.name).toLowerCase()];
      return `<div class="post" style="--tc:#${r?.c || '333'}">${img(r?.logo, 'logo')}<div class="post-bd"><b>${esc(p.name)}</b> <small>${esc(r?.ab || '')} · ${timeAgo(p.t)}</small>
        <p>${esc(p.text).replace(/@([A-Za-z][\w ]{0,20}?)(?=\s|$|[,.!?])/g, '<em>@$1</em>')}</p>
        <div class="reacts">${REACTS.map(em => { const who = p.reacts?.[em] || []; const on = who.some(n => n.toLowerCase() === creds.name.toLowerCase());
          return `<button class="${on ? 'on' : ''}" data-react="${p.id}" data-em="${em}" title="${esc(who.join(', '))}">${em}${who.length ? ` ${who.length}` : ''}</button>`; }).join('')}</div></div></div>`;
    }).join('') : emptyHTML('Quiet in here… start the trash talk.');
  };
  await draw();
  const t = setInterval(() => body.isConnected && ctx.alive ? draw().catch(() => { }) : clearInterval(t), 30000);
  ctx.timers.push(t);
  body.onclick = async e => {
    const q = e.target.closest('[data-q]'); if (q) { const ta = qs('#wTxt', body); ta.value = (ta.value + ' ' + q.dataset.q).trim() + ' '; ta.focus(); return; }
    if (e.target.id === 'wGo') {
      const ta = qs('#wTxt', body), text = ta.value.trim(); if (!text) return toast('Say something!');
      e.target.disabled = true;
      try { await gasPost({ action: 'post', code: creds.code, name: creds.name, pin: creds.pin, text }); ta.value = ''; await draw(); }
      catch (er) { toast(er.message, 4000); }
      e.target.disabled = false; return;
    }
    const rb = e.target.closest('[data-react]');
    if (rb) { try { await gasPost({ action: 'react', code: creds.code, name: creds.name, pin: creds.pin, id: rb.dataset.react, emoji: rb.dataset.em }); await draw(); } catch (er) { toast(er.message); } }
  };
}
