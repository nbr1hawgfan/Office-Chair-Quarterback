/* Office Chair QB — settings sync.
   Teams, colors, look, fantasy league, Morning Brief and other preferences are saved to the
   Apps Script backend under the person's fan name + PIN, so every phone or computer they sign in
   on stays the same. Saves happen automatically a few seconds after any change; the newest change wins. */

const SYNC_KEYS = ['prefs', 'look', 'tickerOn', 'ffl', 'fflScoring', 'brief', 'triviaBest', 'clipMuted', 'recentPlayers', 'statsLg', 'injFilt', 'myLinks'];
const _raw = {
  get: k => { try { return localStorage.getItem('ocq_' + k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem('ocq_' + k, v); } catch (e) { } },
  del: k => { try { localStorage.removeItem('ocq_' + k); } catch (e) { } }
};

const Sync = {
  timer: null, lastPull: 0, applying: false, lastError: '',
  // Plain-English reason a sync failed
  explain(e) {
    const m = String(e && e.message || e || '');
    if (/unknown action/i.test(m)) return 'The Apps Script backend is out of date. Paste the latest gas/Code.gs, then Deploy → Manage deployments → edit → New version.';
    if (/not recognized|wrong invite/i.test(m)) return 'Your sign-in didn\'t match (' + m + '). Sign out of Pick\'em and back in with your fan name + PIN.';
    if (/GAS_NOT_SET/.test(m)) return 'No backend URL set (Settings → Backend).';
    if (/failed to fetch|load failed|network|json|unexpected token/i.test(m)) return 'Couldn\'t reach the backend (' + m + '). Check your connection, or make sure the web app is deployed with access "Anyone".';
    return m || 'Unknown error';
  },
  // gasPost with one retry for flaky phone connections
  async call(body) {
    try { return await gasPost(body); }
    catch (e) { if (/unknown action|not recognized|wrong invite|too large/i.test(e.message)) throw e; await new Promise(r => setTimeout(r, 1200)); return gasPost(body); }
  },
  ready() { return !!(gasUrl() && pickemCreds() && Prefs.get().fan); },
  device() {
    const ua = navigator.userAgent;
    return /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'Other';
  },
  snapshot() {
    const d = {};
    SYNC_KEYS.forEach(k => { const v = _raw.get(k); if (v != null) d[k] = v; });
    return d;
  },
  // A synced setting changed on this device: remember when, and save shortly
  mark() {
    if (this.applying) return;
    _raw.set('syncDirty', String(Date.now()));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 2500);
  },
  async push() {
    clearTimeout(this.timer);
    if (!this.ready()) return false;
    const c = pickemCreds(), t = Number(_raw.get('syncDirty')) || Date.now();
    try {
      const r = await this.call({ action: 'saveSettings', code: c.code, name: c.name, pin: c.pin, data: this.snapshot(), t, device: this.device() });
      if (r.stale) { _raw.del('syncDirty'); return this.pull(true).then(ch => { if (ch) this.refreshUI(); return ch; }); }
      _raw.set('syncAt', String(r.updated || t));
      if (Number(_raw.get('syncDirty')) === t) _raw.del('syncDirty');
      this.lastError = '';
      return true;
    } catch (e) { this.lastError = this.explain(e); console.warn('Sync save failed:', e); return false; } // stays dirty; retried on the next change or app open
  },
  // Bring down the saved settings. Returns true if anything on this device changed.
  async pull(force) {
    if (!this.ready()) return false;
    if (!force && _raw.get('syncDirty')) { await this.push(); return false; }
    this.lastPull = Date.now();
    const c = pickemCreds();
    let r;
    try { r = await this.call({ action: 'loadSettings', code: c.code, name: c.name, pin: c.pin }); this.lastError = ''; }
    catch (e) { this.lastError = this.explain(e); console.warn('Sync load failed:', e); return false; }
    if (!r.data || !Object.keys(r.data).length) { if (Object.keys(this.snapshot()).length) this.mark(); return false; }
    if (!force && r.updated <= (Number(_raw.get('syncAt')) || 0)) return false;
    const before = JSON.stringify(this.snapshot());
    this.applying = true;
    try {
      const fan = Prefs.get().fan;
      Object.entries(r.data).forEach(([k, v]) => { if (SYNC_KEYS.includes(k) && typeof v === 'string') _raw.set(k, v); });
      const p = Prefs.get(); if (!p.fan && fan) { p.fan = fan; _raw.set('prefs', JSON.stringify(p)); }
    } finally { this.applying = false; }
    _raw.set('syncAt', String(r.updated));
    _raw.del('syncDirty');
    return JSON.stringify(this.snapshot()) !== before;
  },
  refreshUI() {
    try { Look.apply(); Ticker.init(); if (!Sheets.stack.length && !document.body.classList.contains('signup')) App.go(App.tab); } catch (e) { }
  },
  // On app open / return to the app: pull at most every 2 minutes
  async check() {
    if (!this.ready() || Date.now() - this.lastPull < 120000) return;
    if (await this.pull(false)) { this.refreshUI(); toast('☁️ Updated with your latest teams & settings'); }
  },
  lastSavedText() {
    const t = Number(_raw.get('syncAt'));
    return t ? timeAgo(new Date(t)) : 'not yet';
  }
};

/* Watch every write to a synced setting, wherever it happens in the app */
(() => {
  const set = LS.set.bind(LS), del = LS.del.bind(LS);
  LS.set = (k, v) => { set(k, v); if (SYNC_KEYS.includes(k)) Sync.mark(); };
  LS.del = k => { del(k); if (SYNC_KEYS.includes(k)) Sync.mark(); };
})();
