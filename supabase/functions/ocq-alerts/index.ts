// Office Chair QB — score alert sender. A pg_cron job calls this every minute.
// Checks ESPN scoreboards for every followed team, compares with the last-seen score in ocq_game_state,
// and sends: kickoff in 15, scores (football/hockey/baseball), close & late, final, and fantasy-player TDs (NFL).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const PATH: Record<string, string> = {
  nfl: "football/nfl", cfb: "football/college-football", nba: "basketball/nba", wnba: "basketball/wnba", mlb: "baseball/mlb", nhl: "hockey/nhl",
  mbb: "basketball/mens-college-basketball", wbb: "basketball/womens-college-basketball", cbase: "baseball/college-baseball", soft: "baseball/college-softball",
};
const ICON: Record<string, string> = { nfl: "🏈", cfb: "🏈", nba: "🏀", wnba: "🏀", mbb: "🏀", wbb: "🏀", mlb: "⚾", cbase: "⚾", soft: "🥎", nhl: "🏒" };
const WEEKLY = ["nfl", "cfb"];
const SCORE_ALERTS = ["nfl", "cfb", "nhl", "mlb", "cbase", "soft"]; // basketball scores too often — close/final only
const START_WORD: Record<string, string> = { nfl: "Kickoff", cfb: "Kickoff", nhl: "Puck drop", mlb: "First pitch", cbase: "First pitch", soft: "First pitch" };

type Sub = { endpoint: string; sub: any; teams: string[]; prefs: Record<string, boolean>; ffl: { id: string; first: string; last: string; pro: number }[]; fails: number };

const chicago = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/-/g, "");
const chiHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(new Date()));
async function getJSON(u: string) {
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (OfficeChairQB alerts)" } });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}
async function scoreboard(lg: string) {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${PATH[lg]}/scoreboard?limit=400`;
  const grp = lg === "cfb" ? "&groups=80" : ["mbb", "wbb"].includes(lg) ? "&groups=50" : "";
  const urls = WEEKLY.includes(lg) ? [base + grp] : [base + grp + "&dates=" + chicago(new Date())];
  if (!WEEKLY.includes(lg) && chiHour() < 5) urls.push(base + grp + "&dates=" + chicago(new Date(Date.now() - 864e5)));
  const all = await Promise.all(urls.map((u) => getJSON(u).catch(() => ({ events: [] }))));
  return all.flatMap((d: any) => d.events || []);
}
const clockSecs = (c: string) => { const m = /(\d+):(\d+)/.exec(c || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
function isCloseLate(lg: string, comp: any, diff: number) {
  const st = comp.status || {}, per = Number(st.period) || 0, secs = clockSecs(st.displayClock);
  if (lg === "nfl" || lg === "cfb") return per >= 4 && (per > 4 || secs <= 300) && diff <= 8;
  if (lg === "mbb") return per >= 2 && (per > 2 || secs <= 240) && diff <= 5;
  if (["nba", "wnba", "wbb"].includes(lg)) return per >= 4 && (per > 4 || secs <= 240) && diff <= 5;
  if (lg === "nhl") return per >= 3 && (per > 3 || secs <= 300) && diff <= 1;
  return per >= 8 && diff <= 2; // baseball/softball (softball 6th+ handled below)
}

Deno.serve(async (req) => {
  const cfg = Object.fromEntries(((await db.from("ocq_config").select("key,value")).data || []).map((r: any) => [r.key, r.value]));
  if (req.headers.get("x-ocq-cron") !== cfg.cron_token) return new Response("forbidden", { status: 403 });
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

  const subs: Sub[] = ((await db.from("ocq_push_subs").select("endpoint,sub,teams,prefs,ffl,fails").lt("fails", 5)).data || []) as Sub[];
  if (!subs.length) return Response.json({ ok: true, subs: 0 });
  const leagues = new Set<string>();
  subs.forEach((s) => { (s.teams || []).forEach((t) => leagues.add(t.split(":")[0])); if ((s.ffl || []).length && s.prefs?.ffl !== false) leagues.add("nfl"); });

  const out: { s: Sub; msg: any }[] = [];
  const log: string[] = [];
  const now = Date.now();
  for (const lg of leagues) {
    if (!PATH[lg]) continue;
    let events: any[] = [];
    try { events = await scoreboard(lg); } catch (e) { log.push(`${lg}: ${e}`); continue; }
    const followers = (id: string) => subs.filter((s) => (s.teams || []).includes(`${lg}:${id}`));
    const fflSubs = (ids: string[]) => lg === "nfl" ? subs.filter((s) => s.prefs?.ffl !== false && (s.ffl || []).some((p) => ids.includes(String(p.pro)))) : [];
    const relevant = events.filter((ev) => {
      const ids = (ev.competitions?.[0]?.competitors || []).map((c: any) => String(c.id || c.team?.id));
      return ids.some((id: string) => followers(id).length) || fflSubs(ids).length;
    });
    if (!relevant.length) continue;
    const { data: rows } = await db.from("ocq_game_state").select("*").eq("lg", lg).in("event_id", relevant.map((e) => String(e.id)));
    const prev = new Map((rows || []).map((r: any) => [r.event_id, r]));
    const upserts: any[] = [];
    for (const ev of relevant) {
      const comp = ev.competitions?.[0] || {}, cs = comp.competitors || [];
      const away = cs.find((c: any) => c.homeAway === "away") || cs[0], home = cs.find((c: any) => c.homeAway === "home") || cs[1];
      if (!away || !home) continue;
      const aId = String(away.id || away.team?.id), hId = String(home.id || home.team?.id);
      const st = comp.status?.type || ev.status?.type || {}, state = st.state;
      const aS = Number(away.score) || 0, hS = Number(home.score) || 0;
      const p = prev.get(String(ev.id));
      const notified = { ...(p?.notified || {}) };
      const A = away.team?.abbreviation || "", H = home.team?.abbreviation || "";
      const line = `${A} ${aS} – ${H} ${hS}`;
      const detail = st.shortDetail || "";
      const path = `?game=${lg}:${ev.id}`;
      const tv = (comp.broadcasts || []).flatMap((b: any) => b.names || []).filter(Boolean)[0] || "";
      const fol = { a: followers(aId), h: followers(hId) };
      const allFol = [...new Set([...fol.a, ...fol.h])];
      const push = (list: Sub[], pref: string, msg: any) => list.filter((s) => s.prefs?.[pref] !== false).forEach((s) => out.push({ s, msg: { ...msg, path, tag: `${lg}-${ev.id}` } }));
      const teamName = (c: any) => c.team?.shortDisplayName || c.team?.displayName || c.team?.abbreviation || "";

      // kickoff / tip-off in 15
      const start = new Date(ev.date).getTime();
      if (state === "pre" && start - now <= 16 * 60e3 && start - now > -5 * 60e3 && !notified.kick) {
        notified.kick = 1;
        push(allFol, "kick", { title: `${ICON[lg]} ${A} @ ${H} starts soon`, body: `${START_WORD[lg] || "Tip-off"} in about 15 minutes${tv ? " on " + tv : ""}. Tap for GameCast.` });
      }
      // scores (baseline the first time we see a game so we never alert on old points)
      if (p && state !== "pre" && SCORE_ALERTS.includes(lg)) {
        const da = aS - (p.away_score ?? aS), dh = hS - (p.home_score ?? hS);
        if (da > 0 || dh > 0) {
          let playText = "";
          let scoringPlay: any = null;
          if (lg === "nfl" || lg === "cfb") {
            try {
              const sum = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/${PATH[lg]}/summary?event=${ev.id}`);
              scoringPlay = (sum.scoringPlays || []).slice(-1)[0] || null;
              playText = scoringPlay?.text || "";
            } catch (_) { /* score alert still goes out without the play */ }
          }
          const scorer = da > 0 && dh <= 0 ? away : dh > 0 && da <= 0 ? home : null;
          const body = `${line} · ${detail}${playText ? "\n" + playText : ""}`;
          if (scorer) {
            const other = scorer === away ? home : away;
            push(scorer === away ? fol.a : fol.h, "score", { title: `🔥 ${teamName(scorer)} score${lg === "nhl" ? "s a goal" : "s"}!`, body });
            push((scorer === away ? fol.h : fol.a).filter((s) => !(scorer === away ? fol.a : fol.h).includes(s)), "score", { title: `😬 ${teamName(scorer)} scored on ${teamName(other)}`, body });
          } else push(allFol, "score", { title: `${ICON[lg]} Score update: ${A} @ ${H}`, body });
          // fantasy: did the scoring play mention one of my players?
          if (lg === "nfl" && playText) {
            fflSubs([aId, hId]).forEach((s) => {
              const hit = (s.ffl || []).find((pl) => [aId, hId].includes(String(pl.pro)) &&
                new RegExp(`(\\b${pl.first.replace(/[^\w'-]/g, "")}\\s+|\\b${(pl.first[0] || "").replace(/\W/g, "")}\\.\\s?)${pl.last.replace(/[^\w' -]/g, "")}\\b`, "i").test(playText));
              if (hit && s.prefs?.ffl !== false) out.push({ s, msg: { title: `⭐ Your fantasy guy ${hit.first} ${hit.last} scored!`, body: `${playText}\n${line}`, path, tag: `ffl-${ev.id}-${scoringPlay?.id || aS + hS}` } });
            });
          }
        }
      }
      // close & late (once per game)
      if (state === "in" && !notified.close) {
        const diff = Math.abs(aS - hS);
        const late = lg === "soft" ? (Number(comp.status?.period) || 0) >= 6 && diff <= 2 : isCloseLate(lg, comp, diff);
        if (late) { notified.close = 1; push(allFol, "close", { title: `⏰ Close one! ${line}`, body: `${detail} — get to a TV. Tap for GameCast.` }); }
      }
      // final (once)
      if (state === "post" && p && p.state !== "post" && !notified.final) {
        notified.final = 1;
        const w = away.winner ? away : home.winner ? home : (aS > hS ? away : hS > aS ? home : null);
        const rec = (c: any) => (c.records || [])[0]?.summary || "";
        [[fol.a, away], [fol.h, home]].forEach(([list, c]: any) => {
          const won = w === c, tie = !w;
          push(list, "final", { title: tie ? `🤝 Final: ${line}` : won ? `🎉 ${teamName(c)} wins! ${line}` : `😞 ${teamName(c)} falls, ${line}`, body: `Final${rec(c) ? " · now " + rec(c) : ""}. Tap for the recap.` });
        });
      }
      if (state === "post" && !p) notified.final = 1; // first seen already final → nothing to say
      upserts.push({ lg, event_id: String(ev.id), state, away_id: aId, home_id: hId, away_score: aS, home_score: hS, start_at: new Date(ev.date).toISOString(), notified, updated_at: new Date().toISOString() });
    }
    if (upserts.length) await db.from("ocq_game_state").upsert(upserts);
  }

  // send (one message per phone per alert)
  let sent = 0, gone = 0;
  const failed = new Map<string, number>();
  await Promise.all(out.map(async ({ s, msg }) => {
    try { await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 900, urgency: "high", topic: String(msg.tag).replace(/[^\w-]/g, "").slice(0, 32) }); sent++; }
    catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) { gone++; await db.from("ocq_push_subs").delete().eq("endpoint", s.endpoint); }
      else failed.set(s.endpoint, (s.fails || 0) + 1);
    }
  }));
  for (const [endpoint, fails] of failed) await db.from("ocq_push_subs").update({ fails }).eq("endpoint", endpoint);
  if (sent) await db.from("ocq_push_subs").update({ last_sent: new Date().toISOString(), fails: 0 }).in("endpoint", [...new Set(out.map((o) => o.s.endpoint))].filter((e) => !failed.has(e)));
  // housekeeping: forget games older than 4 days
  if (new Date().getMinutes() === 0) await db.from("ocq_game_state").delete().lt("updated_at", new Date(now - 4 * 864e5).toISOString());
  return Response.json({ ok: true, subs: subs.length, leagues: [...leagues], alerts: out.length, sent, gone, failed: failed.size, log });
});
