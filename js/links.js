/* Office Chair QB — My Links
   Each person's own bookmarks: fan blogs, group chats, Discords, subreddits, podcasts.
   Saved on their device and backed up with their settings sync, so they follow that person to any
   phone or computer they sign in on. Never shared with anyone else and never checked by the app.
   A link can be tied to a followed team: college links follow the school across every sport
   (an Arkansas link shows on Razorback football, hoops and baseball), pro links follow that team. */

const Links = {
  all() { return LS.get('myLinks', []); },
  save(list) { LS.set('myLinks', list); },
  // tag for a team: college = the school, pro = league + team id
  tagFor(lg, t) {
    const loc = t.location || t.loc;
    return LEAGUES[lg]?.college ? 'col:' + loc : lg + ':' + String(t.id);
  },
  forTeam(lg, t) { const k = this.tagFor(lg, t); return this.all().filter(l => l.tag === k); },
  forGame(lg, comps) {
    const keys = new Set(comps.map(c => c.team).filter(Boolean).map(t => this.tagFor(lg, t)));
    return this.all().filter(l => keys.has(l.tag));
  },
  // only real web / message links; adds https:// when people paste "arkansasfight.com"
  clean(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    if (!/^(https?:|sms:|mailto:)/i.test(u)) return '';
    try { if (/^https?:/i.test(u)) { const x = new URL(u); if (!x.hostname.includes('.')) return ''; } } catch (e) { return ''; }
    return u;
  },
  host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u.split(':')[0]; } },
  icon(u) {
    if (/^sms:/i.test(u)) return '<span class="ml-ico em">💬</span>';
    if (/^mailto:/i.test(u)) return '<span class="ml-ico em">✉️</span>';
    return `<img class="ml-ico" src="https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(this.host(u))}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;ml-ico em&quot;>🔗</span>'">`;
  }
};
const LINK_KINDS = [['💬', 'Group chat'], ['📰', 'Blog / news'], ['🎙️', 'Podcast'], ['🗨️', 'Forum / Reddit'], ['🎮', 'Discord'], ['📺', 'YouTube'], ['🔗', 'Other']];

function teamTagOptions() {
  const seen = new Set(), out = [];
  Prefs.favs().forEach(f => {
    const tag = Links.tagFor(f.lg, f);
    if (seen.has(tag)) return; seen.add(tag);
    out.push({ tag, label: LEAGUES[f.lg].college ? `${f.loc} (all sports)` : f.dn, logo: f.logo, c: f.c, a: f.a });
  });
  return out;
}
const tagInfo = tag => teamTagOptions().find(o => o.tag === tag);

/* Pills shown on a team page / Game Center */
function linkPillsHTML(list, title = '🔗 My Links') {
  if (!list.length) return '';
  return `<div class="card ml-card"><h4>${esc(title)}</h4><div class="ml-pills">${list.map(l => `<a class="ml-pill" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${Links.icon(l.url)}<span>${esc(l.kind || '')} ${esc(l.name)}</span></a>`).join('')}</div></div>`;
}

function openMyLinks(preTag) {
  Sheets.open('🔗 My Links', ctx => {
    let editing = null; // link id being edited, 'new', or null
    const draw = () => {
      const list = Links.all(), opts = teamTagOptions();
      const groups = {};
      list.forEach(l => { const k = l.tag && tagInfo(l.tag) ? l.tag : ''; (groups[k] = groups[k] || []).push(l); });
      const order = [...opts.map(o => o.tag).filter(t => groups[t]), ...(groups[''] ? [''] : [])];
      const form = l => {
        l = l || { name: '', url: '', tag: preTag || '', kind: '💬' };
        return `<div class="card ml-form" data-id="${esc(l.id || 'new')}"><h4>${l.id ? 'Edit link' : 'Add a link'}</h4>
          <input class="search" id="mlName" maxlength="40" placeholder="Name (e.g. Hog Alumni group chat)" value="${esc(l.name)}">
          <input class="search" id="mlUrl" inputmode="url" autocapitalize="off" autocorrect="off" placeholder="Paste the link (https://…)" value="${esc(l.url)}">
          <div class="chips" id="mlKind">${LINK_KINDS.map(([ic, lb]) => `<button data-k="${ic}" class="${l.kind === ic ? 'on' : ''}">${ic} ${lb}</button>`).join('')}</div>
          <label class="lbl">Show it with a team <select class="sel" id="mlTag"><option value="">— Just in My Links —</option>${opts.map(o => `<option value="${esc(o.tag)}" ${o.tag === l.tag ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
          <p class="hint">Tied to a team, it also shows on that team's page and in the Game Center during their games.</p>
          <div class="ml-btns"><button class="btn" id="mlSave">${l.id ? 'Save' : 'Add link'}</button><button class="btn ghost" id="mlCancel">Cancel</button>${l.id ? '<button class="btn ghost danger" id="mlDel">Delete</button>' : ''}</div></div>`;
      };
      ctx.body.innerHTML = `<div class="st-note">Your own shortcuts — group chats, fan blogs, Discords, podcasts. Only you see them; they're saved to your sign-in so they follow you to any phone or computer. The app doesn't check these sites, so add ones you trust.</div>
        ${editing === 'new' ? form() : `<button class="btn" id="mlAdd">＋ Add a link</button>`}
        ${!list.length && editing !== 'new' ? emptyHTML('No links yet. Add your group chat or favorite fan site and it\'s one tap away.') : ''}
        ${order.map(tag => {
          const info = tag ? tagInfo(tag) : null;
          return `<h3 class="sec-h">${info ? img(info.logo, 'logo xs') + ' ' + esc(info.label) : '🔗 Other links'} <small>${groups[tag].length}</small></h3>
            <div class="ml-list">${groups[tag].map(l => editing === l.id ? form(l) : `<div class="ml-row" data-id="${esc(l.id)}">
              <a class="ml-main" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${Links.icon(l.url)}<span><b>${esc(l.kind || '')} ${esc(l.name)}</b><small>${esc(Links.host(l.url))}</small></span></a>
              <button class="icon-btn" data-mv="-1" title="Move up">▲</button><button class="icon-btn" data-mv="1" title="Move down">▼</button><button class="icon-btn" data-ed="1" title="Edit">✏️</button></div>`).join('')}</div>`;
        }).join('')}`;
      const nm = qs('#mlName', ctx.body); if (nm && !nm.value) nm.focus();
    };
    ctx.body.onclick = e => {
      const t = e.target;
      if (t.id === 'mlAdd') { editing = 'new'; return draw(); }
      if (t.id === 'mlCancel') { editing = null; return draw(); }
      const kind = t.closest('#mlKind button'); if (kind) { qsa('#mlKind button', ctx.body).forEach(b => b.classList.toggle('on', b === kind)); return; }
      const row = t.closest('.ml-row');
      if (row && t.closest('[data-ed]')) { editing = row.dataset.id; return draw(); }
      if (row && t.closest('[data-mv]')) {
        const list = Links.all(), i = list.findIndex(l => l.id === row.dataset.id), tag = list[i].tag;
        const d = Number(t.closest('[data-mv]').dataset.mv);
        let j = i + d; while (j >= 0 && j < list.length && list[j].tag !== tag) j += d; // move within its group
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]]; Links.save(list); return draw();
      }
      if (t.id === 'mlDel') {
        const id = t.closest('.ml-form').dataset.id;
        if (!confirm('Delete this link?')) return;
        Links.save(Links.all().filter(l => l.id !== id)); editing = null; toast('Link deleted'); return draw();
      }
      if (t.id === 'mlSave') {
        const f = t.closest('.ml-form'), name = qs('#mlName', f).value.trim(), url = Links.clean(qs('#mlUrl', f).value);
        if (!name) return toast('Give it a name');
        if (!url) return toast('That doesn\'t look like a web link — paste the full address');
        const link = { id: f.dataset.id === 'new' ? 'l' + Date.now().toString(36) : f.dataset.id, name: name.slice(0, 40), url, tag: qs('#mlTag', f).value,
          kind: qs('#mlKind button.on', f)?.dataset.k || '🔗' };
        const list = Links.all(), i = list.findIndex(l => l.id === link.id);
        if (i >= 0) list[i] = link; else list.push(link);
        if (list.length > 60) return toast('That\'s a lot of links! Delete a few first.');
        Links.save(list); editing = null; toast(i >= 0 ? 'Saved ✔' : '🔗 Added — it\'s one tap away now'); draw();
      }
    };
    draw();
  });
}
