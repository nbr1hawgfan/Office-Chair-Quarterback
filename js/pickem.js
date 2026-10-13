/* Office Chair QB — office pick'em (Apps Script backend) */

function pickemCreds() { return LS.get('pickem', null); }

function openPickem() {
  Sheets.open("Office Pick'em", ctx => {
    if (!gasUrl()) { ctx.body.innerHTML = errHTML(new Error('GAS_NOT_SET')); return; }
    const creds = pickemCreds();
    if (!creds) return pickemJoin(ctx);
    ctx.act.innerHTML = `<button class="icon-btn" id="pkOut" title="Switch player">👤</button>`;
    qs('#pkOut', ctx.act).onclick = () => { if (confirm(`Signed in as ${creds.name}. Sign out?`)) { LS.del('pickem'); history.back(); } };
    ctx.body.innerHTML = '';
    subTabs(ctx.body, [{ k: 'nfl', label: '🏈 NFL Picks' }, { k: 'cfb', label: '🎓 College Picks' }, { k: 'board', label: '🏆 Standings' }],
      (k, body) => k === 'board' ? pickemBoard(body) : pickemWeek(body, k, creds));
  });
}

function pickemJoin(ctx) {
  ctx.body.innerHTML = `<div class="card join"><h4>Join the office league</h4>
    <p class="hint">Get the invite code from whoever runs the league. Your PIN keeps others from changing your picks.</p>
    <input class="search" id="jCode" placeholder="Invite code" autocomplete="off">
    <input class="search" id="jName" placeholder="Your name (shown on leaderboard)" value="${esc(Prefs.get().name || '')}">
    <input class="search" id="jPin" placeholder="4-digit PIN" inputmode="numeric" maxlength="6">
    <button class="btn" id="jGo">Join</button></div>`;
  qs('#jGo', ctx.body).onclick = async () => {
    const code = qs('#jCode', ctx.body).value.trim(), name = qs('#jName', ctx.body).value.trim(), pin = qs('#jPin', ctx.body).value.trim();
    if (!code || !name || !/^\d{4,6}$/.test(pin)) return toast('Enter code, name and a 4–6 digit PIN');
    try {
      const r = await gasPost({ action: 'join', code, name, pin });
      LS.set('pickem', { code, name: r.name || name, pin });
      toast(r.returning ? 'Welcome back!' : "You're in!");
      history.back(); setTimeout(openPickem, 350);
    } catch (e) { toast(e.message, 4000); }
  };
}

function pickemGames(lg, events) {
  if (lg === 'nfl') return events;
  const extra = new Set(CONFIG.PICKEM_EXTRA_SCHOOLS);
  return events.filter(ev => {
    const { away, home } = sides(ev);
    return [away, home].some(c => rankOf(c) || SEC_SCHOOLS.includes(c.team?.location) || extra.has(c.team?.location));
  });
}

async function pickemWeek(body, lg, creds) {
  const L = LEAGUES[lg];
  const { data, events } = await fetchScoreboard(lg, { filter: lg === 'cfb' ? 'all' : null });
  const games = pickemGames(lg, events).sort((a, b) => new Date(a.date) - new Date(b.date));
  const week = data.week?.number, season = data.season?.year, stype = data.season?.type;
  const key = `${lg}-${season}-${stype}-${week}`;
  if (!games.length) { body.innerHTML = emptyHTML('No games on this week\'s board yet.'); return; }
  let mine = {}, office = {};
  try {
    const [m, o] = await Promise.all([
      gasGet({ action: 'mypicks', code: creds.code, name: creds.name, pin: creds.pin, week: key }),
      gasGet({ action: 'weekpicks', code: creds.code, week: key }).catch(() => ({ picks: {} }))
    ]);
    mine = m.picks || {}; office = o.picks || {};
  } catch (e) { body.innerHTML = errHTML(e); return; }
  const sel = { ...mine };
  const draw = () => {
    const open = games.filter(g => statusOf(g).state === 'pre');
    const made = games.filter(g => sel[g.id]).length;
    body.innerHTML = `<div class="pk-head"><b>${esc(L.short)} · Week ${esc(week)}</b><span>${made}/${games.length} picked</span></div>
      ${lg === 'cfb' ? '<p class="hint">Board: Top 25, every SEC game, plus Tulsa, Nebraska & Oklahoma State.</p>' : ''}
      <div class="pk-list">${games.map(g => {
        const { away, home } = sides(g), st = statusOf(g), locked = st.state !== 'pre';
        const pick = sel[g.id], tally = office[g.id] || {};
        const btn = c => {
          const t = c.team || {}, on = String(pick) === String(t.id);
          const won = st.state === 'post' && c.winner, lost = st.state === 'post' && on && !c.winner;
          return `<button class="pk-team ${on ? 'on' : ''} ${won ? 'won' : ''} ${lost ? 'lost' : ''}" data-g="${g.id}" data-t="${t.id}" ${locked ? 'disabled' : ''}>
            ${img(logoOf(t), 'logo sm')}<span>${rankOf(c) ? `<b class="rk">${rankOf(c)}</b>` : ''}${esc(t.shortDisplayName || t.abbreviation || '')}</span>
            ${st.state !== 'pre' ? `<b class="pk-sc">${esc(scoreVal(c.score))}</b>` : ''}
            ${locked && tally[t.id] ? `<small class="tally">${tally[t.id]} 👤</small>` : ''}</button>`;
        };
        return `<div class="pk-game ${locked ? 'locked' : ''}"><div class="pk-meta">${esc(locked ? (st.shortDetail || '') : fmtDay(g.date) + ' · ' + fmtTime(g.date))}${locked ? ' 🔒' : ''}
          ${(compOf(g).odds || [])[0]?.details ? ` · ${esc(compOf(g).odds[0].details)}` : ''}</div>
          <div class="pk-row">${btn(away)}<span class="at">@</span>${btn(home)}</div></div>`;
      }).join('')}</div>
      ${open.length ? `<button class="btn sticky" id="pkSave">Save picks</button>` : ''}`;
  };
  draw();
  body.onclick = async e => {
    const b = e.target.closest('.pk-team');
    if (b && !b.disabled) { sel[b.dataset.g] = b.dataset.t; draw(); return; }
    if (e.target.id === 'pkSave') {
      const picks = games.filter(g => sel[g.id] && statusOf(g).state === 'pre').map(g => {
        const { away, home } = sides(g); const t = [away, home].find(c => String(c.team?.id) === String(sel[g.id]));
        return { eventId: g.id, teamId: sel[g.id], team: t?.team?.abbreviation || '' };
      });
      if (!picks.length) return toast('Pick some games first');
      e.target.disabled = true; e.target.textContent = 'Saving…';
      try {
        const r = await gasPost({ action: 'submitPicks', code: creds.code, name: creds.name, pin: creds.pin, week: key, league: lg, picks });
        toast(`Saved ${r.saved} pick${r.saved === 1 ? '' : 's'}${r.rejected?.length ? ` · ${r.rejected.length} already locked` : ''} ✔`);
      } catch (er) { toast(er.message, 4000); }
      e.target.disabled = false; e.target.textContent = 'Save picks';
    }
  };
}

async function pickemBoard(body) {
  const creds = pickemCreds();
  const d = await gasGet({ action: 'leaderboard', code: creds.code });
  const rows = d.rows || [];
  if (!rows.length) { body.innerHTML = emptyHTML('No graded picks yet — check back after the first games finish.'); return; }
  body.innerHTML = `<div class="board">${rows.map((r, i) => `<div class="bd-row ${r.name === creds.name ? 'me' : ''}">
    <b class="bd-rk">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</b><span>${esc(r.name)}<small>${r.lastWeek ? `Last week ${esc(r.lastWeek)}` : ''}</small></span>
    <span class="bd-sc"><b>${r.correct}</b><small>${r.graded ? Math.round(r.correct / r.graded * 100) : 0}% · ${r.graded} graded</small></span></div>`).join('')}</div>
    <p class="src">1 point per correct pick. Updated ${d.updated ? timeAgo(d.updated) : 'just now'}.</p>`;
}
