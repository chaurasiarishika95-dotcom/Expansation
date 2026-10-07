# PRD — UFC Expansion Command Center

## Vision
Help urban fulfillment planners decide where to expand, what to stock, how to allocate capacity, and when to expand assortment while balancing customer selection, delivery speed and operational economics.

## Users
Product managers, network planners, fulfillment/operations planners, inventory planners, business analysts and program managers.

## Product loop
**Forecast → Discover → Plan → Optimize → Simulate → Decide → Explain**

## Key metrics
- Forecast error / MAPE
- Customer selection coverage
- Product availability
- Capacity utilization
- Stockout exposure
- Incremental customer coverage
- Inventory investment per incremental coverage point
- Recommendation acceptance / override rate
- Time from planning question to decision

## Forecasting MVP
Baseline demand + trend + day/time seasonality + event uplift. The architecture allows the forecasting layer to be replaced by a trained ML/time-series model when real data becomes available.

## Product principles
1. Expose customer and operational trade-offs.
2. Make forecast assumptions visible.
3. Keep recommendations explainable.
4. Keep the planner in control.
5. Separate data sources from decision logic.

## Roadmap
v0.1 decision prototype → v0.2 real-data adapter and forecast evaluation → v0.3 network/SKU optimization → v0.4 production monitoring and alerts.

## Scope boundary
Synthetic data is used for the portfolio prototype. It does not represent Amazon internal systems, algorithms or data.
