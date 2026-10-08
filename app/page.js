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
      const payload = {
        zone,
        demandMultiplier: Number(demand),
        budget: Number(budget),
        deliveryTarget: Number(deliveryTarget),
        storageLimitPct: Number(storageLimit),
      };

      console.log("Planning request:", payload);

      const response = await fetch("/api/planning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      console.log("Planning response:", data);

      if (!response.ok || !data.success) {
        throw new Error(
          data?.error ||
            data?.details ||
            `Planning API returned ${response.status}`
        );
      }

      setPlan(data.plan);
    } catch (err) {
      console.error("Planning error:", err);
      setError(err.message || "Unable to generate plan.");
    } finally {
      setLoading(false);
    }
  }

  /*
   * Recalculate automatically whenever
   * a planning assumption changes.
   */
  useEffect(() => {
    generatePlan();
  }, [
    zone,
    demand,
    budget,
    deliveryTarget,
    storageLimit,
  ]);

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

            <Control
              label="Planning Zone"
              value={zone}
              onChange={(e) =>
                setZone(e.target.value)
              }
              options={zones.map((z) => ({
                value: z,
                label: z,
              }))}
            />

            <Control
              label="Demand Scenario"
              value={demand}
              onChange={(e) =>
                setDemand(Number(e.target.value))
              }
              options={[
                {
                  value: 0.8,
                  label: "-20% demand",
                },
                {
                  value: 0.9,
                  label: "-10% demand",
                },
                {
                  value: 1,
                  label: "Base demand",
                },
                {
                  value: 1.1,
                  label: "+10% demand",
                },
                {
                  value: 1.2,
                  label: "+20% demand",
                },
                {
                  value: 1.3,
                  label: "+30% demand",
                },
              ]}
            />

            <Control
              label="Budget"
              value={budget}
              onChange={(e) =>
                setBudget(Number(e.target.value))
              }
              options={[60, 80, 100, 120, 150].map(
                (value) => ({
                  value,
                  label: `₹${value}L`,
                })
              )}
            />

            <Control
              label="Delivery Target"
              value={deliveryTarget}
              onChange={(e) =>
                setDeliveryTarget(
                  Number(e.target.value)
                )
              }
              options={[15, 18, 20, 25].map(
                (value) => ({
                  value,
                  label: `${value} min`,
                })
              )}
            />

            <Control
              label="Storage Limit"
              value={storageLimit}
              onChange={(e) =>
                setStorageLimit(
                  Number(e.target.value)
                )
              }
              options={[70, 80, 85, 90].map(
                (value) => ({
                  value,
                  label: `${value}%`,
                })
              )}
            />

          </div>

          <div className="flex items-center gap-4 mt-6">

            <button
              type="button"
              onClick={generatePlan}
              disabled={loading}
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold transition"
            >
              {loading
                ? "Calculating..."
                : "Generate Expansion Plan"}
            </button>

            {loading && (
              <span className="text-sm text-slate-400">
                Recalculating network and assortment...
              </span>
            )}

          </div>

        </section>

        {/* ERROR */}

        {error && (
          <section className="bg-red-950 border border-red-800 rounded-xl p-5 mb-8">

            <p className="font-semibold text-red-300">
              Planning calculation failed
            </p>

            <p className="text-sm text-red-400 mt-2">
              {error}
            </p>

          </section>
        )}

        {/* RESULTS */}

        {plan && !error && (
          <>
            {/* TOP DECISION */}

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

            {/* DECISION REASON */}

            {plan.decisionReasons?.length > 0 && (
              <section className="bg-blue-950/30 border border-blue-900 rounded-2xl p-6 mb-8">

                <p className="text-xs uppercase tracking-wider text-blue-400 font-semibold">
                  Why this strategy?
                </p>

                <div className="mt-4 space-y-2">

                  {plan.decisionReasons.map(
                    (reason, index) => (
                      <div
                        key={index}
                        className="flex gap-3 text-slate-300"
                      >
                        <span className="text-blue-400">
                          •
                        </span>

                        <span>{reason}</span>
                      </div>
                    )
                  )}

                </div>

              </section>
            )}

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

            {/* NETWORK DESIGN */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <div className="mb-6">

                <p className="text-xs uppercase tracking-wider text-blue-400 font-semibold">
                  Network Design
                </p>

                <h2 className="text-2xl font-semibold mt-1">
                  02 — Small MFC vs UFC vs Phased
                </h2>

                <p className="text-sm text-slate-400 mt-2">
                  Compare the network options against the
                  current demand and planning constraints.
                </p>

              </div>

              <div className="grid md:grid-cols-3 gap-5">

                {plan.networkComparison?.map(
                  (option) => {

                    const isRecommended =
                      option.recommended;

                    return (
                      <div
                        key={option.strategy}
                        className={`rounded-xl border p-5 ${
                          isRecommended
                            ? "border-blue-500 bg-blue-950/30"
                            : "border-slate-700 bg-slate-950"
                        }`}
                      >

                        <div className="flex justify-between items-start">

                          <div>
                            <p className="text-lg font-semibold">
                              {option.strategy}
                            </p>

                            {isRecommended && (
                              <span className="inline-block mt-2 text-xs bg-blue-600 px-2 py-1 rounded">
                                RECOMMENDED
                              </span>
                            )}
                          </div>

                          <span className="text-2xl font-bold">
                            {option.score}
                          </span>

                        </div>

                        <div className="mt-5 space-y-3 text-sm">

                          <Row
                            label="Launch cost"
                            value={`₹${option.cost}L`}
                          />

                          <Row
                            label="Capacity"
                            value={
                              option.capacity?.toLocaleString()
                            }
                          />

                          <Row
                            label="Assortment"
                            value={`${option.assortment?.toLocaleString()} SKUs`}
                          />

                          <Row
                            label="Delivery"
                            value={`${option.delivery} min`}
                          />

                          <Row
                            label="Budget fit"
                            value={
                              option.withinBudget
                                ? "YES"
                                : "NO"
                            }
                          />

                          <Row
                            label="Capacity fit"
                            value={
                              option.capacityFit
                                ? "YES"
                                : "NO"
                            }
                          />

                          {option.futureCapacity && (
                            <Row
                              label="Future capacity"
                              value={option.futureCapacity.toLocaleString()}
                            />
                          )}

                        </div>

                      </div>
                    );
                  }
                )}

              </div>

            </section>

            {/* ASSORTMENT */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <div className="flex justify-between items-center mb-5">

                <div>
                  <p className="text-xs uppercase tracking-wider text-blue-400 font-semibold">
                    Assortment Planning
                  </p>

                  <h2 className="text-2xl font-semibold mt-1">
                    03 — What Should the Node Stock?
                  </h2>

                  <p className="text-sm text-slate-400 mt-2">
                    Category-level selection based on demand,
                    availability and stockout pressure.
                  </p>
                </div>

                <div className="text-right">

                  <div className="text-3xl font-bold">
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
                        Selection Gap
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
                          key={category.category}
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

            {/* SKU PRIORITIZATION */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <p className="text-xs uppercase tracking-wider text-blue-400 font-semibold">
                SKU Prioritization
              </p>

              <h2 className="text-2xl font-semibold mt-1">
                04 — Which SKUs Should Launch First?
              </h2>

              <p className="text-sm text-slate-400 mt-2 mb-5">
                Prioritized using demand share, availability,
                stockout pressure and margin.
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

            {/* CAPACITY + STORAGE */}

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

/* =========================================================
   COMPONENTS
========================================================= */

function Control({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <div>

      <label className="text-xs text-slate-400">
        {label}
      </label>

      <select
        value={value}
        onChange={onChange}
        className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white"
      >

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}

      </select>

    </div>
  );
}

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
