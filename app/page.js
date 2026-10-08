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

const demandOptions = [
  { value: 0.8, label: "-20% demand" },
  { value: 0.9, label: "-10% demand" },
  { value: 1, label: "Base demand" },
  { value: 1.1, label: "+10% demand" },
  { value: 1.2, label: "+20% demand" },
  { value: 1.3, label: "+30% demand" },
];

const budgetOptions = [60, 80, 100, 120, 150];

const deliveryOptions = [15, 18, 20, 25];

const storageOptions = [70, 80, 85, 90];

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

      const response = await fetch("/api/planning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data?.error ||
            data?.details ||
            `Planning API returned ${response.status}`
        );
      }

      setPlan(data.plan);
    } catch (err) {
      console.error(err);
      setError(
        err.message ||
          "Unable to generate expansion plan."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * Automatically recalculate when
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
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* =================================================
            HEADER
        ================================================= */}

        <header className="mb-8">

          <p className="text-sm font-semibold tracking-widest uppercase text-blue-400">
            Network Planning Command Center
          </p>

          <h1 className="text-4xl md:text-5xl font-bold mt-3 tracking-tight">
            UFC Network & Assortment Planner
          </h1>

          <p className="text-slate-400 mt-3 text-lg max-w-4xl">
            Decide where to expand, what node to build,
            what to stock, and how to scale the network.
          </p>

        </header>

        {/* =================================================
            PLANNING CONTROLS
        ================================================= */}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

          <div className="grid md:grid-cols-5 gap-5">

            <Control
              label="Planning Zone"
              value={zone}
              onChange={(e) =>
                setZone(e.target.value)
              }
              options={zones.map((item) => ({
                value: item,
                label: item,
              }))}
            />

            <Control
              label="Demand Scenario"
              value={demand}
              onChange={(e) =>
                setDemand(
                  Number(e.target.value)
                )
              }
              options={demandOptions}
            />

            <Control
              label="Budget"
              value={budget}
              onChange={(e) =>
                setBudget(
                  Number(e.target.value)
                )
              }
              options={budgetOptions.map(
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
              options={deliveryOptions.map(
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
              options={storageOptions.map(
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
                Recalculating network, assortment and economics...
              </span>
            )}

          </div>

        </section>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <section className="bg-red-950/40 border border-red-800 rounded-2xl p-5 mb-8">

            <p className="font-semibold text-red-300">
              Planning calculation failed
            </p>

            <p className="text-sm text-red-400 mt-2">
              {error}
            </p>

          </section>
        )}

        {/* =================================================
            RESULTS
        ================================================= */}

        {plan && !error && (
          <>

            {/* =================================================
                EXECUTIVE DECISION
            ================================================= */}

            <section className="grid md:grid-cols-4 gap-4 mb-8">

              <Metric
                label="Recommended Strategy"
                value={
                  plan.recommendation ||
                  "—"
                }
                highlight
              />

              <Metric
                label="Opportunity Score"
                value={`${plan.opportunity?.opportunityScore ?? 0}/100`}
              />

              <Metric
                label="Projected Daily Demand"
                value={formatNumber(
                  plan.opportunity
                    ?.projectedDailyDemand
                )}
              />

              <Metric
                label="Peak Capacity Gap"
                value={formatNumber(
                  plan.capacity?.capacityGap
                )}
              />

            </section>

            {/* =================================================
                DECISION REASONS
            ================================================= */}

            {plan.decisionReasons?.length >
              0 && (
              <section className="bg-blue-950/30 border border-blue-900 rounded-2xl p-6 mb-8">

                <p className="text-xs uppercase tracking-widest text-blue-400 font-semibold">
                  Decision rationale
                </p>

                <h2 className="text-2xl font-semibold mt-2">
                  Why {plan.recommendation}?
                </h2>

                <div className="mt-5 space-y-3">

                  {plan.decisionReasons.map(
                    (reason, index) => (
                      <div
                        key={index}
                        className="flex gap-3 text-slate-300"
                      >

                        <span className="text-blue-400 font-bold">
                          {index + 1}
                        </span>

                        <span>
                          {reason}
                        </span>

                      </div>
                    )
                  )}

                </div>

              </section>
            )}

            {/* =================================================
                NETWORK OPPORTUNITY
            ================================================= */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <SectionHeading
                eyebrow="NETWORK OPPORTUNITY"
                title="01 — Is there a network gap?"
                description="The model evaluates demand, capacity pressure, delivery performance and unmet customer selection."
              />

              <div className="grid md:grid-cols-6 gap-4 mt-6">

                <Metric
                  label="Current Utilization"
                  value={`${plan.opportunity?.utilization ?? 0}%`}
                />

                <Metric
                  label="Current Delivery"
                  value={`${plan.opportunity?.avgDelivery ?? 0} min`}
                />

                <Metric
                  label="Delivery Gap"
                  value={`${plan.opportunity?.deliveryGap ?? 0} min`}
                />

                <Metric
                  label="Selection Gap"
                  value={`${plan.opportunity?.selectionGapPct ?? 0}%`}
                />

                <Metric
                  label="Search Demand"
                  value={formatNumber(
                    plan.opportunity
                      ?.searchDemand
                  )}
                />

                <Metric
                  label="Unavailable Searches"
                  value={formatNumber(
                    plan.opportunity
                      ?.unavailableSearches
                  )}
                />

              </div>

            </section>

            {/* =================================================
                NETWORK DESIGN
            ================================================= */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <SectionHeading
                eyebrow="NETWORK DESIGN"
                title="02 — What node should we build?"
                description="The model compares operational fit and economics rather than automatically selecting the largest node."
              />

              <div className="grid lg:grid-cols-3 gap-5 mt-6">

                {plan.networkComparison?.map(
                  (option) => (
                    <NetworkOption
                      key={option.strategy}
                      option={option}
                    />
                  )
                )}

              </div>

            </section>

            {/* =================================================
                ECONOMICS
            ================================================= */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <SectionHeading
                eyebrow="NETWORK ECONOMICS"
                title="03 — Does the expansion make financial sense?"
                description="Illustrative economics based on synthetic demand and unit-level gross margin."
              />

              <div className="grid md:grid-cols-4 gap-4 mt-6">

                <FinancialMetric
                  label="Upfront Investment"
                  value={`₹${formatNumber(
                    plan.financials
                      ?.upfrontInvestmentLakh
                  )}L`}
                />

                <FinancialMetric
                  label="Opening Inventory"
                  value={`₹${formatNumber(
                    plan.financials
                      ?.openingInventoryLakh
                  )}L`}
                />

                <FinancialMetric
                  label="Annual Gross Margin"
                  value={`₹${formatNumber(
                    plan.financials
                      ?.annualGrossMarginLakh
                  )}L`}
                />

                <FinancialMetric
                  label="Year-1 GM ROI"
                  value={`${plan.financials?.year1GrossMarginROI ?? 0}%`}
                  highlight
                />

              </div>

              <div className="grid md:grid-cols-4 gap-4 mt-4">

                <FinancialMetric
                  label="Annual Revenue"
                  value={`₹${formatNumber(
                    plan.financials
                      ?.annualRevenueLakh
                  )}L`}
                />

                <FinancialMetric
                  label="Estimated Payback"
                  value={
                    plan.financials
                      ?.paybackMonths != null
                      ? `${plan.financials.paybackMonths} mo`
                      : "—"
                  }
                />

                <FinancialMetric
                  label="Selected SKUs"
                  value={formatNumber(
                    plan.assortment
                      ?.selectedSKUs
                  )}
                />

                <FinancialMetric
                  label="Peak Utilization"
                  value={`${plan.capacity?.peakUtilizationPct ?? 0}%`}
                />

              </div>

              <div className="mt-5 pt-5 border-t border-slate-800">

                <p className="text-xs text-slate-500">
                  {plan.financials?.methodology ||
                    "Illustrative synthetic model."}
                </p>

              </div>

            </section>

            {/* =================================================
                ASSORTMENT
            ================================================= */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                <SectionHeading
                  eyebrow="ASSORTMENT PLANNING"
                  title="04 — What should the node stock?"
                  description="SKU selection is constrained by demand, customer need, inventory investment and storage capacity."
                />

                <div className="text-left md:text-right">

                  <div className="text-4xl font-bold">
                    {formatNumber(
                      plan.assortment
                        ?.selectedSKUs
                    )}
                  </div>

                  <div className="text-xs text-slate-400 uppercase tracking-wide">
                    optimized SKUs
                  </div>

                </div>

              </div>

              <div className="grid md:grid-cols-4 gap-4 mt-6">

                <Metric
                  label="Opening Inventory"
                  value={`₹${formatNumber(
                    plan.assortment
                      ?.openingInventoryCost /
                      100000
                  )}L`}
                />

                <Metric
                  label="Inventory Budget"
                  value={`₹${formatNumber(
                    plan.assortment
                      ?.inventoryBudgetLakh
                  )}L`}
                />

                <Metric
                  label="Storage Used"
                  value={formatNumber(
                    plan.assortment
                      ?.storageUsed
                  )}
                />

                <Metric
                  label="Storage Utilization"
                  value={`${plan.assortment?.storageUtilizationPct ?? 0}%`}
                />

              </div>

              <div className="overflow-x-auto mt-8">

                <table className="w-full text-sm">

                  <thead className="text-slate-400 border-b border-slate-800">

                    <tr>

                      <th className="text-left py-4">
                        Category
                      </th>

                      <th className="text-right">
                        Daily Demand
                      </th>

                      <th className="text-right">
                        Availability
                      </th>

                      <th className="text-right">
                        Stockout
                      </th>

                      <th className="text-right">
                        Selection Gap
                      </th>

                      <th className="text-right">
                        SKUs
                      </th>

                      <th className="text-right">
                        Gross Margin
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {plan.assortment?.categories?.map(
                      (category) => (
                        <tr
                          key={
                            category.category
                          }
                          className="border-b border-slate-800"
                        >

                          <td className="py-4 font-semibold">
                            {category.category}
                          </td>

                          <td className="text-right">
                            {formatNumber(
                              category.demand
                            )}
                          </td>

                          <td className="text-right">
                            {category.availabilityPct}%
                          </td>

                          <td className="text-right">
                            {category.stockoutPct}%
                          </td>

                          <td className="text-right">
                            {category.unmetDemandPct}%
                          </td>

                          <td className="text-right font-bold text-blue-400">
                            {category.recommendedSKUs}
                          </td>

                          <td className="text-right">
                            ₹
                            {formatNumber(
                              Number(
                                category.grossMargin ||
                                  0
                              ) / 100000
                            )}
                            L
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </section>

            {/* =================================================
                SKU LEVEL
            ================================================= */}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">

              <SectionHeading
                eyebrow="SKU PRIORITIZATION"
                title="05 — Which SKUs launch first?"
                description="The optimizer prioritizes individual SKUs rather than assigning the same number of products to every category."
              />

              <div className="overflow-x-auto mt-6">

                <table className="w-full text-sm">

                  <thead className="text-slate-400 border-b border-slate-800">

                    <tr>

                      <th className="text-left py-4">
                        SKU
                      </th>

                      <th className="text-left">
                        Category
                      </th>

                      <th className="text-right">
                        Daily Demand
                      </th>

                      <th className="text-right">
                        Price
                      </th>

                      <th className="text-right">
                        Margin
                      </th>

                      <th className="text-right">
                        Availability
                      </th>

                      <th className="text-right">
                        Stockout
                      </th>

                      <th className="text-right">
                        Opening Inv.
                      </th>

                      <th className="text-right">
                        Priority
                      </th>

                      <th className="text-center">
                        Action
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {plan.skuRecommendations?.map(
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

                          <td className="text-right">
                            {formatNumber(
                              sku.dailyDemand
                            )}
                          </td>

                          <td className="text-right">
                            ₹
                            {formatNumber(
                              sku.Selling_Price
                            )}
                          </td>

                          <td className="text-right">
                            ₹
                            {formatNumber(
                              sku.Margin_Per_Unit
                            )}
                          </td>

                          <td className="text-right">
                            {sku.availabilityPct}%
                          </td>

                          <td className="text-right">
                            {sku.stockoutPct}%
                          </td>

                          <td className="text-right">
                            ₹
                            {formatNumber(
                              sku.openingInventoryCost
                            )}
                          </td>

                          <td className="text-right font-bold">
                            {sku.priority}
                          </td>

                          <td className="text-center">

                            <ActionBadge
                              action={
                                sku.recommendation
                              }
                            />

                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </section>

            {/* =================================================
                CAPACITY + STORAGE
            ================================================= */}

            <section className="grid lg:grid-cols-2 gap-6 mb-8">

              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

                <SectionHeading
                  eyebrow="CAPACITY"
                  title="06 — Can the node handle demand?"
                  description="Peak demand is compared with the selected node's daily order capacity."
                />

                <div className="space-y-4 mt-6">

                  <DataRow
                    label="Node capacity"
                    value={`${formatNumber(
                      plan.capacity?.dailyCapacity
                    )} orders/day`}
                  />

                  <DataRow
                    label="Projected daily demand"
                    value={`${formatNumber(
                      plan.capacity
                        ?.projectedDailyDemand
                    )}`}
                  />

                  <DataRow
                    label="Peak demand"
                    value={`${formatNumber(
                      plan.capacity?.peakDemand
                    )}`}
                  />

                  <DataRow
                    label="Capacity gap"
                    value={`${formatNumber(
                      plan.capacity?.capacityGap
                    )}`}
                  />

                  <DataRow
                    label="Peak utilization"
                    value={`${plan.capacity?.peakUtilizationPct ?? 0}%`}
                  />

                </div>

              </section>

              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

                <SectionHeading
                  eyebrow="STORAGE"
                  title="07 — Can the assortment fit?"
                  description="Storage is treated as a hard planning constraint with the selected scenario limit."
                />

                <div className="space-y-4 mt-6">

                  <DataRow
                    label="Estimated storage"
                    value={`${formatNumber(
                      plan.storage
                        ?.estimatedUnits
                    )} units`}
                  />

                  <DataRow
                    label="Node storage capacity"
                    value={`${formatNumber(
                      plan.storage
                        ?.capacityUnits
                    )} units`}
                  />

                  <DataRow
                    label="Storage utilization"
                    value={`${plan.storage?.utilizationPct ?? 0}%`}
                  />

                  <DataRow
                    label="Scenario limit"
                    value={`${plan.storage?.scenarioLimitPct ?? storageLimit}%`}
                  />

                  <DataRow
                    label="Within constraint"
                    value={
                      plan.storage
                        ?.withinLimit
                        ? "YES"
                        : "NO"
                    }
                    positive={
                      plan.storage
                        ?.withinLimit
                    }
                  />

                </div>

              </section>

            </section>

            {/* =================================================
                ASSUMPTIONS
            ================================================= */}

            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-8">

              <div className="flex flex-wrap gap-6 text-sm">

                <div>
                  <span className="text-slate-500">
                    Demand:
                  </span>{" "}
                  <span className="font-semibold">
                    {Math.round(
                      Number(demand) *
                        100
                    )}
                    %
                  </span>
                </div>

                <div>
                  <span className="text-slate-500">
                    Budget:
                  </span>{" "}
                  <span className="font-semibold">
                    ₹{budget}L
                  </span>
                </div>

                <div>
                  <span className="text-slate-500">
                    Delivery:
                  </span>{" "}
                  <span className="font-semibold">
                    {deliveryTarget} min
                  </span>
                </div>

                <div>
                  <span className="text-slate-500">
                    Storage:
                  </span>{" "}
                  <span className="font-semibold">
                    {storageLimit}%
                  </span>
                </div>

              </div>

              <p className="text-xs text-slate-500 mt-4">
                This is a synthetic planning model created
                for portfolio demonstration. Financial
                outputs are illustrative and should not be
                interpreted as Amazon internal data or actual
                Amazon economics.
              </p>

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

      <label className="text-xs font-medium text-slate-400">
        {label}
      </label>

      <select
        value={value}
        onChange={onChange}
        className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500"
      >

        {options.map(
          (option) => (
            <option
              key={String(
                option.value
              )}
              value={option.value}
            >
              {option.label}
            </option>
          )
        )}

      </select>

    </div>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight
          ? "border-blue-700 bg-blue-950/30"
          : "border-slate-800 bg-slate-900"
      }`}
    >

      <p className="text-xs text-slate-400 uppercase tracking-wide">
        {label}
      </p>

      <p className="text-xl font-bold mt-2">
        {value}
      </p>

    </div>
  );
}

function FinancialMetric({
  label,
  value,
  highlight = false,
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight
          ? "border-emerald-700 bg-emerald-950/20"
          : "border-slate-800 bg-slate-950"
      }`}
    >

      <p className="text-xs text-slate-400 uppercase tracking-wide">
        {label}
      </p>

      <p className="text-2xl font-bold mt-2">
        {value}
      </p>

    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}) {
  return (
    <div>

      <p className="text-xs uppercase tracking-widest text-blue-400 font-semibold">
        {eyebrow}
      </p>

      <h2 className="text-2xl font-semibold mt-2">
        {title}
      </h2>

      {description && (
        <p className="text-sm text-slate-400 mt-2 max-w-3xl">
          {description}
        </p>
      )}

    </div>
  );
}

function DataRow({
  label,
  value,
  positive = null,
}) {
  return (
    <div className="flex justify-between items-center border-b border-slate-800 pb-3">

      <span className="text-slate-400">
        {label}
      </span>

      <span
        className={
          positive === true
            ? "font-semibold text-emerald-400"
            : positive === false
            ? "font-semibold text-red-400"
            : "font-semibold"
        }
      >
        {value}
      </span>

    </div>
  );
}

function Row({
  label,
  value,
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-800 pb-3">

      <span className="text-slate-400">
        {label}
      </span>

      <span className="font-semibold text-right">
        {value}
      </span>

    </div>
  );
}

function NetworkOption({
  option,
}) {
  const recommended =
    option.recommended;

  return (
    <div
      className={`rounded-2xl border p-5 ${
        recommended
          ? "border-blue-500 bg-blue-950/30"
          : "border-slate-700 bg-slate-950"
      }`}
    >

      <div className="flex justify-between items-start gap-3">

        <div>

          <p className="text-lg font-semibold">
            {option.strategy}
          </p>

          {recommended && (
            <span className="inline-block mt-2 text-xs font-semibold bg-blue-600 px-2 py-1 rounded">
              RECOMMENDED
            </span>
          )}

        </div>

        <div className="text-right">

          <p className="text-2xl font-bold">
            {option.score}
          </p>

          <p className="text-xs text-slate-500">
            strategy score
          </p>

        </div>

      </div>

      <div className="mt-6 space-y-3 text-sm">

        <Row
          label="Launch cost"
          value={`₹${formatNumber(
            option.cost
          )}L`}
        />

        <Row
          label="Opening inventory"
          value={`₹${formatNumber(
            option.openingInventory
          )}L`}
        />

        <Row
          label="Total investment"
          value={`₹${formatNumber(
            option.upfrontInvestment
          )}L`}
        />

        <Row
          label="Capacity"
          value={formatNumber(
            option.capacity
          )}
        />

        <Row
          label="Optimized assortment"
          value={`${formatNumber(
            option.assortment
          )} SKUs`}
        />

        <Row
          label="Delivery"
          value={`${option.delivery} min`}
        />

        <Row
          label="Annual gross margin"
          value={`₹${formatNumber(
            option.annualGrossMargin
          )}L`}
        />

        <Row
          label="Year-1 GM ROI"
          value={`${option.roi}%`}
        />

        <Row
          label="Payback"
          value={
            option.payback != null
              ? `${option.payback} months`
              : "—"
          }
        />

      </div>

      <div className="grid grid-cols-2 gap-2 mt-5">

        <FitBadge
          label="Budget"
          good={option.withinBudget}
        />

        <FitBadge
          label="Capacity"
          good={option.capacityFit}
        />

        <FitBadge
          label="Delivery"
          good={option.deliveryFit}
        />

        <FitBadge
          label="Storage"
          good={option.storageFit}
        />

      </div>

    </div>
  );
}

function FitBadge({
  label,
  good,
}) {
  return (
    <div
      className={`text-center rounded-lg py-2 text-xs font-semibold ${
        good
          ? "bg-emerald-950/50 text-emerald-400 border border-emerald-900"
          : "bg-red-950/50 text-red-400 border border-red-900"
      }`}
    >
      {label}: {good ? "FIT" : "GAP"}
    </div>
  );
}

function ActionBadge({
  action,
}) {
  const normalized =
    String(
      action || ""
    ).toLowerCase();

  if (
    normalized ===
    "launch"
  ) {
    return (
      <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-900 px-2 py-1 rounded">
        LAUNCH
      </span>
    );
  }

  if (
    normalized ===
    "test"
  ) {
    return (
      <span className="text-xs font-semibold text-amber-400 bg-amber-950/50 border border-amber-900 px-2 py-1 rounded">
        TEST
      </span>
    );
  }

  return (
    <span className="text-xs font-semibold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-1 rounded">
      DEFER
    </span>
  );
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatNumber(value) {
  const number = Number(
    value || 0
  );

  return number.toLocaleString(
    "en-IN",
    {
      maximumFractionDigits: 1,
    }
  );
}
