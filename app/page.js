"use client";

import { useEffect, useMemo, useState } from "react";

const zones = [
  "West Delhi",
  "South Delhi",
  "East Delhi",
  "North Delhi",
];

const demandOptions = [
  { label: "Base demand", value: 1 },
  { label: "Demand -20%", value: 0.8 },
  { label: "Demand +20%", value: 1.2 },
  { label: "Demand +40%", value: 1.4 },
];

const budgets = [60, 80, 100, 120];
const deliveryTargets = [15, 20, 25, 30];
const storageLimits = [70, 80, 85, 90, 100];

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 1,
  })}L`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function decimal(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 1,
  });
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function safe(value, fallback = 0) {
  return value === undefined || value === null ? fallback : value;
}

export default function Home() {
  const [zone, setZone] = useState("West Delhi");
  const [demandMultiplier, setDemandMultiplier] = useState(1);
  const [budget, setBudget] = useState(100);
  const [deliveryTarget, setDeliveryTarget] = useState(20);
  const [storageLimitPct, setStorageLimitPct] = useState(85);

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
          demandMultiplier,
          budget,
          deliveryTarget,
          storageLimitPct,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data?.details ||
            data?.error ||
            "Unable to generate expansion plan."
        );
      }

      setPlan(data.plan);
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to generate plan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generatePlan();
  }, [
    zone,
    demandMultiplier,
    budget,
    deliveryTarget,
    storageLimitPct,
  ]);

  const node = plan?.node || {};
  const opportunity = plan?.opportunity || {};
  const assortment = plan?.assortment || {};
  const economics = plan?.economics || {};
  const financials = plan?.financials || {};
  const capacity = plan?.capacity || {};
  const storage = plan?.storage || {};

  /*
   * IMPORTANT:
   * The optimizer now returns:
   *
   * totalUpfrontInvestmentLakh
   * openingInventoryInvestmentLakh
   * annualRevenueLakh
   * annualGrossMarginLakh
   * grossMarginRoiPct
   * paybackMonths
   *
   * Capacity:
   * dailyCapacity
   * supportedDemand
   * peakDemand
   * utilizationPct
   *
   * This page intentionally uses those current field names.
   */

  const totalInvestment = Number(
    safe(
      financials.upfrontInvestmentLakh,
      economics.totalUpfrontInvestmentLakh
    )
  );

  const openingInventory = Number(
    safe(
      financials.openingInventoryLakh,
      economics.openingInventoryInvestmentLakh
    )
  );

  const annualRevenue = Number(
    safe(
      financials.annualRevenueLakh,
      economics.annualRevenueLakh
    )
  );

  const annualGrossMargin = Number(
    safe(
      financials.annualGrossMarginLakh,
      economics.annualGrossMarginLakh
    )
  );

  const roi =
    Number(
      safe(
        financials.year1GrossMarginRoiPct,
        economics.grossMarginRoiPct
      )
    ) ||
    (totalInvestment > 0
      ? (annualGrossMargin / totalInvestment) * 100
      : 0);

  const payback =
    Number(
      safe(
        financials.paybackMonths,
        economics.paybackMonths
      )
    ) ||
    (annualGrossMargin > 0
      ? totalInvestment / (annualGrossMargin / 12)
      : 0);

  const dailyCapacity = Number(
    safe(
      capacity.dailyCapacity,
      node.Daily_Capacity_Orders
    )
  );

  const projectedDailyDemand = Number(
    safe(
      opportunity.projectedDailyDemand,
      capacity.supportedDemand
    )
  );

  const peakDemand = Number(
    safe(
      capacity.peakDemand,
      opportunity.peakDemand
    )
  );

  const peakUtilization =
    dailyCapacity > 0
      ? (peakDemand / dailyCapacity) * 100
      : 0;

  const capacityGap = Math.max(
    0,
    peakDemand - dailyCapacity
  );

  const selectedSKUs = Number(
    safe(
      assortment.selectedSKUs,
      node.selectedSKUs
    )
  );

  const openingInventoryAssortment = Number(
    safe(
      assortment.economics?.openingInventoryInvestmentLakh,
      openingInventory
    )
  );

  const inventoryBudget = Number(
    safe(
      assortment.economics?.inventoryBudgetLakh,
      0
    )
  );

  const storageUsed = Number(
    safe(
      storage.estimatedUnits,
      assortment.economics?.storageUsed
    )
  );

  const storageCapacity = Number(
    safe(
      storage.capacityUnits,
      assortment.economics?.storageCapacity
    )
  );

  const storageUtilization =
    storageCapacity > 0
      ? (storageUsed / storageCapacity) * 100
      : Number(
          safe(
            storage.utilizationPct,
            0
          )
        );

  const networkComparison =
    plan?.networkComparison || [];

  const skuRecommendations =
    plan?.skuRecommendations || [];

  const categories =
    assortment.categories || [];

  const recommendation =
    plan?.recommendation || "No recommendation";

  const decisionReasons =
    plan?.decisionReasons || [];

  const networkOpportunityScore =
    Number(
      safe(
        opportunity.opportunityScore,
        0
      )
    );

  const demandLabel =
    demandMultiplier === 1
      ? "Base demand"
      : `${Math.round(
          demandMultiplier * 100
        )}% demand`;

  return (
    <main className="min-h-screen bg-[#030817] text-white">
      <div className="mx-auto max-w-[1400px] px-4 py-8">

        {/* HEADER */}
        <header className="mb-8">
          <div className="mb-2 text-xs font-semibold tracking-[0.18em] text-blue-400">
            NETWORK PLANNING COMMAND CENTER
          </div>

          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            UFC Network & Assortment Planner
          </h1>

          <p className="mt-2 text-sm text-slate-300 md:text-base">
            Decide where to expand, what node to build,
            what to stock, and how to scale the network.
          </p>
        </header>

        {/* CONTROLS */}
        <section className="mb-7 rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-xl">
          <div className="grid gap-4 md:grid-cols-5">

            <SelectControl
              label="Planning Zone"
              value={zone}
              onChange={setZone}
              options={zones.map((x) => ({
                label: x,
                value: x,
              }))}
            />

            <SelectControl
              label="Demand Scenario"
              value={demandMultiplier}
              onChange={(value) =>
                setDemandMultiplier(Number(value))
              }
              options={demandOptions}
            />

            <SelectControl
              label="Budget"
              value={budget}
              onChange={(value) =>
                setBudget(Number(value))
              }
              options={budgets.map((x) => ({
                label: `₹${x}L`,
                value: x,
              }))}
            />

            <SelectControl
              label="Delivery Target"
              value={deliveryTarget}
              onChange={(value) =>
                setDeliveryTarget(Number(value))
              }
              options={deliveryTargets.map((x) => ({
                label: `${x} min`,
                value: x,
              }))}
            />

            <SelectControl
              label="Storage Limit"
              value={storageLimitPct}
              onChange={(value) =>
                setStorageLimitPct(Number(value))
              }
              options={storageLimits.map((x) => ({
                label: `${x}%`,
                value: x,
              }))}
            />

          </div>

          <button
            onClick={generatePlan}
            disabled={loading}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Generating..."
              : "Generate Expansion Plan"}
          </button>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {!plan && loading && (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center text-slate-400">
            Generating planning recommendation...
          </div>
        )}

        {plan && (
          <>
            {/* EXECUTIVE DECISION */}
            <section className="mb-7 grid gap-4 md:grid-cols-4">

              <MetricCard
                label="Recommended Strategy"
                value={recommendation}
                highlight
              />

              <MetricCard
                label="Opportunity Score"
                value={`${networkOpportunityScore}/100`}
              />

              <MetricCard
                label="Projected Daily Demand"
                value={number(projectedDailyDemand)}
              />

              <MetricCard
                label="Peak Capacity Gap"
                value={number(capacityGap)}
              />

            </section>

            {/* DECISION RATIONALE */}
            <section className="mb-7 rounded-2xl border border-blue-500/70 bg-blue-950/20 p-5">
              <div className="mb-2 text-xs font-semibold tracking-[0.16em] text-blue-400">
                DECISION RATIONALE
              </div>

              <h2 className="mb-4 text-2xl font-bold">
                Why {recommendation}?
              </h2>

              <div className="space-y-3">
                {decisionReasons.length > 0 ? (
                  decisionReasons.map(
                    (reason, index) => (
                      <div
                        key={index}
                        className="flex gap-3 text-sm text-slate-200"
                      >
                        <span className="font-semibold text-blue-400">
                          {index + 1}
                        </span>

                        <span>{reason}</span>
                      </div>
                    )
                  )
                ) : (
                  <div className="text-sm text-slate-400">
                    No additional decision rationale returned.
                  </div>
                )}
              </div>
            </section>

            {/* NETWORK OPPORTUNITY */}
            <section className="mb-7 rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
              <SectionHeading
                eyebrow="NETWORK OPPORTUNITY"
                title="01 — Is there a network gap?"
                description="The model evaluates demand, capacity pressure, delivery performance and unmet customer selection."
              />

              <div className="grid gap-3 md:grid-cols-6">
                <MiniMetric
                  label="Current Utilization"
                  value={percent(opportunity.utilization)}
                />

                <MiniMetric
                  label="Current Delivery"
                  value={`${decimal(
                    opportunity.avgDelivery
                  )} min`}
                />

                <MiniMetric
                  label="Delivery Gap"
                  value={`${decimal(
                    opportunity.deliveryGap
                  )} min`}
                />

                <MiniMetric
                  label="Selection Gap"
                  value={percent(
                    opportunity.selectionGapPct
                  )}
                />

                <MiniMetric
                  label="Search Demand"
                  value={number(
                    opportunity.searchDemand
                  )}
                />

                <MiniMetric
                  label="Unavailable Searches"
                  value={number(
                    opportunity.unavailableSearches
                  )}
                />
              </div>
            </section>

            {/* NETWORK DESIGN */}
            <section className="mb-7 rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
              <SectionHeading
                eyebrow="NETWORK DESIGN"
                title="02 — What node should we build?"
                description="The model compares operational fit and economics rather than automatically selecting the largest node."
              />

              <div className="grid gap-4 lg:grid-cols-3">
                {networkComparison.map(
                  (option) => (
                    <NetworkOption
                      key={option.strategy}
                      option={option}
                      recommended={
                        option.recommended
                      }
                    />
                  )
                )}
              </div>
            </section>

            {/* NETWORK ECONOMICS */}
            <section className="mb-7 rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
              <SectionHeading
                eyebrow="NETWORK ECONOMICS"
                title="03 — Does the expansion make financial sense?"
                description="Illustrative economics based on synthetic demand and unit-level gross margin."
              />

              <div className="grid gap-4 md:grid-cols-4">

                <MetricCard
                  label="Upfront Investment"
                  value={money(totalInvestment)}
                />

                <MetricCard
                  label="Opening Inventory"
                  value={money(openingInventory)}
                />

                <MetricCard
                  label="Annual Gross Margin"
                  value={money(annualGrossMargin)}
                />

                <MetricCard
                  label="Year-1 GM ROI"
                  value={percent(roi)}
                  positive
                />

                <MetricCard
                  label="Annual Revenue"
                  value={money(annualRevenue)}
                />

                <MetricCard
                  label="Estimated Payback"
                  value={`${decimal(payback)} mo`}
                />

                <MetricCard
                  label="Selected SKUs"
                  value={number(selectedSKUs)}
                />

                <MetricCard
                  label="Peak Utilization"
                  value={percent(peakUtilization)}
                />

              </div>

              <div className="mt-5 border-t border-slate-700 pt-4 text-xs text-slate-500">
                Illustrative synthetic model.
              </div>
            </section>

            {/* ASSORTMENT */}
            <section className="mb-7 rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <div className="mb-2 text-xs font-semibold tracking-[0.16em] text-blue-400">
                    ASSORTMENT PLANNING
                  </div>

                  <h2 className="text-2xl font-bold">
                    04 — What should the node stock?
                  </h2>

                  <p className="mt-2 text-sm text-slate-400">
                    SKU selection is constrained by demand,
                    customer need, inventory investment and
                    storage capacity.
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-4xl font-bold">
                    {number(selectedSKUs)}
                  </div>

                  <div className="text-xs text-slate-500">
                    OPTIMIZED SKUs
                  </div>
                </div>
              </div>

              <div className="mb-6 grid gap-4 md:grid-cols-4">

                <MetricCard
                  label="Opening Inventory"
                  value={money(
                    openingInventoryAssortment
                  )}
                />

                <MetricCard
                  label="Inventory Budget"
                  value={money(inventoryBudget)}
                />

                <MetricCard
                  label="Storage Used"
                  value={number(storageUsed)}
                />

                <MetricCard
                  label="Storage Utilization"
                  value={percent(
                    storageUtilization
                  )}
                />

              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-slate-400">
                      <th className="px-3 py-3">
                        Category
                      </th>
                      <th className="px-3 py-3 text-right">
                        Daily Demand
                      </th>
                      <th className="px-3 py-3 text-right">
                        Availability
                      </th>
                      <th className="px-3 py-3 text-right">
                        Stockout
                      </th>
                      <th className="px-3 py-3 text-right">
                        Selection Gap
                      </th>
                      <th className="px-3 py-3 text-right">
                        SKUs
                      </th>
                      <th className="px-3 py-3 text-right">
                        Gross Margin
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {categories.map(
                      (category) => (
                        <tr
                          key={category.category}
                          className="border-b border-slate-800"
                        >
                          <td className="px-3 py-3 font-semibold">
                            {category.category}
                          </td>

                          <td className="px-3 py-3 text-right">
                            {number(
                              category.demand
                            )}
                          </td>

                          <td className="px-3 py-3 text-right">
                            {percent(
                              category.availabilityPct
                            )}
                          </td>

                          <td className="px-3 py-3 text-right">
                            {percent(
                              category.stockoutPct
                            )}
                          </td>

                          <td className="px-3 py-3 text-right">
                            {percent(
                              category.unmetDemandPct
                            )}
                          </td>

                          <td className="px-3 py-3 text-right text-blue-400">
                            {number(
                              category.recommendedSKUs
                            )}
                          </td>

                          <td className="px-3 py-3 text-right">
                            ₹
                            {number(
                              Number(
                                category.dailyGrossMargin ||
                                  0
                              )
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* SKU PRIORITIZATION */}
            <section className="mb-7 rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
              <SectionHeading
                eyebrow="SKU PRIORITIZATION"
                title="05 — Which SKUs launch first?"
                description="The optimizer prioritizes individual SKUs rather than assigning the same number of products to every category."
              />

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-slate-400">
                      <th className="px-3 py-3">
                        SKU
                      </th>

                      <th className="px-3 py-3">
                        Category
                      </th>

                      <th className="px-3 py-3 text-right">
                        Daily Demand
                      </th>

                      <th className="px-3 py-3 text-right">
                        Price
                      </th>

                      <th className="px-3 py-3 text-right">
                        Margin
                      </th>

                      <th className="px-3 py-3 text-right">
                        Availability
                      </th>

                      <th className="px-3 py-3 text-right">
                        Stockout
                      </th>

                      <th className="px-3 py-3 text-right">
                        Opening Inv.
                      </th>

                      <th className="px-3 py-3 text-right">
                        Priority
                      </th>

                      <th className="px-3 py-3 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {skuRecommendations.map(
                      (sku, index) => {

                        const selected =
                          Boolean(
                            sku.selected
                          );

                        /*
                         * The optimizer's selected flag is
                         * authoritative. We only improve the
                         * presentation of the action label here.
                         */
                        let action;

                        if (selected) {
                          action =
                            index < 5
                              ? "Launch first"
                              : "Launch";
                        } else {
                          action =
                            index < 18
                              ? "Watch"
                              : "Defer";
                        }

                        return (
                          <tr
                            key={sku.SKU_ID}
                            className="border-b border-slate-800"
                          >
                            <td className="px-3 py-3 font-semibold">
                              {sku.SKU_ID}
                            </td>

                            <td className="px-3 py-3">
                              {sku.Category}
                            </td>

                            <td className="px-3 py-3 text-right">
                              {decimal(
                                sku.dailyDemand
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              ₹
                              {decimal(
                                sku.Selling_Price
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              ₹
                              {decimal(
                                sku.Margin_Per_Unit
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              {percent(
                                sku.availabilityPct
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              {percent(
                                sku.stockoutPct
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              ₹
                              {Number(
                                sku.openingInvestment ||
                                  0
                              ).toLocaleString(
                                "en-IN",
                                {
                                  maximumFractionDigits: 0,
                                }
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              {decimal(
                                sku.priorityScore
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              <ActionBadge
                                action={action}
                              />
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* CAPACITY + STORAGE */}
            <section className="grid gap-5 md:grid-cols-2">

              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
                <SectionHeading
                  eyebrow="CAPACITY"
                  title="06 — Can the node handle demand?"
                  description="Peak demand is compared with the selected node's daily order capacity."
                />

                <DataRow
                  label="Node capacity"
                  value={`${number(
                    dailyCapacity
                  )} orders/day`}
                />

                <DataRow
                  label="Projected daily demand"
                  value={number(
                    projectedDailyDemand
                  )}
                />

                <DataRow
                  label="Peak demand"
                  value={number(
                    peakDemand
                  )}
                />

                <DataRow
                  label="Capacity gap"
                  value={number(
                    capacityGap
                  )}
                />

                <DataRow
                  label="Peak utilization"
                  value={percent(
                    peakUtilization
                  )}
                  last
                />
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
                <SectionHeading
                  eyebrow="STORAGE"
                  title="07 — Can the assortment fit?"
                  description="Storage is treated as a hard planning constraint with the selected scenario limit."
                />

                <DataRow
                  label="Estimated storage"
                  value={`${number(
                    storageUsed
                  )} units`}
                />

                <DataRow
                  label="Node storage capacity"
                  value={`${number(
                    storageCapacity
                  )} units`}
                />

                <DataRow
                  label="Storage utilization"
                  value={percent(
                    storageUtilization
                  )}
                />

                <DataRow
                  label="Scenario limit"
                  value={`${storageLimitPct}%`}
                />

                <DataRow
                  label="Within constraint"
                  value={
                    storageUtilization <=
                    storageLimitPct
                      ? "YES"
                      : "NO"
                  }
                  positive={
                    storageUtilization <=
                    storageLimitPct
                  }
                  last
                />
              </div>

            </section>

            {/* FOOTER */}
            <footer className="mt-7 rounded-2xl border border-slate-700 bg-slate-900/70 p-5 text-xs text-slate-500">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <span>
                  Demand:{" "}
                  <strong className="text-slate-300">
                    {Math.round(
                      demandMultiplier * 100
                    )}%
                  </strong>
                </span>

                <span>
                  Budget:{" "}
                  <strong className="text-slate-300">
                    ₹{budget}L
                  </strong>
                </span>

                <span>
                  Delivery:{" "}
                  <strong className="text-slate-300">
                    {deliveryTarget} min
                  </strong>
                </span>

                <span>
                  Storage:{" "}
                  <strong className="text-slate-300">
                    {storageLimitPct}%
                  </strong>
                </span>
              </div>

              <p className="mt-4">
                This is a synthetic planning model created
                for portfolio demonstration. Financial outputs
                are illustrative and should not be interpreted
                as Amazon internal data or actual Amazon economics.
              </p>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}


/* -------------------------------------------------------
   COMPONENTS
------------------------------------------------------- */

function SelectControl({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-400">
        {label}
      </span>

      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-sm text-white outline-none transition focus:border-blue-500"
      >
        {options.map((option) => (
          <option
            key={String(option.value)}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}


function MetricCard({
  label,
  value,
  highlight = false,
  positive = false,
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-blue-500 bg-blue-950/20"
          : positive
          ? "border-emerald-500/60 bg-emerald-950/10"
          : "border-slate-700 bg-slate-900/80"
      }`}
    >
      <div className="text-[10px] font-medium tracking-wide text-blue-300">
        {label.toUpperCase()}
      </div>

      <div className="mt-2 text-xl font-bold">
        {value}
      </div>
    </div>
  );
}


function MiniMetric({
  label,
  value,
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-[10px] text-slate-500">
        {label.toUpperCase()}
      </div>

      <div className="mt-2 text-lg font-semibold">
        {value}
      </div>
    </div>
  );
}


function SectionHeading({
  eyebrow,
  title,
  description,
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-xs font-semibold tracking-[0.16em] text-blue-400">
        {eyebrow}
      </div>

      <h2 className="text-2xl font-bold">
        {title}
      </h2>

      {description && (
        <p className="mt-2 text-sm text-slate-400">
          {description}
        </p>
      )}
    </div>
  );
}


function DataRow({
  label,
  value,
  positive = false,
  last = false,
}) {
  return (
    <div
      className={`flex items-center justify-between py-3 ${
        !last
          ? "border-b border-slate-800"
          : ""
      }`}
    >
      <span className="text-sm text-slate-400">
        {label}
      </span>

      <strong
        className={
          positive
            ? "text-emerald-400"
            : ""
        }
      >
        {value}
      </strong>
    </div>
  );
}


function ActionBadge({
  action,
}) {
  let classes =
    "border-slate-600 bg-slate-800 text-slate-300";

  if (action === "Launch first") {
    classes =
      "border-blue-500/60 bg-blue-500/10 text-blue-300";
  }

  if (action === "Launch") {
    classes =
      "border-emerald-500/60 bg-emerald-500/10 text-emerald-300";
  }

  if (action === "Watch") {
    classes =
      "border-yellow-500/60 bg-yellow-500/10 text-yellow-300";
  }

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${classes}`}
    >
      {action.toUpperCase()}
    </span>
  );
}


function NetworkOption({
  option,
  recommended,
}) {
  const totalInvestment = Number(
    option.totalInvestment || 0
  );

  const openingInventory = Number(
    option.openingInventory || 0
  );

  const annualGrossMargin = Number(
    option.annualGrossMargin || 0
  );

  const roi = Number(
    option.grossMarginRoiPct ||
      (totalInvestment > 0
        ? (annualGrossMargin /
            totalInvestment) *
          100
        : 0)
  );

  const payback = Number(
    option.paybackMonths || 0
  );

  const capacity =
    Number(option.capacity || 0);

  const delivery =
    Number(option.delivery || 0);

  const assortment =
    Number(option.assortment || 0);

  return (
    <div
      className={`rounded-2xl border p-4 ${
        recommended
          ? "border-blue-500 bg-blue-950/20"
          : "border-slate-700 bg-slate-950/50"
      }`}
    >
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold">
            {option.strategy}
          </h3>

          {recommended && (
            <span className="mt-2 inline-block rounded bg-blue-600 px-2 py-1 text-[10px] font-bold">
              RECOMMENDED
            </span>
          )}
        </div>

        <div className="text-right">
          <div className="text-2xl font-bold">
            {decimal(option.score)}
          </div>

          <div className="text-[9px] text-slate-500">
            strategy score
          </div>
        </div>
      </div>

      <div className="space-y-0">

        <NetworkRow
          label="Launch cost"
          value={money(
            option.launchCost ||
              option.cost
          )}
        />

        <NetworkRow
          label="Opening inventory"
          value={money(
            openingInventory
          )}
        />

        <NetworkRow
          label="Total investment"
          value={money(
            totalInvestment
          )}
        />

        <NetworkRow
          label="Capacity"
          value={number(capacity)}
        />

        <NetworkRow
          label="Optimized assortment"
          value={`${number(
            assortment
          )} SKUs`}
        />

        <NetworkRow
          label="Delivery"
          value={`${decimal(
            delivery
          )} min`}
        />

        <NetworkRow
          label="Annual gross margin"
          value={money(
            annualGrossMargin
          )}
        />

        <NetworkRow
          label="Year-1 GM ROI"
          value={percent(roi)}
        />

        <NetworkRow
          label="Payback"
          value={
            payback > 0
              ? `${decimal(
                  payback
                )} mo`
              : "—"
          }
          last
        />

      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <FitBadge
          label="Budget"
          fit={option.budgetFit}
        />

        <FitBadge
          label="Capacity"
          fit={option.capacityFit}
        />

        <FitBadge
          label="Delivery"
          fit={option.deliveryFit}
        />

        <FitBadge
          label="Storage"
          fit={option.storageFit}
        />
      </div>
    </div>
  );
}


function NetworkRow({
  label,
  value,
  last = false,
}) {
  return (
    <div
      className={`flex items-center justify-between py-3 ${
        !last
          ? "border-b border-slate-800"
          : ""
      }`}
    >
      <span className="text-sm text-slate-400">
        {label}
      </span>

      <strong className="text-sm">
        {value}
      </strong>
    </div>
  );
}


function FitBadge({
  label,
  fit,
}) {
  return (
    <div
      className={`rounded-md border px-2 py-2 text-center text-[10px] font-semibold ${
        fit
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/40 bg-red-500/10 text-red-400"
      }`}
    >
      {label}: {fit ? "FIT" : "GAP"}
    </div>
  );
}
