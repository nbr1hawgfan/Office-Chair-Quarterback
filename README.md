# Office Chair QB 🏈

Sports-only PWA for the office. Dark, mobile-first, static files on GitHub Pages, with a Google Apps Script backend for the shared stuff.

## What's in it
- **Team colors** — pick a team and the whole app (header, buttons, tabs) switches to its colors. Saved per phone.
- **Scores** — NFL, CFB, NBA, men's & women's college hoops, MLB, college baseball, **college softball**, NHL, WNBA. College filters: Top 25 / **SEC** / All D-I. Auto-refreshes while games are live.
- **Game Center** — box score, team stats, leaders, scoring plays, win probability, odds, TV, season series.
- **My Team** — next game countdown, schedule, roster (with injuries), news, and links to the same school's other sports (OU football → OU softball in one tap).
- **Recruiting** (college football) — class rank, commits with stars and ratings, transfer portal in/out.
- **ProHawgs** — every active NFL/NBA/MLB/NHL/WNBA player from a school, with their current season line. Arkansas gets "ProHawgs"; others get Pro Sooners, Pro Pokes, Pro Huskers, etc.
- **Players** — search any pro or college player, see bio, season/career splits, career by season, recent game log, news, plus **trading card links** (eBay for sale, sold prices, rookies, PSA 10, TCDB checklist, COMC).
- **Office Pick'em** — weekly NFL + college board (Top 25, every SEC game, plus Tulsa, Nebraska, Oklahoma State), PIN-protected, locks at kickoff, leaderboard, and office pick tallies once a game starts.
- **Polls**, **Standings** (SEC first), **News** feed for your teams, **Break Room Trivia**.

## Deploy the app (GitHub Pages)
1. New repo (e.g. `OfficeChairQB`), upload everything **except** the `gas` folder.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<you>.github.io/OfficeChairQB/` on your phone → Add to Home Screen.

## Set up the backend (new GAS)
Needed for Pick'em, ProHawgs and Recruiting. Scores/stats/players work without it.
1. Create a new Google Sheet → **Extensions → Apps Script** → paste `gas/Code.gs`.
2. **Project Settings → Script Properties**:
   - `LEAGUE_CODE` — the pick'em invite code you give co-workers (e.g. `HOGS2026`)
   - `CFBD_KEY` — free key from https://collegefootballdata.com/key (recruiting tab only)
3. Select `setup` in the function dropdown → **Run** → approve. It builds the tabs, loads ~3,000 pro roster rows, and schedules a 5 AM daily refresh.
4. **Deploy → New deployment → Web app** — Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
5. Paste it into `js/config.js` (`GAS_URL`) before uploading, or in the app under **More → Settings → Save & test**.

After code changes in GAS: Deploy → Manage deployments → edit → **New version** (same URL).

## Notes
- Scores/stats come from ESPN's free public feeds — no keys. They're unofficial, so ESPN can change them; if a section goes blank, that's usually why.
- Recruiting is football only (CFBD doesn't cover basketball recruiting).
- Sheet tabs: `Players` (names + hashed PINs), `Picks`, `Results` (graded games), `ProAlumni`, `Meta`. To remove a player, delete their row in `Players`.
- Change the extra pick'em schools in `js/config.js` → `PICKEM_EXTRA_SCHOOLS`.
