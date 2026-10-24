# Office Chair QB 🏈

Sports-only PWA for the office. Dark, mobile-first, static files on GitHub Pages, with a Google Apps Script backend for the shared stuff.

## What's in it
- **Team colors** — pick a team and the whole app (header, buttons, tabs) switches to its colors. Saved per phone.
- **Scores** — NFL, CFB, NBA, men's & women's college hoops, MLB, college baseball, **college softball**, NHL, WNBA. College filters: Top 25 / **SEC, Big Ten, Big 12, ACC, Pac-12, American** / All D-I (your team's conference gets a ★ and goes first). Auto-refreshes while games are live.
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

## Fantasy Football (ESPN)
Home → **Fantasy** tile. Each person enters their own league ID (the number after `leagueId=` on fantasy.espn.com). Shows matchups with live points and projections (tap for both lineups), standings, and every roster. Tap "This is my team" on Rosters to highlight yours. NFL game centers also have a **Fantasy Points** card (PPR / Half / Standard).

**Public leagues** load directly. **Private leagues** go through the backend:
1. Log into fantasy.espn.com on a computer → developer tools → Application → Cookies → `espn.com`. Copy `espn_s2` and `SWID`.
2. Apps Script → Project Settings → Script Properties → add `ESPN_S2` and `SWID` (keep the `{ }` on SWID).
3. Optional: `FANTASY_LEAGUES` = comma list of league IDs allowed through (otherwise any league your login can see works for anyone with the app).
4. Deploy a New version.

Your cookies only unlock leagues **you're in**. A co-worker's private league in a league you're not part of won't load unless it's public (League → Settings → "Make league viewable to public").

## Office Rivalry ⚔️
Home screen card + **Office Rivalry** tile. Uses the same name/PIN as Pick'em.
- **Board** — everyone picks one team to "rep" (from their followed teams). Shows each person's team live score, today's result or next game, last-5 form, and 🔥/🥶 streaks. When two co-workers' teams play each other, a **Rivalry Game** banner appears with both names.
- **Bragging Rights** — co-workers ranked by their team's win % this season. Last place buys lunch.
- **Trash Talk** — short posts (240 chars, one every 10 seconds) with 🔥 😂 🗑️ 👏 reactions. A wiggling 🗑️ appears next to anyone whose team just lost — tap it to start a post at them.
- Sheet tabs added automatically: `Rivals`, `Wall`. Delete a row in `Wall` to remove a post.

## Morning Brief 📬
Home → **Morning Brief** tile (or Settings). Each person enters their email, picks a time and days, and gets a daily email in their team's colors: last night's results, today's games + TV, headlines, their fantasy matchup, pick'em rank and the office rivalry. Every email has an unsubscribe link. Changing followed teams updates the brief automatically.

Setup (one time, after pasting the new `Code.gs`):
1. Run **`installBriefTrigger`** from the editor and approve the new Gmail permission (it sends from your account).
2. Deploy → Manage deployments → edit → **New version**.
3. Optional Script Properties: `BRIEF_TZ` (default `America/Chicago`), `APP_URL` (the "Open app" button; default `https://nbr1hawgfan.github.io/Office-Chair-Quarterback/`).

A free Gmail account can send ~100 emails a day. The `Brief` sheet tab lists subscribers; set `Active` to FALSE to stop someone.
The brief pulls scores from ESPN on Google's servers, so it needs `testESPN` to show 200s.

## Game Day Mode 🔥
Automatic for your color team:
- **Game day:** the home screen shows a big countdown hero (logos, TV, venue) and the header gets animated team-color stripes.
- **Live:** a score bar pins above the bottom nav on every screen (tap for Game Center), and the browser tab shows 🔴 and the score.
- **Win:** confetti in team colors, once per game. (Settings → "Test the win celebration" to show it off.)

## One-time sign-in & usage log
- First time anyone opens the app they enter **their name**, a **fan name** (e.g. `nbr1hawgfan`), the office invite code and a PIN. That single sign-in also covers Pick'em, Office Rivalry and the Morning Brief, and it's remembered on that device. On a new phone, the same fan name + PIN signs them back in.
- The fan name shows in the header, the greeting, leaderboards and trash talk.
- Sheet tabs: **Users** (one row per person: real name, fan name, team, device, first/last seen, open count) and **Activity** (one row per app open, at most every 20 minutes per device).

## Score ticker
A scrolling strip under the header with live, today's and last night's scores across every league. Your teams are highlighted and come first; tap a game to open it; hover/hold to pause. Turn it off in Settings.

## History, Draft, Legends & NIL (college)
Uses the same free `CFBD_KEY` as Recruiting — nothing new to set up.
- **📜 History tab** (college football team pages): all-time record, every season with coach, conference record, AP final rank and bowl result; best seasons; coaches list; **Head-to-Head** vs any opponent going back to the first meeting.
- **All-time series** card in every college football Game Center.
- **🏈 Draft tab**: every NFL draft pick from the school by year; tap a name to open his pro career.
- **This Day in History** card on Home for your college football teams.
- **🏛️ Legends**: retired players get a Legend badge; the Players tab shows your school's 1st-round picks as quick links.
- **Throwback trivia**: up to 4 questions per round built from your school's real history.
- **💰 NIL tab** (all college sports): links to On3 valuations, roster value, collective and revenue-sharing info, plus a filtered NIL news feed. Player cards for college players get an On3 NIL link.

Notes: the first look at a school takes ~30 seconds (it builds game history since `HISTORY_FROM`, default 1980) and then it's stored in the **HistoryCache** tab for good. The free CFBD tier has a monthly call limit; the app caps itself at `CFBD_MONTHLY` (default 900) calls per month — set that Script Property to match your tier. Basketball/softball history isn't freely available in this depth.

## Light / Dark look
Tap 🌓 in the header to flip between light and dark, or pick **Dark / Light / Match phone** in Settings. Team colors and logos carry over to both. Saved per device.

## 🎬 Highlights
ESPN posts short highlight clips for finished games, and the app plays them right inside it:
- **Home:** a "Your team highlights" row (falls back to latest highlights across leagues) + a **Highlights** tile.
- **Swipe feed:** full-screen, swipe up for the next clip (TikTok-style). Starts muted (phones require that for autoplay) — tap 🔇 once and sound stays on. Tap the video to pause; buttons jump to the Game Center or share the clip.
- **Game Center:** a 🎬 Highlights card when ESPN has clips for that game.
- **Player cards:** a 🎬 Videos row from that player's news.
Clips usually appear a few hours after a game ends; not every game gets them (fewer for smaller college games and softball). No live game streams — those are licensed to TV networks.

## 📈 Stat Center (NFL & NBA)
Home → **Stat Center** tile (also in More). Free ESPN stat feeds — nothing to set up.
- **Leaders** — top 5 in 12 NFL categories (pass/rush/rec yards & TDs, passer rating, receptions, sacks, tackles, INTs, total TDs) and 10 NBA categories (PPG, RPG, APG, STL, BLK, 3PM, FG%, FT%, double-doubles, minutes). "Full list ›" jumps to the full table.
- **Player Stats** — full sortable tables (tap any column header). NFL: Passing, Rushing, Receiving, Defense, Kicking. NBA: Per Game, Shooting, Season Totals. Filter by player or team; "Load more" pages 50 at a time. Your teams' players are highlighted.
- **Team Ranks** — every team ranked on offense, defense and other stats with bar charts (lower-is-better stats like points allowed rank correctly).
- **FPI / BPI** — ESPN Power Index: rating, offense/defense, record, projected record, playoff, division and title odds.
- **Injuries** — league-wide report, your teams first, filter by Out / Doubtful / Questionable.
- **Team pages** for NFL & NBA teams get a **📈 Stat Ranks** tab: where that team ranks in each stat (green = top quarter, red = bottom quarter), its FPI/BPI odds and its injury report.
- Before a new NBA season has games, it shows last season's final numbers with a note, then switches over on its own.

## 🖥️ Computers & laptops
On screens 1024px and wider the app uses the full width: the bottom tabs become a left-side rail, text is a little larger, and tiles, game cards, leaders and tables spread across the screen. Phones look the same as before.

## App icon
`icons/icon.svg` is the source art (football on a gold swivel-chair base). PNGs: `icon-192/256/384/512` (installs, including Windows/Mac desktop), `icon-maskable-192/512` (Android adaptive), `apple-touch-icon` (iPhone home screen) and `favicon-32`. People who already added the app to their home screen may need to remove and re-add it to see the new icon — phones cache home-screen icons.

## ☁️ Backup & sync across devices
Teams, colors, light/dark, ticker, fantasy league, Morning Brief and other settings are saved to the backend under each person's **fan name + PIN**. Sign in on another phone, computer or browser with the same fan name and PIN and everything comes back — no re-picking teams. Changes save automatically a few seconds after they're made, and other devices pick them up when the app is opened or brought back up (newest change wins). Settings → **Backup & sync** shows the last save and has a **Sync now** button.

Setup (one time): paste the new `gas/Code.gs`, then **Deploy → Manage deployments → edit → New version**. A `Settings` tab is added to the sheet automatically on the first save (one row per person). Delete someone's row there to clear their saved settings.

Anyone already set up gets backed up automatically the first time they open the updated app.
