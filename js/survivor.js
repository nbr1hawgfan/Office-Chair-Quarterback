/* Office Chair QB — NFL Survivor Pool (Apps Script backend, same sign-in as Pick'em)
   Pick one team to win each week. You can't use a team twice. Lose and you're out. Last one standing wins. */

function openSurvivor() {
  Sheets.open('💀 Survivor Pool', async ctx => {
    if (!gasUrl()) { ctx.body.innerHTML = errHTML(new Error('GAS_NOT_SET')); return; }
    const creds = pickemCreds();
    if (!creds) { ctx.body.innerHTML = `<div class="card join"><h4>Sign in first</h4><p class="hint">Survivor uses the same office sign-in as Pick'em.</p><button class="btn" id="svJoin">Sign in</button></div>`;
      qs('#svJoin', ctx.body).onclick = () => { history.back(); setTimeout(openPickem, 350); }; return; }
    const { data, events } = await fetchScoreboard('nfl', {});
    const week = Number(data.week?.number || 0), season = String(data.season?.year || ''), stype = String(data.season?.type || '');
    ctx.body.innerHTML = `<div class="sv-rules">Pick <b>one team to win</b> each week. <b>Never the same team twice.</b> Lose, tie or miss a week and you're out. If everyone left loses the same week, you all survive. Last one standing wins.</div>`;
    if (stype !== '2' || !week) { ctx.body.innerHTML += emptyHTML('Survivor runs during the NFL regular season. See you in September! 🏈'); return; }
    subTabs(ctx.body, [{ k: 'pick', label: `🎯 Week ${week} Pick` }, { k: 'board', label: '💀 Who\'s Alive' }],
      (k, body) => k === 'pick' ? survPickTab(body, creds, season, week, events) : survBoardTab(body, creds, season, week));
  });
}

async function survPickTab(body, creds, season, week, events) {
  const [mine, board] = await Promise.all([
    gasGet({ action: 'survMine', code: creds.code, name: creds.name, pin: creds.pin, season }),
    gasGet({ action: 'survBoard', code: creds.code, season, week, name: creds.name })
  ]);
  const picks = mine.picks || [], cur = picks.find(p => p.week === week);
  const used = new Map(picks.filter(p => p.week !== week).map(p => [String(p.teamId), p.week]));
  const me = (board.rows || []).find(r => r.name.toLowerCase() === creds.name.toLowerCase());
  const start = board.start || week;
  if (me && !me.alive) {
    body.innerHTML = `<div class="sv-out"><span>💀</span><b>You're out</b><small>Eliminated in week ${me.outWeek} after ${me.wins} win${me.wins === 1 ? '' : 's'}. Cheer on (or against) the survivors in Who's Alive.</small></div>${survHistoryHTML(picks)}`;
    return;
  }
  if (!picks.length && board.rows?.length && week > start + 1) {
    body.innerHTML = emptyHTML(`This season's pool started in week ${start}, so sign-ups are closed. Catch the next one!`); return;
  }
  const games = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
  let sel = cur ? { eventId: cur.eventId, teamId: String(cur.teamId), team: cur.team } : null;
  const curLocked = cur && games.some(g => g.id === cur.eventId && statusOf(g).state !== 'pre');
  const draw = () => {
    body.innerHTML = `<div class="pk-head"><b>Week ${week}</b><span>${board.aliveCount ?? '—'} still alive</span></div>
      ${curLocked ? `<div class="sv-lock">🔒 Your pick is locked: <b>${esc(cur.team)}</b></div>` : sel ? `<div class="sv-lock on">Your pick: <b>${esc(sel.team)}</b>${cur && cur.teamId === sel.teamId ? ' ✔ saved' : ' — not saved yet'}</div>` : `<div class="sv-lock">Tap the team you think wins. Used teams are greyed out.</div>`}
      <div class="pk-list">${games.map(g => {
        const { away, home } = sides(g), st = statusOf(g), locked = st.state !== 'pre' || curLocked;
        const btn = c => {
          const t = c.team || {}, id = String(t.id), wk = used.get(id), on = sel && sel.teamId === id;
          const won = st.state === 'post' && c.winner, lost = st.state === 'post' && on && !c.winner;
          return `<button class="pk-team ${on ? 'on' : ''} ${wk ? 'used' : ''} ${won ? 'won' : ''} ${lost ? 'lost' : ''}" data-ev="${g.id}" data-t="${id}" data-ab="${esc(t.abbreviation || t.shortDisplayName || '')}" ${locked || wk ? 'disabled' : ''}>
            ${img(logoOf(t), 'logo sm')}<span>${esc(t.shortDisplayName || t.abbreviation || '')}<small>${wk ? `used wk ${wk}` : esc((c.records || [])[0]?.summary || '')}</small></span>
            ${st.state !== 'pre' ? `<b class="pk-sc">${esc(scoreVal(c.score))}</b>` : ''}</button>`;
        };
        const odds = (compOf(g).odds || [])[0]?.details;
        return `<div class="pk-game ${st.state !== 'pre' ? 'locked' : ''}"><div class="pk-meta">${esc(st.state !== 'pre' ? (st.shortDetail || '') : fmtDay(g.date) + ' · ' + fmtTime(g.date))}${st.state !== 'pre' ? ' 🔒' : ''}${odds ? ' · ' + esc(odds) : ''}</div>
          <div class="pk-row">${btn(away)}<span class="at">@</span>${btn(home)}</div></div>`;
      }).join('')}</div>
      ${!curLocked ? `<button class="btn sticky" id="svSave" ${sel ? '' : 'disabled'}>${sel ? `Lock in ${esc(sel.team)}` : 'Pick a team'}</button>` : ''}
      ${survHistoryHTML(picks)}`;
  };
  draw();
  body.onclick = async e => {
    const b = e.target.closest('.pk-team');
    if (b && !b.disabled) { sel = { eventId: b.dataset.ev, teamId: b.dataset.t, team: b.dataset.ab }; draw(); return; }
    const sv = e.target.closest('#svSave');
    if (sv && sel) {
      sv.disabled = true; sv.textContent = 'Saving…';
      try {
        await gasPost({ action: 'survPick', code: creds.code, name: creds.name, pin: creds.pin, season, week, ...sel });
        toast(`💀 Week ${week}: ${sel.team} it is. Good luck!`);
        body.innerHTML = loadingHTML();
        survPickTab(body, creds, season, week, events).catch(er => { body.innerHTML = errHTML(er); });
      } catch (er) { toast(er.message, 4500); sv.disabled = false; sv.textContent = `Lock in ${sel.team}`; }
    }
  };
}

function survHistoryHTML(picks) {
  const done = [...picks].sort((a, b) => a.week - b.week);
  if (!done.length) return '';
  return `<div class="card"><h4>My Picks</h4><div class="sv-hist">${done.map(p => `<span><small>Wk ${p.week}</small><b>${esc(p.team)}</b></span>`).join('')}</div></div>`;
}

async function survBoardTab(body, creds, season, week) {
  const d = await gasGet({ action: 'survBoard', code: creds.code, season, week, name: creds.name });
  const rows = d.rows || [];
  if (!rows.length) { body.innerHTML = emptyHTML('Nobody has picked yet. Be the first one in!'); return; }
  const alive = rows.filter(r => r.alive), out = rows.filter(r => !r.alive);
  const row = r => `<div class="sv-row ${r.alive ? '' : 'dead'} ${r.name === creds.name ? 'me' : ''}">
      <span class="sv-nm"><b>${r.alive ? '🟢' : '💀'} ${esc(r.name)}</b><small>${r.alive ? `${r.wins} win${r.wins === 1 ? '' : 's'}` : `Out week ${r.outWeek}`}</small></span>
      <span class="sv-picks">${r.picks.map(p => `<i class="sv-p ${p.result === 'W' ? 'w' : p.result === 'L' ? 'l' : p.result === 'live' ? 'lv' : ''}" title="Week ${p.week}"><small>${p.week}</small>${p.hidden ? '🔒' : esc(p.team)}</i>`).join('')}</span></div>`;
  body.innerHTML = `<div class="pk-head"><b>${alive.length} alive · ${out.length} out</b><span>Pool started week ${d.start}</span></div>
    ${alive.length === 1 && out.length ? `<div class="sv-win">👑 ${esc(alive[0].name)} is the last one standing!</div>` : ''}
    <div class="sv-board">${alive.map(row).join('')}${out.length ? `<h3 class="sec-h">The Graveyard <small>${out.length}</small></h3>${out.map(row).join('')}` : ''}</div>
    <p class="src">This week's picks stay hidden 🔒 until each game kicks off.</p>`;
}
