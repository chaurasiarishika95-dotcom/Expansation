import demandHistory from "../data/demand_history.json";
import searchDemand from "../data/search_demand.json";
import facilities from "../data/facilities.json";
import candidateNodes from "../data/candidate_nodes.json";
import candidateZoneService from "../data/candidate_zone_service.json";
import skuCatalog from "../data/sku_catalog.json";
import skuAvailability from "../data/sku_availability.json";
import skuDemandHistory from "../data/sku_demand_history.json";
import inventoryEconomics from "../data/inventory_economics.json";
import nodeTypeRules from "../data/node_type_rules.json";

/* =========================================================
   HELPERS
========================================================= */

function avg(values) {
  if (!values.length) return 0;

  return (
    values.reduce(
      (sum, value) => sum + Number(value || 0),
      0
    ) / values.length
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 0) {
  const multiplier = 10 ** decimals;
  return (
    Math.round(Number(value || 0) * multiplier) /
    multiplier
  );
}

function money(value) {
  return round(value, 2);
}

/* =========================================================
   PRE-COMPUTED LOOKUPS

   Important:
   sku_demand_history has ~76,800 rows.
   We aggregate it once instead of repeatedly filtering it.
========================================================= */

const skuDemandMap = {};

skuDemandHistory.forEach((row) => {
  const key = `${row.Zone}|${row.SKU_ID}`;

  if (!skuDemandMap[key]) {
    skuDemandMap[key] = {
      orders: 0,
      weeks: 0,
    };
  }

  skuDemandMap[key].orders += Number(
    row.Orders || 0
  );

  skuDemandMap[key].weeks += 1;
});

const availabilityMap = {};

skuAvailability.forEach((row) => {
  availabilityMap[
    `${row.Zone}|${row.SKU_ID}`
  ] = row;
});

const inventoryMap = {};

inventoryEconomics.forEach((row) => {
  inventoryMap[row.SKU_ID] = row;
});

const categoryDemandMap = {};

demandHistory.forEach((row) => {
  const key = `${row.Zone}|${row.Category}`;

  if (!categoryDemandMap[key]) {
    categoryDemandMap[key] = 0;
  }

  categoryDemandMap[key] += Number(
    row.Orders || 0
  );
});

/* =========================================================
   1. ZONE DEMAND
========================================================= */

export function getZoneDemand(
  zone,
  demandMultiplier = 1
) {
  const rows = demandHistory.filter(
    (row) => row.Zone === zone
  );

  const daily = {};

  rows.forEach((row) => {
    daily[row.Date] =
      (daily[row.Date] || 0) +
      Number(row.Orders || 0);
  });

  const values = Object.values(daily);

  const baseline = avg(values);

  const recent = values.slice(-28);
  const previous = values.slice(-56, -28);

  const recentAvg = avg(recent);
  const previousAvg = avg(previous);

  const trend =
    previousAvg > 0
      ? (recentAvg - previousAvg) /
        previousAvg
      : 0;

  const projectedDaily =
    recentAvg *
    (1 + trend * 0.5) *
    demandMultiplier;

  const peakDaily =
    projectedDaily * 1.2;

  return {
    zone,

    baseline:
      Math.round(baseline),

    recentDemand:
      Math.round(recentAvg),

    trendPct:
      round(trend * 100, 1),

    projectedDaily:
      Math.round(projectedDaily),

    peakDaily:
      Math.round(peakDaily),

    historicalDays:
      values.length,
  };
}

/* =========================================================
   2. NETWORK OPPORTUNITY
========================================================= */

export function getNetworkOpportunity(
  zone,
  demandMultiplier = 1,
  deliveryTarget = 20
) {
  const demand =
    getZoneDemand(
      zone,
      demandMultiplier
    );

  const existingFacilities =
    facilities.filter(
      (facility) =>
        facility.Zone === zone
    );

  const existingCapacity =
    existingFacilities.reduce(
      (sum, facility) =>
        sum +
        Number(
          facility.Daily_Capacity_Orders || 0
        ),
      0
    );

  const utilization =
    avg(
      existingFacilities.map(
        (facility) =>
          Number(
            facility.Current_Utilization ||
              0
          )
      )
    );

  const delivery =
    avg(
      existingFacilities.map(
        (facility) =>
          Number(
            facility.Avg_Delivery_Min ||
              0
          )
      )
    );

  const searchRows =
    searchDemand.filter(
      (row) => row.Zone === zone
    );

  const searchVolume =
    searchRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.Daily_Search_Demand || 0
        ),
      0
    );

  const unavailableSearches =
    searchRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.Unavailable_Searches || 0
        ),
      0
    );

  const selectionGap =
    searchVolume > 0
      ? unavailableSearches /
        searchVolume
      : 0;

  const capacityGap =
    Math.max(
      0,
      demand.peakDaily -
        existingCapacity * 0.85
    );

  const deliveryGap =
    Math.max(
      0,
      delivery - deliveryTarget
    );

  const capacityPressure =
    clamp(
      (capacityGap /
        Math.max(
          demand.peakDaily,
          1
        )) *
        100,
      0,
      100
    );

  const deliveryPressure =
    clamp(
      deliveryGap * 8,
      0,
      100
    );

  const selectionPressure =
    clamp(
      selectionGap * 100,
      0,
      100
    );

  const utilizationPressure =
    clamp(
      utilization * 100,
      0,
      100
    );

  const opportunityScore =
    capacityPressure * 0.35 +
    deliveryPressure * 0.25 +
    selectionPressure * 0.2 +
    utilizationPressure * 0.2;

  return {
    zone,

    projectedDailyDemand:
      demand.projectedDaily,

    peakDemand:
      demand.peakDaily,

    demandTrendPct:
      demand.trendPct,

    existingCapacity,

    utilization:
      round(
        utilization * 100
      ),

    avgDelivery:
      round(delivery),

    deliveryGap:
      round(deliveryGap),

    searchDemand:
      Math.round(searchVolume),

    unavailableSearches:
      Math.round(
        unavailableSearches
      ),

    selectionGapPct:
      round(
        selectionGap * 100
      ),

    capacityGap:
      Math.round(
        capacityGap
      ),

    opportunityScore:
      round(
        opportunityScore
      ),
  };
}

/* =========================================================
   3. NODE EVALUATION
========================================================= */

function evaluateNode(
  candidate,
  opportunity,
  budget,
  deliveryTarget
) {
  const serviceRows =
    candidateZoneService.filter(
      (row) =>
        row.Candidate_ID ===
        candidate.Candidate_ID
    );

  const primaryService =
    serviceRows.find(
      (row) =>
        row.Service_Zone ===
        candidate.Primary_Zone
    );

  const delivery =
    primaryService?.Expected_Delivery_Min ??
    candidate.Fixed_Delivery_Min;

  const deliveryScore =
    delivery <= deliveryTarget
      ? 100
      : clamp(
          100 -
            (delivery -
              deliveryTarget) *
              10,
          0,
          100
        );

  const capacityScore =
    candidate.Daily_Capacity_Orders >=
    opportunity.peakDemand
      ? 100
      : clamp(
          (candidate.Daily_Capacity_Orders /
            opportunity.peakDemand) *
            100,
          0,
          100
        );

  const requiredAssortment =
    opportunity.selectionGapPct >= 20
      ? 2500
      : opportunity.selectionGapPct >= 10
      ? 1500
      : 800;

  const assortmentScore =
    candidate.Max_Assortment_SKUs >=
    requiredAssortment
      ? 100
      : clamp(
          (candidate.Max_Assortment_SKUs /
            requiredAssortment) *
            100,
          0,
          100
        );

  const storageScore =
    candidate.Storage_Capacity_Units >=
    opportunity.peakDemand * 1.5
      ? 100
      : clamp(
          (candidate.Storage_Capacity_Units /
            (opportunity.peakDemand *
              1.5)) *
            100,
          0,
          100
        );

  const costScore =
    clamp(
      100 -
        (candidate.Launch_Cost_Lakh /
          100) *
          70,
      10,
      100
    );

  const score =
    deliveryScore * 0.25 +
    capacityScore * 0.3 +
    assortmentScore * 0.2 +
    storageScore * 0.1 +
    costScore * 0.15;

  return {
    ...candidate,

    expectedDelivery:
      delivery,

    deliveryScore:
      round(deliveryScore),

    capacityScore:
      round(capacityScore),

    assortmentScore:
      round(assortmentScore),

    storageScore:
      round(storageScore),

    costScore:
      round(costScore),

    score:
      round(score, 1),

    withinBudget:
      candidate.Launch_Cost_Lakh <=
      budget,

    capacityFit:
      candidate.Daily_Capacity_Orders >=
      opportunity.peakDemand,

    deliveryFit:
      delivery <=
      deliveryTarget,

    assortmentFit:
      candidate.Max_Assortment_SKUs >=
      requiredAssortment,
  };
}

/* =========================================================
   4. SKU ECONOMICS
========================================================= */

function getSkuEconomics(
  zone,
  sku,
  demandMultiplier
) {
  const demandKey =
    `${zone}|${sku.SKU_ID}`;

  const demandData =
    skuDemandMap[demandKey];

  const weeklyOrders =
    demandData
      ? demandData.orders /
        Math.max(
          demandData.weeks,
          1
        )
      : 0;

  const dailyDemand =
    (weeklyOrders / 7) *
    demandMultiplier;

  const availability =
    availabilityMap[
      demandKey
    ];

  const inventory =
    inventoryMap[
      sku.SKU_ID
    ];

  const availabilityPct =
    Number(
      availability
        ?.Current_Availability_Pct ||
        0
    );

  const stockoutRate =
    Number(
      availability
        ?.Stockout_Rate_Pct ||
        0
    );

  const replenishmentDays =
    Number(
      inventory
        ?.Replenishment_Days ||
        sku.Replenishment_Days ||
        2
    );

  const minimumStockDays =
    Number(
      inventory
        ?.Minimum_Stock_Days ||
        3
    );

  /*
   * Opening inventory covers:
   *
   * minimum stock
   * +
   * replenishment buffer
   */

  const openingDays =
    Math.max(
      minimumStockDays,
      replenishmentDays + 1
    );

  const openingUnits =
    Math.max(
      1,
      Math.ceil(
        dailyDemand *
          openingDays
      )
    );

  const openingInventoryCost =
    openingUnits *
    Number(
      sku.Unit_Cost || 0
    );

  const annualUnits =
    dailyDemand * 365;

  const annualRevenue =
    annualUnits *
    Number(
      sku.Selling_Price || 0
    );

  const annualGrossMargin =
    annualUnits *
    Number(
      sku.Margin_Per_Unit || 0
    );

  const marginRate =
    sku.Selling_Price > 0
      ? sku.Margin_Per_Unit /
        sku.Selling_Price
      : 0;

  /*
   * SKU priority rewards:
   *
   * demand
   * margin
   * stockout
   * low availability
   *
   * and penalizes:
   *
   * inventory investment
   * storage consumption
   */

  const demandScore =
    Math.log10(
      Math.max(
        dailyDemand,
        1
      )
    ) * 20;

  const availabilityGap =
    1 -
    availabilityPct;

  const marginScore =
    marginRate * 100;

  const customerNeedScore =
    availabilityGap * 50 +
    stockoutRate * 50;

  const capitalPenalty =
    openingInventoryCost /
    100000;

  const storageConsumption =
    openingUnits *
    Number(
      sku.Storage_Units || 0
    );

  const priority =
    demandScore * 0.35 +
    marginScore * 0.2 +
    customerNeedScore * 0.3 -
    capitalPenalty * 0.05 -
    storageConsumption *
      0.0005;

  return {
    ...sku,

    dailyDemand:
      round(
        dailyDemand,
        2
      ),

    openingUnits,

    openingInventoryCost:
      money(
        openingInventoryCost
      ),

    storageConsumption:
      round(
        storageConsumption,
        2
      ),

    annualUnits:
      round(
        annualUnits
      ),

    annualRevenue:
      money(
        annualRevenue
      ),

    annualGrossMargin:
      money(
        annualGrossMargin
      ),

    marginRate:
      round(
        marginRate * 100,
        1
      ),

    availabilityPct:
      round(
        availabilityPct * 100
      ),

    stockoutPct:
      round(
        stockoutRate * 100
      ),

    priority:
      round(
        priority,
        2
      ),
  };
}

/* =========================================================
   5. ASSORTMENT OPTIMIZER
========================================================= */

export function optimizeAssortment({
  zone,
  nodeType,
  demandMultiplier = 1,
  totalBudget = 100,
  launchCost = 0,
  storageCapacity = 0,
}) {
  const rule =
    nodeTypeRules.find(
      (item) =>
        item.Node_Type ===
        nodeType
    );

  const maxSKUs =
    Number(
      rule?.Max_Assortment_SKUs ||
        1200
    );

  /*
   * Remaining budget after node launch.
   *
   * Example:
   * Budget = ₹100L
   * Node = ₹90L
   * Inventory budget = ₹10L
   */

  const inventoryBudgetLakh =
    Math.max(
      0,
      totalBudget -
        launchCost
    );

  const inventoryBudget =
    inventoryBudgetLakh *
    100000;

  const candidates = [];

  skuCatalog.forEach((sku) => {
    const economics =
      getSkuEconomics(
        zone,
        sku,
        demandMultiplier
      );

    /*
     * Don't allocate inventory
     * to SKUs with essentially
     * no observed demand.
     */

    if (
      economics.dailyDemand <=
      0.05
    ) {
      return;
    }

    candidates.push(
      economics
    );
  });

  /*
   * Rank by economic value.
   */

  candidates.sort(
    (a, b) =>
      b.priority -
      a.priority
  );

  let usedBudget = 0;
  let usedStorage = 0;

  const selected = [];

  for (
    const sku of candidates
  ) {
    if (
      selected.length >=
      maxSKUs
    ) {
      break;
    }

    const newBudget =
      usedBudget +
      sku.openingInventoryCost;

    const newStorage =
      usedStorage +
      sku.storageConsumption;

    if (
      newBudget >
      inventoryBudget
    ) {
      continue;
    }

    if (
      storageCapacity > 0 &&
      newStorage >
        storageCapacity *
          0.85
    ) {
      continue;
    }

    selected.push(
      sku
    );

    usedBudget =
      newBudget;

    usedStorage =
      newStorage;
  }

  /*
   * Category roll-up
   */

  const categoryMap = {};

  selected.forEach(
    (sku) => {
      if (
        !categoryMap[
          sku.Category
        ]
      ) {
        categoryMap[
          sku.Category
        ] = {
          category:
            sku.Category,
          skuCount: 0,
          demand: 0,
          revenue: 0,
          grossMargin: 0,
          inventoryCost: 0,
          storage: 0,
        };
      }

      const category =
        categoryMap[
          sku.Category
        ];

      category.skuCount += 1;

      category.demand +=
        sku.dailyDemand;

      category.revenue +=
        sku.annualRevenue;

      category.grossMargin +=
        sku.annualGrossMargin;

      category.inventoryCost +=
        sku.openingInventoryCost;

      category.storage +=
        sku.storageConsumption;
    }
  );

  const categories =
    Object.values(
      categoryMap
    )
      .map(
        (category) => ({
          ...category,

          demand:
            round(
              category.demand,
              1
            ),

          revenue:
            money(
              category.revenue
            ),

          grossMargin:
            money(
              category.grossMargin
            ),

          inventoryCost:
            money(
              category.inventoryCost
            ),

          storage:
            round(
              category.storage,
              1
            ),
        })
      )
      .sort(
        (a, b) =>
          b.grossMargin -
          a.grossMargin
      );

  const totalRevenue =
    selected.reduce(
      (sum, sku) =>
        sum +
        sku.annualRevenue,
      0
    );

  const totalGrossMargin =
    selected.reduce(
      (sum, sku) =>
        sum +
        sku.annualGrossMargin,
      0
    );

  const totalInventory =
    selected.reduce(
      (sum, sku) =>
        sum +
        sku.openingInventoryCost,
      0
    );

  const totalStorage =
    selected.reduce(
      (sum, sku) =>
        sum +
        sku.storageConsumption,
      0
    );

  return {
    selected,

    categories,

    selectedSKUCount:
      selected.length,

    inventoryBudgetLakh:
      round(
        inventoryBudgetLakh,
        2
      ),

    openingInventoryCost:
      money(
        totalInventory
      ),

    storageUsed:
      round(
        totalStorage,
        1
      ),

    storageUtilizationPct:
      storageCapacity > 0
        ? round(
            (totalStorage /
              storageCapacity) *
              100,
            1
          )
        : 0,

    annualRevenue:
      money(
        totalRevenue
      ),

    annualGrossMargin:
      money(
        totalGrossMargin
      ),
  };
}

/* =========================================================
   6. NETWORK FINANCIAL MODEL
========================================================= */

function calculateFinancials({
  node,
  assortment,
  recommendation,
}) {
  const launchCost =
    Number(
      node?.Launch_Cost_Lakh ||
        0
    );

  const openingInventory =
    Number(
      assortment
        ?.openingInventoryCost ||
        0
    ) / 100000;

  const upfrontInvestment =
    launchCost +
    openingInventory;

  const annualGrossMargin =
    Number(
      assortment
        ?.annualGrossMargin ||
        0
    ) / 100000;

  const annualRevenue =
    Number(
      assortment
        ?.annualRevenue ||
        0
    ) / 100000;

  const roi =
    upfrontInvestment > 0
      ? (annualGrossMargin /
          upfrontInvestment) *
        100
      : 0;

  const monthlyGrossMargin =
    annualGrossMargin /
    12;

  const paybackMonths =
    monthlyGrossMargin > 0
      ? upfrontInvestment /
        monthlyGrossMargin
      : null;

  return {
    launchCostLakh:
      round(
        launchCost,
        2
      ),

    openingInventoryLakh:
      round(
        openingInventory,
        2
      ),

    upfrontInvestmentLakh:
      round(
        upfrontInvestment,
        2
      ),

    annualRevenueLakh:
      round(
        annualRevenue,
        2
      ),

    annualGrossMarginLakh:
      round(
        annualGrossMargin,
        2
      ),

    year1GrossMarginROI:
      round(
        roi,
        1
      ),

    paybackMonths:
      paybackMonths === null
        ? null
        : round(
            paybackMonths,
            1
          ),

    methodology:
      "Year-1 gross-margin ROI; excludes rent, labor, logistics OPEX, taxes, financing and other operating expenses.",

    recommendation,
  };
}

/* =========================================================
   7. NODE + ASSORTMENT OPTION
========================================================= */

function buildNodeOption({
  candidate,
  opportunity,
  budget,
  deliveryTarget,
  demandMultiplier,
}) {
  if (!candidate) {
    return null;
  }

  const assortment =
    optimizeAssortment({
      zone:
        opportunity.zone,

      nodeType:
        candidate.Node_Type,

      demandMultiplier,

      totalBudget:
        budget,

      launchCost:
        candidate.Launch_Cost_Lakh,

      storageCapacity:
        candidate.Storage_Capacity_Units,
    });

  const financials =
    calculateFinancials({
      node: candidate,

      assortment,

      recommendation:
        candidate.Node_Type,
    });

  const capacityGap =
    Math.max(
      0,
      opportunity.peakDemand -
        candidate.Daily_Capacity_Orders
    );

  const capacityFit =
    capacityGap === 0;

  const deliveryFit =
    candidate.Fixed_Delivery_Min <=
    deliveryTarget;

  const storageFit =
    assortment.storageUtilizationPct <=
    85;

  /*
   * Economic score.
   *
   * This prevents UFC from
   * automatically winning simply
   * because it has more capacity.
   */

  const roiScore =
    clamp(
      financials.year1GrossMarginROI *
        2,
      0,
      100
    );

  const capacityScore =
    capacityFit
      ? 100
      : clamp(
          (candidate.Daily_Capacity_Orders /
            opportunity.peakDemand) *
            100,
          0,
          100
        );

  const deliveryScore =
    deliveryFit
      ? 100
      : clamp(
          100 -
            (candidate.Fixed_Delivery_Min -
              deliveryTarget) *
              10,
          0,
          100
        );

  const assortmentScore =
    clamp(
      (assortment.selectedSKUCount /
        Math.max(
          candidate.Max_Assortment_SKUs,
          1
        )) *
        100,
      0,
      100
    );

  const capitalEfficiency =
    clamp(
      100 -
        financials.upfrontInvestmentLakh,
      0,
      100
    );

  const score =
    capacityScore * 0.25 +
    deliveryScore * 0.15 +
    roiScore * 0.35 +
    assortmentScore * 0.1 +
    capitalEfficiency * 0.15;

  return {
    candidateId:
      candidate.Candidate_ID,

    nodeType:
      candidate.Node_Type,

    siteName:
      candidate.Site_Name,

    cost:
      candidate.Launch_Cost_Lakh,

    capacity:
      candidate.Daily_Capacity_Orders,

    storage:
      candidate.Storage_Capacity_Units,

    maxAssortment:
      candidate.Max_Assortment_SKUs,

    delivery:
      candidate.Fixed_Delivery_Min,

    selectedSKUs:
      assortment.selectedSKUCount,

    openingInventory:
      round(
        financials.openingInventoryLakh,
        2
      ),

    upfrontInvestment:
      financials.upfrontInvestmentLakh,

    annualRevenue:
      financials.annualRevenueLakh,

    annualGrossMargin:
      financials.annualGrossMarginLakh,

    roi:
      financials.year1GrossMarginROI,

    payback:
      financials.paybackMonths,

    capacityGap,

    capacityFit,

    deliveryFit,

    storageFit,

    withinBudget:
      financials.upfrontInvestmentLakh <=
      budget,

    assortmentFit:
      assortment.selectedSKUCount <=
      candidate.Max_Assortment_SKUs,

    score:
      round(
        score,
        1
      ),

    assortment,
  };
}

/* =========================================================
   8. NETWORK STRATEGY
========================================================= */

export function planNetwork({
  zone,
  demandMultiplier = 1,
  budget = 100,
  deliveryTarget = 20,
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

  const mfcCandidate =
    candidates.find(
      (candidate) =>
        candidate.Node_Type ===
        "Small MFC"
    );

  const ufcCandidate =
    candidates.find(
      (candidate) =>
        candidate.Node_Type ===
        "UFC"
    );

  const mfc =
    buildNodeOption({
      candidate:
        mfcCandidate,

      opportunity,

      budget,

      deliveryTarget,

      demandMultiplier,
    });

  const ufc =
    buildNodeOption({
      candidate:
        ufcCandidate,

      opportunity,

      budget,

      deliveryTarget,

      demandMultiplier,
    });

  const options =
    [mfc, ufc].filter(
      Boolean
    );

  /*
   * Phased economics:
   *
   * Start with MFC.
   * Future UFC is triggered
   * when demand/utilization
   * crosses the threshold.
   */

  let phased = null;

  if (mfc && ufc) {
    const futureInvestment =
      ufc.upfrontInvestment;

    const phase1Investment =
      mfc.upfrontInvestment;

    const initialCapitalSaving =
      futureInvestment -
      phase1Investment;

    const phasedTrigger =
      opportunity.demandTrendPct >= 15 ||
      opportunity.utilization >= 90 ||
      opportunity.selectionGapPct >= 20;

    phased = {
      strategy:
        "Phased MFC → UFC",

      initialNode:
        "Small MFC",

      futureNode:
        "UFC",

      initialInvestment:
        round(
          phase1Investment,
          2
        ),

      futureInvestment:
        round(
          futureInvestment,
          2
        ),

      initialSKUCount:
        mfc.selectedSKUs,

      futureSKUCount:
        ufc.selectedSKUs,

      initialCapacity:
        mfc.capacity,

      futureCapacity:
        ufc.capacity,

      initialDelivery:
        mfc.delivery,

      futureDelivery:
        ufc.delivery,

      capitalDeferred:
        round(
          initialCapitalSaving,
          2
        ),

      trigger:
        phasedTrigger
          ? "Growth/utilization/selection threshold reached"
          : "Use MFC to validate demand before committing to UFC",

      score:
        round(
          (
            mfc.score +
            ufc.score
          ) /
            2 +
            5,
          1
        ),
    };
  }

  /*
   * Determine recommendation.
   */

  const affordable =
    options.filter(
      (option) =>
        option.withinBudget
    );

  let recommendation =
    "No viable node";

  let recommendedNode =
    null;

  const reasons = [];

  /*
   * Phased is attractive when:
   *
   * MFC can serve current demand,
   * but UFC is better for future demand.
   */

  const phasedEligible =
    mfc &&
    ufc &&
    mfc.withinBudget &&
    mfc.capacityFit &&
    !ufc.withinBudget &&
    opportunity.demandTrendPct >= 5;

  /*
   * Find financially strongest
   * viable option.
   */

  if (affordable.length) {
    affordable.sort(
      (a, b) =>
        b.score -
        a.score
    );

    recommendedNode =
      affordable[0];

    recommendation =
      recommendedNode.nodeType;
  }

  /*
   * Explicit capacity requirement
   * can override ROI if a node
   * physically cannot handle demand.
   */

  const mfcCannotHandleDemand =
    mfc &&
    opportunity.peakDemand >
      mfc.capacity;

  const ufcCanHandleDemand =
    ufc &&
    opportunity.peakDemand <=
      ufc.capacity;

  if (
    mfcCannotHandleDemand &&
    ufcCanHandleDemand &&
    ufc.withinBudget
  ) {
    recommendation =
      "UFC";

    recommendedNode =
      ufc;

    reasons.push(
      "Peak demand exceeds Small MFC capacity."
    );
  }

  /*
   * High selection gap can
   * justify broader UFC assortment.
   */

  if (
    opportunity.selectionGapPct >=
      20 &&
    ufc &&
    ufc.withinBudget &&
    ufc.selectedSKUs >
      (mfc?.selectedSKUs || 0)
  ) {
    recommendation =
      "UFC";

    recommendedNode =
      ufc;

    reasons.push(
      "High selection gap requires broader assortment capacity."
    );
  }

  /*
   * Delivery target.
   */

  if (
    opportunity.avgDelivery >
      deliveryTarget &&
    ufc &&
    ufc.withinBudget &&
    ufc.delivery <
      (mfc?.delivery || 999)
  ) {
    recommendation =
      "UFC";

    recommendedNode =
      ufc;

    reasons.push(
      "UFC provides a better fit to the delivery-time target."
    );
  }

  /*
   * Capital-efficient phased strategy.
   */

  if (
    mfc &&
    ufc &&
    mfc.withinBudget &&
    mfc.capacityFit &&
    opportunity.demandTrendPct >=
      8 &&
    ufc.score >
      mfc.score + 8
  ) {
    recommendation =
      "Phased MFC → UFC";

    recommendedNode =
      mfc;

    reasons.push(
      "Small MFC can serve current demand while limiting initial capital exposure."
    );

    reasons.push(
      "Future UFC provides additional assortment and capacity headroom as demand grows."
    );
  }

  if (
    recommendation ===
    "Small MFC"
  ) {
    reasons.push(
      "Small MFC provides sufficient capacity under the current scenario."
    );

    reasons.push(
      "Lower upfront investment improves capital efficiency."
    );
  }

  if (
    recommendation ===
    "UFC"
  ) {
    if (
      reasons.length === 0
    ) {
      reasons.push(
        "UFC provides the strongest overall operational and economic fit."
      );
    }
  }

  /*
   * Comparison table.
   */

  const comparison =
    options.map(
      (option) => ({
        strategy:
          option.nodeType,

        nodeType:
          option.nodeType,

        cost:
          option.cost,

        capacity:
          option.capacity,

        assortment:
          option.selectedSKUs,

        maxAssortment:
          option.maxAssortment,

        delivery:
          option.delivery,

        openingInventory:
          option.openingInventory,

        upfrontInvestment:
          option.upfrontInvestment,

        annualRevenue:
          option.annualRevenue,

        annualGrossMargin:
          option.annualGrossMargin,

        roi:
          option.roi,

        payback:
          option.payback,

        capacityGap:
          option.capacityGap,

        withinBudget:
          option.withinBudget,

        capacityFit:
          option.capacityFit,

        storageFit:
          option.storageFit,

        score:
          option.score,

        recommended:
          recommendation ===
          option.nodeType,
      })
    );

  if (phased) {
    comparison.push({
      strategy:
        "Phased MFC → UFC",

      nodeType:
        "Phased",

      cost:
        phased.initialInvestment,

      capacity:
        phased.initialCapacity,

      assortment:
        phased.initialSKUCount,

      delivery:
        phased.initialDelivery,

      futureCapacity:
        phased.futureCapacity,

      futureAssortment:
        phased.futureSKUCount,

      futureDelivery:
        phased.futureDelivery,

      upfrontInvestment:
        phased.initialInvestment,

      futureInvestment:
        phased.futureInvestment,

      capitalDeferred:
        phased.capitalDeferred,

      score:
        phased.score,

      recommended:
        recommendation ===
        "Phased MFC → UFC",
    });
  }

  return {
    zone,

    opportunity,

    recommendation,

    reasons,

    recommendedNode,

    mfc,

    ufc,

    phased,

    options,

    comparison,
  };
}

/* =========================================================
   9. FULL EXPANSION PLAN
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
    });

  let selectedNode =
    network.recommendedNode;

  /*
   * For phased strategy,
   * assortment should initially
   * follow the MFC.
   */

  if (
    network.recommendation ===
    "Phased MFC → UFC"
  ) {
    selectedNode =
      network.mfc;
  }

  const assortment =
    selectedNode?.assortment ||
    optimizeAssortment({
      zone,
      nodeType:
        selectedNode?.nodeType ||
        "Small MFC",
      demandMultiplier,
      totalBudget:
        budget,
      launchCost:
        selectedNode?.cost ||
        0,
      storageCapacity:
        selectedNode?.storage ||
        0,
    });

  const selectedSKUs =
    assortment.selected || [];

  /*
   * Storage limit scenario
   */

  const storageCapacity =
    Number(
      selectedNode?.storage ||
        0
    );

  const storageUtilization =
    storageCapacity > 0
      ? (assortment.storageUsed /
          storageCapacity) *
        100
      : 0;

  /*
   * Customer value estimate.
   *
   * We use the candidate's
   * serviceable customers as
   * the modeled coverage.
   */

  const serviceRows =
    candidateZoneService.filter(
      (row) =>
        row.Candidate_ID ===
        selectedNode?.candidateId
    );

  const serviceableCustomers =
    serviceRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.Serviceable_Customers ||
            0
        ),
      0
    );

  /*
   * Financials.
   */

  const financials =
    calculateFinancials({
      node: selectedNode,

      assortment,

      recommendation:
        network.recommendation,
    });

  /*
   * Capacity metrics.
   */

  const peakDemand =
    network.opportunity
      .peakDemand;

  const dailyCapacity =
    selectedNode
      ?.capacity || 0;

  const capacityGap =
    Math.max(
      0,
      peakDemand -
        dailyCapacity
    );

  const capacityUtilization =
    dailyCapacity > 0
      ? (peakDemand /
          dailyCapacity) *
        100
      : 0;

  /*
   * Top SKU recommendations.
   */

  const skuRecommendations =
    selectedSKUs
      .slice(0, 30)
      .map(
        (sku) => ({
          ...sku,

          recommendation:
            sku.priority >= 30
              ? "Launch"
              : sku.priority >= 20
              ? "Test"
              : "Defer",
        })
      );

  return {
    zone,

    recommendation:
      network.recommendation,

    decisionReasons:
      network.reasons,

    opportunity:
      network.opportunity,

    node:
      selectedNode,

    networkOptions:
      network.options,

    networkComparison:
      network.comparison,

    phased:
      network.phased,

    assortment: {
      ...assortment,

      selectedSKUs:
        assortment.selectedSKUCount,

      categories:
        assortment.categories,
    },

    skuRecommendations,

    customerImpact: {
      serviceableCustomers:
        Math.round(
          serviceableCustomers
        ),

      deliveryTarget,

      deliveryTime:
        selectedNode
          ?.delivery ||
        null,
    },

    capacity: {
      dailyCapacity,

      projectedDailyDemand:
        network.opportunity
          .projectedDailyDemand,

      peakDemand,

      capacityGap,

      peakUtilizationPct:
        round(
          capacityUtilization,
          1
        ),
    },

    storage: {
      estimatedUnits:
        Math.round(
          assortment.storageUsed
        ),

      capacityUnits:
        storageCapacity,

      utilizationPct:
        round(
          storageUtilization,
          1
        ),

      scenarioLimitPct:
        storageLimitPct,

      withinLimit:
        storageUtilization <=
        storageLimitPct,
    },

    financials,

    assumptions: {
      demandMultiplier,

      budget,

      deliveryTarget,

      storageLimitPct,

      note:
        "Illustrative synthetic model. Year-1 gross-margin ROI excludes rent, labor, logistics OPEX, taxes, financing and other operating expenses.",
    },
  };
}
