"use client";

import { useMemo, useState } from "react";
import {
  zones,
  facilities,
  skuCategories,
  forecastInputs,
  candidateUFCs,
} from "../lib/data";

import {
  forecastDemand,
  forecastExplanation,
} from "../lib/forecast";

import {
  rankExpansionCandidates,
  recommendAssortment,
  recommendCapacity,
} from "../lib/optimizer";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "forecast", label: "Demand Forecast" },
  { id: "expansion", label: "UFC Expansion" },
  { id: "assortment", label: "Assortment" },
  { id: "scenario", label: "Scenario Builder" },
];

const kpis = {
  demand: 11405,
  coverage: 22,
  delivery: 16.8,
  investment: 82,
  score: 86,
  skus: 4800,
  availability: 95.2,
  storage: 83,
};

const candidates = [
  {
    name: "South Delhi",
    demand: 11405,
    coverage: 22,
    delivery: 16.8,
    investment: 82,
    score: 86,
    decision: "Launch",
  },
  {
    name: "Gurgaon",
    demand: 9800,
    coverage: 15,
    delivery: 17.4,
    investment: 76,
    score: 79,
    decision: "Evaluate",
  },
  {
    name: "Noida",
    demand: 8900,
    coverage: 12,
    delivery: 18.1,
    investment: 71,
    score: 74,
    decision: "Evaluate",
  },
  {
    name: "West Delhi",
    demand: 7400,
    coverage: 9,
    delivery: 19.2,
    investment: 68,
    score: 68,
    decision: "Defer",
  },
];

const assortment = [
  {
    category: "Electronics",
    demand: "High",
    gap: "High",
    space: "Medium",
    priority: "P1",
    reason: "High demand and significant customer selection gap.",
  },
  {
    category: "Apparel",
    demand: "High",
    gap: "High",
    space: "High",
    priority: "P1",
    reason: "Large incremental selection opportunity.",
  },
  {
    category: "Beauty",
    demand: "Medium",
    gap: "High",
    space: "Low",
    priority: "P2",
    reason: "Strong customer gap with relatively efficient storage.",
  },
  {
    category: "Footwear",
    demand: "Medium",
    gap: "Medium",
    space: "Medium",
    priority: "P2",
    reason: "Good expansion candidate after initial demand validation.",
  },
  {
    category: "Furniture",
    demand: "Low",
    gap: "Medium",
    space: "Very High",
    priority: "Defer",
    reason: "High storage requirement relative to incremental demand.",
  },
];

function MetricCard({ value, label, description }) {
  return (
    <div className="metric-card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-description">{description}</div>
    </div>
  );
}

function ScoreBar({ label, value }) {
  return (
    <div className="score-row">
      <div className="score-label">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("overview");
  const [demandMultiplier, setDemandMultiplier] = useState(100);
  const [inventoryBudget, setInventoryBudget] = useState(80);
  const [storageCapacity, setStorageCapacity] = useState(85);
  const [deliveryTarget, setDeliveryTarget] = useState(20);

  const [copilotQuestion, setCopilotQuestion] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);

  const scenario = useMemo(() => {
    const demand = Math.round(
      kpis.demand * (demandMultiplier / 100)
    );

    const skuIncrease =
      demandMultiplier > 110
        ? Math.round((demandMultiplier - 100) * 30)
        : 0;

    const skus = kpis.skus + skuIncrease;

    const availability = Math.max(
      87,
      Math.min(
        98,
        kpis.availability +
          (inventoryBudget - 80) * 0.08 -
          (demandMultiplier - 100) * 0.08
      )
    );

    const storage = Math.min(
      99,
      Math.max(
        65,
        kpis.storage +
          (skus - kpis.skus) / 100 -
          (inventoryBudget - 80) * 0.15
      )
    );

    const delivery =
      kpis.delivery +
      Math.max(0, demandMultiplier - 100) * 0.06 -
      Math.max(0, inventoryBudget - 80) * 0.025;

    return {
      demand,
      skus,
      availability: availability.toFixed(1),
      storage: storage.toFixed(0),
      delivery: delivery.toFixed(1),
    };
  }, [
    demandMultiplier,
    inventoryBudget,
    storageCapacity,
    deliveryTarget,
  ]);

  async function askCopilot() {
    if (!copilotQuestion.trim()) return;

    setCopilotLoading(true);
    setCopilotAnswer("");

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: copilotQuestion,
          context: {
            recommendation: "Launch South Delhi UFC",
            demand: kpis.demand,
            coverageGain: kpis.coverage,
            delivery: kpis.delivery,
            investment: kpis.investment,
            score: kpis.score,
            scenario,
          },
        }),
      });

      const data = await response.json();

      setCopilotAnswer(
        data.answer ||
          "The recommendation is driven by demand, incremental customer coverage, delivery performance and investment constraints."
      );
    } catch (error) {
      setCopilotAnswer(
        "South Delhi is recommended because it provides the highest incremental customer coverage among evaluated candidates while maintaining the delivery target and a reasonable investment profile."
      );
    }

    setCopilotLoading(false);
  }

  return (
    <main className="app-shell">

      {/* HEADER */}
      <header className="top-header">
        <div>
          <div className="eyebrow">UFC EXPANSION COMMAND CENTER</div>
          <h1>Demand & Network Planning</h1>
          <p>
            Decide <strong>where to expand</strong>,{" "}
            <strong>what to stock</strong>, and{" "}
            <strong>when to scale</strong>.
          </p>
        </div>

        <div className="header-status">
          <span className="status-dot" />
          Planning scenario
          <strong>Delhi NCR</strong>
          <span className="status-divider">|</span>
          7-day horizon
        </div>
      </header>

      {/* NAVIGATION */}
      <nav className="tab-navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* OVERVIEW */}
      {activeTab === "overview" && (
        <>
          <section className="hero-grid">

            <div className="recommendation-card">
              <div className="section-kicker">
                RECOMMENDED ACTION
              </div>

              <div className="recommendation-title-row">
                <div>
                  <h2>Launch South Delhi UFC</h2>
                  <p>
                    Highest incremental customer coverage among
                    evaluated locations while maintaining delivery
                    and investment constraints.
                  </p>
                </div>

                <div className="decision-score">
                  <strong>{kpis.score}</strong>
                  <span>/100</span>
                  <small>Recommendation score</small>
                </div>
              </div>

              <div className="button-row">
                <button
                  className="primary-button"
                  onClick={() => setActiveTab("expansion")}
                >
                  View decision
                </button>

                <button
                  className="secondary-button"
                  onClick={() => setActiveTab("scenario")}
                >
                  Run scenario
                </button>
              </div>
            </div>

            <div className="forecast-card">
              <div className="section-kicker">DEMAND SIGNAL</div>
              <div className="forecast-number">
                {kpis.demand.toLocaleString()}
              </div>
              <div className="forecast-unit">orders / day</div>

              <div className="confidence-row">
                <span>Forecast confidence</span>
                <strong>84%</strong>
              </div>

              <div className="mini-chart">
                {[55, 62, 58, 68, 73, 79, 84, 90].map(
                  (height, index) => (
                    <div
                      key={index}
                      className="chart-bar"
                      style={{ height: `${height}%` }}
                    />
                  )
                )}
              </div>
            </div>

          </section>

          {/* KPI ROW */}
          <section className="metric-grid">
            <MetricCard
              value={`+${kpis.coverage}%`}
              label="Customer coverage"
              description="Incremental customers within target delivery radius"
            />

            <MetricCard
              value={kpis.demand.toLocaleString()}
              label="Forecast demand"
              description="Expected daily orders in the candidate catchment"
            />

            <MetricCard
              value={`${kpis.delivery} min`}
              label="Expected delivery"
              description="Projected average delivery time"
            />

            <MetricCard
              value={`₹${kpis.investment}L`}
              label="Illustrative investment"
              description="Estimated launch investment for the UFC"
            />
          </section>

          {/* DECISION + MAP */}
          <section className="two-column">

            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="section-kicker">
                    DECISION LOGIC
                  </div>
                  <h2>Why South Delhi?</h2>
                </div>
                <span className="info-pill">Explainable score</span>
              </div>

              <div className="check-list">
                <div>
                  <span className="check">✓</span>
                  High forecast demand
                </div>
                <div>
                  <span className="check">✓</span>
                  Large underserved customer base
                </div>
                <div>
                  <span className="check">✓</span>
                  Low overlap with existing facilities
                </div>
                <div>
                  <span className="check">✓</span>
                  Delivery target remains within threshold
                </div>
                <div>
                  <span className="check">✓</span>
                  Investment remains within planning limit
                </div>
              </div>

              <div className="score-box">
                <ScoreBar label="Demand" value={91} />
                <ScoreBar label="Coverage" value={87} />
                <ScoreBar label="Delivery" value={89} />
                <ScoreBar label="Investment" value={81} />
                <ScoreBar label="Network overlap" value={72} />
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="section-kicker">
                    NETWORK VIEW
                  </div>
                  <h2>Existing footprint & UFC opportunity</h2>
                </div>
              </div>

              <div className="network-map">
                <div className="map-title">
                  Delhi NCR planning view
                </div>

                <div className="map-location location-one">
                  <span className="map-dot existing" />
                  Saket MFC
                </div>

                <div className="map-location location-two">
                  <span className="map-dot existing" />
                  Gurgaon MFC
                </div>

                <div className="map-location location-three">
                  <span className="map-dot existing" />
                  Noida MFC
                </div>

                <div className="map-location location-four">
                  <span className="map-dot existing" />
                  Rajouri MFC
                </div>

                <div className="map-location location-five">
                  <span className="map-dot recommended" />
                  South Delhi UFC
                  <small>Recommended</small>
                </div>

                <div className="map-legend">
                  <span>
                    <i className="legend-dot existing" />
                    Existing facility
                  </span>

                  <span>
                    <i className="legend-dot recommended" />
                    Recommended UFC
                  </span>

                  <span>
                    <i className="legend-dot candidate" />
                    Candidate
                  </span>
                </div>
              </div>
            </div>

          </section>

          {/* FORECAST */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="section-kicker">
                  FORECAST SIGNAL
                </div>
                <h2>Demand outlook</h2>
                <p>
                  Transparent baseline + trend + seasonality +
                  event model.
                </p>
              </div>

              <button
                className="text-button"
                onClick={() => setActiveTab("forecast")}
              >
                View forecast →
              </button>
            </div>

            <div className="forecast-large">

              <div className="forecast-summary">
                <strong>{kpis.demand.toLocaleString()}</strong>
                <span>orders/day</span>

                <div className="range">
                  Expected range
                  <strong>10,600 – 12,200</strong>
                </div>

                <div className="confidence">
                  <span>Confidence</span>
                  <strong>84%</strong>
                </div>
              </div>

              <div className="large-chart">
                {[42, 50, 45, 58, 62, 68, 64, 72, 78, 86, 82, 91].map(
                  (height, index) => (
                    <div
                      key={index}
                      className="large-chart-bar"
                      style={{ height: `${height}%` }}
                    >
                      <span />
                    </div>
                  )
                )}
              </div>

            </div>
          </section>

          {/* COPILOT */}
          <Copilot
            question={copilotQuestion}
            setQuestion={setCopilotQuestion}
            answer={copilotAnswer}
            loading={copilotLoading}
            onAsk={askCopilot}
          />
        </>
      )}

      {/* FORECAST PAGE */}
      {activeTab === "forecast" && (
        <section className="page-section">

          <PageIntro
            eyebrow="DEMAND FORECAST"
            title="Understand the demand signal"
            description="Forecast demand before making a network expansion or assortment decision."
          />

          <div className="metric-grid">
            <MetricCard
              value={kpis.demand.toLocaleString()}
              label="Forecast demand"
              description="Expected orders per day"
            />
            <MetricCard
              value="10.6K – 12.2K"
              label="Prediction range"
              description="Expected operating range"
            />
            <MetricCard
              value="84%"
              label="Confidence"
              description="Model confidence for the planning horizon"
            />
            <MetricCard
              value="+8.4%"
              label="Demand trend"
              description="Projected demand growth"
            />
          </div>

          <div className="two-column">

            <div className="panel">
              <div className="section-kicker">
                FORECAST COMPONENTS
              </div>
              <h2>What drives the forecast?</h2>

              <div className="forecast-components">
                <div>
                  <span>Historical baseline</span>
                  <strong>8,900</strong>
                </div>
                <div>
                  <span>Trend contribution</span>
                  <strong>+1,200</strong>
                </div>
                <div>
                  <span>Seasonality</span>
                  <strong>+700</strong>
                </div>
                <div>
                  <span>Event uplift</span>
                  <strong>+605</strong>
                </div>
                <div className="total">
                  <span>Forecast</span>
                  <strong>11,405</strong>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="section-kicker">
                MODEL APPROACH
              </div>
              <h2>Transparent by design</h2>
              <p className="body-copy">
                The MVP uses an explainable baseline + trend +
                seasonality + event approach. The architecture
                allows operational data and more advanced
                forecasting models to replace the demo layer
                later.
              </p>

              <div className="info-box">
                <strong>Why this matters</strong>
                <p>
                  Planners can understand what is driving the
                  forecast instead of receiving an unexplained
                  number.
                </p>
              </div>
            </div>

          </div>

          <div className="panel">
            <div className="section-kicker">
              DEMAND TREND
            </div>
            <h2>Projected daily demand</h2>

            <div className="full-chart">
              {[48, 51, 55, 53, 60, 64, 67, 70, 75, 78, 82, 87, 91].map(
                (height, index) => (
                  <div
                    key={index}
                    className="full-chart-bar"
                    style={{ height: `${height}%` }}
                  />
                )
              )}
            </div>
          </div>
        </section>
      )}

      {/* EXPANSION PAGE */}
      {activeTab === "expansion" && (
        <section className="page-section">

          <PageIntro
            eyebrow="UFC EXPANSION PLANNER"
            title="Where should the next UFC launch?"
            description="Compare candidate locations using demand, customer coverage, delivery performance and investment."
          />

          <div className="panel">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Demand</th>
                    <th>Coverage gain</th>
                    <th>Delivery</th>
                    <th>Investment</th>
                    <th>Score</th>
                    <th>Decision</th>
                  </tr>
                </thead>

                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.name}>
                      <td>
                        <strong>{candidate.name}</strong>
                      </td>
                      <td>
                        {candidate.demand.toLocaleString()}
                      </td>
                      <td className="positive">
                        +{candidate.coverage}%
                      </td>
                      <td>{candidate.delivery} min</td>
                      <td>₹{candidate.investment}L</td>
                      <td>
                        <strong>{candidate.score}</strong>
                      </td>
                      <td>
                        <span
                          className={`decision-badge ${candidate.decision.toLowerCase()}`}
                        >
                          {candidate.decision}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="two-column">

            <div className="panel recommendation-detail">
              <div className="section-kicker">
                RECOMMENDATION
              </div>
              <h2>Launch South Delhi UFC</h2>
              <p>
                South Delhi provides the strongest incremental
                customer coverage while maintaining the expected
                delivery target and a reasonable investment
                profile.
              </p>

              <div className="decision-reasons">
                <div>01 — Highest incremental coverage</div>
                <div>02 — Strong demand forecast</div>
                <div>03 — Low network overlap</div>
                <div>04 — Acceptable investment</div>
                <div>05 — Delivery target maintained</div>
              </div>
            </div>

            <div className="panel">
              <div className="section-kicker">
                PLANNING ASSUMPTION
              </div>
              <h2>What could change the decision?</h2>

              <div className="risk-item">
                <strong>Demand below forecast</strong>
                <span>
                  Recommendation confidence decreases.
                </span>
              </div>

              <div className="risk-item">
                <strong>Delivery exceeds 20 minutes</strong>
                <span>
                  Candidate may need capacity or assortment
                  adjustment.
                </span>
              </div>

              <div className="risk-item">
                <strong>Storage utilization &gt;90%</strong>
                <span>
                  Assortment expansion should be deferred.
                </span>
              </div>
            </div>

          </div>
        </section>
      )}

      {/* ASSORTMENT PAGE */}
      {activeTab === "assortment" && (
        <section className="page-section">

          <PageIntro
            eyebrow="UFC ASSORTMENT PLANNER"
            title="What should the UFC stock?"
            description="Prioritize categories based on customer demand, selection gaps and storage constraints."
          />

          <div className="metric-grid">
            <MetricCard
              value="4,800"
              label="Initial SKUs"
              description="Recommended launch assortment"
            />
            <MetricCard
              value="83%"
              label="Storage utilization"
              description="Projected utilization at launch"
            />
            <MetricCard
              value="95.2%"
              label="Projected availability"
              description="Expected in-stock availability"
            />
            <MetricCard
              value="+600"
              label="Expansion opportunity"
              description="Potential SKUs after demand validation"
            />
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="section-kicker">
                  CATEGORY PRIORITIZATION
                </div>
                <h2>Recommended assortment</h2>
              </div>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Demand</th>
                    <th>Customer gap</th>
                    <th>Space requirement</th>
                    <th>Priority</th>
                    <th>Why?</th>
                  </tr>
                </thead>

                <tbody>
                  {assortment.map((item) => (
                    <tr key={item.category}>
                      <td>
                        <strong>{item.category}</strong>
                      </td>
                      <td>{item.demand}</td>
                      <td>{item.gap}</td>
                      <td>{item.space}</td>
                      <td>
                        <span
                          className={`priority-badge ${
                            item.priority === "Defer"
                              ? "defer"
                              : item.priority === "P1"
                              ? "p1"
                              : "p2"
                          }`}
                        >
                          {item.priority}
                        </span>
                      </td>
                      <td className="reason-cell">
                        {item.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="info-box large">
            <strong>Planning principle</strong>
            <p>
              Launch with categories that create the largest
              incremental customer value without consuming
              disproportionate storage capacity. Expand the
              assortment after validating demand.
            </p>
          </div>

        </section>
      )}

      {/* SCENARIO PAGE */}
      {activeTab === "scenario" && (
        <section className="page-section">

          <PageIntro
            eyebrow="SCENARIO BUILDER"
            title="What happens if assumptions change?"
            description="Stress-test the UFC recommendation before committing to an expansion decision."
          />

          <div className="scenario-layout">

            <div className="panel controls-panel">
              <div className="section-kicker">
                PLANNING CONTROLS
              </div>

              <h2>Change the assumptions</h2>

              <label>
                <div className="slider-header">
                  <span>Demand multiplier</span>
                  <strong>{demandMultiplier}%</strong>
                </div>

                <input
                  type="range"
                  min="80"
                  max="140"
                  value={demandMultiplier}
                  onChange={(e) =>
                    setDemandMultiplier(Number(e.target.value))
                  }
                />
              </label>

              <label>
                <div className="slider-header">
                  <span>Inventory budget</span>
                  <strong>₹{inventoryBudget}L</strong>
                </div>

                <input
                  type="range"
                  min="60"
                  max="120"
                  value={inventoryBudget}
                  onChange={(e) =>
                    setInventoryBudget(Number(e.target.value))
                  }
                />
              </label>

              <label>
                <div className="slider-header">
                  <span>Storage capacity</span>
                  <strong>{storageCapacity}%</strong>
                </div>

                <input
                  type="range"
                  min="70"
                  max="100"
                  value={storageCapacity}
                  onChange={(e) =>
                    setStorageCapacity(Number(e.target.value))
                  }
                />
              </label>

              <label>
                <div className="slider-header">
                  <span>Delivery target</span>
                  <strong>{deliveryTarget} min</strong>
                </div>

                <input
                  type="range"
                  min="15"
                  max="30"
                  value={deliveryTarget}
                  onChange={(e) =>
                    setDeliveryTarget(Number(e.target.value))
                  }
                />
              </label>

              <button
                className="secondary-button full-width"
                onClick={() => {
                  setDemandMultiplier(100);
                  setInventoryBudget(80);
                  setStorageCapacity(85);
                  setDeliveryTarget(20);
                }}
              >
                Reset scenario
              </button>
            </div>

            <div className="panel">
              <div className="section-kicker">
                SCENARIO OUTCOME
              </div>

              <h2>Base vs scenario</h2>

              <div className="scenario-table">
                <div className="scenario-row header">
                  <span>Metric</span>
                  <strong>Base</strong>
                  <strong>Scenario</strong>
                </div>

                <div className="scenario-row">
                  <span>Demand</span>
                  <strong>11.4K</strong>
                  <strong>
                    {(scenario.demand / 1000).toFixed(1)}K
                  </strong>
                </div>

                <div className="scenario-row">
                  <span>SKUs</span>
                  <strong>4,800</strong>
                  <strong>{scenario.skus.toLocaleString()}</strong>
                </div>

                <div className="scenario-row">
                  <span>Availability</span>
                  <strong>95.2%</strong>
                  <strong>{scenario.availability}%</strong>
                </div>

                <div className="scenario-row">
                  <span>Storage utilization</span>
                  <strong>83%</strong>
                  <strong>{scenario.storage}%</strong>
                </div>

                <div className="scenario-row">
                  <span>Delivery</span>
                  <strong>16.8 min</strong>
                  <strong>{scenario.delivery} min</strong>
                </div>
              </div>

              <div className="scenario-recommendation">
                <div className="section-kicker">
                  PRODUCT RECOMMENDATION
                </div>

                <h3>
                  {Number(scenario.storage) > 90
                    ? "Defer further assortment expansion"
                    : Number(scenario.demand) > 12500
                    ? "Validate demand and expand assortment"
                    : "Proceed with initial assortment"}
                </h3>

                <p>
                  The recommendation changes as demand,
                  capacity and service constraints move.
                  This keeps the planner in control rather
                  than automatically executing a decision.
                </p>
              </div>
            </div>

          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="footer">
        <div>
          <strong>UFC Expansion Command Center</strong>
          <span>
            Independent product case study
          </span>
        </div>

        <div className="footer-note">
          Synthetic / illustrative data · Not Amazon internal
          data, systems or algorithms
        </div>
      </footer>

    </main>
  );
}

function PageIntro({ eyebrow, title, description }) {
  return (
    <div className="page-intro">
      <div className="section-kicker">{eyebrow}</div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function Copilot({
  question,
  setQuestion,
  answer,
  loading,
  onAsk,
}) {
  const suggestions = [
    "Why South Delhi?",
    "Why not Gurgaon?",
    "What if demand increases?",
    "Why defer furniture?",
  ];

  return (
    <section className="copilot-panel">

      <div className="copilot-header">
        <div className="copilot-icon">✦</div>

        <div>
          <div className="section-kicker">
            DECISION SUPPORT
          </div>
          <h2>Planning Copilot</h2>
          <p>
            Ask why a recommendation was made or explore
            the trade-offs behind it.
          </p>
        </div>
      </div>

      <div className="suggestion-row">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => setCopilotQuestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="copilot-input">
        <textarea
          value={question}
          onChange={(e) =>
            setCopilotQuestion(e.target.value)
          }
          placeholder="Ask about this planning decision..."
        />

        <button
          className="primary-button"
          onClick={onAsk}
          disabled={loading}
        >
          {loading ? "Thinking..." : "Ask Copilot"}
        </button>
      </div>

      {answer && (
        <div className="copilot-answer">
          <div className="answer-label">
            ✦ COPILOT RESPONSE
          </div>

          <p>{answer}</p>
        </div>
      )}

      <div className="copilot-disclaimer">
        Copilot explains computed recommendations. It does
        not generate or replace the underlying planning
        numbers.
      </div>

    </section>
  );
}
