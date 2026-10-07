"use client";

import { useMemo, useState } from "react";

import {
  zones,
  facilities,
  categories,
  candidates as candidateUFCs,
} from "../lib/data";

import { forecastDemand } from "../lib/forecast";

import {
  rankLocations,
  assortmentPlan,
  capacityPlan,
} from "../lib/optimizer";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "forecast", label: "Demand Forecast" },
  { id: "expansion", label: "UFC Expansion" },
  { id: "assortment", label: "Assortment" },
  { id: "scenario", label: "Scenario Builder" },
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
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div className="score-row">
      <div className="score-label">
        <span>{label}</span>
        <strong>{Math.round(safeValue)}</strong>
      </div>

      <div className="score-track">
        <div
          className="score-fill"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
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

export default function Home() {
  const [activeTab, setActiveTab] = useState("overview");

  // -----------------------------
  // Planning inputs
  // -----------------------------

  const [market, setMarket] = useState("Delhi NCR");
  const [planningHorizon, setPlanningHorizon] = useState(30);
  const [objective, setObjective] = useState("Expand selection");

  // -----------------------------
  // Analysis state
  // -----------------------------

  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [analysisTimestamp, setAnalysisTimestamp] = useState(null);

  // -----------------------------
  // Scenario controls
  // -----------------------------

  const [demandMultiplier, setDemandMultiplier] = useState(100);
  const [inventoryBudget, setInventoryBudget] = useState(80);
  const [storageCapacity, setStorageCapacity] = useState(85);
  const [deliveryTarget, setDeliveryTarget] = useState(20);

  // -----------------------------
  // Copilot
  // -----------------------------

  const [copilotQuestion, setCopilotQuestion] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);

  // --------------------------------------------------
  // BASE ANALYSIS
  // --------------------------------------------------

  const analysis = useMemo(() => {
    if (!hasRunAnalysis) {
      return null;
    }

    /*
      The planner currently evaluates all Delhi NCR
      candidate UFCs using the synthetic operational data.
    */

    const locationRanking = rankLocations(candidateUFCs);

    const bestLocation = locationRanking[0];

    const selectedZone =
      bestLocation?.Primary_Zone || "South Delhi";

    const forecast = forecastDemand({
      zone: selectedZone,
      horizonDays: planningHorizon,
      demandMultiplier: 1,
    });

    const assortment = assortmentPlan(categories, {
      budget: inventoryBudget,
      storage: storageCapacity,
      demandMultiplier: 1,
      zone: selectedZone,
    });

    const capacity = capacityPlan(forecast, 1);

    return {
      locations: locationRanking,
      bestLocation,
      selectedZone,
      forecast,
      assortment,
      capacity,
    };
  }, [
    hasRunAnalysis,
    planningHorizon,
    inventoryBudget,
    storageCapacity,
  ]);

  // --------------------------------------------------
  // SCENARIO ANALYSIS
  // --------------------------------------------------

  const scenario = useMemo(() => {
    if (!analysis) {
      return null;
    }

    const multiplier = demandMultiplier / 100;

    const scenarioForecast = forecastDemand({
      zone: analysis.selectedZone,
      horizonDays: planningHorizon,
      demandMultiplier: multiplier,
    });

    const scenarioAssortment = assortmentPlan(categories, {
      budget: inventoryBudget,
      storage: storageCapacity,
      demandMultiplier: multiplier,
      zone: analysis.selectedZone,
    });

    const scenarioCapacity = capacityPlan(
      scenarioForecast,
      multiplier
    );

    /*
      Re-rank locations using the same synthetic network
      data. The demand multiplier affects the planning
      pressure rather than replacing the underlying data.
    */

    const scenarioLocations = rankLocations(candidateUFCs);

    const scenarioBestLocation = scenarioLocations[0];

    return {
      forecast: scenarioForecast,
      assortment: scenarioAssortment,
      capacity: scenarioCapacity,
      bestLocation: scenarioBestLocation,
    };
  }, [
    analysis,
    demandMultiplier,
    inventoryBudget,
    storageCapacity,
    planningHorizon,
  ]);

  // --------------------------------------------------
  // RUN ANALYSIS
  // --------------------------------------------------

  function runAnalysis() {
    setHasRunAnalysis(true);
    setAnalysisTimestamp(new Date().toLocaleTimeString());
    setActiveTab("overview");
  }

  function resetAnalysis() {
    setHasRunAnalysis(false);
    setAnalysisTimestamp(null);
    setCopilotAnswer("");
    setActiveTab("overview");
  }

  // --------------------------------------------------
  // COPILOT
  // --------------------------------------------------

  async function askCopilot() {
    if (!copilotQuestion.trim() || !analysis) {
      return;
    }

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
            recommendation: analysis.bestLocation?.Candidate_Name,
            zone: analysis.selectedZone,
            demand: analysis.forecast?.final,
            coverageGain:
              analysis.bestLocation?.incrementalCoverage,
            delivery:
              analysis.bestLocation?.delivery,
            investment:
              analysis.bestLocation?.cost,
            score:
              analysis.bestLocation?.score,
            scenario: scenario
              ? {
                  demand: scenario.forecast?.final,
                  delivery:
                    scenario.bestLocation?.delivery,
                  location:
                    scenario.bestLocation?.Candidate_Name,
                }
              : null,
          },
        }),
      });

      const data = await response.json();

      setCopilotAnswer(
        data.answer ||
          "The recommendation is based on the computed demand, customer coverage, network capacity, delivery performance and investment trade-offs."
      );
    } catch (error) {
      setCopilotAnswer(
        "Copilot could not connect to the explanation service. The recommendation itself is calculated from the synthetic planning data."
      );
    }

    setCopilotLoading(false);
  }

  // --------------------------------------------------
  // Derived UI values
  // --------------------------------------------------

  const best = analysis?.bestLocation;
  const forecast = analysis?.forecast;
  const assortment = analysis?.assortment;
  const capacity = analysis?.capacity;

  const recommendedName =
    best?.Primary_Zone || "No recommendation";

  const demandValue =
    forecast?.final
      ? Math.round(forecast.final / 7)
      : 0;

  const deliveryValue =
    best?.delivery
      ? Number(best.delivery).toFixed(1)
      : "—";

  const investmentValue =
    best?.cost
      ? Number(best.cost).toFixed(0)
      : "—";

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <main className="app-shell">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="top-header">
        <div>
          <div className="eyebrow">
            UFC EXPANSION COMMAND CENTER
          </div>

          <h1>Demand & Network Planning</h1>

          <p>
            Decide <strong>where to expand</strong>,{" "}
            <strong>what to stock</strong>, and{" "}
            <strong>when to scale</strong>.
          </p>
        </div>

        <div className="header-status">
          <span className="status-dot" />

          {hasRunAnalysis ? (
            <>
              Analysis complete
              <strong>{market}</strong>

              <span className="status-divider">|</span>

              {planningHorizon}-day horizon
            </>
          ) : (
            <>
              Planning workspace
              <strong>{market}</strong>

              <span className="status-divider">|</span>

              Ready to analyze
            </>
          )}
        </div>
      </header>

      {/* =====================================================
          PLANNING INPUTS
      ===================================================== */}

      <section className="panel planning-input-panel">

        <div className="panel-header">
          <div>
            <div className="section-kicker">
              PLANNING INPUTS
            </div>

            <h2>Start a UFC expansion analysis</h2>

            <p>
              Define the planning context before the system
              evaluates demand, capacity, coverage and
              candidate locations.
            </p>
          </div>

          {hasRunAnalysis && (
            <span className="info-pill">
              Analysis completed
            </span>
          )}
        </div>

        <div className="planning-controls">

          <label>
            <span>Market</span>

            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            >
              <option>Delhi NCR</option>
            </select>
          </label>

          <label>
            <span>Planning horizon</span>

            <select
              value={planningHorizon}
              onChange={(e) =>
                setPlanningHorizon(Number(e.target.value))
              }
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </label>

          <label>
            <span>Expansion objective</span>

            <select
              value={objective}
              onChange={(e) =>
                setObjective(e.target.value)
              }
            >
              <option>Expand selection</option>
              <option>Improve delivery speed</option>
              <option>Increase customer coverage</option>
            </select>
          </label>

          <div className="planning-action">
            <button
              className="primary-button"
              onClick={runAnalysis}
            >
              {hasRunAnalysis
                ? "Run Analysis Again"
                : "Run Analysis"}
            </button>
          </div>
        </div>

        {analysisTimestamp && (
          <div className="analysis-meta">
            Analysis generated at {analysisTimestamp} using
            synthetic operational data.
          </div>
        )}
      </section>

      {/* =====================================================
          NAVIGATION
      ===================================================== */}

      <nav className="tab-navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={
              activeTab === tab.id
                ? "tab active"
                : "tab"
            }
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* =====================================================
          EMPTY STATE BEFORE ANALYSIS
      ===================================================== */}

      {!hasRunAnalysis && (
        <section className="empty-analysis-state">

          <div className="empty-analysis-icon">
            ◎
          </div>

          <div className="section-kicker">
            READY FOR ANALYSIS
          </div>

          <h2>
            Your UFC expansion recommendation will
            appear here.
          </h2>

          <p>
            The system will analyze synthetic demand,
            customer coverage, existing facilities,
            candidate locations, delivery performance,
            capacity and assortment data.
          </p>

          <button
            className="primary-button"
            onClick={runAnalysis}
          >
            Run UFC Expansion Analysis
          </button>

          <div className="data-note">
            Synthetic / illustrative operational data ·
            Designed to be replaceable with production
            data sources
          </div>
        </section>
      )}

      {/* =====================================================
          OVERVIEW
      ===================================================== */}

      {hasRunAnalysis &&
        activeTab === "overview" && (
          <>
            {/* HERO */}

            <section className="hero-grid">

              <div className="recommendation-card">

                <div className="section-kicker">
                  RECOMMENDED ACTION
                </div>

                <div className="recommendation-title-row">

                  <div>

                    <h2>
                      Launch {recommendedName} UFC
                    </h2>

                    <p>
                      This candidate currently ranks highest
                      based on the synthetic demand, customer
                      coverage, capacity, delivery and
                      investment data.
                    </p>

                  </div>

                  <div className="decision-score">
                    <strong>
                      {best?.score ?? "—"}
                    </strong>

                    <span>/100</span>

                    <small>
                      Recommendation score
                    </small>
                  </div>

                </div>

                <div className="button-row">

                  <button
                    className="primary-button"
                    onClick={() =>
                      setActiveTab("expansion")
                    }
                  >
                    View decision
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() =>
                      setActiveTab("scenario")
                    }
                  >
                    Run scenario
                  </button>

                </div>
              </div>

              <div className="forecast-card">

                <div className="section-kicker">
                  DEMAND SIGNAL
                </div>

                <div className="forecast-number">
                  {demandValue
                    ? demandValue.toLocaleString()
                    : "—"}
                </div>

                <div className="forecast-unit">
                  orders / day
                </div>

                <div className="confidence-row">
                  <span>
                    Forecast confidence
                  </span>

                  <strong>
                    {forecast?.confidence ?? "—"}%
                  </strong>
                </div>

                <div className="mini-chart">
                  {(forecast?.weekly || []).map(
                    (week, index) => (
                      <div
                        key={week.week}
                        className="chart-bar"
                        style={{
                          height: `${Math.min(
                            100,
                            Math.max(
                              20,
                              (week.orders /
                                Math.max(
                                  ...(
                                    forecast.weekly || []
                                  ).map(
                                    (item) =>
                                      item.orders
                                  ),
                                  1
                                )) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    )
                  )}
                </div>
              </div>
            </section>

            {/* KPI ROW */}

            <section className="metric-grid">

              <MetricCard
                value={
                  best
                    ? `+${Math.round(
                        best.incrementalCoverage
                      ).toLocaleString()}`
                    : "—"
                }
                label="Serviceable customers"
                description="Customers reachable through the candidate UFC service footprint"
              />

              <MetricCard
                value={
                  demandValue
                    ? demandValue.toLocaleString()
                    : "—"
                }
                label="Forecast demand"
                description="Expected daily orders in the recommended market"
              />

              <MetricCard
                value={
                  best
                    ? `${deliveryValue} min`
                    : "—"
                }
                label="Expected delivery"
                description="Weighted expected delivery time across serviceable customers"
              />

              <MetricCard
                value={
                  best
                    ? `₹${investmentValue}L`
                    : "—"
                }
                label="Launch investment"
                description="Synthetic candidate launch investment"
              />

            </section>

            {/* DECISION + NETWORK */}

            <section className="two-column">

              <div className="panel">

                <div className="panel-header">

                  <div>

                    <div className="section-kicker">
                      DECISION LOGIC
                    </div>

                    <h2>
                      Why {recommendedName}?
                    </h2>

                  </div>

                  <span className="info-pill">
                    Explainable score
                  </span>

                </div>

                <div className="check-list">

                  <div>
                    <span className="check">
                      ✓
                    </span>

                    High demand opportunity
                  </div>

                  <div>
                    <span className="check">
                      ✓
                    </span>

                    Customer coverage opportunity
                  </div>

                  <div>
                    <span className="check">
                      ✓
                    </span>

                    Existing network capacity pressure
                  </div>

                  <div>
                    <span className="check">
                      ✓
                    </span>

                    Delivery performance evaluated
                  </div>

                  <div>
                    <span className="check">
                      ✓
                    </span>

                    Launch economics considered
                  </div>

                </div>

                <div className="score-box">

                  <ScoreBar
                    label="Customer opportunity"
                    value={best?.customerScore}
                  />

                  <ScoreBar
                    label="Capacity pressure"
                    value={best?.capacityScore}
                  />

                  <ScoreBar
                    label="Delivery"
                    value={best?.deliveryScore}
                  />

                  <ScoreBar
                    label="Investment"
                    value={best?.costScore}
                  />

                </div>

              </div>

              <div className="panel">

                <div className="panel-header">

                  <div>

                    <div className="section-kicker">
                      NETWORK VIEW
                    </div>

                    <h2>
                      Existing footprint & opportunity
                    </h2>

                  </div>

                </div>

                <div className="network-map">

                  <div className="map-title">
                    Delhi NCR planning view
                  </div>

                  {facilities.map((facility, index) => (
                    <div
                      key={facility.Facility_ID}
                      className={`map-location location-${
                        index + 1
                      }`}
                    >
                      <span className="map-dot existing" />
                      {facility.Facility_Name}
                    </div>
                  ))}

                  {best && (
                    <div className="map-location location-five">

                      <span className="map-dot recommended" />

                      {best.Primary_Zone} UFC

                      <small>
                        Recommended
                      </small>

                    </div>
                  )}

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

            {/* FORECAST SUMMARY */}

            <section className="panel">

              <div className="panel-header">

                <div>

                  <div className="section-kicker">
                    FORECAST SIGNAL
                  </div>

                  <h2>
                    Demand outlook
                  </h2>

                  <p>
                    Forecast derived from the synthetic
                    historical demand dataset.
                  </p>

                </div>

                <button
                  className="text-button"
                  onClick={() =>
                    setActiveTab("forecast")
                  }
                >
                  View forecast →
                </button>

              </div>

              <div className="forecast-large">

                <div className="forecast-summary">

                  <strong>
                    {demandValue
                      ? demandValue.toLocaleString()
                      : "—"}
                  </strong>

                  <span>
                    orders/day
                  </span>

                  <div className="range">
                    Expected range

                    <strong>
                      {forecast
                        ? `${Math.round(
                            forecast.low / 7
                          ).toLocaleString()} – ${Math.round(
                            forecast.high / 7
                          ).toLocaleString()}`
                        : "—"}
                    </strong>
                  </div>

                  <div className="confidence">

                    <span>
                      Confidence
                    </span>

                    <strong>
                      {forecast?.confidence ?? "—"}%
                    </strong>

                  </div>

                </div>

                <div className="large-chart">

                  {(forecast?.weekly || []).map(
                    (week) => (
                      <div
                        key={week.week}
                        className="large-chart-bar"
                        style={{
                          height: `${Math.min(
                            100,
                            Math.max(
                              20,
                              (week.orders /
                                Math.max(
                                  ...(
                                    forecast.weekly ||
                                    []
                                  ).map(
                                    (item) =>
                                      item.orders
                                  ),
                                  1
                                )) *
                                100
                            )
                          )}%`,
                        }}
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
              hasAnalysis={hasRunAnalysis}
            />
          </>
        )}

      {/* =====================================================
          FORECAST PAGE
      ===================================================== */}

      {hasRunAnalysis &&
        activeTab === "forecast" && (
          <section className="page-section">

            <PageIntro
              eyebrow="DEMAND FORECAST"
              title="Understand the demand signal"
              description="The forecast is calculated from the synthetic historical demand dataset rather than a hardcoded number."
            />

            <div className="metric-grid">

              <MetricCard
                value={
                  demandValue
                    ? demandValue.toLocaleString()
                    : "—"
                }
                label="Forecast demand"
                description="Expected orders per day"
              />

              <MetricCard
                value={
                  forecast
                    ? `${Math.round(
                        forecast.low / 7
                      ).toLocaleString()} – ${Math.round(
                        forecast.high / 7
                      ).toLocaleString()}`
                    : "—"
                }
                label="Prediction range"
                description="Expected operating range"
              />

              <MetricCard
                value={
                  forecast
                    ? `${forecast.confidence}%`
                    : "—"
                }
                label="Confidence"
                description="Historical stability-based forecast confidence"
              />

              <MetricCard
                value={
                  forecast
                    ? `${(
                        (forecast.trendFactor - 1) *
                        100
                      ).toFixed(1)}%`
                    : "—"
                }
                label="Observed trend"
                description="Recent 14-day demand trend versus prior period"
              />

            </div>

            <div className="two-column">

              <div className="panel">

                <div className="section-kicker">
                  FORECAST COMPONENTS
                </div>

                <h2>
                  What drives the forecast?
                </h2>

                <div className="forecast-components">

                  <div>
                    <span>
                      Historical baseline
                    </span>

                    <strong>
                      {forecast?.baseline?.toLocaleString() ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Trend factor
                    </span>

                    <strong>
                      {forecast
                        ? `${(
                            (forecast.trendFactor - 1) *
                            100
                          ).toFixed(1)}%`
                        : "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Seasonality
                    </span>

                    <strong>
                      Included
                    </strong>
                  </div>

                  <div>
                    <span>
                      Historical days used
                    </span>

                    <strong>
                      {forecast?.historicalDaysUsed ||
                        "—"}
                    </strong>
                  </div>

                  <div className="total">

                    <span>
                      Forecast
                    </span>

                    <strong>
                      {demandValue
                        ? demandValue.toLocaleString()
                        : "—"}
                    </strong>

                  </div>

                </div>

              </div>

              <div className="panel">

                <div className="section-kicker">
                  MODEL APPROACH
                </div>

                <h2>
                  Transparent by design
                </h2>

                <p className="body-copy">
                  The MVP uses recent historical demand,
                  observed trend and day-of-week
                  seasonality. The synthetic data layer can
                  later be replaced by production demand
                  feeds and a more advanced forecasting
                  model.
                </p>

                <div className="info-box">

                  <strong>
                    Why this matters
                  </strong>

                  <p>
                    The planner can see what is driving
                    the forecast instead of receiving an
                    unexplained number.
                  </p>

                </div>

              </div>

            </div>

            <div className="panel">

              <div className="section-kicker">
                DEMAND TREND
              </div>

              <h2>
                Projected weekly demand
              </h2>

              <div className="full-chart">

                {(forecast?.weekly || []).map(
                  (week) => (
                    <div
                      key={week.week}
                      className="full-chart-bar"
                      style={{
                        height: `${Math.min(
                          100,
                          Math.max(
                            20,
                            (week.orders /
                              Math.max(
                                ...(
                                  forecast.weekly ||
                                  []
                                ).map(
                                  (item) =>
                                    item.orders
                                ),
                                1
                              )) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  )
                )}

              </div>

            </div>

          </section>
        )}

      {/* =====================================================
          EXPANSION PAGE
      ===================================================== */}

      {hasRunAnalysis &&
        activeTab === "expansion" && (
          <section className="page-section">

            <PageIntro
              eyebrow="UFC EXPANSION PLANNER"
              title="Where should the next UFC launch?"
              description="Compare candidate locations using the synthetic demand, customer, network, delivery and investment datasets."
            />

            <div className="panel">

              <div className="table-wrapper">

                <table>

                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Demand</th>
                      <th>Customers</th>
                      <th>Delivery</th>
                      <th>Investment</th>
                      <th>Score</th>
                      <th>Decision</th>
                    </tr>
                  </thead>

                  <tbody>

                    {(analysis?.locations || []).map(
                      (candidate, index) => {

                        const decision =
                          index === 0
                            ? "Launch"
                            : index === 1
                            ? "Evaluate"
                            : "Defer";

                        return (
                          <tr
                            key={candidate.Candidate_ID}
                          >

                            <td>
                              <strong>
                                {candidate.Primary_Zone}
                              </strong>
                            </td>

                            <td>
                              {Number(
                                candidate.dailyDemand ||
                                  0
                              ).toLocaleString()}
                            </td>

                            <td className="positive">
                              +
                              {Number(
                                candidate.incrementalCoverage ||
                                  0
                              ).toLocaleString()}
                            </td>

                            <td>
                              {Number(
                                candidate.delivery || 0
                              ).toFixed(1)}{" "}
                              min
                            </td>

                            <td>
                              ₹
                              {Number(
                                candidate.cost || 0
                              ).toFixed(0)}
                              L
                            </td>

                            <td>
                              <strong>
                                {candidate.score}
                              </strong>
                            </td>

                            <td>

                              <span
                                className={`decision-badge ${decision.toLowerCase()}`}
                              >
                                {decision}
                              </span>

                            </td>

                          </tr>
                        );
                      }
                    )}

                  </tbody>

                </table>

              </div>

            </div>

            <div className="two-column">

              <div className="panel recommendation-detail">

                <div className="section-kicker">
                  RECOMMENDATION
                </div>

                <h2>
                  Launch {recommendedName} UFC
                </h2>

                <p>
                  {recommendedName} currently ranks
                  highest based on the computed candidate
                  score.
                </p>

                <div className="decision-reasons">

                  <div>
                    01 — Customer opportunity
                  </div>

                  <div>
                    02 — Capacity pressure
                  </div>

                  <div>
                    03 — Delivery performance
                  </div>

                  <div>
                    04 — Investment profile
                  </div>

                  <div>
                    05 — Network coverage
                  </div>

                </div>

              </div>

              <div className="panel">

                <div className="section-kicker">
                  CAPACITY SIGNAL
                </div>

                <h2>
                  Current network pressure
                </h2>

                <div className="risk-item">

                  <strong>
                    Forecast demand
                  </strong>

                  <span>
                    {demandValue.toLocaleString()}
                    orders/day
                  </span>

                </div>

                <div className="risk-item">

                  <strong>
                    Existing network capacity
                  </strong>

                  <span>
                    {Number(
                      capacity?.existingCapacity || 0
                    ).toLocaleString()}
                    orders/day
                  </span>

                </div>

                <div className="risk-item">

                  <strong>
                    Planning gap
                  </strong>

                  <span>
                    {Number(
                      capacity?.gap || 0
                    ).toLocaleString()}
                    orders/day
                  </span>

                </div>

              </div>

            </div>

          </section>
        )}

      {/* =====================================================
          ASSORTMENT PAGE
      ===================================================== */}

      {hasRunAnalysis &&
        activeTab === "assortment" && (
          <section className="page-section">

            <PageIntro
              eyebrow="UFC ASSORTMENT PLANNER"
              title="What should the UFC stock?"
              description="Prioritize categories using observed demand, selection gaps, SKU storage requirements and inventory constraints."
            />

            <div className="metric-grid">

              <MetricCard
                value={
                  assortment?.skuSlots?.toLocaleString() ||
                  "—"
                }
                label="Initial SKU slots"
                description="Calculated from the synthetic SKU catalog"
              />

              <MetricCard
                value={
                  assortment
                    ? `${assortment.storage}`
                    : "—"
                }
                label="Storage used"
                description="Relative storage requirement from selected categories"
              />

              <MetricCard
                value={
                  assortment
                    ? `${assortment.coverage}%`
                    : "—"
                }
                label="Selection coverage"
                description="Estimated selection coverage from selected categories"
              />

              <MetricCard
                value={
                  assortment
                    ? `₹${assortment.budget}L`
                    : "—"
                }
                label="Illustrative inventory"
                description="Calculated category inventory requirement"
              />

            </div>

            <div className="panel">

              <div className="panel-header">

                <div>

                  <div className="section-kicker">
                    CATEGORY PRIORITIZATION
                  </div>

                  <h2>
                    Recommended assortment
                  </h2>

                </div>

              </div>

              <div className="table-wrapper">

                <table>

                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Demand</th>
                      <th>Customer gap</th>
                      <th>Space</th>
                      <th>SKUs</th>
                      <th>Priority</th>
                    </tr>
                  </thead>

                  <tbody>

                    {(assortment?.selected || []).map(
                      (item, index) => {

                        const priority =
                          index < 3 ? "P1" : "P2";

                        return (
                          <tr key={item.category}>

                            <td>
                              <strong>
                                {item.category}
                              </strong>
                            </td>

                            <td>
                              {Number(
                                item.demand || 0
                              ).toLocaleString()}
                            </td>

                            <td>
                              {item.gap}%
                            </td>

                            <td>
                              {item.space}
                            </td>

                            <td>
                              {item.recommendedSkus}
                            </td>

                            <td>

                              <span
                                className={`priority-badge ${
                                  priority === "P1"
                                    ? "p1"
                                    : "p2"
                                }`}
                              >
                                {priority}
                              </span>

                            </td>

                          </tr>
                        );
                      }
                    )}

                  </tbody>

                </table>

              </div>

            </div>

            <div className="info-box large">

              <strong>
                Planning principle
              </strong>

              <p>
                Launch categories that create the largest
                customer value without consuming
                disproportionate storage capacity. Expand
                the assortment after validating actual
                demand.
              </p>

            </div>

          </section>
        )}

      {/* =====================================================
          SCENARIO PAGE
      ===================================================== */}

      {hasRunAnalysis &&
        activeTab === "scenario" && (
          <section className="page-section">

            <PageIntro
              eyebrow="SCENARIO BUILDER"
              title="What happens if assumptions change?"
              description="Stress-test the planning decision before committing to an expansion."
            />

            <div className="scenario-layout">

              <div className="panel controls-panel">

                <div className="section-kicker">
                  PLANNING CONTROLS
                </div>

                <h2>
                  Change the assumptions
                </h2>

                <label>

                  <div className="slider-header">
                    <span>
                      Demand multiplier
                    </span>

                    <strong>
                      {demandMultiplier}%
                    </strong>
                  </div>

                  <input
                    type="range"
                    min="80"
                    max="140"
                    value={demandMultiplier}
                    onChange={(e) =>
                      setDemandMultiplier(
                        Number(e.target.value)
                      )
                    }
                  />

                </label>

                <label>

                  <div className="slider-header">
                    <span>
                      Inventory budget
                    </span>

                    <strong>
                      ₹{inventoryBudget}L
                    </strong>
                  </div>

                  <input
                    type="range"
                    min="60"
                    max="120"
                    value={inventoryBudget}
                    onChange={(e) =>
                      setInventoryBudget(
                        Number(e.target.value)
                      )
                    }
                  />

                </label>

                <label>

                  <div className="slider-header">
                    <span>
                      Storage capacity
                    </span>

                    <strong>
                      {storageCapacity}%
                    </strong>
                  </div>

                  <input
                    type="range"
                    min="50"
                    max="120"
                    value={storageCapacity}
                    onChange={(e) =>
                      setStorageCapacity(
                        Number(e.target.value)
                      )
                    }
                  />

                </label>

                <label>

                  <div className="slider-header">
                    <span>
                      Delivery target
                    </span>

                    <strong>
                      {deliveryTarget} min
                    </strong>
                  </div>

                  <input
                    type="range"
                    min="15"
                    max="30"
                    value={deliveryTarget}
                    onChange={(e) =>
                      setDeliveryTarget(
                        Number(e.target.value)
                      )
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

                <h2>
                  Base vs scenario
                </h2>

                <div className="scenario-table">

                  <div className="scenario-row header">
                    <span>Metric</span>
                    <strong>Base</strong>
                    <strong>Scenario</strong>
                  </div>

                  <div className="scenario-row">

                    <span>
                      Demand
                    </span>

                    <strong>
                      {demandValue
                        ? `${(
                            demandValue / 1000
                          ).toFixed(1)}K`
                        : "—"}
                    </strong>

                    <strong>
                      {scenario?.forecast
                        ? `${(
                            scenario.forecast.final /
                            7 /
                            1000
                          ).toFixed(1)}K`
                        : "—"}
                    </strong>

                  </div>

                  <div className="scenario-row">

                    <span>
                      SKU slots
                    </span>

                    <strong>
                      {assortment?.skuSlots ||
                        "—"}
                    </strong>

                    <strong>
                      {scenario?.assortment
                        ?.skuSlots || "—"}
                    </strong>

                  </div>

                  <div className="scenario-row">

                    <span>
                      Storage
                    </span>

                    <strong>
                      {assortment?.storage || "—"}
                    </strong>

                    <strong>
                      {scenario?.assortment
                        ?.storage || "—"}
                    </strong>

                  </div>

                  <div className="scenario-row">

                    <span>
                      Delivery
                    </span>

                    <strong>
                      {deliveryValue} min
                    </strong>

                    <strong>
                      {scenario?.bestLocation
                        ? Number(
                            scenario.bestLocation
                              .delivery
                          ).toFixed(1)
                        : "—"}{" "}
                      min
                    </strong>

                  </div>

                  <div className="scenario-row">

                    <span>
                      Recommended UFC
                    </span>

                    <strong>
                      {recommendedName}
                    </strong>

                    <strong>
                      {scenario?.bestLocation
                        ?.Primary_Zone || "—"}
                    </strong>

                  </div>

                </div>

                <div className="scenario-recommendation">

                  <div className="section-kicker">
                    PLANNER INTERPRETATION
                  </div>

                  <h3>

                    {scenario?.assortment &&
                    scenario.assortment.storage >
                      storageCapacity
                      ? "Storage constraint may limit assortment"
                      : scenario?.forecast &&
                        scenario.forecast.final /
                          7 >
                          demandValue * 1.15
                      ? "Validate capacity before expanding assortment"
                      : "Proceed with the current planning assumption"}

                  </h3>

                  <p>
                    The scenario changes the planning
                    assumptions while keeping the same
                    underlying synthetic operational data.
                    This allows the planner to test
                    trade-offs before making a decision.
                  </p>

                </div>

              </div>

            </div>

          </section>
        )}

      {/* =====================================================
          FOOTER
      ===================================================== */}

      <footer className="footer">

        <div>

          <strong>
            UFC Expansion Command Center
          </strong>

          <span>
            Independent product case study
          </span>

        </div>

        <div className="footer-note">
          Synthetic / illustrative data · Not Amazon
          internal data, systems or algorithms
        </div>

      </footer>

    </main>
  );
}

/* =========================================================
   COPILOT
========================================================= */

function Copilot({
  question,
  setQuestion,
  answer,
  loading,
  onAsk,
  hasAnalysis,
}) {
  const suggestions = [
    "Why was this UFC recommended?",
    "Why not the second-ranked location?",
    "What if demand increases?",
    "What is driving the assortment?",
  ];

  return (
    <section className="copilot-panel">

      <div className="copilot-header">

        <div className="copilot-icon">
          ✦
        </div>

        <div>

          <div className="section-kicker">
            DECISION SUPPORT
          </div>

          <h2>
            Planning Copilot
          </h2>

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
            onClick={() =>
              setQuestion(suggestion)
            }
            disabled={!hasAnalysis}
          >
            {suggestion}
          </button>
        ))}

      </div>

      <div className="copilot-input">

        <textarea
          value={question}
          onChange={(e) =>
            setQuestion(e.target.value)
          }
          placeholder={
            hasAnalysis
              ? "Ask about this planning decision..."
              : "Run the analysis first..."
          }
          disabled={!hasAnalysis}
        />

        <button
          className="primary-button"
          onClick={onAsk}
          disabled={
            loading || !hasAnalysis
          }
        >
          {loading
            ? "Thinking..."
            : "Ask Copilot"}
        </button>

      </div>

      {answer && (
        <div className="copilot-answer">

          <div className="answer-label">
            ✦ COPILOT RESPONSE
          </div>

          <p>
            {answer}
          </p>

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
