// Season and weather demand layer. ALL multipliers here are planning ASSUMPTIONS, not measured values.
// Replace the SEASON table with observed seasonality from real order data when available.
export const CATEGORIES = ["Fresh Produce","Dairy","Snacks","Beverages","Household Cleaning","Personal Care","Packaged Food","Bakery","Frozen Foods","Baby Care","Pet Care","Health & Wellness","Home Essentials","Beauty","Electronics Accessories","Meat Alternatives"];
export const MIN_F = 0.8, MAX_F = 1.35;
export const clamp = (v, lo = MIN_F, hi = MAX_F) => Math.max(lo, Math.min(hi, v));

// Month (1-12) -> category multipliers for Delhi NCR (heat, monsoon, festive season, winter). Missing = 1.0.
const SEASON = {
  1: { "Health & Wellness": 1.10, Bakery: 1.05, Snacks: 1.05, Beverages: 0.85, "Frozen Foods": 0.85 },
  2: { "Health & Wellness": 1.05, Beverages: 0.92, "Frozen Foods": 0.90 },
  3: { Beverages: 1.05, Beauty: 1.05 },
  4: { Beverages: 1.15, "Frozen Foods": 1.12, Dairy: 1.05, "Fresh Produce": 1.05 },
  5: { Beverages: 1.25, "Frozen Foods": 1.20, Dairy: 1.08, "Fresh Produce": 1.05 },
  6: { Beverages: 1.25, "Frozen Foods": 1.20, Dairy: 1.08 },
  7: { Snacks: 1.08, "Packaged Food": 1.05, "Health & Wellness": 1.05, Beverages: 1.05 },
  8: { Snacks: 1.08, "Packaged Food": 1.05 },
  9: { Beverages: 1.08, "Frozen Foods": 1.05, "Household Cleaning": 1.05 },
  10: { "Household Cleaning": 1.15, "Home Essentials": 1.12, Snacks: 1.12, Bakery: 1.10, Beauty: 1.08, "Personal Care": 1.05, "Electronics Accessories": 1.10, "Packaged Food": 1.05, Dairy: 1.05 },
  11: { "Household Cleaning": 1.12, "Home Essentials": 1.10, Snacks: 1.12, Bakery: 1.12, Beauty: 1.10, "Electronics Accessories": 1.12, "Health & Wellness": 1.08, "Frozen Foods": 0.95, Beverages: 0.92 },
  12: { Bakery: 1.12, Snacks: 1.08, "Health & Wellness": 1.08, Beverages: 0.88, "Frozen Foods": 0.88, "Electronics Accessories": 1.05 },
};
const SEASON_NOTE = { 1: "Winter", 2: "Late winter", 3: "Spring", 4: "Early summer", 5: "Peak summer", 6: "Peak summer", 7: "Monsoon", 8: "Monsoon", 9: "Late monsoon", 10: "Festive season begins", 11: "Festive season and winter", 12: "Winter and year-end" };
export const seasonLabel = (m) => SEASON_NOTE[m] || "";
export const seasonFactors = (m) => Object.fromEntries(CATEGORIES.map((c) => [c, SEASON[m]?.[c] ?? 1]));

// Summarize a 7-day forecast and air quality into the numbers the rules use.
export function summarizeWeather(daily, aqiHourly) {
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const max = (daily?.temperature_2m_max || []).filter((x) => x != null);
  const min = (daily?.temperature_2m_min || []).filter((x) => x != null);
  const rain = (daily?.precipitation_sum || []).filter((x) => x != null);
  const aqi = (aqiHourly || []).filter((x) => x != null);
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return { avgMax: r1(avg(max)), avgMin: r1(avg(min)), rainMm: r1(rain.reduce((s, x) => s + x, 0)), aqiMax: aqi.length ? Math.round(Math.max(...aqi)) : null, aqiAvg: aqi.length ? Math.round(avg(aqi)) : null, days: max.length };
}

// Rule-based weather effects: returns { category: { m: multiplier, why } } for affected categories only.
export function weatherRules(w) {
  const out = {};
  const add = (c, d, why) => { const cur = out[c] || { m: 1, why: [] }; cur.m += d; cur.why.push(why); out[c] = cur; };
  if (w.avgMax != null && w.avgMax >= 34) {
    const hot = w.avgMax >= 38, s = hot ? "Heat above 38C" : "Heat above 34C";
    add("Beverages", hot ? 0.18 : 0.10, s + " lifts cold drinks"); add("Frozen Foods", hot ? 0.14 : 0.08, s + " lifts frozen desserts");
    add("Dairy", hot ? 0.06 : 0.04, s + " lifts curd and milk"); add("Bakery", hot ? -0.05 : -0.03, s + " slows bakery");
  }
  if (w.avgMin != null && w.avgMin <= 12) {
    const cold = w.avgMin <= 8, s = cold ? "Cold nights below 8C" : "Cool nights below 12C", k = cold ? 1 : 0.5;
    add("Health & Wellness", 0.08 * k, s + " lifts wellness items"); add("Bakery", 0.05 * k, s + " lifts bakery"); add("Snacks", 0.04 * k, s + " lifts snacks");
    add("Beverages", -0.06 * k, s + " slows cold drinks"); add("Frozen Foods", -0.08 * k, s + " slows frozen foods");
  }
  if (w.rainMm != null && w.rainMm >= 40) {
    const s = "Heavy rain expected";
    add("Snacks", 0.06, s + " lifts snacks"); add("Packaged Food", 0.05, s + " lifts ready food"); add("Home Essentials", 0.02, s); add("Fresh Produce", -0.03, s + " can disrupt fresh supply");
  }
  if (w.aqiMax != null && w.aqiMax >= 200) {
    const sev = w.aqiMax >= 300, s = sev ? "Severe air pollution (AQI 300+)" : "Poor air quality (AQI 200+)";
    add("Health & Wellness", sev ? 0.12 : 0.06, s + " lifts wellness items"); add("Personal Care", sev ? 0.03 : 0.015, s);
  }
  return out;
}

// Combine season and weather parts. weatherPart: { category: { m, why } }
export function combine(month, weatherPart, source) {
  const season = seasonFactors(month);
  const cats = CATEGORIES.map((c) => {
    const wm = clamp(weatherPart[c]?.m ?? 1, 0.85, 1.25);
    const sm = season[c];
    const why = [sm !== 1 ? `${seasonLabel(month)}` : null, weatherPart[c]?.why ? (Array.isArray(weatherPart[c].why) ? weatherPart[c].why.join("; ") : weatherPart[c].why) : null].filter(Boolean).join(". ");
    return { category: c, season: round3(sm), weather: round3(wm), final: round3(clamp(sm * wm)), reason: why || "No expected change", source: weatherPart[c] ? source : sm !== 1 ? "season table" : "none" };
  });
  return { categories: cats, factors: Object.fromEntries(cats.map((x) => [x.category, x.final])) };
}
const round3 = (x) => Math.round(x * 1000) / 1000;

// Validate Gemini output: only known categories, numeric, bounded. Returns { category: { m, why } } or null.
export function parseAiAdjustments(text) {
  try {
    const clean = String(text).replace(/```json|```/g, "").trim();
    const j = JSON.parse(clean);
    const list = Array.isArray(j) ? j : j.adjustments;
    if (!Array.isArray(list)) return null;
    const out = {};
    for (const a of list) {
      if (!a || !CATEGORIES.includes(a.category)) continue;
      const m = Number(a.multiplier);
      if (!Number.isFinite(m)) continue;
      out[a.category] = { m: clamp(m, 0.85, 1.25), why: String(a.reason || "AI estimate").slice(0, 140) };
    }
    return out;
  } catch { return null; }
}
