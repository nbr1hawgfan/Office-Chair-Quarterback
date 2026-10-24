/* Office Chair QB — Conference Race
   Conference standings built from every team's schedule, with games left and who's still alive.
   Football: the top two meet in the conference title game. Hoops: the race for the regular-season title. */

const RACE_LG = ['cfb', 'mbb', 'wbb'];

async function raceData(lg, conf) {
  const list = confSchools(conf, lg);
  const teams = (await teamsFor(lg)).filter(t => list.includes(t.loc));
  const byId = new Map(teams.map(t => [String(t.id), t]));
  const scheds = await pool(teams, 6, t => getJSON(`${SITE}${LEAGUES[lg].path}/teams/${t.id}/schedule`, 1800));
  return teams.map((t, i) => {
    const r = { t, cw: 0, cl: 0, w: 0, l: 0, left: 0, next: null, last5: [] };
    (scheds[i]?.events || []).forEach(ev => {
      const comp = compOf(ev), cs = comp.competitors || [];
      const me = cs.find(c => String(c.id || c.team?.id) === String(t.id)), opp = cs.find(c => c !== me);
      if (!me || !opp) return;
      const stype = ev.seasonType?.type ?? ev.seasonType?.id;
      if (String(stype) === '3' || /championship|tournament/i.test(PS_HEAD(ev))) return;
      const oppLoc = opp.team?.location || byId.get(String(opp.id || opp.team?.id))?.loc;
      const isConf = list.includes(oppLoc);
      const st = comp.status?.type || ev.status?.type || {};
      if (st.completed || st.state === 'post') {
        const won = me.winner === true || (me.winner == null && Number(scoreVal(me.score)) > Number(scoreVal(opp.score)));
        won ? r.w++ : r.l++;
        if (isConf) { won ? r.cw++ : r.cl++; r.last5.push(won ? 'W' : 'L'); }
      } else if (isConf) {
        r.left++;
        if (!r.next) r.next = { date: ev.date, opp: opp.team?.abbreviation || opp.team?.shortDisplayName || '', at: me.homeAway === 'away' ? '@' : 'vs', id: ev.id };
      }
    });
    r.last5 = r.last5.slice(-5);
    r.pct = r.cw + r.cl ? r.cw / (r.cw + r.cl) : 0;
    return r;
  });
}

function raceStatus(rows, spots) {
  rows.forEach(r => {
    const maxW = r.cw + r.left;
    const surelyAhead = rows.filter(o => o !== r && o.cw > maxW).length;
    const couldPass = rows.filter(o => o !== r && o.cw + o.left >= r.cw).length;
    r.status = surelyAhead >= spots ? 'out' : couldPass < spots && r.cw > 0 ? 'in' : 'alive';
  });
  rows.sort((a, b) => b.pct - a.pct || b.cw - a.cw || a.cl - b.cl || (b.w - b.l) - (a.w - a.l));
  const ref = rows[Math.min(spots, rows.length) - 1];
  rows.forEach(r => { r.gb = ref ? ((ref.cw - r.cw) + (r.cl - ref.cl)) / 2 : 0; });
  return rows;
}

function openRace(lg, conf) {
  const p = Prefs.get(), cf = collegeFav(p);
  lg = RACE_LG.includes(lg) ? lg : LS.get('raceLg', cf && RACE_LG.includes(cf.lg) ? cf.lg : 'cfb');
  Sheets.open('🏁 Conference Race', ctx => {
    const draw = async () => {
      const mine = myConf();
      conf = CONFERENCES[conf] ? conf : LS.get('raceConf', mine || 'sec');
      const confs = mine ? [mine, ...CONF_ORDER.filter(k => k !== mine)] : CONF_ORDER;
      const football = lg === 'cfb', spots = football ? 2 : 1;
      ctx.body.innerHTML = `${lgChipsHTML(RACE_LG, lg, 'raLg')}
        <div class="chips conf-chips" id="raConf">${confs.map(k => `<button data-k="${k}" class="${k === conf ? 'on' : ''}"><img class="conf-ico" src="${CONF_LOGO(k)}" alt="" onerror="this.remove()">${CONFERENCES[k].name}${k === mine ? ' <small>★</small>' : ''}</button>`).join('')}</div>
        <div id="raBody">${loadingHTML('Crunching every schedule…')}</div>`;
      bindChips(ctx.body, 'raLg', k => { lg = k; LS.set('raceLg', k); draw(); });
      qs('#raConf', ctx.body).onclick = e => { const b = e.target.closest('button'); if (b) { conf = b.dataset.k; LS.set('raceConf', conf); draw(); } };
      const on = qs('#raConf button.on', ctx.body); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
      const body = qs('#raBody', ctx.body);
      try {
        const rows = raceStatus(await raceData(lg, conf), spots);
        const played = rows.some(r => r.cw + r.cl);
        const favIds = new Set(Prefs.favs().filter(f => f.lg === lg).map(f => String(f.id)));
        const pill = r => r.status === 'in' ? `<i class="ra-pill in">${football ? '✅ In title game' : '✅ Clinched'}</i>` : r.status === 'out' ? '<i class="ra-pill out">❌ Out</i>' : '<i class="ra-pill">🟢 Alive</i>';
        const alive = rows.filter(r => r.status !== 'out').length;
        body.innerHTML = `<div class="st-note">${football ? `The top two in the ${esc(CONFERENCES[conf].name)} meet in the conference championship game.` : `Race for the ${esc(CONFERENCES[conf].name)} regular-season title.`}
          ${played ? ` <b>${alive}</b> team${alive === 1 ? '' : 's'} still alive.` : ' Conference play hasn\'t started yet — everybody\'s alive!'} Tiebreakers aren't applied, so ties count as alive.</div>
          <div class="tbl-wrap"><table class="stats stand race"><tr><th>#</th><th class="pl">Team</th><th>Conf</th><th>GB</th><th>Overall</th><th>Left</th><th class="pl">Status</th></tr>
          ${rows.map((r, i) => `<tr class="${favIds.has(String(r.t.id)) ? 'favrow' : ''} ${r.status === 'out' ? 'dim' : ''} ${i === spots - 1 ? 'cut' : ''}" data-team="${r.t.id}">
            <td>${i + 1}</td><td class="pl rl">${img(r.t.logo, 'logo xs')}${esc(r.t.loc)}${r.next ? `<small class="ra-next">${r.next.at} ${esc(r.next.opp)} · ${esc(fmtDay(r.next.date))}</small>` : ''}</td>
            <td><b>${r.cw}-${r.cl}</b></td><td>${r.gb > 0 ? r.gb : '—'}</td><td>${r.w}-${r.l}</td><td>${r.left}</td><td class="pl">${pill(r)}${r.last5.length ? `<small class="ra-l5">${r.last5.map(x => `<i class="${x === 'W' ? 'w' : 'l'}">${x}</i>`).join('')}</small>` : ''}</td></tr>`).join('')}</table></div>
          <p class="src">Built from each team's schedule. "Left" = conference games remaining. GB = games back of ${football ? '2nd place (the title-game cut)' : 'first place'}.</p>`;
        body.onclick = e => { const t = e.target.closest('[data-team]'); if (t) openTeam(lg, t.dataset.team); };
      } catch (e) { body.innerHTML = errHTML(e); }
    };
    draw();
  });
}
