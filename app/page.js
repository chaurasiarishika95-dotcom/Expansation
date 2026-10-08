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
  return value === undefined || value === null
    ? fallback
    : value;
}

export default function Home() {
  const [zone, setZone] = useState("West Delhi");
  const [demandMultiplier, setDemandMultiplier] = useState(1);
  const [budget, setBudget] = useState(100);
  const [deliveryTarget, setDeliveryTarget] = useState(20);
  const [storageLimitPct, setStorageLimitPct] =
    useState(85);

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
      setError(
        err.message || "Unable to generate plan."
      );
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
      ? totalInvestment /
        (annualGrossMargin / 12)
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

  const openingInventoryAssortment =
    Number(
      safe(
        assortment.economics
          ?.openingInventoryInvestmentLakh,
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
          safe(storage.utilizationPct, 0)
        );

  const networkComparison =
    plan?.networkComparison || [];

  const skuRecommendations =
    plan?.skuRecommendations || [];

  const categories =
    assortment.categories || [];

  const recommendation =
    plan?.recommendation ||
    "No recommendation";

  const decisionReasons =
    plan?.decisionReasons || [];

  const opportunityScore = Number(
    safe(
      opportunity.opportunityScore,
      0
    )
  );

  const topCategories = [...categories]
    .sort(
      (a, b) =>
        Number(b.demand || 0) -
        Number(a.demand || 0)
    )
    .slice(0, 8);

  const topSkus = skuRecommendations.slice(
    0,
    10
  );

  return (
    <main className="min-h-screen bg-[#030817] text-white">
      <div className="mx-auto max-w-[1450px] px-4 py-6">

        {/* HEADER */}
        <header className="mb-5">
          <div className="mb-1 text-xs font-semibold tracking-[0.18em] text-blue-400">
            NETWORK PLANNING COMMAND CENTER
          </div>

          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                UFC Network & Assortment Planner
              </h1>

              <p className="mt-1 text-sm text-slate-400">
                Decide where to expand, what node to build,
                what to stock, and how to scale the network.
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-right">
              <div className="text-[10px] tracking-wider text-slate-500">
                ACTIVE PLAN
              </div>
              <div className="text-sm font-semibold">
                {zone}
              </div>
            </div>
          </div>
        </header>

        {/* CONTROLS */}
        <section className="mb-5 rounded-xl border border-slate-700 bg-slate-900/90 p-4">
          <div className="grid gap-3 md:grid-cols-5">

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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={generatePlan}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Generating..."
                : "Generate Expansion Plan"}
            </button>

            <div className="text-xs text-slate-500">
              Scenario changes automatically recalculate
              the planning recommendation.
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-300">
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
            <section className="mb-5 grid gap-3 md:grid-cols-4">

              <MetricCard
                label="Recommended Strategy"
                value={recommendation}
                highlight
              />

              <MetricCard
                label="Opportunity Score"
                value={`${opportunityScore}/100`}
              />

              <MetricCard
                label="Projected Daily Demand"
                value={number(
                  projectedDailyDemand
                )}
              />

              <MetricCard
                label="Peak Utilization"
                value={percent(
                  peakUtilization
                )}
              />

            </section>

            {/* DECISION RATIONALE + QUICK ECONOMICS */}
            <section className="mb-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">

              <div className="rounded-xl border border-blue-500/60 bg-blue-950/20 p-5">
                <div className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-blue-400">
                  DECISION RATIONALE
                </div>

                <h2 className="mb-3 text-xl font-bold">
                  Why {recommendation}?
                </h2>

                <div className="space-y-2">
                  {decisionReasons
                    .slice(0, 4)
                    .map(
                      (reason, index) => (
                        <div
                          key={index}
                          className="flex gap-3 text-sm text-slate-200"
                        >
                          <span className="font-semibold text-blue-400">
                            {String(
                              index + 1
                            ).padStart(
                              2,
                              "0"
                            )}
                          </span>

                          <span>{reason}</span>
                        </div>
                      )
                    )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5">
                <div className="mb-3 text-[10px] font-semibold tracking-[0.16em] text-blue-400">
                  FINANCIAL SNAPSHOT
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <SmallStat
                    label="Investment"
                    value={money(
                      totalInvestment
                    )}
                  />

                  <SmallStat
                    label="Opening Inventory"
                    value={money(
                      openingInventory
                    )}
                  />

                  <SmallStat
                    label="Annual GM"
                    value={money(
                      annualGrossMargin
                    )}
                  />

                  <SmallStat
                    label="GM ROI"
                    value={percent(roi)}
                  />

                  <SmallStat
                    label="Payback"
                    value={`${decimal(
                      payback
                    )} mo`}
                  />

                  <SmallStat
                    label="Optimized SKUs"
                    value={number(
                      selectedSKUs
                    )}
                  />
                </div>
              </div>

            </section>

            {/* NETWORK GAP */}
            <section className="mb-5 rounded-xl border border-slate-700 bg-slate-900/80 p-5">
              <SectionHeading
                eyebrow="01 — NETWORK OPPORTUNITY"
                title="Is there a network gap?"
                description="Demand, delivery, capacity and customer selection signals."
              />

              <div className="grid gap-3 md:grid-cols-6">
                <MiniMetric
                  label="Current Utilization"
                  value={percent(
                    opportunity.utilization
                  )}
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

            {/* GRAPHS */}
            <section className="mb-5 grid gap-4 lg:grid-cols-2">

              <ChartCard
                title="Demand vs node capacity"
                description="Peak demand should remain within the selected node's capacity."
              >
                <CapacityChart
                  projected={projectedDailyDemand}
                  peak={peakDemand}
                  capacity={dailyCapacity}
                />
              </ChartCard>

              <ChartCard
                title="Network strategy comparison"
                description="Strategy score across the modeled node options."
              >
                <StrategyChart
                  options={networkComparison}
                />
              </ChartCard>

              <ChartCard
                title="Category demand"
                description="Highest-demand categories in the optimized assortment."
              >
                <CategoryChart
                  categories={topCategories}
                />
              </ChartCard>

              <ChartCard
                title="SKU priority queue"
                description="Highest-priority SKUs for launch sequencing."
              >
                <PriorityChart
                  skus={topSkus}
                />
              </ChartCard>

            </section>

            {/* NETWORK DESIGN */}
            <section className="mb-5 rounded-xl border border-slate-700 bg-slate-900/80 p-5">
              <SectionHeading
                eyebrow="02 — NETWORK DESIGN"
                title="What node should we build?"
                description="Compare Small MFC, UFC and phased expansion."
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

            {/* ASSORTMENT + ECONOMICS */}
            <section className="mb-5 grid gap-4 lg:grid-cols-2">

              <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5">
                <SectionHeading
                  eyebrow="03 — ASSORTMENT"
                  title="What should the node stock?"
                  description="Inventory is optimized against demand, storage and budget."
                />

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <SmallStat
                    label="SKUs"
                    value={number(
                      selectedSKUs
                    )}
                  />

                  <SmallStat
                    label="Inventory"
                    value={money(
                      openingInventoryAssortment
                    )}
                  />

                  <SmallStat
                    label="Storage"
                    value={percent(
                      storageUtilization
                    )}
                  />

                  <SmallStat
                    label="Stock Budget"
                    value={money(
                      inventoryBudget
                    )}
                  />
                </div>

                <div className="mt-5">
                  <ProgressBar
                    label="Storage utilization"
                    value={
                      storageUtilization
                    }
                    max={100}
                  />

                  <ProgressBar
                    label="Peak capacity utilization"
                    value={
                      peakUtilization
                    }
                    max={100}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5">
                <SectionHeading
                  eyebrow="04 — ECONOMICS"
                  title="Does the expansion make sense?"
                  description="Illustrative economics using the synthetic planning model."
                />

                <div className="grid grid-cols-2 gap-3">
                  <SmallStat
                    label="Investment"
                    value={money(
                      totalInvestment
                    )}
                  />

                  <SmallStat
                    label="Revenue"
                    value={money(
                      annualRevenue
                    )}
                  />

                  <SmallStat
                    label="Gross Margin"
                    value={money(
                      annualGrossMargin
                    )}
                  />

                  <SmallStat
                    label="GM ROI"
                    value={percent(roi)}
                  />

                  <SmallStat
                    label="Payback"
                    value={`${decimal(
                      payback
                    )} mo`}
                  />

                  <SmallStat
                    label="Delivery"
                    value={`${decimal(
                      node.expectedDelivery
                    )} min`}
                  />
                </div>
              </div>

            </section>

            {/* COLLAPSIBLE CATEGORY TABLE */}
            <section className="mb-5 rounded-xl border border-slate-700 bg-slate-900/80">
              <details>
                <summary className="cursor-pointer list-none p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold tracking-[0.16em] text-blue-400">
                        DETAIL VIEW
                      </div>

                      <h2 className="mt-1 text-xl font-bold">
                        Category assortment breakdown
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        {categories.length} categories
                        in the optimized assortment.
                      </p>
                    </div>

                    <span className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400">
                      Expand
                    </span>
                  </div>
                </summary>

                <div className="border-t border-slate-800 p-5">
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
                            Daily GM
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {categories.map(
                          (category) => (
                            <tr
                              key={
                                category.category
                              }
                              className="border-b border-slate-800"
                            >
                              <td className="px-3 py-3 font-semibold">
                                {
                                  category.category
                                }
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
                                  category.dailyGrossMargin
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </section>

            {/* SKU QUEUE */}
            <section className="mb-5 rounded-xl border border-slate-700 bg-slate-900/80 p-5">
              <SectionHeading
                eyebrow="05 — SKU PRIORITIZATION"
                title="Which SKUs launch first?"
                description="Launch the strongest candidates, test uncertain high-potential SKUs, and defer lower-priority items."
              />

              <div className="mb-4 flex flex-wrap gap-2">
                <ActionLegend
                  action="LAUNCH"
                  text="Strong launch candidate"
                />

                <ActionLegend
                  action="TEST"
                  text="Validate before scaling"
                />

                <ActionLegend
                  action="DEFER"
                  text="Lower initial priority"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-sm">
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
                    {skuRecommendations
                      .slice(0, 30)
                      .map((sku) => (
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
                              action={
                                sku.action
                              }
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* CAPACITY / STORAGE */}
            <section className="mb-5 grid gap-4 md:grid-cols-2">

              <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5">
                <SectionHeading
                  eyebrow="06 — CAPACITY"
                  title="Can the node handle demand?"
                  description="Peak demand is compared with node capacity."
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

              <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5">
                <SectionHeading
                  eyebrow="07 — STORAGE"
                  title="Can the assortment fit?"
                  description="Storage is treated as a planning constraint."
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

            {/* ASSUMPTIONS */}
            <details className="mb-5 rounded-xl border border-slate-700 bg-slate-900/70">
              <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-300">
                Model assumptions & methodology
              </summary>

              <div className="border-t border-slate-800 p-4 text-xs leading-6 text-slate-500">
                <p>
                  Year-1 gross-margin ROI =
                  annual gross margin divided by
                  total upfront investment.
                </p>

                <p>
                  Total upfront investment includes
                  modeled launch cost plus opening
                  inventory.
                </p>

                <p>
                  Revenue and gross margin use the
                  synthetic demand model and a
                  modeled Year-1 realization factor.
                </p>

                <p>
                  The model does not include rent,
                  labor, logistics OPEX, taxes or
                  financing costs.
                </p>

                <p>
                  All values are illustrative
                  planning data created for product
                  demonstration.
                </p>
              </div>
            </details>

            {/* FOOTER */}
            <footer className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-600">
              Synthetic planning model. Financial outputs
              are illustrative and intended for product
              demonstration.
            </footer>
          </>
        )}
      </div>
    </main>
  );
}


/* =====================================================
   BASIC UI
===================================================== */

function SelectControl({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium tracking-wide text-slate-500">
        {label.toUpperCase()}
      </span>

      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
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
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-blue-500 bg-blue-950/25"
          : "border-slate-700 bg-slate-900/80"
      }`}
    >
      <div className="text-[9px] font-medium tracking-[0.12em] text-blue-300">
        {label.toUpperCase()}
      </div>

      <div className="mt-2 text-xl font-bold">
        {value}
      </div>
    </div>
  );
}


function SmallStat({
  label,
  value,
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-[9px] tracking-wide text-slate-500">
        {label.toUpperCase()}
      </div>

      <div className="mt-1 text-lg font-semibold">
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
      <div className="text-[9px] text-slate-500">
        {label.toUpperCase()}
      </div>

      <div className="mt-1 text-lg font-semibold">
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
    <div className="mb-4">
      <div className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-blue-400">
        {eyebrow}
      </div>

      <h2 className="text-xl font-bold">
        {title}
      </h2>

      {description && (
        <p className="mt-1 text-xs text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}


/* =====================================================
   GRAPH COMPONENTS
===================================================== */

function ChartCard({
  title,
  description,
  children,
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5">
      <div className="mb-4">
        <h3 className="text-base font-bold">
          {title}
        </h3>

        <p className="mt-1 text-xs text-slate-500">
          {description}
        </p>
      </div>

      {children}
    </div>
  );
}


function CapacityChart({
  projected,
  peak,
  capacity,
}) {
  const max = Math.max(
    projected,
    peak,
    capacity,
    1
  );

  return (
    <div className="space-y-4">
      <Bar
        label="Projected demand"
        value={projected}
        max={max}
        suffix=""
      />

      <Bar
        label="Peak demand"
        value={peak}
        max={max}
        suffix=""
      />

      <Bar
        label="Node capacity"
        value={capacity}
        max={max}
        suffix=""
      />

      <div className="mt-3 text-xs text-slate-500">
        Peak utilization:{" "}
        <strong className="text-slate-300">
          {percent(
            capacity > 0
              ? (peak / capacity) *
                  100
              : 0
          )}
        </strong>
      </div>
    </div>
  );
}


function StrategyChart({
  options,
}) {
  const max = Math.max(
    ...options.map(
      (x) =>
        Number(x.score || 0)
    ),
    1
  );

  return (
    <div className="space-y-4">
      {options.map((option) => (
        <Bar
          key={option.strategy}
          label={
            option.strategy
          }
          value={Number(
            option.score || 0
          )}
          max={max}
          suffix=""
          recommended={
            option.recommended
          }
        />
      ))}
    </div>
  );
}


function CategoryChart({
  categories,
}) {
  const max = Math.max(
    ...categories.map(
      (x) =>
        Number(x.demand || 0)
    ),
    1
  );

  return (
    <div className="space-y-3">
      {categories.map(
        (category) => (
          <Bar
            key={
              category.category
            }
            label={
              category.category
            }
            value={Number(
              category.demand || 0
            )}
            max={max}
            suffix=""
          />
        )
      )}
    </div>
  );
}


function PriorityChart({
  skus,
}) {
  const max = Math.max(
    ...skus.map(
      (x) =>
        Number(
          x.priorityScore || 0
        )
    ),
    1
  );

  return (
    <div className="space-y-2.5">
      {skus.map((sku) => (
        <Bar
          key={sku.SKU_ID}
          label={sku.SKU_ID}
          value={Number(
            sku.priorityScore || 0
          )}
          max={max}
          suffix=""
          action={sku.action}
        />
      ))}
    </div>
  );
}


function Bar({
  label,
  value,
  max,
  suffix = "",
  recommended = false,
  action,
}) {
  const width = Math.max(
    3,
    Math.min(
      100,
      (value / Math.max(max, 1)) *
        100
    )
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="truncate text-slate-400">
          {label}
        </span>

        <div className="flex items-center gap-2">
          {action && (
            <ActionBadge
              action={action}
              small
            />
          )}

          {recommended && (
            <span className="text-[9px] font-semibold text-blue-400">
              RECOMMENDED
            </span>
          )}

          <strong className="text-slate-200">
            {decimal(value)}
            {suffix}
          </strong>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${
            recommended
              ? "bg-blue-500"
              : "bg-slate-500"
          }`}
          style={{
            width: `${width}%`,
          }}
        />
      </div>
    </div>
  );
}


/* =====================================================
   NETWORK OPTION
===================================================== */

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

  const roi =
    Number(
      option.grossMarginRoiPct || 0
    ) ||
    (totalInvestment > 0
      ? (annualGrossMargin /
          totalInvestment) *
        100
      : 0);

  const payback = Number(
    option.paybackMonths || 0
  );

  return (
    <div
      className={`rounded-xl border p-4 ${
        recommended
          ? "border-blue-500 bg-blue-950/20"
          : "border-slate-700 bg-slate-950/50"
      }`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold">
            {option.strategy}
          </h3>

          {recommended && (
            <span className="mt-2 inline-block rounded bg-blue-600 px-2 py-1 text-[9px] font-bold">
              RECOMMENDED
            </span>
          )}
        </div>

        <div className="text-right">
          <div className="text-2xl font-bold">
            {decimal(option.score)}
          </div>

          <div className="text-[8px] text-slate-500">
            STRATEGY SCORE
          </div>
        </div>
      </div>

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
        value={number(
          option.capacity
        )}
      />

      <NetworkRow
        label="Optimized assortment"
        value={`${number(
          option.assortment
        )} SKUs`}
      />

      <NetworkRow
        label="Delivery"
        value={`${decimal(
          option.delivery
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
      className={`flex items-center justify-between py-2.5 ${
        !last
          ? "border-b border-slate-800"
          : ""
      }`}
    >
      <span className="text-xs text-slate-500">
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
      className={`rounded-md border px-2 py-1.5 text-center text-[9px] font-semibold ${
        fit
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/40 bg-red-500/10 text-red-400"
      }`}
    >
      {label}: {fit ? "FIT" : "GAP"}
    </div>
  );
}


/* =====================================================
   OTHER UI
===================================================== */

function ProgressBar({
  label,
  value,
  max,
}) {
  const width = Math.min(
    100,
    Math.max(
      0,
      (value / max) * 100
    )
  );

  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-500">
          {label}
        </span>

        <strong>
          {percent(value)}
        </strong>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-blue-500"
          style={{
            width: `${width}%`,
          }}
        />
      </div>
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
      className={`flex items-center justify-between py-2.5 ${
        !last
          ? "border-b border-slate-800"
          : ""
      }`}
    >
      <span className="text-xs text-slate-500">
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
  small = false,
}) {
  const normalized =
    String(action || "")
      .toUpperCase();

  let classes =
    "border-slate-600 bg-slate-800 text-slate-300";

  if (normalized === "LAUNCH") {
    classes =
      "border-emerald-500/60 bg-emerald-500/10 text-emerald-300";
  }

  if (normalized === "TEST") {
    classes =
      "border-yellow-500/60 bg-yellow-500/10 text-yellow-300";
  }

  if (normalized === "DEFER") {
    classes =
      "border-slate-600 bg-slate-800 text-slate-400";
  }

  return (
    <span
      className={`inline-flex rounded-md border font-semibold ${
        small
          ? "px-1.5 py-0.5 text-[8px]"
          : "px-2 py-1 text-[9px]"
      } ${classes}`}
    >
      {normalized}
    </span>
  );
}


function ActionLegend({
  action,
  text,
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
      <ActionBadge action={action} />
      <span className="text-[10px] text-slate-500">
        {text}
      </span>
    </div>
  );
}
