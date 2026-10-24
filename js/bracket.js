/* Office Chair QB — Office March Madness Bracket Challenge (men's NCAA tournament)
   Round-by-round format so nobody's bracket is dead by Friday:
   • Before the first round tips: pick a champion (+25) and one Final Four team from each region (+5 each).
   • Each round, pick the winner of every game once the matchups are set. Points double each round: 1 · 2 · 4 · 8 · 16 · 32.
   Uses the same office sign-in as Pick'em. Picks lock at each game's tip. */

const MM_ROUNDS = [['r64', '1st Round', 1], ['r32', '2nd Round', 2], ['s16', 'Sweet 16', 4], ['e8', 'Elite 8', 8], ['f4', 'Final Four', 16], ['ncg', 'Title Game', 32]];
const MM_REGIONS = ['East', 'West', 'South', 'Midwest'];
function mmRound(ev) {
  const h = PS_HEAD(ev);
  if (/first four/i.test(h)) return 'ff';
  if (/1st round|first round/i.test(h)) return 'r64';
  if (/2nd round|second round/i.test(h)) return 'r32';
  if (/sweet 16|sweet sixteen|regional semifinal/i.test(h)) return 's16';
  if (/elite 8|elite eight|regional final/i.test(h)) return 'e8';
  if (/final four|national semifinal/i.test(h)) return 'f4';
  if (/national championship|championship game|title game/i.test(h)) return 'ncg';
  return null;
}
const mmRegion = ev => (/(East|West|South|Midwest)\s+Region/i.exec(PS_HEAD(ev)) || [])[1] || '';
const mmYear = () => { const n = new Date(); return n.getMonth() >= 4 ? n.getFullYear() + 1 : n.getFullYear(); };
const mmSelection = y => firstSunday(y, 2, 11);
const mmSeed = c => c.seed || (c.curatedRank?.current && c.curatedRank.current <= 16 ? c.curatedRank.current : '');
async function mmEvents(y) {
  const last = new Date(Math.min(new Date(y, 3, 9), Date.now() + 3 * 864e5));
  const dates = dayList(new Date(y, 2, 12), last);
  return fetchDays('mbb', dates, ev => /basketball championship/i.test(PS_HEAD(ev)) && !!mmRound(ev), 300);
}

function openBracket() {
  Sheets.open('🏀 Bracket Challenge', async ctx => {
    if (!gasUrl()) { ctx.body.innerHTML = errHTML(new Error('GAS_NOT_SET')); return; }
    const y = mmYear(), sel = mmSelection(y), now = new Date();
    const rules = `<div class="sv-rules"><b>How it works:</b> before tip-off, pick your <b>champion (+25)</b> and a <b>Final Four team from each region (+5 each)</b>.
      Then pick every game round by round as matchups are set — points double each round: <b>1 · 2 · 4 · 8 · 16 · 32</b>. No busted brackets: a bad Thursday doesn't sink your Sweet 16 picks.</div>`;
    if (now < sel) {
      ctx.body.innerHTML = `<div class="cws-hero"><span>🏀</span><div><b>Office Bracket Challenge ${y}</b><small>Selection Sunday is ${fmtDay(sel)} — about <b>${countdown(sel)}</b> away</small></div></div>${rules}
        <p class="hint">The bracket opens here the moment the field is announced. Same sign-in as Pick'em, and everyone's picks stay hidden until the games tip.</p>`;
      return;
    }
    const creds = pickemCreds();
    if (!creds) { ctx.body.innerHTML = rules + `<button class="btn" id="mmJoin">Sign in to play</button>`; qs('#mmJoin', ctx.body).onclick = () => { history.back(); setTimeout(openPickem, 350); }; return; }
    const evs = await mmEvents(y);
    if (!evs.length) { ctx.body.innerHTML = rules + emptyHTML('The bracket is set — games will show up here as soon as ESPN posts them.'); return; }
    const mine = await gasGet({ action: 'bracketMine', code: creds.code, name: creds.name, pin: creds.pin, season: y }).then(d => d.picks || {});
    const st = { y, evs, mine, creds };
    ctx.body.innerHTML = rules.replace('sv-rules', 'sv-rules small');
    subTabs(ctx.body, [{ k: 'picks', label: '🎯 Game Picks' }, { k: 'champ', label: '👑 Champ & Final 4' }, { k: 'board', label: '🏆 Leaderboard' }],
      (k, body) => k === 'picks' ? mmPicks(body, st) : k === 'champ' ? mmChamp(body, st) : mmBoard(body, st),
      evs.some(ev => mmRound(ev) === 'r64' && statusOf(ev).state !== 'pre') ? 'picks' : 'champ');
  });
}

const r64Ids = st => st.evs.filter(ev => mmRound(ev) === 'r64').map(ev => ev.id);

function mmPicks(body, st) {
  const rounds = MM_ROUNDS.filter(([k]) => st.evs.some(ev => mmRound(ev) === k));
  if (!rounds.length) { body.innerHTML = emptyHTML('First-round games aren\'t posted yet.'); return; }
  let rk = (rounds.find(([k]) => st.evs.some(ev => mmRound(ev) === k && statusOf(ev).state === 'pre')) || rounds[rounds.length - 1])[0];
  const sel = {};
  Object.entries(st.mine).forEach(([k, v]) => { if (k.startsWith('game:')) sel[k.slice(5)] = v.teamId; });
  const draw = () => {
    const R = MM_ROUNDS.find(r => r[0] === rk), games = st.evs.filter(ev => mmRound(ev) === rk);
    const groups = {}; games.forEach(ev => { const g = mmRegion(ev) || R[1]; (groups[g] = groups[g] || []).push(ev); });
    const order = Object.keys(groups).sort((a, b) => MM_REGIONS.indexOf(a) - MM_REGIONS.indexOf(b));
    const open = games.filter(g => statusOf(g).state === 'pre');
    body.innerHTML = `<div class="chips" id="mmR">${rounds.map(([k, l, pts]) => `<button data-k="${k}" class="${k === rk ? 'on' : ''}">${l} <small>${pts} pt${pts > 1 ? 's' : ''}</small></button>`).join('')}</div>
      <div class="pk-head"><b>${R[1]} · ${R[2]} point${R[2] > 1 ? 's' : ''} each</b><span>${games.filter(g => sel[g.id]).length}/${games.length} picked</span></div>
      ${order.map(g => `<h3 class="sec-h">${esc(g)}${MM_REGIONS.includes(g) ? ' Region' : ''}</h3><div class="pk-list">${groups[g].map(ev => {
        const { away, home } = sides(ev), s = statusOf(ev), locked = s.state !== 'pre';
        const btn = c => {
          const t = c.team || {}, on = String(sel[ev.id]) === String(t.id), tbd = !t.id;
          return `<button class="pk-team ${on ? 'on' : ''} ${s.state === 'post' && c.winner ? 'won' : ''} ${s.state === 'post' && on && !c.winner ? 'lost' : ''}" data-g="${ev.id}" data-t="${t.id || ''}" data-ab="${esc(t.shortDisplayName || t.abbreviation || '')}" ${locked || tbd ? 'disabled' : ''}>
            ${tbd ? '<span class="logo sm ph"></span>' : img(logoOf(t), 'logo sm')}<span>${mmSeed(c) ? `<b class="rk">${mmSeed(c)}</b>` : ''}${esc(tbd ? 'TBD' : t.shortDisplayName || t.abbreviation || '')}</span>
            ${s.state !== 'pre' ? `<b class="pk-sc">${esc(scoreVal(c.score))}</b>` : ''}</button>`;
        };
        return `<div class="pk-game ${locked ? 'locked' : ''}"><div class="pk-meta">${esc(locked ? s.shortDetail || '' : fmtDay(ev.date) + ' · ' + fmtTime(ev.date) + (broadcastOf(ev) ? ' · ' + broadcastOf(ev) : ''))}${locked ? ' 🔒' : ''}</div>
          <div class="pk-row">${btn(away)}<span class="at">vs</span>${btn(home)}</div></div>`;
      }).join('')}</div>`).join('')}
      ${open.length ? `<button class="btn sticky" id="mmSave">Save ${R[1]} picks</button>` : ''}`;
  };
  draw();
  body.onclick = async e => {
    const r = e.target.closest('#mmR button'); if (r) { rk = r.dataset.k; return draw(); }
    const b = e.target.closest('.pk-team'); if (b && !b.disabled) { sel[b.dataset.g] = b.dataset.t; b.closest('.pk-row').querySelectorAll('.pk-team').forEach(x => x.classList.toggle('on', x === b)); return; }
    const sv = e.target.closest('#mmSave'); if (!sv) return;
    const games = st.evs.filter(ev => mmRound(ev) === rk && statusOf(ev).state === 'pre' && sel[ev.id]);
    if (!games.length) return toast('Pick some games first');
    const picks = games.map(ev => { const c = Object.values(sides(ev)).find(c => String(c.team?.id) === String(sel[ev.id])); return { kind: 'game', key: ev.id, teamId: sel[ev.id], team: c?.team?.abbreviation || '', round: rk }; });
    sv.disabled = true; sv.textContent = 'Saving…';
    try {
      const res = await gasPost({ action: 'bracketSave', code: st.creds.code, name: st.creds.name, pin: st.creds.pin, season: st.y, picks, r64: r64Ids(st) });
      picks.forEach(p => { st.mine['game:' + p.key] = { teamId: p.teamId, team: p.team, round: p.round }; });
      toast(`Saved ${res.saved} pick${res.saved === 1 ? '' : 's'}${res.rejected ? ` · ${res.rejected} already locked` : ''} ✔`);
    } catch (er) { toast(er.message, 4000); }
    sv.disabled = false; sv.textContent = 'Save picks';
  };
}

function mmChamp(body, st) {
  const field = {}, all = new Map();
  st.evs.filter(ev => ['r64', 'ff'].includes(mmRound(ev))).forEach(ev => {
    const reg = mmRegion(ev) || 'Other';
    Object.values(sides(ev)).forEach(c => { const t = c.team || {}; if (!t.id) return;
      const x = { id: String(t.id), name: t.shortDisplayName || t.displayName, ab: t.abbreviation || t.shortDisplayName, seed: Number(mmSeed(c)) || 99, logo: logoOf(t), reg };
      (field[reg] = field[reg] || new Map()).set(x.id, x); all.set(x.id, x); });
  });
  const locked = st.evs.some(ev => mmRound(ev) === 'r64' && statusOf(ev).state !== 'pre');
  const pick = { champ: st.mine['champ:champ']?.teamId || '' };
  MM_REGIONS.forEach(r => { pick[r] = st.mine['f4:' + r]?.teamId || ''; });
  const opts = (list, cur) => `<option value="">— pick —</option>` + [...list].sort((a, b) => a.seed - b.seed || a.name.localeCompare(b.name)).map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${t.seed < 99 ? `(${t.seed}) ` : ''}${esc(t.name)}</option>`).join('');
  const regions = MM_REGIONS.filter(r => field[r]);
  const show = id => { const t = all.get(id); return t ? `${img(t.logo, 'logo sm')}<b>${t.seed < 99 ? `<i class="rk">${t.seed}</i>` : ''}${esc(t.name)}</b>` : '<span class="mut">No pick</span>'; };
  body.innerHTML = `${locked ? '<div class="sv-lock">🔒 Locked — the tournament has tipped off.</div>' : '<p class="hint">Locks when the first 1st-round game tips. Change your mind as often as you like until then.</p>'}
    <div class="card mm-champ"><h4>👑 National Champion <small class="st-sub">+25</small></h4>${locked ? `<div class="mm-pick">${show(pick.champ)}</div>` : `<select class="sel" data-k="champ">${opts(all.values(), pick.champ)}</select>`}</div>
    <div class="card"><h4>Final Four <small class="st-sub">+5 each</small></h4>${regions.map(r => `<div class="mm-reg"><small>${r}</small>${locked ? `<div class="mm-pick">${show(pick[r])}</div>` : `<select class="sel" data-k="${r}">${opts(field[r].values(), pick[r])}</select>`}</div>`).join('') || '<p class="hint">Regions show up once ESPN posts the first-round games.</p>'}</div>
    ${locked ? '' : '<button class="btn" id="mmChampSave">Save champion & Final Four</button>'}`;
  body.onchange = e => { const s = e.target.closest('select[data-k]'); if (s) pick[s.dataset.k] = s.value; };
  body.onclick = async e => {
    const sv = e.target.closest('#mmChampSave'); if (!sv) return;
    const picks = [];
    if (pick.champ) picks.push({ kind: 'champ', key: 'champ', teamId: pick.champ, team: all.get(pick.champ)?.ab || '' });
    regions.forEach(r => { if (pick[r]) picks.push({ kind: 'f4', key: r, teamId: pick[r], team: all.get(pick[r])?.ab || '' }); });
    if (!picks.length) return toast('Make a pick first');
    sv.disabled = true; sv.textContent = 'Saving…';
    try {
      const res = await gasPost({ action: 'bracketSave', code: st.creds.code, name: st.creds.name, pin: st.creds.pin, season: st.y, picks, r64: r64Ids(st) });
      if (res.locked) toast('Too late — the tournament already tipped off', 4000);
      else { picks.forEach(p => { st.mine[p.kind + ':' + p.key] = { teamId: p.teamId, team: p.team }; }); toast('👑 Saved. Bold choice.'); }
    } catch (er) { toast(er.message, 4000); }
    sv.disabled = false; sv.textContent = 'Save champion & Final Four';
  };
}

async function mmBoard(body, st) {
  const e8 = st.evs.filter(ev => mmRound(ev) === 'e8').map(ev => `${mmRegion(ev)}:${ev.id}`).filter(x => !x.startsWith(':')).join(',');
  const ncg = st.evs.find(ev => mmRound(ev) === 'ncg')?.id || '';
  const d = await gasGet({ action: 'bracketBoard', code: st.creds.code, season: st.y, e8, ncg, r64: r64Ids(st)[0] || '', name: st.creds.name });
  const rows = d.rows || [];
  if (!rows.length) { body.innerHTML = emptyHTML('No brackets yet — be the first!'); return; }
  body.innerHTML = `<div class="board">${rows.map((r, i) => `<div class="bd-row ${r.name === st.creds.name ? 'me' : ''}">
    <b class="bd-rk">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</b><span>${esc(r.name)}<small>👑 ${esc(r.champ || '—')}${r.f4?.length ? ' · F4: ' + r.f4.map(esc).join(', ') : ''}</small></span>
    <span class="bd-sc"><b>${r.pts}</b><small>${r.right}/${r.graded} games</small></span></div>`).join('')}</div>
    <p class="src">Champion and Final Four picks are revealed once the first round tips. Updated ${d.updated ? timeAgo(d.updated) : 'just now'}.</p>`;
}
