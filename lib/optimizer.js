import demandHistory from "../data/demand_history.json";
import searchDemand from "../data/search_demand.json";
import facilities from "../data/facilities.json";
import candidateNodes from "../data/candidate_nodes.json";
import candidateZoneService from "../data/candidate_zone_service.json";
import skuCatalog from "../data/sku_catalog.json";
import skuAvailability from "../data/sku_availability.json";
import skuDemandHistory from "../data/sku_demand_history.json";
import nodeTypeRules from "../data/node_type_rules.json";

/* =========================================================
   HELPERS
========================================================= */

function avg(values) {
  if (!values || values.length === 0) return 0;

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

/*
 * Handles percentages whether the dataset stores:
 *
 * 0.82
 * or
 * 82
 */
function normalizePct(value) {
  const number = Number(value || 0);

  if (number > 1) {
    return number / 100;
  }

  return number;
}

/* =========================================================
   LOOKUPS
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

  const dailyDemand = {};

  rows.forEach((row) => {
    if (!dailyDemand[row.Date]) {
      dailyDemand[row.Date] = 0;
    }

    dailyDemand[row.Date] += Number(
      row.Orders || 0
    );
  });

  const values = Object.values(dailyDemand);

  if (values.length === 0) {
    return {
      zone,
      baseline: 0,
      recentDemand: 0,
      trendPct: 0,
      projectedDaily: 0,
      peakDaily: 0,
      historicalDays: 0,
    };
  }

  const baseline = avg(values);

  const recent = values.slice(-28);

  const previous = values.slice(
    -56,
    -28
  );

  const recentAvg = avg(recent);

  const previousAvg = avg(previous);

  let trend = 0;

  if (previousAvg > 0) {
    trend =
      (recentAvg - previousAvg) /
      previousAvg;
  }

  /*
   * Keep the trend impact realistic.
   * We don't want synthetic data to
   * explode the forecast.
   */
  const cappedTrend = clamp(
    trend,
    -0.2,
    0.2
  );

  const projectedDaily =
    recentAvg *
    (1 + cappedTrend * 0.5) *
    demandMultiplier;

  /*
   * Peak demand = 20% buffer
   */
  const peakDaily =
    projectedDaily * 1.2;

  return {
    zone,

    baseline:
      Math.round(baseline),

    recentDemand:
      Math.round(recentAvg),

    trendPct:
      round(cappedTrend * 100, 1),

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
        (
          facility.Zone ||
          facility.Primary_Zone
        ) === zone
    );

  const existingCapacity =
    existingFacilities.reduce(
      (sum, facility) =>
        sum +
        Number(
          facility.Daily_Capacity_Orders ||
            facility.Capacity_Orders_Day ||
            0
        ),
      0
    );

  const utilization =
    avg(
      existingFacilities.map(
        (facility) =>
          normalizePct(
            facility.Current_Utilization ||
              facility.Utilization ||
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
              facility.Average_Delivery_Min ||
              facility.Delivery_Time_Min ||
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
          row.Daily_Search_Demand ||
            row.Search_Demand ||
            row.Searches ||
            0
        ),
      0
    );

  const unavailableSearches =
    searchRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.Unavailable_Searches ||
            row.Unavailable_Search ||
            0
        ),
      0
    );

  const selectionGap =
    searchVolume > 0
      ? unavailableSearches /
        searchVolume
      : 0;

  /*
   * Existing network should ideally
   * operate at <=85% utilization.
   */
  const safeExistingCapacity =
    existingCapacity * 0.85;

  const capacityGap =
    Math.max(
      0,
      demand.peakDaily -
        safeExistingCapacity
    );

  const deliveryGap =
    Math.max(
      0,
      delivery -
        deliveryTarget
    );

  const capacityPressure =
    demand.peakDaily > 0
      ? clamp(
          (capacityGap /
            demand.peakDaily) *
            100,
          0,
          100
        )
      : 0;

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
      Math.round(capacityGap),

    opportunityScore:
      round(opportunityScore),
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
  if (!candidate) {
    return null;
  }

  const serviceRows =
    candidateZoneService.filter(
      (row) =>
        row.Candidate_ID ===
        candidate.Candidate_ID
    );

  const primaryService =
    serviceRows.find(
      (row) =>
        (
          row.Service_Zone ||
          row.Zone
        ) === candidate.Primary_Zone
    );

  const delivery =
    Number(
      primaryService?.Expected_Delivery_Min ||
        candidate.Fixed_Delivery_Min ||
        candidate.Delivery_Time_Min ||
        0
    );

  const nodeCapacity =
    Number(
      candidate.Daily_Capacity_Orders ||
        candidate.Capacity_Orders_Day ||
        0
    );

  const maxAssortment =
    Number(
      candidate.Max_Assortment_SKUs ||
        candidate.Max_SKUs ||
        0
    );

  const storageCapacity =
    Number(
      candidate.Storage_Capacity_Units ||
        candidate.Storage_Units ||
        0
    );

  const launchCost =
    Number(
      candidate.Launch_Cost_Lakh ||
        candidate.Launch_Cost ||
        0
    );

  /*
   * Capacity score
   */

  const capacityScore =
    opportunity.peakDemand <=
    nodeCapacity
      ? 100
      : clamp(
          (nodeCapacity /
            Math.max(
              opportunity.peakDemand,
              1
            )) *
            100,
          0,
          100
        );

  /*
   * Delivery score
   */

  const deliveryScore =
    delivery <=
    deliveryTarget
      ? 100
      : clamp(
          100 -
            (delivery -
              deliveryTarget) *
              10,
          0,
          100
        );

  /*
   * Selection requirement
   */

  const requiredAssortment =
    opportunity.selectionGapPct >= 20
      ? 2500
      : opportunity.selectionGapPct >= 10
      ? 1500
      : 800;

  const assortmentScore =
    maxAssortment >=
    requiredAssortment
      ? 100
      : clamp(
          (maxAssortment /
            Math.max(
              requiredAssortment,
              1
            )) *
            100,
          0,
          100
        );

  /*
   * Storage score
   */

  const storageRequired =
    opportunity.peakDemand *
    1.5;

  const storageScore =
    storageCapacity >=
    storageRequired
      ? 100
      : storageCapacity > 0
      ? clamp(
          (storageCapacity /
            storageRequired) *
            100,
          0,
          100
        )
      : 0;

  /*
   * Lower cost gets a higher score,
   * but cost is NOT allowed to
   * dominate the decision.
   */

  const costScore =
    clamp(
      100 -
        (launchCost / 120) *
          70,
      10,
      100
    );

  const score =
    capacityScore * 0.3 +
    deliveryScore * 0.2 +
    assortmentScore * 0.15 +
    storageScore * 0.1 +
    costScore * 0.25;

  return {
    ...candidate,

    launchCost,

    nodeCapacity,

    maxAssortment,

    storageCapacity,

    expectedDelivery:
      delivery,

    capacityScore:
      round(capacityScore),

    deliveryScore:
      round(deliveryScore),

    assortmentScore:
      round(assortmentScore),

    storageScore:
      round(storageScore),

    costScore:
      round(costScore),

    score:
      round(score, 1),

    withinBudget:
      launchCost <=
      budget,

    capacityFit:
      nodeCapacity >=
      opportunity.peakDemand,

    deliveryFit:
      delivery <=
      deliveryTarget,

    assortmentFit:
      maxAssortment >=
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
  const key =
    `${zone}|${sku.SKU_ID}`;

  const demandData =
    skuDemandMap[key];

  /*
   * Weekly SKU demand
   * converted into daily demand.
   */

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
    availabilityMap[key];

  const availabilityPct =
    normalizePct(
      availability
        ?.Current_Availability_Pct ||
        0
    );

  const stockoutRate =
    normalizePct(
      availability
        ?.Stockout_Rate_Pct ||
        0
    );

  const unitCost =
    Number(
      sku.Unit_Cost || 0
    );

  const sellingPrice =
    Number(
      sku.Selling_Price || 0
    );

  const margin =
    Number(
      sku.Margin_Per_Unit ||
        sellingPrice -
          unitCost
    );

  const storageUnits =
    Number(
      sku.Storage_Units ||
        1
    );

  const replenishmentDays =
    Number(
      sku.Replenishment_Days ||
        2
    );

  const shelfLifeDays =
    Number(
      sku.Shelf_Life_Days ||
        30
    );

  /*
   * Opening stock.
   *
   * Perishable items receive
   * a smaller holding window.
   */

  const holdingDays =
    Math.min(
      shelfLifeDays * 0.35,
      Math.max(
        3,
        replenishmentDays + 2
      )
    );

  const openingUnits =
    Math.max(
      1,
      Math.ceil(
        dailyDemand *
          holdingDays
      )
    );

  const openingInventoryCost =
    openingUnits *
    unitCost;

  const storageConsumption =
    openingUnits *
    storageUnits;

  const annualUnits =
    dailyDemand * 365;

  const annualRevenue =
    annualUnits *
    sellingPrice;

  const annualGrossMargin =
    annualUnits *
    margin;

  const marginRate =
    sellingPrice > 0
      ? margin /
        sellingPrice
      : 0;

  /*
   * SKU priority.
   *
   * High:
   * - demand
   * - customer unmet need
   * - margin
   *
   * Low:
   * - capital requirement
   * - storage requirement
   */

  const demandScore =
    Math.log10(
      Math.max(
        dailyDemand,
        1
      )
    ) * 20;

  const unmetNeed =
    1 -
    availabilityPct;

  const marginScore =
    marginRate * 100;

  const customerNeedScore =
    unmetNeed * 60 +
    stockoutRate * 40;

  const capitalPenalty =
    openingInventoryCost /
    100000;

  const storagePenalty =
    storageConsumption /
    1000;

  const priority =
    demandScore * 0.35 +
    marginScore * 0.2 +
    customerNeedScore * 0.3 -
    capitalPenalty * 0.05 -
    storagePenalty * 0.1;

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
  const nodeRule =
    nodeTypeRules.find(
      (rule) =>
        rule.Node_Type ===
        nodeType
    );

  const maxSKUs =
    Number(
      nodeRule?.Max_Assortment_SKUs ||
        1200
    );

  /*
   * Remaining money available
   * for opening inventory.
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

  /*
   * Evaluate EVERY SKU.
   */

  const candidates = [];

  skuCatalog.forEach(
    (sku) => {
      const economics =
        getSkuEconomics(
          zone,
          sku,
          demandMultiplier
        );

      /*
       * Ignore products with
       * almost no demand.
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
    }
  );

  /*
   * Highest-value SKUs first.
   */

  candidates.sort(
    (a, b) =>
      b.priority -
      a.priority
  );

  let usedBudget = 0;

  let usedStorage = 0;

  const selected = [];

  /*
   * Greedy constrained
   * assortment selection.
   */

  for (
    const sku of candidates
  ) {
    if (
      selected.length >=
      maxSKUs
    ) {
      break;
    }

    const nextBudget =
      usedBudget +
      sku.openingInventoryCost;

    const nextStorage =
      usedStorage +
      sku.storageConsumption;

    /*
     * Inventory budget constraint.
     */

    if (
      nextBudget >
      inventoryBudget
    ) {
      continue;
    }

    /*
     * Storage constraint.
     *
     * Keep 15% capacity
     * as operating buffer.
     */

    if (
      storageCapacity > 0 &&
      nextStorage >
        storageCapacity *
          0.85
    ) {
      continue;
    }

    selected.push(
      sku
    );

    usedBudget =
      nextBudget;

    usedStorage =
      nextStorage;
  }

  /*
   * Category aggregation.
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

          availabilityTotal: 0,

          stockoutTotal: 0,

          availabilityCount: 0,
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

      category.availabilityTotal +=
        normalizePct(
          sku.availabilityPct
        );

      category.stockoutTotal +=
        normalizePct(
          sku.stockoutPct
        );

      category.availabilityCount +=
        1;
    }
  );

  /*
   * Convert category data
   * into the format expected
   * by the UI.
   */

  const categories =
    Object.values(
      categoryMap
    )
      .map(
        (category) => {
          const availability =
            category.availabilityCount >
            0
              ? category.availabilityTotal /
                category.availabilityCount
              : 0;

          const stockout =
            category.availabilityCount >
            0
              ? category.stockoutTotal /
                category.availabilityCount
              : 0;

          return {
            category:
              category.category,

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

            /*
             * Fields used by page.js
             */

            recommendedSKUs:
              category.skuCount,

            availabilityPct:
              round(
                availability * 100
              ),

            stockoutPct:
              round(
                stockout * 100
              ),

            unmetDemandPct:
              round(
                (1 -
                  availability) *
                  100
              ),
          };
        }
      )
      .sort(
        (a, b) =>
          b.grossMargin -
          a.grossMargin
      );

  /*
   * Total assortment economics.
   */

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

    /*
     * Alias retained for
     * compatibility with UI.
     */

    selectedSKUs:
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
   6. FINANCIAL MODEL
========================================================= */

function calculateFinancials({
  node,
  assortment,
}) {
  const launchCost =
    Number(
      node?.launchCost ||
        node?.Launch_Cost_Lakh ||
        0
    );

  const openingInventoryLakh =
    Number(
      assortment?.openingInventoryCost ||
        0
    ) / 100000;

  const upfrontInvestment =
    launchCost +
    openingInventoryLakh;

  const annualRevenueLakh =
    Number(
      assortment?.annualRevenue ||
        0
    ) / 100000;

  const annualGrossMarginLakh =
    Number(
      assortment?.annualGrossMargin ||
        0
    ) / 100000;

  const year1GrossMarginROI =
    upfrontInvestment > 0
      ? (
          annualGrossMarginLakh /
          upfrontInvestment
        ) * 100
      : 0;

  const monthlyGrossMargin =
    annualGrossMarginLakh /
    12;

  const paybackMonths =
    monthlyGrossMargin > 0
      ? upfrontInvestment /
        monthlyGrossMargin
      : null;

  return {
    launchCostLakh:
      money(launchCost),

    openingInventoryLakh:
      money(
        openingInventoryLakh
      ),

    upfrontInvestmentLakh:
      money(
        upfrontInvestment
      ),

    annualRevenueLakh:
      money(
        annualRevenueLakh
      ),

    annualGrossMarginLakh:
      money(
        annualGrossMarginLakh
      ),

    year1GrossMarginROI:
      round(
        year1GrossMarginROI,
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
      "Year-1 gross-margin ROI. Excludes rent, labor, logistics OPEX, taxes, financing and other operating expenses.",
  };
}

/* =========================================================
   7. BUILD ONE NETWORK OPTION
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

  const nodeType =
    candidate.Node_Type;

  const launchCost =
    Number(
      candidate.Launch_Cost_Lakh ||
        candidate.Launch_Cost ||
        0
    );

  const capacity =
    Number(
      candidate.Daily_Capacity_Orders ||
        candidate.Capacity_Orders_Day ||
        0
    );

  const storage =
    Number(
      candidate.Storage_Capacity_Units ||
        candidate.Storage_Units ||
        0
    );

  const maxAssortment =
    Number(
      candidate.Max_Assortment_SKUs ||
        candidate.Max_SKUs ||
        0
    );

  const delivery =
    Number(
      candidate.Fixed_Delivery_Min ||
        candidate.Delivery_Time_Min ||
        0
    );

  const assortment =
    optimizeAssortment({
      zone:
        opportunity.zone,

      nodeType,

      demandMultiplier,

      totalBudget:
        budget,

      launchCost,

      storageCapacity:
        storage,
    });

  const financials =
    calculateFinancials({
      node: {
        launchCost,
      },

      assortment,
    });

  const capacityGap =
    Math.max(
      0,
      opportunity.peakDemand -
        capacity
    );

  const capacityFit =
    capacityGap === 0;

  const deliveryFit =
    delivery <=
    deliveryTarget;

  const storageFit =
    assortment.storageUtilizationPct <=
    85;

  const assortmentFit =
    assortment.selectedSKUCount <=
    maxAssortment;

  /*
   * Economic score.
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
          (capacity /
            Math.max(
              opportunity.peakDemand,
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
            (delivery -
              deliveryTarget) *
              10,
          0,
          100
        );

  const assortmentScore =
    maxAssortment > 0
      ? clamp(
          (assortment.selectedSKUCount /
            maxAssortment) *
            100,
          0,
          100
        )
      : 0;

  const capitalEfficiency =
    clamp(
      100 -
        financials.upfrontInvestmentLakh,
      0,
      100
    );

  /*
   * Overall strategy score.
   *
   * Economics is deliberately
   * weighted heavily.
   */

  const score =
    capacityScore * 0.25 +
    deliveryScore * 0.15 +
    roiScore * 0.35 +
    assortmentScore * 0.1 +
    capitalEfficiency * 0.15;

  return {
    candidateId:
      candidate.Candidate_ID,

    nodeType,

    siteName:
      candidate.Site_Name ||
      candidate.Location ||
      candidate.Candidate_ID,

    cost:
      launchCost,

    capacity,

    storage,

    maxAssortment,

    delivery,

    selectedSKUs:
      assortment.selectedSKUCount,

    openingInventory:
      financials.openingInventoryLakh,

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

    assortmentFit,

    withinBudget:
      financials.upfrontInvestmentLakh <=
      budget,

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
   * PHASED STRATEGY
   */

  let phased = null;

  if (mfc && ufc) {
    const growthPressure =
      opportunity.demandTrendPct >=
      8;

    const currentPressure =
      opportunity.utilization >=
      80;

    const selectionPressure =
      opportunity.selectionGapPct >=
      15;

    const phasedScore =
      (
        mfc.score +
        ufc.score
      ) / 2;

    phased = {
      strategy:
        "Phased MFC → UFC",

      initialNode:
        "Small MFC",

      futureNode:
        "UFC",

      initialInvestment:
        mfc.upfrontInvestment,

      futureInvestment:
        ufc.upfrontInvestment,

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
          ufc.upfrontInvestment -
            mfc.upfrontInvestment,
          2
        ),

      trigger:
        growthPressure ||
        currentPressure ||
        selectionPressure
          ? "Expand to UFC when demand, utilization or selection pressure crosses the planning threshold."
          : "Validate demand with the Small MFC before committing additional capital.",

      score:
        round(
          phasedScore + 5,
          1
        ),
    };
  }

  /*
   * ONLY financially and operationally
   * viable options should compete.
   */

  const viableOptions =
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
   * Start with highest score.
   */

  if (
    viableOptions.length > 0
  ) {
    viableOptions.sort(
      (a, b) =>
        b.score -
        a.score
    );

    recommendedNode =
      viableOptions[0];

    recommendation =
      recommendedNode.nodeType;
  }

  /*
   * HARD CAPACITY RULE
   *
   * If MFC cannot handle peak
   * demand but UFC can, UFC wins.
   */

  const mfcCannotHandle =
    mfc &&
    opportunity.peakDemand >
      mfc.capacity;

  const ufcCanHandle =
    ufc &&
    opportunity.peakDemand <=
      ufc.capacity;

  if (
    mfcCannotHandle &&
    ufcCanHandle &&
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
   * HIGH SELECTION GAP
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
   * DELIVERY REQUIREMENT
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
   * PHASED STRATEGY
   *
   * Use it when MFC can handle
   * today's demand but demand is
   * growing and UFC offers a
   * better future solution.
   */

  if (
    mfc &&
    ufc &&
    mfc.withinBudget &&
    mfc.capacityFit &&
    opportunity.demandTrendPct >=
      8 &&
    ufc.score >
      mfc.score + 10
  ) {
    recommendation =
      "Phased MFC → UFC";

    recommendedNode =
      mfc;

    reasons.push(
      "Small MFC can handle current demand with lower initial capital."
    );

    reasons.push(
      "Demand growth indicates a future need for larger UFC capacity."
    );
  }

  /*
   * SMALL MFC REASONS
   */

  if (
    recommendation ===
    "Small MFC"
  ) {
    reasons.push(
      "Small MFC provides sufficient capacity for the current demand scenario."
    );

    reasons.push(
      "Lower upfront investment improves capital efficiency."
    );
  }

  /*
   * UFC REASONS
   */

  if (
    recommendation ===
      "UFC" &&
    reasons.length === 0
  ) {
    reasons.push(
      "UFC provides the strongest combined operational and economic fit."
    );
  }

  /*
   * COMPARISON
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

        assortmentFit:
          option.assortmentFit,

        score:
          option.score,

        recommended:
          recommendation ===
          option.nodeType,
      })
    );

  /*
   * Add phased comparison.
   */

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

  /*
   * If phased, the first
   * operating node is MFC.
   */

  let selectedNode =
    network.recommendedNode;

  if (
    network.recommendation ===
    "Phased MFC → UFC"
  ) {
    selectedNode =
      network.mfc;
  }

  /*
   * Fallback if no node was
   * found.
   */

  if (!selectedNode) {
    return {
      zone,

      recommendation:
        "No viable node",

      decisionReasons: [
        "No candidate node satisfies the current budget and planning constraints.",
      ],

      opportunity:
        network.opportunity,

      node: null,

      networkOptions:
        network.options,

      networkComparison:
        network.comparison,

      phased:
        network.phased,

      assortment: {
        selectedSKUs: 0,
        categories: [],
      },

      skuRecommendations: [],

      capacity: {
        dailyCapacity: 0,
        projectedDailyDemand:
          network.opportunity
            .projectedDailyDemand,
        peakDemand:
          network.opportunity
            .peakDemand,
        capacityGap:
          network.opportunity
            .peakDemand,
      },

      storage: {
        estimatedUnits: 0,
        capacityUnits: 0,
        utilizationPct: 0,
        scenarioLimitPct:
          storageLimitPct,
        withinLimit: true,
      },

      financials: {
        launchCostLakh: 0,
        openingInventoryLakh: 0,
        upfrontInvestmentLakh: 0,
        annualRevenueLakh: 0,
        annualGrossMarginLakh: 0,
        year1GrossMarginROI: 0,
        paybackMonths: null,
        methodology:
          "No viable node under current scenario.",
      },

      assumptions: {
        demandMultiplier,
        budget,
        deliveryTarget,
        storageLimitPct,
      },
    };
  }

  /*
   * Assortment is already calculated
   * inside the node option.
   */

  const assortment =
    selectedNode.assortment;

  /*
   * Apply user's storage scenario.
   *
   * Example:
   * 85% scenario means we allow
   * only 85% of physical storage.
   */

  const allowedStorage =
    selectedNode.storage *
    (storageLimitPct / 100);

  const storageUtilization =
    selectedNode.storage > 0
      ? (
          assortment.storageUsed /
          selectedNode.storage
        ) * 100
      : 0;

  const withinStorageLimit =
    assortment.storageUsed <=
    allowedStorage;

  /*
   * Customer coverage.
   */

  const serviceRows =
    candidateZoneService.filter(
      (row) =>
        row.Candidate_ID ===
        selectedNode.candidateId
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
    });

  /*
   * Capacity.
   */

  const dailyCapacity =
    selectedNode.capacity;

  const projectedDemand =
    network.opportunity
      .projectedDailyDemand;

  const peakDemand =
    network.opportunity
      .peakDemand;

  const capacityGap =
    Math.max(
      0,
      peakDemand -
        dailyCapacity
    );

  const peakUtilization =
    dailyCapacity > 0
      ? (
          peakDemand /
          dailyCapacity
        ) * 100
      : 0;

  /*
   * Top 30 SKU recommendations.
   */

  const skuRecommendations =
    assortment.selected
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

  /*
   * Category output.
   */

  const categories =
    assortment.categories.map(
      (category) => ({
        ...category,

        /*
         * Compatibility with
         * current UI.
         */
        recommendedSKUs:
          category.recommendedSKUs ||
          0,

        availabilityPct:
          category.availabilityPct ||
          0,

        stockoutPct:
          category.stockoutPct ||
          0,

        unmetDemandPct:
          category.unmetDemandPct ||
          0,
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

    /*
     * ASSORTMENT
     */

    assortment: {
      ...assortment,

      selectedSKUs:
        assortment.selectedSKUCount,

      categories,
    },

    /*
     * SKU LEVEL
     */

    skuRecommendations,

    /*
     * CUSTOMER IMPACT
     */

    customerImpact: {
      serviceableCustomers:
        Math.round(
          serviceableCustomers
        ),

      deliveryTarget,

      deliveryTime:
        selectedNode.delivery,
    },

    /*
     * CAPACITY
     */

    capacity: {
      dailyCapacity,

      projectedDailyDemand:
        projectedDemand,

      peakDemand,

      capacityGap,

      peakUtilizationPct:
        round(
          peakUtilization,
          1
        ),
    },

    /*
     * STORAGE
     */

    storage: {
      estimatedUnits:
        Math.round(
          assortment.storageUsed
        ),

      capacityUnits:
        selectedNode.storage,

      utilizationPct:
        round(
          storageUtilization,
          1
        ),

      scenarioLimitPct:
        storageLimitPct,

      withinLimit:
        withinStorageLimit,
    },

    /*
     * FINANCIALS
     */

    financials,

    /*
     * ASSUMPTIONS
     */

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
