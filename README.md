# UFC Expansion Command Center

Independent PM case study: demand forecasting, selection expansion and urban fulfillment network planning.

Workflow: **Forecast → Discover → Plan → Optimize → Simulate → Decide → Explain**

## Core decisions
- WHERE: candidate UFC expansion location
- WHAT: assortment/category expansion
- HOW: capacity and inventory allocation
- WHEN: expansion trigger based on demand/capacity signals

## Run
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Gemini
Add `GEMINI_API_KEY` to Vercel environment variables. Optional `GEMINI_MODEL` can override the default model. Core product works without Gemini; only Copilot requires the key.

## Real-data readiness
The MVP uses synthetic data, but product logic is separated from the data layer. Later, replace `lib/data.js` with real order/event, inventory, facility, customer/geography and promotion sources. Forecasting can then be upgraded to a trained time-series/ML model and evaluated with forecast error metrics such as MAPE.

## Scope
This is an independent case study and does not reproduce Amazon proprietary systems, algorithms or data.
