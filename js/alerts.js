/* Office Chair QB — 🔔 Score alerts (real phone notifications, no extra app)
   Works on Android/desktop in the browser, and on iPhone once the app is added to the Home Screen (iOS 16.4+).
   This phone's subscription + the teams you follow + your fantasy players go to the alerts server
   (Supabase ocq-subscribe). The server checks scores every minute and sends the alerts. */

const ALERT_TYPES = [
  ['kick', '⏱️ Starting soon', 'About 15 minutes before kickoff / first pitch / tip-off'],
  ['score', '🔥 Scores', 'Every score in football, hockey and baseball/softball (basketball is too busy — use the others)'],
  ['close', '⏰ Close & late', 'Once per game when it\'s tight near the end'],
  ['final', '✅ Finals', 'Final score, win or loss'],
  ['ffl', '⭐ Fantasy TDs', 'When one of your ESPN fantasy players scores (NFL)']
];

const Alerts = {
  isIOS: () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  supported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  prefs() { return { kick: true, score: true, close: true, final: true, ffl: true, fflm: '30', ...LS.get('alertPrefs', {}) }; },
  league() { const c = fflCfg(); return c && c.leagueId && c.teamId != null ? { leagueId: String(c.leagueId), season: String(c.season), teamId: String(c.teamId), relay: gasUrl() || '' } : null; },
  on() { return !!_raw.get('alertsOn'); },
  keyBytes() { const s = CONFIG.PUSH_KEY.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); },
  async reg() { return navigator.serviceWorker.ready; },
  async current() { try { return await (await this.reg()).pushManager.getSubscription(); } catch (e) { return null; } },
  payload(sub) {
    return { action: 'subscribe', sub: sub.toJSON ? sub.toJSON() : sub, fan: Prefs.get().fan || '', prefs: this.prefs(),
      teams: [...new Set(Prefs.favs().map(f => `${f.lg}:${f.id}`))],
      ffl: MyFF.players().filter(p => !p.dst).map(p => ({ id: p.id, first: p.first, last: p.last, pro: p.pro })), league: this.league() };
  },
  async post(body) {
    const r = await fetch(CONFIG.PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || 'Alerts server returned ' + r.status);
    return d;
  },
  sig(p) { return JSON.stringify([p.teams.slice().sort(), p.prefs, p.ffl.map(x => x.id).sort(), p.league]); },
  async enable() {
    if (!this.supported()) throw new Error(this.isIOS() ? 'IOS_HOME' : 'This browser can\'t do notifications');
    if (this.isIOS() && !this.standalone()) throw new Error('IOS_HOME');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'BLOCKED' : 'Notifications weren\'t allowed');
    const reg = await this.reg();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.keyBytes() });
    await MyFF.load().catch(() => null);
    const p = this.payload(sub);
    await this.post(p);
    _raw.set('alertsOn', '1'); LS.set('alertSig', this.sig(p));
    return p;
  },
  async disable() {
    const sub = await this.current();
    if (sub) { await this.post({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => { }); await sub.unsubscribe().catch(() => { }); }
    _raw.del('alertsOn');
  },
  async test() { const sub = await this.current(); if (!sub) throw new Error('Alerts aren\'t on for this phone'); return this.post({ action: 'test', endpoint: sub.endpoint }); },
  // keep the server's team list in step with the app (called on open and when teams/prefs change)
  async sync(force) {
    if (!this.on() || !this.supported()) return;
    const sub = await this.current();
    if (!sub) { if (Notification.permission === 'granted') { try { await this.enable(); } catch (e) { } } else _raw.del('alertsOn'); return; }
    const p = this.payload(sub);
    if (!force && LS.get('alertSig', '') === this.sig(p)) return;
    try { await this.post(p); LS.set('alertSig', this.sig(p)); } catch (e) { }
  }
};

function openAlerts() {
  Sheets.open('🔔 Score Alerts', ctx => {
    const draw = async () => {
      const on = Alerts.on() && !!(await Alerts.current()), prefs = Alerts.prefs();
      const favs = Prefs.favs(), ff = MyFF.players();
      const blocked = Alerts.supported() && Notification.permission === 'denied';
      const iosHome = Alerts.isIOS() && !Alerts.standalone();
      ctx.body.innerHTML = `
        <div class="al-hero ${on ? 'on' : ''}"><span>${on ? '🔔' : '🔕'}</span><div><b>${on ? 'Alerts are on for this phone' : 'Get score alerts on this phone'}</b>
          <small>${on ? `Following ${favs.length} team${favs.length === 1 ? '' : 's'}${ff.length ? ` + ${ff.length} fantasy players` : ''}${Alerts.league() && prefs.fflm !== 'off' ? ' + your fantasy matchup' : ''}.` : 'Real notifications — no other app to install.'}</small></div></div>
        ${iosHome ? `<div class="card al-ios"><h4>📲 One step first on iPhone</h4><ol><li>Tap the <b>Share</b> button <span class="al-ico">⎋</span> in Safari</li><li>Choose <b>Add to Home Screen</b></li><li>Open Office Chair QB from your Home Screen and come back here</li></ol><p class="hint">Apple only allows alerts for apps on the Home Screen (iOS 16.4 or newer).</p></div>` : ''}
        ${blocked ? `<div class="card al-ios"><h4>Notifications are blocked</h4><p class="hint">Turn them back on in your phone's settings for this app (or the browser's site settings), then try again.</p></div>` : ''}
        ${!Alerts.supported() && !iosHome ? emptyHTML('This browser can\'t do notifications. Try Chrome, Edge, Safari, or the app from your Home Screen.') : ''}
        ${Alerts.supported() && !iosHome && !blocked ? (on ? `<div class="al-btns"><button class="btn" id="alTest">Send a test alert</button><button class="btn ghost" id="alOff">Turn off</button></div>`
          : `<button class="btn" id="alOn" ${favs.length ? '' : 'disabled'}>🔔 Turn on alerts</button>${favs.length ? '' : '<p class="hint">Follow some teams first (Teams & Colors).</p>'}`) : ''}
        <div class="card"><h4>What to send</h4>${ALERT_TYPES.map(([k, l, d]) => `<label class="al-row ${k === 'ffl' && !ff.length ? 'dim' : ''}"><span><b>${l}</b><small>${d}${k === 'ffl' && !ff.length ? ' — connect Fantasy and mark your team first' : ''}</small></span><input type="checkbox" data-k="${k}" ${prefs[k] ? 'checked' : ''}></label>`).join('')}</div>
        <div class="card"><h4>📊 Fantasy matchup updates</h4>${Alerts.league() ? `<p class="hint">Your live score vs. your opponent in one notification that updates itself — plus an instant alert when the lead changes, a recap when each set of games ends, and the final after Monday night.</p>
          <select class="sel" id="alFflm">${[['off', 'Off'], ['lead', 'Lead changes + final only'], ['15', 'Every 15 minutes during games'], ['30', 'Every 30 minutes during games'], ['60', 'Every hour during games']].map(([k, l]) => `<option value="${k}" ${String(prefs.fflm) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`
          : '<p class="hint">Connect your ESPN league in Fantasy and tap “This is my team” on Rosters, then your live matchup score can come here too.</p>'}</div>
        <div class="card"><h4>Teams you'll hear about</h4>${favs.length ? `<div class="al-teams">${favs.map(f => `<span>${img(f.logo, 'logo xs')}${esc(f.ab || f.dn)} <small>${LEAGUES[f.lg]?.short || ''}</small></span>`).join('')}</div>` : '<p class="hint">None yet.</p>'}
          <p class="hint">Alerts follow your teams automatically — follow or unfollow a team and this phone updates.</p></div>
        <p class="src">Alerts come from our own small server that checks ESPN every minute. Each phone signs up on its own, so turn this on on every phone or computer you want alerts on.</p>`;
      const busy = (b, t) => { if (b) { b.disabled = true; b.textContent = t; } };
      const onB = qs('#alOn', ctx.body), offB = qs('#alOff', ctx.body), testB = qs('#alTest', ctx.body);
      if (onB) onB.onclick = async () => {
        busy(onB, 'Turning on…');
        try { const p = await Alerts.enable(); toast(`🔔 Alerts on — ${p.teams.length} teams${p.ffl.length ? `, ${p.ffl.length} fantasy players` : ''}`); Alerts.test().catch(() => { }); }
        catch (e) { toast(e.message === 'IOS_HOME' ? 'Add the app to your Home Screen first' : e.message === 'BLOCKED' ? 'Notifications are blocked in settings' : e.message, 4500); }
        draw();
      };
      if (offB) offB.onclick = async () => { busy(offB, 'Turning off…'); await Alerts.disable(); toast('🔕 Alerts off for this phone'); draw(); };
      if (testB) testB.onclick = async () => { busy(testB, 'Sending…'); try { await Alerts.test(); toast('Test sent — check your notifications 🔔'); } catch (e) { toast(e.message, 4000); } testB.disabled = false; testB.textContent = 'Send a test alert'; };
      ctx.body.onchange = e => {
        const f = e.target.closest('#alFflm');
        if (f) { const p = Alerts.prefs(); p.fflm = f.value; LS.set('alertPrefs', p); Alerts.sync().then(() => { if (Alerts.on()) toast('Saved ✔'); }); return; }
        const c = e.target.closest('input[data-k]'); if (!c) return;
        const p = Alerts.prefs(); p[c.dataset.k] = c.checked; LS.set('alertPrefs', p);
        Alerts.sync().then(() => { if (Alerts.on()) toast('Saved ✔'); });
      };
    };
    draw();
  });
}

/* Notification taps and subscription refreshes from the service worker */
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'resubscribe') Alerts.sync(true);
  if (m.type === 'openUrl') { try { const q = new URL(m.url).searchParams, g = q.get('game'); if (g) openGameLink(g); else if (q.get('ffl')) openFantasy(); } catch (er) { } }
});
function openGameLink(g) {
  const [lg, id] = String(g).split(':');
  if (LEAGUES[lg] && /^\d+$/.test(id || '')) openGame(lg, id);
}
