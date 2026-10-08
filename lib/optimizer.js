import demandHistory from "../data/demand_history.json";
import searchDemand from "../data/search_demand.json";
import facilities from "../data/facilities.json";
import candidateNodes from "../data/candidate_nodes.json";
import candidateZoneService from "../data/candidate_zone_service.json";
import skuCatalog from "../data/sku_catalog.json";
import skuAvailability from "../data/sku_availability.json";
import inventoryEconomics from "../data/inventory_economics.json";
import skuDemandHistory from "../data/sku_demand_history.json";
import zones from "../data/zones.json";
import planningAssumptions from "../data/planning_assumptions.json";

const zoneMap = Object.fromEntries(zones.map((z) => [z.Zone, z]));
const inventoryMap = Object.fromEntries(
  inventoryEconomics.map((x) => [x.SKU_ID, x])
);

const availabilityMap = {};
for (const row of skuAvailability) {
  availabilityMap[`${row.Zone}__${row.SKU_ID}`] = row;
}

const serviceMap = {};
for (const row of candidateZoneService) {
  serviceMap[`${row.Candidate_ID}__${row.Service_Zone}`] = row;
}

const zoneDailyDemand = {};

for (const row of demandHistory) {
  if (!zoneDailyDemand[row.Zone]) {
    zoneDailyDemand[row.Zone] = {};
  }

  zoneDailyDemand[row.Zone][row.Date] =
    (zoneDailyDemand[row.Zone][row.Date] || 0) +
    Number(row.Orders || 0);
}

const searchMap = {};

for (const row of searchDemand) {
  if (!searchMap[row.Zone]) {
    searchMap[row.Zone] = [];
  }

  searchMap[row.Zone].push(row);
}

const skuWeekly = {};
const skuWeeksByZone = {};

for (const row of skuDemandHistory) {
  const key = `${row.Zone}__${row.SKU_ID}`;

  if (!skuWeekly[key]) {
    skuWeekly[key] = {};
  }

  skuWeekly[key][row.Week_Start] = Number(row.Orders || 0);

  if (!skuWeeksByZone[row.Zone]) {
    skuWeeksByZone[row.Zone] = new Set();
  }

  skuWeeksByZone[row.Zone].add(row.Week_Start);
}

function avg(values) {
  if (!values.length) return 0;

  return (
    values.reduce((sum, value) => sum + Number(value || 0), 0) /
    values.length
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function moneyLakh(value) {
  return round(Number(value || 0) / 100000, 1);
}

function pct(value) {
  const n = Number(value || 0);
  return n > 1 ? n / 100 : n;
}

/* =========================================================
   DEMAND
========================================================= */

function getZoneDemand(zone, demandMultiplier = 1) {
  const daily = zoneDailyDemand[zone] || {};

  const dates = Object.keys(daily).sort();
  const values = dates.map((date) => daily[date]);

  const recent = values.slice(-28);
  const previous = values.slice(-56, -28);

  const recentAvg = avg(recent);
  const previousAvg = avg(previous);

  const observedTrend =
    previousAvg > 0
      ? (recentAvg - previousAvg) / previousAvg
      : 0;

  const expectedGrowth =
    Number(zoneMap[zone]?.Expected_Growth_Pct || 0) / 100;

  const planningTrend =
    observedTrend * 0.35 +
    expectedGrowth * 0.65;

  const projectedDaily =
    recentAvg *
    (1 + planningTrend * 0.5) *
    demandMultiplier;

  const buffer =
    Number(
      planningAssumptions.Default_Capacity_Buffer_Pct || 10
    ) / 100;

  return {
    baseline: round(avg(values)),
    recentDemand: round(recentAvg),

    observedTrendPct: round(
      observedTrend * 100,
      1
    ),

    expectedGrowthPct: round(
      expectedGrowth * 100,
      1
    ),

    planningTrendPct: round(
      planningTrend * 100,
      1
    ),

    projectedDaily: round(projectedDaily),

    peakDaily: round(
      projectedDaily * (1 + buffer)
    ),

    historicalDays: values.length,
  };
}

/* =========================================================
   NETWORK OPPORTUNITY
========================================================= */

function getNetworkOpportunity(
  zone,
  demandMultiplier = 1,
  deliveryTarget = 20
) {
  const demand = getZoneDemand(
    zone,
    demandMultiplier
  );

  const existing = facilities.filter(
    (f) => f.Zone === zone
  );

  const capacity = existing.reduce(
    (sum, f) =>
      sum + Number(f.Daily_Capacity_Orders || 0),
    0
  );

  const utilization = avg(
    existing.map((f) =>
      pct(f.Current_Utilization)
    )
  );

  const delivery = avg(
    existing.map((f) =>
      Number(f.Avg_Delivery_Min || 0)
    )
  );

  const currentLoad = existing.reduce(
    (sum, f) =>
      sum +
      Number(f.Daily_Capacity_Orders || 0) *
        pct(f.Current_Utilization),
    0
  );

  const pressureCapacity = Math.max(
    0,
    currentLoad - capacity * 0.85
  );

  const searches = searchMap[zone] || [];

  const searchVolume = searches.reduce(
    (sum, row) =>
      sum + Number(row.Daily_Search_Demand || 0),
    0
  );

  const unavailable = searches.reduce(
    (sum, row) =>
      sum + Number(row.Unavailable_Searches || 0),
    0
  );

  const selectionGap =
    searchVolume > 0
      ? unavailable / searchVolume
      : 0;

  const customer = zoneMap[zone] || {};

  const coverageGap = Math.max(
    0,
    Number(customer.Potential_Customers || 0) -
      Number(customer.Active_Customers || 0)
  );

  const capacityPressure = clamp(
    (pressureCapacity /
      Math.max(demand.peakDaily, 1)) *
      100,
    0,
    100
  );

  const deliveryPressure = clamp(
    Math.max(
      0,
      delivery - deliveryTarget
    ) * 10,
    0,
    100
  );

  const selectionPressure = clamp(
    selectionGap * 100,
    0,
    100
  );

  const growthPressure = clamp(
    Number(customer.Expected_Growth_Pct || 0) * 5,
    0,
    100
  );

  return {
    zone,

    projectedDailyDemand:
      demand.projectedDaily,

    peakDemand:
      demand.peakDaily,

    baselineDemand:
      demand.baseline,

    observedTrendPct:
      demand.observedTrendPct,

    expectedGrowthPct:
      demand.expectedGrowthPct,

    planningTrendPct:
      demand.planningTrendPct,

    existingCapacity:
      round(capacity),

    currentLoad:
      round(currentLoad),

    utilization:
      round(utilization * 100),

    avgDelivery:
      round(delivery, 1),

    deliveryGap:
      round(
        Math.max(
          0,
          delivery - deliveryTarget
        ),
        1
      ),

    selectionGapPct:
      round(selectionGap * 100, 1),

    searchDemand:
      round(searchVolume),

    unavailableSearches:
      round(unavailable),

    coverageGapCustomers:
      round(coverageGap),

    currentCapacityPressure:
      round(pressureCapacity),

    opportunityScore: round(
      capacityPressure * 0.25 +
        deliveryPressure * 0.25 +
        selectionPressure * 0.3 +
        growthPressure * 0.2
    ),
  };
}

/* =========================================================
   SKU DEMAND
========================================================= */

function getRecentSkuDailyDemand(
  zone,
  skuId
) {
  const weeks = Array.from(
    skuWeeksByZone[zone] || []
  )
    .sort()
    .slice(-4);

  const weekly =
    skuWeekly[`${zone}__${skuId}`] || {};

  if (!weeks.length) return 0;

  return (
    avg(
      weeks.map((week) =>
        Number(weekly[week] || 0)
      )
    ) / 7
  );
}

/* =========================================================
   CUSTOMER / NODE CAPTURE
========================================================= */

function getCandidateDemandCapture(
  zone,
  candidate
) {
  const service =
    serviceMap[
      `${candidate.Candidate_ID}__${zone}`
    ];

  const customer = zoneMap[zone] || {};

  const active = Number(
    customer.Active_Customers || 0
  );

  const serviceable = Number(
    service?.Serviceable_Customers || 0
  );

  const incrementalCustomers = Math.max(
    0,
    serviceable - active
  );

  const incrementalRatio =
    active > 0
      ? incrementalCustomers / active
      : 0.2;

  return {
    serviceableCustomers:
      serviceable,

    serviceablePct:
      Number(service?.Serviceable_Pct || 0),

    incrementalCustomers,

    incrementalRatio: clamp(
      incrementalRatio,
      0.05,
      0.45
    ),

    expectedDelivery:
      Number(
        service?.Expected_Delivery_Min ||
          candidate.Fixed_Delivery_Min ||
          20
      ),
  };
}

/* =========================================================
   SKU SCORING
========================================================= */

function scoreSku(
  zone,
  sku,
  demandMultiplier,
  captureRatio
) {
  const availability =
    availabilityMap[
      `${zone}__${sku.SKU_ID}`
    ] || {};

  const economics =
    inventoryMap[sku.SKU_ID] || {};

  const dailyDemand =
    getRecentSkuDailyDemand(
      zone,
      sku.SKU_ID
    ) *
    captureRatio *
    demandMultiplier;

  const minStockDays = Number(
    economics.Minimum_Stock_Days ||
      sku.Replenishment_Days ||
      3
  );

  const openingUnits =
    dailyDemand * minStockDays;

  const openingInvestment =
    openingUnits *
    Number(sku.Unit_Cost || 0);

  const storageUnits =
    openingUnits *
    Number(sku.Storage_Units || 0);

  const price =
    Number(sku.Selling_Price || 0);

  const margin =
    Number(sku.Margin_Per_Unit || 0);

  const dailyRevenue =
    dailyDemand * price;

  const dailyGrossMargin =
    dailyDemand * margin;

  const availabilityPct =
    pct(
      availability.Current_Availability_Pct
    );

  const stockoutPct =
    pct(
      availability.Stockout_Rate_Pct
    );

  const marginRate =
    margin / Math.max(price, 1);

  const customerValue =
    Math.log1p(dailyDemand) * 18;

  const availabilityValue =
    (1 - availabilityPct) * 55 +
    stockoutPct * 45;

  const economicsValue =
    marginRate * 25;

  const velocityValue =
    sku.Long_Tail_Flag
      ? 0
      : 8;

  const capitalPenalty =
    (openingInvestment / 100000) * 1.5;

  const storagePenalty =
    storageUnits * 0.035;

  return {
    ...sku,

    dailyDemand,

    openingUnits,

    openingInvestment,

    storageUnits,

    dailyRevenue,

    dailyGrossMargin,

    availabilityPct:
      round(availabilityPct * 100),

    stockoutPct:
      round(stockoutPct * 100),

    priorityScore: round(
      customerValue +
        availabilityValue +
        economicsValue +
        velocityValue -
        capitalPenalty -
        storagePenalty,
      2
    ),
  };
}

/* =========================================================
   ASSORTMENT OPTIMIZER
========================================================= */

function optimizeAssortment({
  zone,
  candidate,
  demandMultiplier,
  budget,
  storageLimitPct,
}) {
  const capture =
    getCandidateDemandCapture(
      zone,
      candidate
    );

  const maxSkus = Number(
    candidate.Max_Assortment_SKUs ||
      1200
  );

  /*
   * Total budget = launch cost + opening inventory.
   *
   * Therefore lowering the budget actually
   * reduces available assortment investment.
   */

  const launchCost =
    Number(candidate.Launch_Cost_Lakh || 0) *
    100000;

  const inventoryBudget = Math.max(
    0,
    Number(budget) * 100000 -
      launchCost
  );

  /*
   * Storage scenario is now a real constraint.
   *
   * Example:
   * 100% = full storage
   * 85% = use maximum 85%
   * 70% = use maximum 70%
   */

  const physicalStorage =
    Number(
      candidate.Storage_Capacity_Units || 0
    );

  const storageBudget =
    physicalStorage *
    (Number(storageLimitPct) / 100);

  /*
   * Only 80% of daily node capacity is
   * allocated to the launch assortment.
   */

  const assortmentDemandCapacity =
    Number(
      candidate.Daily_Capacity_Orders || 0
    ) * 0.8;

  const ranked =
    skuCatalog
      .map((sku) =>
        scoreSku(
          zone,
          sku,
          demandMultiplier,
          capture.incrementalRatio
        )
      )
      .sort(
        (a, b) =>
          b.priorityScore -
          a.priorityScore
      );

  const selected = [];

  let investment = 0;
  let storage = 0;
  let dailyDemand = 0;
  let dailyRevenue = 0;
  let dailyGrossMargin = 0;

  const categoryCounts = {};

  /*
   * STEP 1
   *
   * Guarantee category breadth.
   */

  const categories = [
    ...new Set(
      ranked.map((x) => x.Category)
    ),
  ];

  for (const category of categories) {
    const best = ranked.find(
      (x) => x.Category === category
    );

    if (!best) continue;

    const fitsBudget =
      investment +
        best.openingInvestment <=
      inventoryBudget;

    const fitsStorage =
      storage +
        best.storageUnits <=
      storageBudget;

    const fitsCapacity =
      dailyDemand +
        best.dailyDemand <=
      assortmentDemandCapacity;

    if (
      selected.length < maxSkus &&
      fitsBudget &&
      fitsStorage &&
      fitsCapacity
    ) {
      selected.push(best);

      investment +=
        best.openingInvestment;

      storage +=
        best.storageUnits;

      dailyDemand +=
        best.dailyDemand;

      dailyRevenue +=
        best.dailyRevenue;

      dailyGrossMargin +=
        best.dailyGrossMargin;

      categoryCounts[category] = 1;
    }
  }

  /*
   * STEP 2
   *
   * Fill remaining capacity with
   * highest-priority SKUs.
   */

  for (const sku of ranked) {
    if (
      selected.some(
        (x) =>
          x.SKU_ID === sku.SKU_ID
      )
    ) {
      continue;
    }

    if (
      selected.length >= maxSkus
    ) {
      break;
    }

    const fitsBudget =
      investment +
        sku.openingInvestment <=
      inventoryBudget;

    const fitsStorage =
      storage +
        sku.storageUnits <=
      storageBudget;

    const fitsCapacity =
      dailyDemand +
        sku.dailyDemand <=
      assortmentDemandCapacity;

    if (
      fitsBudget &&
      fitsStorage &&
      fitsCapacity
    ) {
      selected.push(sku);

      investment +=
        sku.openingInvestment;

      storage +=
        sku.storageUnits;

      dailyDemand +=
        sku.dailyDemand;

      dailyRevenue +=
        sku.dailyRevenue;

      dailyGrossMargin +=
        sku.dailyGrossMargin;

      categoryCounts[sku.Category] =
        (categoryCounts[sku.Category] || 0) +
        1;
    }
  }

  /*
   * Year-1 realization factor.
   *
   * This is intentionally illustrative.
   */

  const realization = 0.72;

  const annualRevenue =
    dailyRevenue *
    365 *
    realization;

  const annualGrossMargin =
    dailyGrossMargin *
    365 *
    realization;

  /*
   * IMPORTANT:
   *
   * Total upfront investment =
   * Launch cost + opening inventory.
   */

  const totalUpfrontInvestment =
    launchCost + investment;

  /*
   * Year-1 gross-margin ROI.
   */

  const grossMarginRoiPct =
    totalUpfrontInvestment > 0
      ? (annualGrossMargin /
          totalUpfrontInvestment) *
        100
      : 0;

  /*
   * Payback in months.
   */

  const paybackMonths =
    annualGrossMargin > 0
      ? totalUpfrontInvestment /
        (annualGrossMargin / 12)
      : 999;

  return {
    candidateId:
      candidate.Candidate_ID,

    nodeType:
      candidate.Node_Type,

    selected,

    selectedSKUs:
      selected.length,

    categoryCounts,

    inventoryBudget:
      round(inventoryBudget),

    openingInventoryInvestment:
      round(investment),

    storageUsed:
      round(storage),

    storageCapacity:
      physicalStorage,

    storageUtilizationPct:
      round(
        (storage /
          Math.max(
            physicalStorage,
            1
          )) *
          100,
        1
      ),

    dailyDemandSupported:
      round(dailyDemand),

    assortmentDemandCapacity:
      round(
        assortmentDemandCapacity
      ),

    dailyRevenue:
      round(dailyRevenue),

    dailyGrossMargin:
      round(dailyGrossMargin),

    annualRevenue:
      round(annualRevenue),

    annualGrossMargin:
      round(annualGrossMargin),

    totalUpfrontInvestment:
      round(
        totalUpfrontInvestment
      ),

    grossMarginRoiPct:
      round(
        grossMarginRoiPct,
        1
      ),

    paybackMonths:
      round(
        paybackMonths,
        1
      ),

    serviceableCustomers:
      capture.serviceableCustomers,

    incrementalCustomers:
      capture.incrementalCustomers,

    incrementalCustomerPct:
      round(
        capture.incrementalRatio *
          100,
        1
      ),

    expectedDelivery:
      capture.expectedDelivery,

    peakCapacityUtilizationPct:
      round(
        (getZoneDemand(
          zone,
          demandMultiplier
        ).peakDaily /
          Math.max(
            Number(
              candidate.Daily_Capacity_Orders ||
                1
            ),
            1
          )) *
          100,
        1
      ),

    assortmentCapacityUtilizationPct:
      round(
        (dailyDemand /
          Math.max(
            Number(
              candidate.Daily_Capacity_Orders ||
                1
            ),
            1
          )) *
          100,
        1
      ),
  };
}

/* =========================================================
   NODE EVALUATION
========================================================= */

function evaluateNode({
  zone,
  candidate,
  opportunity,
  demandMultiplier,
  budget,
  deliveryTarget,
  storageLimitPct,
}) {
  const economics =
    optimizeAssortment({
      zone,
      candidate,
      demandMultiplier,
      budget,
      storageLimitPct,
    });

  const peakDemand =
    opportunity.peakDemand;

  /*
   * HARD CONSTRAINTS
   */

  const deliveryFit =
    economics.expectedDelivery <=
    deliveryTarget;

  const budgetFit =
    economics.totalUpfrontInvestment <=
    Number(budget) * 100000 + 0.01;

  const capacityFit =
    Number(
      candidate.Daily_Capacity_Orders ||
        0
    ) >= peakDemand;

  const storageFit =
    economics.storageUtilizationPct <=
    Number(storageLimitPct) + 0.01;

  /*
   * Selection breadth requirement.
   *
   * Higher selection gap =
   * greater assortment requirement.
   */

  const requiredAssortment =
    Math.min(
      Number(
        candidate.Max_Assortment_SKUs ||
          1200
      ),
      Math.round(
        35 +
          opportunity.selectionGapPct *
            2
      )
    );

  const assortmentFit =
    economics.selectedSKUs >=
    requiredAssortment;

  /*
   * OPERATIONAL SCORE
   */

  const capacityScore =
    capacityFit
      ? 100
      : clamp(
          (Number(
            candidate.Daily_Capacity_Orders ||
              0
          ) /
            Math.max(
              peakDemand,
              1
            )) *
            100,
          0,
          100
        );

  const deliveryScore =
    deliveryFit
      ? 100
      : clamp(
          100 -
            Math.max(
              0,
              economics.expectedDelivery -
                deliveryTarget
            ) *
              12,
          0,
          100
        );

  const assortmentScore =
    assortmentFit
      ? 100
      : clamp(
          (economics.selectedSKUs /
            Math.max(
              requiredAssortment,
              1
            )) *
            100,
          0,
          100
        );

  const storageScore =
    storageFit
      ? 100
      : clamp(
          (Number(
            storageLimitPct
          ) /
            Math.max(
              economics.storageUtilizationPct,
              1
            )) *
            100,
          0,
          100
        );

  const operationalScore =
    capacityScore * 0.35 +
    deliveryScore * 0.2 +
    assortmentScore * 0.25 +
    storageScore * 0.2;

  /*
   * ECONOMIC SCORE
   */

  const roiScore = clamp(
    economics.grossMarginRoiPct / 8,
    0,
    100
  );

  const paybackScore = clamp(
    100 -
      Math.max(
        0,
        economics.paybackMonths - 6
      ) *
        8,
    0,
    100
  );

  const capitalScore = clamp(
    100 -
      (economics.totalUpfrontInvestment /
        Math.max(
          Number(budget) * 100000,
          1
        )) *
        100,
    0,
    100
  );

  const economicScore =
    roiScore * 0.5 +
    paybackScore * 0.3 +
    capitalScore * 0.2;

  /*
   * FINAL STRATEGY SCORE
   */

  const score =
    operationalScore * 0.6 +
    economicScore * 0.4;

  return {
    ...candidate,

    ...economics,

    score:
      round(score, 1),

    operationalScore:
      round(
        operationalScore,
        1
      ),

    economicScore:
      round(
        economicScore,
        1
      ),

    roiScore:
      round(
        roiScore,
        1
      ),

    paybackScore:
      round(
        paybackScore,
        1
      ),

    capitalScore:
      round(
        capitalScore,
        1
      ),

    requiredAssortment,

    budgetFit,
    capacityFit,
    deliveryFit,
    storageFit,
    assortmentFit,
  };
}

/* =========================================================
   PHASED MFC → UFC
========================================================= */

function buildPhasedOption(
  mfc,
  ufc,
  opportunity,
  budget,
  demandMultiplier,
  storageLimitPct
) {
  if (!mfc || !ufc) {
    return null;
  }

  const growth =
    Number(
      opportunity.expectedGrowthPct || 0
    );

  const triggerProbability =
    clamp(
      0.3 +
        growth / 100 +
        opportunity.selectionGapPct /
          300 +
        (opportunity.utilization >= 85
          ? 0.15
          : 0),
      0.25,
      0.85
    );

  const phase1Investment =
    mfc.totalUpfrontInvestment;

  const phase2Investment =
    ufc.totalUpfrontInvestment;

  /*
   * Only a proportion of Phase 2 is
   * expected to occur in the modeled
   * planning horizon.
   */

  const expectedInvestment =
    phase1Investment +
    phase2Investment *
      triggerProbability *
      0.55;

  const phase1AnnualGM =
    mfc.annualGrossMargin;

  const phase2AnnualGM =
    ufc.annualGrossMargin;

  const expectedAnnualGM =
    phase1AnnualGM *
      (1 -
        triggerProbability * 0.55) +
    phase2AnnualGM *
      (triggerProbability * 0.55);

  const expectedAnnualRevenue =
    mfc.annualRevenue *
      (1 -
        triggerProbability * 0.55) +
    ufc.annualRevenue *
      (triggerProbability * 0.55);

  const roi =
    expectedInvestment > 0
      ? (expectedAnnualGM /
          expectedInvestment) *
        100
      : 0;

  const payback =
    expectedAnnualGM > 0
      ? expectedInvestment /
        (expectedAnnualGM / 12)
      : 999;

  const initialBudgetFit =
    phase1Investment <=
    Number(budget) * 100000 + 0.01;

  const fullBudgetFit =
    phase1Investment +
      phase2Investment <=
    Number(budget) * 100000 + 0.01;

  const initialCapacityFit =
    mfc.capacityFit;

  const futureCapacityFit =
    ufc.capacityFit;

  const deliveryFit =
    mfc.deliveryFit &&
    ufc.deliveryFit;

  const storageFit =
    mfc.storageFit;

  const assortmentFit =
    mfc.assortmentFit ||
    ufc.assortmentFit;

  const operationalScore =
    (initialCapacityFit
      ? 100
      : 55) *
      0.3 +
    (futureCapacityFit
      ? 100
      : 60) *
      0.2 +
    (deliveryFit
      ? 100
      : 65) *
      0.2 +
    (assortmentFit
      ? 100
      : 70) *
      0.15 +
    (storageFit
      ? 100
      : 65) *
      0.15;

  const economicScore =
    clamp(
      roi / 8,
      0,
      100
    ) *
      0.55 +
    clamp(
      100 -
        Math.max(
          0,
          payback - 6
        ) *
          8,
      0,
      100
    ) *
      0.25 +
    (initialBudgetFit
      ? 100
      : 40) *
      0.2;

  const score =
    operationalScore * 0.6 +
    economicScore * 0.4;

  return {
    strategy:
      "Phased MFC → UFC",

    nodeType:
      "Phased",

    score:
      round(score, 1),

    operationalScore:
      round(
        operationalScore,
        1
      ),

    economicScore:
      round(
        economicScore,
        1
      ),

    initialNode:
      mfc,

    futureNode:
      ufc,

    cost:
      moneyLakh(
        phase1Investment
      ),

    futureCost:
      moneyLakh(
        phase2Investment
      ),

    expectedInvestment:
      moneyLakh(
        expectedInvestment
      ),

    maxInvestment:
      moneyLakh(
        phase1Investment +
          phase2Investment
      ),

    capacity:
      mfc.Daily_Capacity_Orders,

    futureCapacity:
      ufc.Daily_Capacity_Orders,

    assortment:
      mfc.selectedSKUs,

    futureAssortment:
      ufc.selectedSKUs,

    delivery:
      mfc.expectedDelivery,

    futureDelivery:
      ufc.expectedDelivery,

    annualRevenue:
      moneyLakh(
        expectedAnnualRevenue
      ),

    annualGrossMargin:
      moneyLakh(
        expectedAnnualGM
      ),

    grossMarginRoiPct:
      round(roi, 1),

    paybackMonths:
      round(payback, 1),

    triggerProbabilityPct:
      round(
        triggerProbability * 100,
        0
      ),

    trigger:
      "Move from MFC to UFC when demand or utilization reaches the expansion trigger.",

    triggerMetric:
      "Peak utilization / forecast demand",

    initialBudgetFit,

    fullBudgetFit,

    budgetFit:
      initialBudgetFit,

    capacityFit:
      initialCapacityFit,

    futureCapacityFit,

    deliveryFit,

    storageFit,

    assortmentFit,

    recommended:
      false,

    demandMultiplier,

    storageLimitPct,
  };
}

/* =========================================================
   STRATEGY SELECTION
========================================================= */

function chooseStrategy({
  mfc,
  ufc,
  phased,
}) {
  const options = [
    mfc,
    ufc,
    phased,
  ].filter(Boolean);

  /*
   * First preference:
   * fully feasible strategies.
   */

  const feasible =
    options.filter(
      (x) =>
        x.budgetFit &&
        x.capacityFit &&
        x.deliveryFit &&
        x.storageFit &&
        x.assortmentFit
    );

  if (feasible.length) {
    return [...feasible].sort(
      (a, b) =>
        b.score - a.score
    )[0];
  }

  /*
   * If nothing is fully feasible,
   * prioritize hard operational
   * constraints before score.
   */

  return [...options].sort(
    (a, b) => {
      const hardA =
        Number(a.capacityFit) * 3 +
        Number(a.deliveryFit) * 2 +
        Number(a.budgetFit) * 2 +
        Number(a.storageFit) +
        Number(a.assortmentFit);

      const hardB =
        Number(b.capacityFit) * 3 +
        Number(b.deliveryFit) * 2 +
        Number(b.budgetFit) * 2 +
        Number(b.storageFit) +
        Number(b.assortmentFit);

      if (hardB !== hardA) {
        return hardB - hardA;
      }

      return b.score - a.score;
    }
  )[0];
}

/* =========================================================
   NETWORK PLANNING
========================================================= */

export function planNetwork({
  zone,
  demandMultiplier = 1,
  budget = 100,
  deliveryTarget = 20,
  storageLimitPct = 85,
}) {
  const opportunity =
    getNetworkOpportunity(
      zone,
      demandMultiplier,
      deliveryTarget
    );

  const candidates =
    candidateNodes.filter(
      (candidate) =>
        candidate.Primary_Zone ===
        zone
    );

  const evaluated =
    candidates.map(
      (candidate) =>
        evaluateNode({
          zone,
          candidate,
          opportunity,
          demandMultiplier,
          budget,
          deliveryTarget,
          storageLimitPct,
        })
    );

  const mfc =
    evaluated.find(
      (x) =>
        x.Node_Type ===
        "Small MFC"
    );

  const ufc =
    evaluated.find(
      (x) =>
        x.Node_Type ===
        "UFC"
    );

  const phased =
    buildPhasedOption(
      mfc,
      ufc,
      opportunity,
      budget,
      demandMultiplier,
      storageLimitPct
    );

  const winner =
    chooseStrategy({
      mfc,
      ufc,
      phased,
    });

  const reasons = [];

  if (
    winner?.strategy ===
    "Phased MFC → UFC"
  ) {
    reasons.push(
      `Phase 1 limits upfront investment to ₹${winner.cost}L; Phase 2 is deferred until demand/utilization reaches the trigger.`
    );

    reasons.push(
      `Expected Phase 2 trigger probability is ${winner.triggerProbabilityPct}% under the selected demand scenario.`
    );

    if (!winner.capacityFit) {
      reasons.push(
        "Small MFC does not cover the current peak-demand requirement, so the phased plan carries an explicit capacity risk until Phase 2."
      );
    }

    if (winner.deliveryFit) {
      reasons.push(
        `Both phases meet the ${deliveryTarget}-minute delivery target in the modeled service data.`
      );
    }
  } else if (
    winner?.Node_Type === "UFC"
  ) {
    if (
      mfc &&
      !mfc.capacityFit
    ) {
      reasons.push(
        `Peak demand of ${opportunity.peakDemand.toLocaleString()} orders/day exceeds Small MFC capacity of ${Number(
          mfc.Daily_Capacity_Orders
        ).toLocaleString()}.`
      );
    }

    if (
      mfc &&
      !mfc.assortmentFit
    ) {
      reasons.push(
        `Small MFC cannot provide the modeled assortment breadth required for the ${opportunity.selectionGapPct}% selection gap.`
      );
    }

    if (
      mfc &&
      mfc.deliveryFit &&
      ufc.deliveryFit
    ) {
      reasons.push(
        `Both nodes meet the ${deliveryTarget}-minute target, but UFC provides a ${Math.max(
          0,
          deliveryTarget -
            ufc.expectedDelivery
        )}-minute delivery buffer.`
      );
    }

    reasons.push(
      `UFC supports ${ufc.selectedSKUs} optimized SKUs within the modeled inventory and storage constraints.`
    );

    reasons.push(
      `Modeled Year-1 gross-margin ROI is ${ufc.grossMarginRoiPct}% with an estimated ${ufc.paybackMonths}-month payback.`
    );
  } else if (
    winner?.Node_Type ===
    "Small MFC"
  ) {
    reasons.push(
      "Small MFC meets the modeled customer, capacity, delivery and storage requirements at lower upfront investment."
    );

    reasons.push(
      `The optimized launch assortment is ${winner.selectedSKUs} SKUs rather than the full catalog.`
    );

    reasons.push(
      `Modeled Year-1 gross-margin ROI is ${winner.grossMarginRoiPct}% with an estimated ${winner.paybackMonths}-month payback.`
    );
  }

  /*
   * NETWORK COMPARISON
   */

  const comparison =
    [mfc, ufc]
      .filter(Boolean)
      .map((x) => ({
        strategy:
          x.Node_Type,

        nodeType:
          x.Node_Type,

        cost:
          x.Launch_Cost_Lakh,

        launchCost:
          x.Launch_Cost_Lakh,

        totalInvestment:
          moneyLakh(
            x.totalUpfrontInvestment
          ),

        openingInventory:
          moneyLakh(
            x.openingInventoryInvestment
          ),

        capacity:
          x.Daily_Capacity_Orders,

        supportedDemand:
          x.dailyDemandSupported,

        peakDemand:
          opportunity.peakDemand,

        assortment:
          x.selectedSKUs,

        storageUtilizationPct:
          x.storageUtilizationPct,

        delivery:
          x.expectedDelivery,

        annualRevenue:
          moneyLakh(
            x.annualRevenue
          ),

        annualGrossMargin:
          moneyLakh(
            x.annualGrossMargin
          ),

        grossMarginRoiPct:
          x.grossMarginRoiPct,

        paybackMonths:
          x.paybackMonths,

        score:
          x.score,

        budgetFit:
          x.budgetFit,

        capacityFit:
          x.capacityFit,

        deliveryFit:
          x.deliveryFit,

        storageFit:
          x.storageFit,

        assortmentFit:
          x.assortmentFit,

        recommended:
          winner === x,
      }));

  if (phased) {
    comparison.push({
      strategy:
        phased.strategy,

      nodeType:
        phased.nodeType,

      cost:
        phased.cost,

      launchCost:
        phased.cost,

      totalInvestment:
        phased.expectedInvestment,

      maxInvestment:
        phased.maxInvestment,

      openingInventory:
        moneyLakh(
          mfc?.openingInventoryInvestment ||
            0
        ),

      capacity:
        phased.capacity,

      futureCapacity:
        phased.futureCapacity,

      supportedDemand:
        mfc?.dailyDemandSupported ||
        0,

      peakDemand:
        opportunity.peakDemand,

      assortment:
        phased.assortment,

      futureAssortment:
        phased.futureAssortment,

      storageUtilizationPct:
        mfc?.storageUtilizationPct ||
        0,

      delivery:
        phased.delivery,

      futureDelivery:
        phased.futureDelivery,

      annualRevenue:
        phased.annualRevenue,

      annualGrossMargin:
        phased.annualGrossMargin,

      grossMarginRoiPct:
        phased.grossMarginRoiPct,

      paybackMonths:
        phased.paybackMonths,

      score:
        phased.score,

      budgetFit:
        phased.budgetFit,

      capacityFit:
        phased.capacityFit,

      futureCapacityFit:
        phased.futureCapacityFit,

      deliveryFit:
        phased.deliveryFit,

      storageFit:
        phased.storageFit,

      assortmentFit:
        phased.assortmentFit,

      triggerProbabilityPct:
        phased.triggerProbabilityPct,

      trigger:
        phased.trigger,

      recommended:
        winner === phased,
    });
  }

  return {
    zone,

    opportunity,

    recommendation:
      winner?.strategy ||
      winner?.Node_Type ||
      "No feasible option",

    decisionReasons:
      reasons,

    recommendedNode:
      winner?.initialNode ||
      winner,

    options:
      evaluated,

    phasedOption:
      phased,

    comparison,
  };
}

/* =========================================================
   ASSORTMENT PLAN
========================================================= */

export function planAssortment({
  zone,
  nodeType = "UFC",
  candidateId,
  demandMultiplier = 1,
  budget = 100,
  storageLimitPct = 85,
}) {
  const candidate = candidateId
    ? candidateNodes.find(
        (x) =>
          x.Candidate_ID ===
          candidateId
      )
    : candidateNodes.find(
        (x) =>
          x.Primary_Zone ===
            zone &&
          x.Node_Type ===
            nodeType
      );

  if (!candidate) {
    return {
      zone,
      nodeType,
      selectedSKUs: 0,
      categories: [],
      economics: {},
    };
  }

  const optimized =
    optimizeAssortment({
      zone,
      candidate,
      demandMultiplier,
      budget,
      storageLimitPct,
    });

  const categories = {};

  for (const sku of optimized.selected) {
    if (!categories[sku.Category]) {
      categories[sku.Category] = {
        category:
          sku.Category,

        demand: 0,

        availability: [],

        stockout: [],

        recommendedSKUs: 0,

        openingInvestment: 0,

        storageUnits: 0,

        dailyGrossMargin: 0,

        priority: 0,
      };
    }

    const row =
      categories[sku.Category];

    row.demand +=
      sku.dailyDemand;

    row.availability.push(
      sku.availabilityPct
    );

    row.stockout.push(
      sku.stockoutPct
    );

    row.recommendedSKUs += 1;

    row.openingInvestment +=
      sku.openingInvestment;

    row.storageUnits +=
      sku.storageUnits;

    row.dailyGrossMargin +=
      sku.dailyGrossMargin;

    row.priority +=
      sku.priorityScore;
  }

  const categoryRows =
    Object.values(categories)
      .map((row) => ({
        category:
          row.category,

        demand:
          round(row.demand),

        availabilityPct:
          round(
            avg(row.availability)
          ),

        stockoutPct:
          round(
            avg(row.stockout)
          ),

        unmetDemandPct:
          round(
            100 -
              avg(
                row.availability
              )
          ),

        recommendedSKUs:
          row.recommendedSKUs,

        openingInvestmentLakh:
          moneyLakh(
            row.openingInvestment
          ),

        storageUnits:
          round(
            row.storageUnits
          ),

        dailyGrossMargin:
          round(
            row.dailyGrossMargin
          ),

        priority:
          round(
            row.priority,
            1
          ),
      }))
      .sort(
        (a, b) =>
          b.priority -
          a.priority
      );

  return {
    zone,

    nodeType:
      candidate.Node_Type,

    maxSkus:
      candidate.Max_Assortment_SKUs,

    selectedSKUs:
      optimized.selectedSKUs,

    categories:
      categoryRows,

    economics: {
      openingInventoryInvestmentLakh:
        moneyLakh(
          optimized.openingInventoryInvestment
        ),

      inventoryBudgetLakh:
        moneyLakh(
          optimized.inventoryBudget
        ),

      storageUsed:
        optimized.storageUsed,

      storageCapacity:
        optimized.storageCapacity,

      storageUtilizationPct:
        optimized.storageUtilizationPct,

      dailyDemandSupported:
        optimized.dailyDemandSupported,

      dailyRevenue:
        optimized.dailyRevenue,

      dailyGrossMargin:
        optimized.dailyGrossMargin,

      annualRevenueLakh:
        moneyLakh(
          optimized.annualRevenue
        ),

      annualGrossMarginLakh:
        moneyLakh(
          optimized.annualGrossMargin
        ),

      totalUpfrontInvestmentLakh:
        moneyLakh(
          optimized.totalUpfrontInvestment
        ),

      grossMarginRoiPct:
        optimized.grossMarginRoiPct,

      paybackMonths:
        optimized.paybackMonths,
    },
  };
}

/* =========================================================
   SKU ACTIONS
========================================================= */

function actionForRank(
  rank,
  total
) {
  const p =
    rank /
    Math.max(total, 1);

  if (p <= 0.02) {
    return "Launch first";
  }

  if (p <= 0.2) {
    return "Launch";
  }

  if (p <= 0.6) {
    return "Watch";
  }

  return "Defer";
}

/* =========================================================
   SKU RECOMMENDATIONS
========================================================= */

export function getSkuRecommendations({
  zone,
  candidateId,
  nodeType = "UFC",
  demandMultiplier = 1,
  budget = 100,
  storageLimitPct = 85,
  maxResults = 30,
}) {
  const candidate = candidateId
    ? candidateNodes.find(
        (x) =>
          x.Candidate_ID ===
          candidateId
      )
    : candidateNodes.find(
        (x) =>
          x.Primary_Zone ===
            zone &&
          x.Node_Type ===
            nodeType
      );

  if (!candidate) {
    return [];
  }

  const capture =
    getCandidateDemandCapture(
      zone,
      candidate
    );

  const ranked =
    skuCatalog
      .map((sku) =>
        scoreSku(
          zone,
          sku,
          demandMultiplier,
          capture.incrementalRatio
        )
      )
      .sort(
        (a, b) =>
          b.priorityScore -
          a.priorityScore
      );

  const optimized =
    optimizeAssortment({
      zone,
      candidate,
      demandMultiplier,
      budget,
      storageLimitPct,
    });

  const selectedIds =
    new Set(
      optimized.selected.map(
        (x) => x.SKU_ID
      )
    );

  return ranked
    .slice(0, maxResults)
    .map((sku, index) => ({
      ...sku,

      rank:
        index + 1,

      selected:
        selectedIds.has(
          sku.SKU_ID
        ),

      action:
        actionForRank(
          index + 1,
          ranked.length
        ),

      actionReason:
        selectedIds.has(
          sku.SKU_ID
        )
          ? "Fits the modeled launch constraints and ranks high on demand, selection gap and unit economics."
          : "High-priority candidate for later expansion if budget, storage or demand allows.",
    }));
}

/* =========================================================
   FINAL EXPANSION PLAN
========================================================= */

export function buildExpansionPlan({
  zone,
  demandMultiplier = 1,
  budget = 100,
  deliveryTarget = 20,
  storageLimitPct = 85,
}) {
  const network =
    planNetwork({
      zone,
      demandMultiplier,
      budget,
      deliveryTarget,
      storageLimitPct,
    });

  const recommended =
    network.recommendedNode;

  const recommendedCandidateId =
    recommended?.Candidate_ID;

  const recommendedNodeType =
    recommended?.Node_Type ||
    "Small MFC";

  const assortment =
    planAssortment({
      zone,
      nodeType:
        recommendedNodeType,
      candidateId:
        recommendedCandidateId,
      demandMultiplier,
      budget,
      storageLimitPct,
    });

  const skuRecommendations =
    getSkuRecommendations({
      zone,
      candidateId:
        recommendedCandidateId,
      nodeType:
        recommendedNodeType,
      demandMultiplier,
      budget,
      storageLimitPct,
      maxResults: 30,
    });

  const economics =
    assortment.economics || {};

  const capacity =
    recommended
      ? {
          dailyCapacity:
            Number(
              recommended.Daily_Capacity_Orders ||
                0
            ),

          supportedDemand:
            Number(
              recommended.dailyDemandSupported ||
                0
            ),

          peakDemand:
            network.opportunity
              .peakDemand,

          utilizationPct:
            round(
              (network.opportunity
                .peakDemand /
                Math.max(
                  Number(
                    recommended.Daily_Capacity_Orders ||
                      1
                  ),
                  1
                )) *
                100,
              1
            ),

          capacityHeadroom:
            Math.max(
              0,
              Number(
                recommended.Daily_Capacity_Orders ||
                  0
              ) -
                network.opportunity
                  .peakDemand
            ),
        }
      : {};

  return {
    zone,

    recommendation:
      network.recommendation,

    decisionReasons:
      network.decisionReasons,

    opportunity:
      network.opportunity,

    node:
      recommended,

    networkOptions:
      network.options,

    networkComparison:
      network.comparison,

    phased:
      network.phasedOption,

    assortment,

    skuRecommendations,

    economics: {
      openingInventoryInvestmentLakh:
        economics.openingInventoryInvestmentLakh ||
        0,

      inventoryBudgetLakh:
        economics.inventoryBudgetLakh ||
        0,

      totalUpfrontInvestmentLakh:
        economics.totalUpfrontInvestmentLakh ||
        0,

      annualRevenueLakh:
        economics.annualRevenueLakh ||
        0,

      annualGrossMarginLakh:
        economics.annualGrossMarginLakh ||
        0,

      grossMarginRoiPct:
        economics.grossMarginRoiPct ||
        0,

      paybackMonths:
        economics.paybackMonths ||
        0,
    },

    /*
     * Alias retained for pages
     * that read "financials".
     */

    financials: {
      upfrontInvestmentLakh:
        economics.totalUpfrontInvestmentLakh ||
        0,

      openingInventoryLakh:
        economics.openingInventoryInvestmentLakh ||
        0,

      annualRevenueLakh:
        economics.annualRevenueLakh ||
        0,

      annualGrossMarginLakh:
        economics.annualGrossMarginLakh ||
        0,

      year1GrossMarginRoiPct:
        economics.grossMarginRoiPct ||
        0,

      paybackMonths:
        economics.paybackMonths ||
        0,
    },

    capacity,

    storage: {
      estimatedUnits:
        economics.storageUsed ||
        0,

      capacityUnits:
        economics.storageCapacity ||
        0,

      utilizationPct:
        economics.storageUtilizationPct ||
        0,

      scenarioLimitPct:
        Number(storageLimitPct),

      withinLimit:
        (economics.storageUtilizationPct ||
          0) <=
        Number(storageLimitPct),
    },

    assumptions: {
      demandMultiplier,

      budget,

      deliveryTarget,

      storageLimitPct,

      roiDefinition:
        "Year-1 gross-margin ROI = annual gross margin / total upfront investment. Synthetic model excludes rent, labor, logistics OPEX, taxes and financing costs.",

      rampRealization:
        "72% modeled realization factor for Year-1 revenue and gross margin.",

      phasedMethod:
        "Phase 2 investment is deferred; expected investment uses the modeled trigger probability. Maximum investment is Phase 1 + Phase 2.",
    },
  };
}
