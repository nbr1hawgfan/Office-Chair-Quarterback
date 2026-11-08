// Office Chair QB — saves a phone's alert subscription + preferences (and sends a test alert)
// Deployed to the "Offsite WMS" Supabase project; uses only the ocq_* tables.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.services\.microsoft\.com$/];
const LEAGUES = ["nfl", "cfb", "nba", "wnba", "mlb", "nhl", "mbb", "wbb", "cbase", "soft"];

async function cfg() {
  const { data } = await db.from("ocq_config").select("key,value");
  return Object.fromEntries((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
}
function cleanSub(s: any) {
  if (!s || typeof s.endpoint !== "string" || !s.keys?.p256dh || !s.keys?.auth) throw new Error("Bad subscription");
  const u = new URL(s.endpoint);
  if (u.protocol !== "https:" || !PUSH_HOSTS.some((re) => re.test(u.hostname))) throw new Error("Unsupported push service");
  return { endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh).slice(0, 200), auth: String(s.keys.auth).slice(0, 100) } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const b = await req.json();
    if (b.action === "subscribe") {
      const sub = cleanSub(b.sub);
      const teams = (Array.isArray(b.teams) ? b.teams : []).map(String).filter((t: string) => /^[a-z]+:\d+$/.test(t) && LEAGUES.includes(t.split(":")[0])).slice(0, 40);
      const p = b.prefs || {};
      const prefs = { kick: p.kick !== false, score: p.score !== false, close: p.close !== false, final: p.final !== false, ffl: p.ffl !== false,
        fflm: ["off", "lead", "15", "30", "60"].includes(String(p.fflm)) ? String(p.fflm) : "30" };
      // fantasy league for matchup updates; private leagues are read through the office Apps Script relay
      const L = b.league || null;
      let league = null;
      if (L && /^\d{1,12}$/.test(String(L.leagueId)) && /^\d{4}$/.test(String(L.season)) && /^\d{1,4}$/.test(String(L.teamId))) {
        let relay = "";
        try { const u = new URL(String(L.relay || "")); if (u.protocol === "https:" && u.hostname === "script.google.com" && u.pathname.startsWith("/macros/s/")) relay = u.origin + u.pathname; } catch (_) { /* no relay */ }
        league = { leagueId: String(L.leagueId), season: String(L.season), teamId: String(L.teamId), relay };
      }
      const ffl = (Array.isArray(b.ffl) ? b.ffl : []).slice(0, 30).map((x: any) => ({ id: String(x.id || "").slice(0, 20), first: String(x.first || "").slice(0, 30), last: String(x.last || "").slice(0, 40), pro: Number(x.pro) || 0 }))
        .filter((x: any) => x.last && x.pro);
      const { count } = await db.from("ocq_push_subs").select("endpoint", { count: "exact", head: true });
      if ((count || 0) > 1500) throw new Error("Alert list is full");
      const { error } = await db.from("ocq_push_subs").upsert({ endpoint: sub.endpoint, sub, teams, prefs, ffl, ffl_league: league, fan: String(b.fan || "").slice(0, 40), fails: 0, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true, teams: teams.length, ffl: ffl.length, league: !!league });
    }
    if (b.action === "unsubscribe") {
      await db.from("ocq_push_subs").delete().eq("endpoint", String(b.endpoint || ""));
      return json({ ok: true });
    }
    if (b.action === "test") {
      const { data } = await db.from("ocq_push_subs").select("sub").eq("endpoint", String(b.endpoint || "")).maybeSingle();
      if (!data) throw new Error("Not subscribed");
      const c = await cfg();
      webpush.setVapidDetails(c.vapid_subject, c.vapid_public, c.vapid_private);
      await webpush.sendNotification(data.sub, JSON.stringify({ title: "🔔 Alerts are on!", body: "This is what a score alert looks like. Go team! 🏈", tag: "ocq-test", path: "" }), { TTL: 600, urgency: "high" });
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
