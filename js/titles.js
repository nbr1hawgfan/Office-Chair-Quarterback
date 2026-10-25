/* Office Chair QB — 🏆 Titles & droughts tab on team pages
   NFL / NBA / MLB / NHL: every division title (and NFL playoff trip) in ESPN's past standings, with the current drought.
   College football: conference championship game wins and bowl / CFP games.
   The backend builds each league once (about a minute the very first time) and keeps it, so after that it's instant. */

const TITLE_LG = ['nfl', 'nba', 'mlb', 'nhl', 'cfb'];
const seasonsAgo = n => n == null ? '' : n <= 0 ? 'this past season' : n === 1 ? '1 season ago' : `${n} seasons ago`;

async function teamTitlesTab(body, lg, t) {
  if (!gasUrl()) { body.innerHTML = errHTML(new Error('GAS_NOT_SET')); return; }
  body.innerHTML = loadingHTML(lg === 'cfb' ? 'Digging through the record books…' : 'Digging through every past season… (first look at a league takes about a minute)');
  let d;
  try { d = await gasGet({ action: 'titles', lg, team: t.id, loc: t.location || '' }); }
  catch (e) {
    body.innerHTML = /unknown action/i.test(e.message) ? emptyHTML('This needs the latest Apps Script backend — paste gas/Code.gs and deploy a New version.') : errHTML(e);
    return;
  }
  const short = t.shortDisplayName || t.location || t.displayName || '';
  if (lg === 'cfb') return cfbTitlesHTML(body, d, short);
  const L = LEAGUES[lg], div = d.div || [], po = d.po;
  const lastDiv = div[0];
  const hero = lastDiv
    ? `<div class="ti-hero"><small>Last division title</small><b>${seasonLabel(lg, lastDiv.y)}</b><span>${esc(lastDiv.name)}${d.divDrought > 0 ? ` · ${seasonsAgo(d.divDrought)}` : ' · reigning champs 👑'}</span></div>`
    : `<div class="ti-hero dry"><small>Division titles</small><b>None</b><span>since ${seasonLabel(lg, d.from)} in ESPN's records</span></div>`;
  const poHero = po ? (po.length
    ? `<div class="ti-hero"><small>Last playoff trip</small><b>${seasonLabel(lg, po[0])}</b><span>${d.poDrought > 0 ? seasonsAgo(d.poDrought) : 'made it last season ✅'}</span></div>`
    : `<div class="ti-hero dry"><small>Playoff trips</small><b>None</b><span>since ${seasonLabel(lg, d.from)}</span></div>`) : '';
  body.innerHTML = `<div class="ti-heroes">${hero}${poHero}</div>
    <div class="rank-tiles"><div class="rank-tile"><small>Division titles</small><b>${div.length}</b><span>since ${seasonLabel(lg, d.from)}</span></div>
      ${po ? `<div class="rank-tile"><small>Playoff trips</small><b>${po.length}</b><span>since ${seasonLabel(lg, d.from)}</span></div>` : ''}
      <div class="rank-tile"><small>Seasons checked</small><b>${d.seasons}</b><span>${seasonLabel(lg, d.from)}–${seasonLabel(lg, d.to)}</span></div></div>
    ${div.length ? `<div class="card"><h4>👑 Division Titles <small class="st-sub">${div.length}</small></h4><div class="ti-years">${div.map(x => `<span title="${esc(x.name)}"><b>${seasonLabel(lg, x.y)}</b><small>${esc(x.name.replace(/^(American|National) (Football |League )?(Conference )?/i, '').replace(/ Division$/i, ''))}</small></span>`).join('')}</div></div>` : ''}
    ${po && po.length ? `<div class="card"><h4>🏈 Playoff Seasons <small class="st-sub">${po.length}</small></h4><div class="ti-years">${po.map(y => `<span><b>${seasonLabel(lg, y)}</b></span>`).join('')}</div></div>` : ''}
    <p class="src">From ESPN's final regular-season standings. Division winner = ${lg === 'nfl' ? 'best playoff seed in the division' : lg === 'nhl' ? 'most points in the division' : 'best record in the division'}. Records before ${seasonLabel(lg, d.from)} aren't in ESPN's feed.</p>`;
}

function cfbTitlesHTML(body, d, short) {
  const ct = d.confTitles || [], bowls = d.bowls || [], rec = d.bowlRec || {};
  const last = ct[0];
  body.innerHTML = `<div class="ti-heroes">
      ${last ? `<div class="ti-hero"><small>Last conference title game win</small><b>${last.y}</b><span>${esc(last.name)} · ${seasonsAgo(new Date().getFullYear() - 1 - last.y)}</span></div>`
        : `<div class="ti-hero dry"><small>Conference title game wins</small><b>None</b><span>since ${d.from || '—'}</span></div>`}
      ${bowls.length ? `<div class="ti-hero"><small>Last bowl / playoff game</small><b>${bowls[0].y}</b><span>${esc(bowls[0].name)} · ${bowls[0].r} ${esc(bowls[0].s)}</span></div>` : ''}</div>
    <div class="rank-tiles"><div class="rank-tile"><small>Conf. title game</small><b>${ct.length}-${d.confGameLosses || 0}</b><span>since ${d.from || '—'}</span></div>
      <div class="rank-tile"><small>Bowls & CFP</small><b>${rec.W || 0}-${rec.L || 0}${rec.T ? '-' + rec.T : ''}</b><span>${bowls.length} games</span></div></div>
    ${ct.length ? `<div class="card"><h4>👑 Conference Championship Game Wins</h4>${ct.map(x => `<div class="ti-row"><b>${x.y}</b><span>${esc(x.name)}</span><small>W ${esc(x.s)} vs ${esc(x.o)}</small></div>`).join('')}</div>` : ''}
    ${bowls.length ? `<div class="card"><h4>🏟️ Bowls & Playoff Games</h4>${bowls.map(x => `<div class="ti-row"><b>${x.y}</b><span>${esc(x.name)}</span><small class="${x.r === 'W' ? 'w' : 'l'}">${x.r} ${esc(x.s)} vs ${esc(x.o)}</small></div>`).join('')}</div>` : ''}
    <p class="src">From CollegeFootballData game logs since ${d.from || '—'}. Counts conference championship <i>game</i> wins — shared regular-season titles from before title games aren't included.</p>`;
}
