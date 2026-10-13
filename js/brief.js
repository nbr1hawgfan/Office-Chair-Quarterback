/* Office Chair QB — Morning Brief email sign-up */
const BRIEF_DAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];
const BRIEF_HOURS = [5, 6, 7, 8, 9, 10, 12, 17, 20];
const hourLabel = h => h === 12 ? '12:00 PM' : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;

function briefPayload(b) {
  const p = Prefs.get(), ffl = LS.get('ffl', null);
  return {
    code: b.code, email: b.email, name: p.name || pickemCreds()?.name || '', hour: b.hour, days: b.days,
    teams: p.favs.map(({ lg, id, dn, loc, ab, logo, c, a }) => ({ lg, id, dn, loc, ab, logo, c, a })), theme: p.theme,
    fantasy: b.fantasy && ffl ? { leagueId: ffl.leagueId, season: ffl.season, teamId: ffl.teamId } : null
  };
}

/* keep the brief's team list in sync when favorites change */
let _briefSyncT;
function briefSync() {
  const b = LS.get('brief', null); if (!b || !b.on || !gasUrl()) return;
  clearTimeout(_briefSyncT);
  _briefSyncT = setTimeout(() => gasPost({ action: 'briefSave', ...briefPayload(b) }).catch(() => { }), 1500);
}

function openBrief() {
  Sheets.open('Morning Brief 📬', ctx => {
    if (!gasUrl()) { ctx.body.innerHTML = errHTML(new Error('GAS_NOT_SET')); return; }
    const p = Prefs.get(), th = p.theme;
    const b = LS.get('brief', { email: '', hour: 7, days: '1234567', fantasy: true, on: false, code: pickemCreds()?.code || '' });
    const draw = () => {
      ctx.body.innerHTML = `
        <div class="brief-hero" style="--tc:#${th?.c || '1f6feb'};--ta:#${th?.a || 'f2c94c'};--tl:url('${esc(th?.logo || '')}')">
          <div><small>OFFICE CHAIR QB</small><h3>Your morning sports brief</h3>
          <p>One email in your team's colors: last night's results, today's games & TV, top headlines, your fantasy matchup, pick'em spot and the office rivalry.</p></div>
          ${th ? img(th.logo, 'logo xl') : ''}</div>
        ${b.on ? `<div class="brief-on">✅ You're signed up — ${esc(hourLabel(Number(b.hour)))} on ${esc(b.days === '1234567' ? 'every day' : b.days === '12345' ? 'weekdays' : BRIEF_DAYS.filter(d => b.days.includes(d[0])).map(d => d[1]).join(', '))}</div>` : ''}
        <div class="card">
          <h4>Email</h4><input class="search" id="bEmail" type="email" placeholder="you@email.com" value="${esc(b.email)}">
          ${pickemCreds() ? '' : `<h4 style="margin-top:12px">Office invite code</h4><input class="search" id="bCode" placeholder="Same code as Pick'em" value="${esc(b.code)}">`}
          <h4 style="margin-top:12px">Deliver at</h4>
          <div class="chips wrap" id="bHour">${BRIEF_HOURS.map(hh => `<button data-h="${hh}" class="${Number(b.hour) === hh ? 'on' : ''}">${hourLabel(hh)}</button>`).join('')}</div>
          <h4 style="margin-top:6px">Days</h4>
          <div class="chips wrap" id="bDays"><button data-preset="1234567" class="${b.days === '1234567' ? 'on' : ''}">Every day</button><button data-preset="12345" class="${b.days === '12345' ? 'on' : ''}">Weekdays</button>
            ${BRIEF_DAYS.map(([k, l]) => `<button data-d="${k}" class="day ${b.days.includes(k) ? 'on' : ''}">${l}</button>`).join('')}</div>
          <label class="chk"><input type="checkbox" id="bFfl" ${b.fantasy && LS.get('ffl', null) ? 'checked' : ''} ${LS.get('ffl', null) ? '' : 'disabled'}> Include my fantasy matchup ${LS.get('ffl', null) ? '' : '<small>(connect a league first)</small>'}</label>
          <p class="hint">Teams in the brief: ${p.favs.map(f => `${img(f.logo, 'logo xs')} ${esc(f.ab || f.dn)}`).join(' · ') || 'none yet — follow some teams'}. Changes to your teams update the brief automatically.</p>
          <button class="btn" id="bSave">${b.on ? 'Save changes' : '📬 Sign me up'}</button>
          ${b.on ? `<button class="btn ghost" id="bTest">Send me one now</button><button class="btn ghost danger" id="bStop">Stop my brief</button>` : ''}
        </div>
        <p class="src">Sent from the office league's Gmail. Every email has an unsubscribe link.</p>`;
    };
    draw();
    const read = () => {
      b.email = qs('#bEmail', ctx.body).value.trim();
      const codeEl = qs('#bCode', ctx.body); b.code = pickemCreds()?.code || (codeEl ? codeEl.value.trim() : b.code);
      b.fantasy = qs('#bFfl', ctx.body).checked;
    };
    ctx.body.onclick = async e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.h) { read(); b.hour = Number(t.dataset.h); return draw(); }
      if (t.dataset.preset) { read(); b.days = t.dataset.preset; return draw(); }
      if (t.dataset.d) { read(); const k = t.dataset.d; b.days = b.days.includes(k) ? b.days.replace(k, '') : (b.days + k).split('').sort().join(''); if (!b.days) b.days = k; return draw(); }
      if (t.id === 'bSave') {
        read();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email)) return toast('Enter a valid email');
        if (!b.code) return toast('Enter the office invite code');
        t.disabled = true; t.textContent = 'Saving…';
        try { const r = await gasPost({ action: 'briefSave', ...briefPayload(b) }); b.on = true; b.token = r.token; LS.set('brief', b); toast('You\'re signed up! 📬'); draw(); }
        catch (er) { toast(er.message, 4000); t.disabled = false; t.textContent = '📬 Sign me up'; }
      }
      if (t.id === 'bTest') {
        t.disabled = true; t.textContent = 'Sending…';
        try { await gasPost({ action: 'briefTest', code: b.code, email: b.email }); toast('Sent! Check your inbox (and spam the first time).', 4000); }
        catch (er) { toast(er.message, 4000); }
        t.disabled = false; t.textContent = 'Send me one now';
      }
      if (t.id === 'bStop' && confirm('Stop your morning brief?')) {
        try { await gasPost({ action: 'briefStop', code: b.code, email: b.email }); b.on = false; LS.set('brief', b); toast('Brief stopped'); draw(); } catch (er) { toast(er.message); }
      }
    };
  });
}
