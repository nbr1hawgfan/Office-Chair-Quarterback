/* Office Chair QB — one-time sign-in (real name + fan name) and usage check-in */
const fanName = () => Prefs.get().fan || pickemCreds()?.name || Prefs.get().name || '';

function needsSignup() { return !Prefs.get().fan; }

function renderSignup(view) {
  const p = Prefs.get(), creds = pickemCreds();
  document.body.classList.add('signup');
  view.innerHTML = `<div class="signup-card">
    <img src="icons/icon-192.png" class="app-mark" alt="">
    <h2>Welcome to the Clubhouse</h2>
    <p class="hint">One quick sign-in and you're set on this device for good.</p>
    <label>Your name<input class="search" id="suReal" placeholder="First & last name" value="${esc(p.name || '')}" autocomplete="name"></label>
    <label>Fan name <small>shown on leaderboards, rivalry board & trash talk</small>
      <input class="search" id="suFan" placeholder="e.g. nbr1hawgfan" maxlength="24" value="${esc(p.fan || creds?.name || '')}" autocomplete="nickname"></label>
    ${creds ? '' : `<label>Office invite code <small>ask Tim</small><input class="search" id="suCode" placeholder="Invite code" autocomplete="off"></label>`}
    ${creds ? '' : `<label>4-digit PIN <small>only needed if you sign in on another phone</small><input class="search" id="suPin" inputmode="numeric" maxlength="6" placeholder="••••"></label>`}
    <button class="btn" id="suGo">Let's go 🏈</button>
  </div>`;
  qs('#suGo', view).onclick = async e => {
    const real = qs('#suReal', view).value.trim(), fan = qs('#suFan', view).value.trim().replace(/\s+/g, ' ');
    if (real.length < 2) return toast('Enter your name');
    if (!/^[\w .'-]{3,24}$/.test(fan)) return toast('Fan name: 3–24 letters, numbers, spaces, - or _');
    const btn = e.target; btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      if (!creds && gasUrl()) {
        const code = qs('#suCode', view).value.trim(), pin = qs('#suPin', view).value.trim();
        if (!code) throw new Error('Enter the office invite code');
        if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4–6 digits');
        const r = await gasPost({ action: 'join', code, name: fan, pin });
        LS.set('pickem', { code, name: r.name || fan, pin });
        if (r.returning) toast(`Welcome back, ${r.name || fan}!`);
      }
      const np = Prefs.get(); np.name = real; np.fan = pickemCreds()?.name || fan; Prefs.save(np);
      document.body.classList.remove('signup');
      Theme.apply(np.theme);
      checkIn(true);
      App.go('home');
      if (!np.favs.length) setTimeout(() => openTeamPicker({ title: 'Pick Your Teams' }), 300);
    } catch (er) { toast(er.message, 4000); btn.disabled = false; btn.textContent = "Let's go 🏈"; }
  };
}

/* Logs app opens to the Users / Activity tabs in the sheet (at most every 20 minutes per device) */
function checkIn(force) {
  const creds = pickemCreds(), p = Prefs.get();
  if (!gasUrl() || !creds || !p.fan) return;
  const last = LS.get('lastCheckIn', 0);
  if (!force && Date.now() - last < 20 * 60000) return;
  LS.set('lastCheckIn', Date.now());
  const ua = navigator.userAgent;
  const device = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'Other';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  gasPost({ action: 'hello', code: creds.code, fan: p.fan, real: p.name || '', team: p.theme?.dn || '', device: device + (standalone ? ' (app)' : ' (browser)') }).catch(() => { });
}
