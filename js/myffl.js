/* Office Chair QB — "My fantasy guys"
   Reads your connected ESPN fantasy roster (the team you marked "This is my team") and flags:
   • NFL games in Watch Now / My Weekend that have your players
   • a "⭐ Your fantasy players" card in the Game Center with live fantasy points
   • plays in GameCast that involve your players (plus a ⭐ My guys filter)
   ESPN fantasy player IDs and NFL team IDs are the same as ESPN's, so matching is exact for box scores and teams;
   play text is matched by name ("J.Hurts" / "Jalen Hurts"). */

const MyFF = {
  _loading: null,
  roster() { const r = LS.get('fflMine', null); return r && r.players ? r : null; },
  players() { return this.roster()?.players || []; },
  // refresh from ESPN at most every 3 hours (rosters change on waivers / trades)
  async load(force) {
    const c = fflCfg(); if (!c || !c.leagueId || c.teamId == null) return null;
    const r = this.roster();
    if (!force && r && r.team === String(c.teamId) && r.league === String(c.leagueId) && Date.now() - r.t < 3 * 36e5) return r;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const base = await fflFetch(['mStatus', 'mSettings']);
        const week = base.scoringPeriodId || base.status?.currentMatchupPeriod || 1;
        const d = await fflFetch(['mRoster', 'mTeam'], week);
        const t = (d.teams || []).find(x => String(x.id) === String(c.teamId)); if (!t) return null;
        const players = (t.roster?.entries || []).map(e => {
          const p = e.playerPoolEntry?.player || {};
          const parts = String(p.fullName || '').split(' ');
          return { id: String(p.id), name: p.fullName || '', first: p.firstName || parts[0] || '', last: p.lastName || parts.slice(1).join(' '),
            pro: Number(p.proTeamId) || 0, pos: FFL_POS[p.defaultPositionId] || '', start: ![20, 21].includes(e.lineupSlotId), dst: p.defaultPositionId === 16 };
        });
        const out = { t: Date.now(), team: String(c.teamId), league: String(c.leagueId), teamName: fflTeamName(t), players };
        LS.set('fflMine', out); return out;
      } catch (e) { return this.roster(); } finally { this._loading = null; }
    })();
    return this._loading;
  },
  // NFL games: which of my players are in this game?
  inGame(lg, ev) {
    if (lg !== 'nfl') return [];
    const ids = Object.values(sides(ev)).map(c => Number(c.team?.id));
    return this.players().filter(p => ids.includes(p.pro));
  },
  tagHTML(lg, ev) {
    const ps = this.inGame(lg, ev); if (!ps.length) return '';
    const st = ps.filter(p => p.start), show = (st.length ? st : ps).slice(0, 4);
    return `<span class="ff-tag" title="${esc(ps.map(p => p.name).join(', '))}">⭐ ${esc(show.map(p => p.dst ? p.name.replace(/ D\/ST$/, ' D') : p.last).join(', '))}${ps.length > show.length ? ` +${ps.length - show.length}` : ''}</span>`;
  },
  // does this play text mention one of my players? returns the player or null
  _res: null,
  matcher() {
    const ps = this.players().filter(p => !p.dst && p.last);
    const key = ps.map(p => p.id).join(',');
    if (this._res && this._res.key === key) return this._res.fn;
    const esc2 = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pats = ps.map(p => ({ p, re: new RegExp(`(?:\\b${esc2(p.first)}\\s+|\\b${esc2(p.first[0] || '')}\\.\\s?)${esc2(p.last)}\\b`, 'i') }));
    const fn = text => { const t = String(text || ''); for (const x of pats) if (x.re.test(t)) return x.p; return null; };
    this._res = { key, fn };
    return fn;
  },
  // Game Center card: my players in this game with live fantasy points (from the box score)
  gameCardHTML(lg, ev, bp) {
    const ps = this.inGame(lg, ev); if (!ps.length) return '';
    const pts = fantasyPointsFrom(bp || []);
    const mode = LS.get('fflScoring', 'ppr');
    return `<div class="card ff-card"><h4>⭐ Your Fantasy Players <small class="st-sub">${esc(this.roster()?.teamName || '')} · ${mode.toUpperCase()}</small></h4>
      ${ps.sort((a, b) => b.start - a.start).map(p => { const x = pts[p.id];
        return `<div class="ff-row ${p.start ? '' : 'bench'}"><b>${esc(p.name)}</b><small>${esc(p.pos)} · ${esc(FFL_PRO[p.pro] || '')}${p.start ? '' : ' · bench'}</small><span>${x ? esc(x.line.join(', ')) : p.dst ? '' : 'no stats yet'}</span><em>${x ? x.pts.toFixed(1) : '—'}</em></div>`; }).join('')}
      <p class="src">Points are an estimate from the box score (your league's exact scoring may differ a bit).</p></div>`;
  }
};
