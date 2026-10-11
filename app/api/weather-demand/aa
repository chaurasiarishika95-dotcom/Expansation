import { CATEGORIES, summarizeWeather, weatherRules, combine, parseAiAdjustments, seasonLabel } from "../../../lib/seasonality";

export const dynamic = "force-dynamic";
const COORDS = { "South Delhi": [28.52, 77.21], Gurgaon: [28.46, 77.03], Noida: [28.57, 77.32], "West Delhi": [28.65, 77.07], "Central Delhi": [28.64, 77.22], "North Delhi": [28.71, 77.2], "East Delhi": [28.63, 77.3], Ghaziabad: [28.67, 77.44] };
const hits = new Map(), cache = new Map();

export async function POST(req) {
  const ip = (req.headers.get("x-forwarded-for") || "x").split(",")[0], now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= 40) return Response.json({ error: "Too many requests" }, { status: 429 });
  recent.push(now); hits.set(ip, recent);
  try {
    const { zone = "West Delhi", useAI = false } = await req.json();
    const c = COORDS[zone] || COORDS["West Delhi"];
    const month = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", month: "numeric" }));
    let w = cache.get(zone), weatherNote = null;
    if (!w || now - w.t > 1800000) {
      try {
        const [f, a] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c[0]}&longitude=${c[1]}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=7&timezone=Asia%2FKolkata`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c[0]}&longitude=${c[1]}&hourly=us_aqi&forecast_days=5&timezone=Asia%2FKolkata`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (f.error) throw new Error("weather");
        w = { t: now, summary: summarizeWeather(f.daily, a?.hourly?.us_aqi) };
        cache.set(zone, w);
      } catch (e) {
        w = null;
        weatherNote = "Weather forecast is unavailable right now, so only the season is applied.";
      }
    }
    const summary = w ? w.summary : null;
    const rules = summary ? weatherRules(summary) : {};
    let weatherPart = rules, mode = "rules", aiStatus = null;
    const key = process.env.GEMINI_API_KEY;
    if (useAI && summary) {
      if (!key) aiStatus = "Gemini key not configured, using rules.";
      else {
        try {
          const prompt = `You help an urban fulfillment demand planner in Delhi NCR. Month number: ${month} (${seasonLabel(month)}). Zone: ${zone}. 7-day forecast summary: ${JSON.stringify(summary)}. Rule-based reference adjustments: ${JSON.stringify(Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, Math.round(v.m * 1000) / 1000])))}.
Estimate the demand multiplier from WEATHER AND LOCAL EVENTS ONLY (the seasonal pattern is handled separately) for these categories: ${CATEGORIES.join(", ")}.
Rules: be conservative; each multiplier must be between 0.85 and 1.25; include only categories you expect to move by 2% or more; mention a festival or event only if you are confident it falls in this period; keep each reason under 100 characters; do not invent data.
Return ONLY JSON: {"adjustments":[{"category":"...","multiplier":1.00,"reason":"..."}]}`;
          const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 2000 } }) });
          if (!r.ok) throw new Error("gemini");
          const j = await r.json();
          const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
          const parsed = parseAiAdjustments(text);
          if (!parsed) throw new Error("parse");
          weatherPart = { ...rules, ...parsed }; mode = "ai";
        } catch (e) { aiStatus = "Gemini was unavailable or returned an invalid answer, so rule-based adjustments are shown."; }
      }
    }
    const { categories, factors } = combine(month, weatherPart, mode === "ai" ? "Gemini" : "weather rules");
    return Response.json({ zone, month, seasonLabel: seasonLabel(month), weather: summary, mode: summary ? mode : "season", aiStatus: weatherNote || aiStatus, categories, factors });
  } catch (e) {
    return Response.json({ error: "Weather and season data is unavailable right now." }, { status: 502 });
  }
}
