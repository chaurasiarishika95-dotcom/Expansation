"use client";

import { useEffect, useState } from "react";

const zones = [
  "South Delhi",
  "Gurgaon",
  "Noida",
  "West Delhi",
  "Central Delhi",
  "North Delhi",
  "East Delhi",
  "Ghaziabad",
];

export default function Home() {
  const [zone, setZone] = useState("South Delhi");

  const [demand, setDemand] = useState(1);
  const [budget, setBudget] = useState(100);
  const [deliveryTarget, setDeliveryTarget] = useState(20);
  const [storageLimit, setStorageLimit] = useState(85);

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generatePlan() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/planning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          zone,
          demandMultiplier: demand,
          budget,
          deliveryTarget,
          storageLimitPct: storageLimit,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.error || "Unable to generate plan"
        );
      }

      setPlan(data.plan);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generatePlan();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}

        <div className="mb-8">
          <p className="text-sm text-blue-400 font-semibold uppercase tracking-wider">
            Network Planning Command Center
          </p>

          <h1 className="text-4xl md:text-5xl font-bold mt-2">
            UFC Network & Assortment Planner
          </h1>

          <p className="text-slate-400 mt-3 max-w-3xl">
            Decide where to expand, what node to build,
            what to stock, and how to scale the network.
          </p>
        </div>

        {/* CONTROLS */}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

          <div className="grid md:grid-cols-5 gap-5">

            <div>
              <label className="text-xs text-slate-400">
                Planning Zone
              </label>

              <select
                value={zone}
                onChange={(e) =>
                  setZone(e.target.value)
                }
                className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3"
              >
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400">
                Demand Scenario
              </label>

              <select
                value={demand}
                onChange={(e) =>
                  setDemand(Number(e.target.value))
                }
                className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3"
              >
                <option value={0.8}>
                  -20% demand
                </option>

                <option value={0.9}>
                  -10% demand
                </option>

                <option value={1}>
                  Base demand
                </option>

                <option value={1.1}>
                  +10% demand
                </option>

                <option value={1.2}>
                  +20% demand
                </option>

                <option value={1.3}>
                  +30% demand
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400">
                Budget
              </label>

              <select
                value={budget}
                onChange={(e) =>
                  setBudget(Number(e.target.value))
                }
                className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3"
              >
                {[60, 80, 100, 120, 150].map(
                  (value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      ₹{value}L
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400">
                Delivery Target
              </label>

              <select
                value={deliveryTarget}
                onChange={(e) =>
                  setDeliveryTarget(
                    Number(e.target.value)
                  )
                }
                className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3"
              >
                {[15, 18, 20, 25].map(
                  (value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value} min
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400">
                Storage Limit
              </label>

              <select
                value={storageLimit}
                onChange={(e) =>
                  setStorageLimit(
                    Number(e.target.value)
                  )
                }
                className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3"
              >
                {[70, 80, 85, 90].map(
                  (value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value}%
                    </option>
                  )
                )}
              </select>
            </div>

          </div>

          <button
            onClick={generatePlan}
            disabled={loading}
            className="mt-6 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold"
          >
            {loading
              ? "Recalculating..."
              : "Generate Expansion Plan"}
          </button>

        </section>

        {/* ERROR */}

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-5 mb-8 text-red-300">
            {error}
          </div>
        )}

        {/* RESULTS */}

        {plan && (
          <>
            {/* DECISION */}

            <section className="grid md:grid-cols-4 gap-4 mb-8">

              <Metric
                label="Recommended Strategy"
                value={plan.recommendation}
              />

              <Metric
                label="Opportunity Score"
                value={`${plan.opportunity.opportunityScore}/100`}
              />

              <Metric
                label="Projected Daily Demand"
                value={plan.opportunity.projectedDailyDemand.toLocaleString()}
              />

              <Metric
                label="Capacity Gap"
                value={plan.opportunity.capacityGap.toLocaleString()}
              />

            </section>

            {/* NETWORK OPPORTUNITY */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <h2 className="text-xl font-semibold mb-5">
                01 — Network Opportunity
              </h2>

              <div className="grid md:grid-cols-6 gap-4">

                <Metric
                  label="Current Utilization"
                  value={`${plan.opportunity.utilization}%`}
                />

                <Metric
                  label="Current Delivery"
                  value={`${plan.opportunity.avgDelivery} min`}
                />

                <Metric
                  label="Delivery Gap"
                  value={`${plan.opportunity.deliveryGap} min`}
                />

                <Metric
                  label="Selection Gap"
                  value={`${plan.opportunity.selectionGapPct}%`}
                />

                <Metric
                  label="Search Demand"
                  value={plan.opportunity.searchDemand.toLocaleString()}
                />

                <Metric
                  label="Unavailable Searches"
                  value={plan.opportunity.unavailableSearches.toLocaleString()}
                />

              </div>

            </section>

            {/* NODE OPTIONS */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <h2 className="text-xl font-semibold mb-5">
                02 — Network Design
              </h2>

              <div className="overflow-x-auto">

                <table className="w-full text-sm">

                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="text-left py-3">
                        Node
                      </th>

                      <th className="text-left">
                        Cost
                      </th>

                      <th className="text-left">
                        Capacity
                      </th>

                      <th className="text-left">
                        Storage
                      </th>

                      <th className="text-left">
                        Delivery
                      </th>

                      <th className="text-left">
                        Score
                      </th>
                    </tr>
                  </thead>

                  <tbody>

                    {plan.networkOptions.map(
                      (option) => (
                        <tr
                          key={
                            option.Candidate_ID
                          }
                          className="border-b border-slate-800"
                        >
                          <td className="py-4 font-semibold">
                            {option.Node_Type}
                          </td>

                          <td>
                            ₹
                            {
                              option.Launch_Cost_Lakh
                            }
                            L
                          </td>

                          <td>
                            {option.Daily_Capacity_Orders.toLocaleString()}
                          </td>

                          <td>
                            {option.Storage_Capacity_Units.toLocaleString()}
                          </td>

                          <td>
                            {option.expectedDelivery} min
                          </td>

                          <td className="font-bold">
                            {option.score}
                          </td>
                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </section>

            {/* ASSORTMENT */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <div className="flex justify-between items-center mb-5">

                <div>
                  <h2 className="text-xl font-semibold">
                    03 — Assortment Plan
                  </h2>

                  <p className="text-sm text-slate-400 mt-1">
                    What should this node stock?
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {plan.assortment.selectedSKUs}
                  </div>

                  <div className="text-xs text-slate-400">
                    recommended SKUs
                  </div>
                </div>

              </div>

              <div className="overflow-x-auto">

                <table className="w-full text-sm">

                  <thead className="text-slate-400 border-b border-slate-800">

                    <tr>
                      <th className="text-left py-3">
                        Category
                      </th>

                      <th className="text-left">
                        Demand
                      </th>

                      <th className="text-left">
                        Availability
                      </th>

                      <th className="text-left">
                        Stockout
                      </th>

                      <th className="text-left">
                        Gap
                      </th>

                      <th className="text-left">
                        Recommended SKUs
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {plan.assortment.categories.map(
                      (category) => (
                        <tr
                          key={
                            category.category
                          }
                          className="border-b border-slate-800"
                        >

                          <td className="py-4 font-medium">
                            {category.category}
                          </td>

                          <td>
                            {category.demand.toLocaleString()}
                          </td>

                          <td>
                            {category.availabilityPct}%
                          </td>

                          <td>
                            {category.stockoutPct}%
                          </td>

                          <td>
                            {category.unmetDemandPct}%
                          </td>

                          <td className="font-bold">
                            {category.recommendedSKUs}
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </section>

            {/* SKU RECOMMENDATIONS */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <h2 className="text-xl font-semibold mb-2">
                04 — SKU Prioritization
              </h2>

              <p className="text-sm text-slate-400 mb-5">
                Highest-priority SKUs based on demand,
                availability, stockout pressure and margin.
              </p>

              <div className="overflow-x-auto">

                <table className="w-full text-sm">

                  <thead className="text-slate-400 border-b border-slate-800">

                    <tr>
                      <th className="text-left py-3">
                        SKU
                      </th>

                      <th className="text-left">
                        Category
                      </th>

                      <th className="text-left">
                        Price
                      </th>

                      <th className="text-left">
                        Margin
                      </th>

                      <th className="text-left">
                        Availability
                      </th>

                      <th className="text-left">
                        Stockout
                      </th>

                      <th className="text-left">
                        Priority
                      </th>
                    </tr>

                  </thead>

                  <tbody>

                    {plan.skuRecommendations.map(
                      (sku) => (
                        <tr
                          key={sku.SKU_ID}
                          className="border-b border-slate-800"
                        >

                          <td className="py-3 font-semibold">
                            {sku.SKU_ID}
                          </td>

                          <td>
                            {sku.Category}
                          </td>

                          <td>
                            ₹{sku.Selling_Price}
                          </td>

                          <td>
                            ₹{sku.Margin_Per_Unit}
                          </td>

                          <td>
                            {sku.availabilityPct}%
                          </td>

                          <td>
                            {sku.stockoutPct}%
                          </td>

                          <td className="font-bold">
                            {sku.priority}
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </section>

            {/* CAPACITY */}

            <section className="grid md:grid-cols-2 gap-6 mb-8">

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

                <h2 className="text-xl font-semibold mb-5">
                  05 — Capacity
                </h2>

                <div className="space-y-4">

                  <Row
                    label="Node capacity"
                    value={plan.capacity.dailyCapacity.toLocaleString()}
                  />

                  <Row
                    label="Projected demand"
                    value={plan.capacity.projectedDailyDemand.toLocaleString()}
                  />

                  <Row
                    label="Peak demand"
                    value={plan.capacity.peakDemand.toLocaleString()}
                  />

                  <Row
                    label="Capacity gap"
                    value={plan.capacity.capacityGap.toLocaleString()}
                  />

                </div>

              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

                <h2 className="text-xl font-semibold mb-5">
                  06 — Storage
                </h2>

                <div className="space-y-4">

                  <Row
                    label="Estimated storage"
                    value={`${plan.storage.estimatedUnits.toLocaleString()} units`}
                  />

                  <Row
                    label="Node capacity"
                    value={`${plan.storage.capacityUnits.toLocaleString()} units`}
                  />

                  <Row
                    label="Utilization"
                    value={`${plan.storage.utilizationPct}%`}
                  />

                  <Row
                    label="Within scenario limit"
                    value={
                      plan.storage.withinLimit
                        ? "YES"
                        : "NO"
                    }
                  />

                </div>

              </div>

            </section>

          </>
        )}

      </div>
    </main>
  );
}


/* ---------------------------------------------------------
   SMALL UI COMPONENTS
--------------------------------------------------------- */

function Metric({ label, value }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <p className="text-xs text-slate-400 uppercase tracking-wide">
        {label}
      </p>

      <p className="text-xl font-bold mt-2">
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-slate-800 pb-3">
      <span className="text-slate-400">
        {label}
      </span>

      <span className="font-semibold">
        {value}
      </span>
    </div>
  );
}
