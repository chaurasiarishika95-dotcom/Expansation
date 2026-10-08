import demandHistory from "../data/demand_history.json";
import searchDemand from "../data/search_demand.json";
import facilities from "../data/facilities.json";
import candidateNodes from "../data/candidate_nodes.json";
import candidateZoneService from "../data/candidate_zone_service.json";
import skuCatalog from "../data/sku_catalog.json";
import skuAvailability from "../data/sku_availability.json";
import inventoryEconomics from "../data/inventory_economics.json";
import nodeTypeRules from "../data/node_type_rules.json";

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + Number(b || 0), 0) / values.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* ---------------------------------------------------------
   1. DEMAND ANALYSIS
--------------------------------------------------------- */

export function getZoneDemand(zone, demandMultiplier = 1) {
  const rows = demandHistory.filter((r) => r.Zone === zone);

  const daily = {};

  rows.forEach((r) => {
    daily[r.Date] = (daily[r.Date] || 0) + Number(r.Orders || 0);
  });

  const values = Object.values(daily);

  const baseline = avg(values);

  const recent = values.slice(-28);
  const previous = values.slice(-56, -28);

  const recentAvg = avg(recent);
  const previousAvg = avg(previous);

  const trend =
    previousAvg > 0
      ? (recentAvg - previousAvg) / previousAvg
      : 0;

  const projectedDaily =
    recentAvg * (1 + trend * 0.5) * demandMultiplier;

  const peakDaily = projectedDaily * 1.2;

  return {
    zone,
    baseline: Math.round(baseline),
    recentDemand: Math.round(recentAvg),
    trendPct: Math.round(trend * 1000) / 10,
    projectedDaily: Math.round(projectedDaily),
    peakDaily: Math.round(peakDaily),
    historicalDays: values.length,
  };
}

/* ---------------------------------------------------------
   2. NETWORK OPPORTUNITY
--------------------------------------------------------- */

export function getNetworkOpportunity(zone, demandMultiplier = 1) {
  const demand = getZoneDemand(zone, demandMultiplier);

  const facilitiesInZone = facilities.filter(
    (f) => f.Zone === zone
  );

  const existingCapacity = facilitiesInZone.reduce(
    (sum, f) => sum + Number(f.Daily_Capacity_Orders || 0),
    0
  );

  const utilization = avg(
    facilitiesInZone.map((f) => Number(f.Current_Utilization || 0))
  );

  const delivery = avg(
    facilitiesInZone.map((f) => Number(f.Avg_Delivery_Min || 0))
  );

  const searchRows = searchDemand.filter(
    (r) => r.Zone === zone
  );

  const searchVolume = searchRows.reduce(
    (sum, r) => sum + Number(r.Daily_Search_Demand || 0),
    0
  );

  const unavailableSearches = searchRows.reduce(
    (sum, r) => sum + Number(r.Unavailable_Searches || 0),
    0
  );

  const selectionGap =
    searchVolume > 0
      ? unavailableSearches / searchVolume
      : 0;

  const capacityGap = Math.max(
    0,
    demand.peakDaily - existingCapacity * 0.85
  );

  const deliveryGap = Math.max(
    0,
    delivery - 20
  );

  const opportunityScore =
    clamp(capacityGap / Math.max(demand.peakDaily, 1) * 100, 0, 100) * 0.35 +
    clamp(deliveryGap * 5, 0, 100) * 0.25 +
    clamp(selectionGap * 100, 0, 100) * 0.20 +
    clamp(utilization * 100, 0, 100) * 0.20;

  return {
    zone,
    projectedDailyDemand: demand.projectedDaily,
    peakDemand: demand.peakDaily,
    existingCapacity,
    utilization: Math.round(utilization * 100),
    avgDelivery: Math.round(delivery),
    searchDemand: searchVolume,
    unavailableSearches,
    selectionGapPct: Math.round(selectionGap * 100),
    capacityGap: Math.round(capacityGap),
    deliveryGap: Math.round(deliveryGap),
    opportunityScore: Math.round(opportunityScore),
  };
}

/* ---------------------------------------------------------
   3. NODE TYPE DECISION
--------------------------------------------------------- */

function evaluateNode(candidate, opportunity, budget, deliveryTarget) {
  const serviceRows = candidateZoneService.filter(
    (r) => r.Candidate_ID === candidate.Candidate_ID
  );

  const primaryService = serviceRows.find(
    (r) => r.Service_Zone === candidate.Primary_Zone
  );

  const delivery =
    primaryService?.Expected_Delivery_Min ??
    candidate.Fixed_Delivery_Min;

  const deliveryScore =
    delivery <= deliveryTarget
      ? 100
      : clamp(100 - (delivery - deliveryTarget) * 8, 0, 100);

  const capacityScore =
    opportunity.peakDemand <= candidate.Daily_Capacity_Orders
      ? 100
      : clamp(
          100 -
            ((opportunity.peakDemand -
              candidate.Daily_Capacity_Orders) /
              opportunity.peakDemand) *
              100,
          0,
          100
        );

  const selectionScore =
    candidate.Max_Assortment_SKUs >=
    (opportunity.selectionGapPct >= 20 ? 2500 : 1000)
      ? 100
      : 60;

  const costScore = clamp(
    100 - candidate.Launch_Cost_Lakh * 0.7,
    10,
    100
  );

  const score =
    deliveryScore * 0.30 +
    capacityScore * 0.35 +
    selectionScore * 0.20 +
    costScore * 0.15;

  return {
    ...candidate,
    expectedDelivery: delivery,
    deliveryScore: Math.round(deliveryScore),
    capacityScore: Math.round(capacityScore),
    selectionScore: Math.round(selectionScore),
    costScore: Math.round(costScore),
    score: Math.round(score * 10) / 10,
    withinBudget:
      candidate.Launch_Cost_Lakh <= budget,
  };
}

/* ---------------------------------------------------------
   4. NETWORK PLAN
--------------------------------------------------------- */

export function planNetwork({
  zone,
  demandMultiplier = 1,
  budget = 100,
  deliveryTarget = 20,
}) {
  const opportunity = getNetworkOpportunity(
    zone,
    demandMultiplier
  );

  const candidates = candidateNodes.filter(
    (c) => c.Primary_Zone === zone
  );

  const evaluated = candidates
    .map((candidate) =>
      evaluateNode(
        candidate,
        opportunity,
        budget,
        deliveryTarget
      )
    )
    .sort((a, b) => b.score - a.score);

  const affordable = evaluated.filter(
    (x) => x.withinBudget
  );

  const best =
    affordable[0] ||
    evaluated[0];

  let recommendation = best?.Node_Type || "Small MFC";

  /*
   * Phased expansion is recommended when:
   * - demand is growing
   * - current network is under pressure
   * - UFC provides more capacity
   * - but a lower-cost MFC can validate demand first
   */

  const mfc = evaluated.find(
    (x) => x.Node_Type === "Small MFC"
  );

  const ufc = evaluated.find(
    (x) => x.Node_Type === "UFC"
  );

  if (
    mfc &&
    ufc &&
    opportunity.utilization >= 85 &&
    opportunity.opportunityScore >= 60 &&
    opportunity.projectedDailyDemand <
      ufc.Daily_Capacity_Orders * 0.75 &&
    opportunity.deliveryGap > 0 &&
    demandMultiplier >= 1
  ) {
    recommendation = "Phased MFC → UFC";
  }

  return {
    zone,
    opportunity,
    options: evaluated,
    recommendation,
    recommendedNode:
      recommendation === "Phased MFC → UFC"
        ? mfc
        : best,
  };
}

/* ---------------------------------------------------------
   5. ASSORTMENT PLANNING
--------------------------------------------------------- */

export function planAssortment({
  zone,
  nodeType = "UFC",
  storageLimitPct = 85,
  demandMultiplier = 1,
}) {
  const nodeRule = nodeTypeRules.find(
    (r) => r.Node_Type === nodeType
  );

  const maxSkus =
    nodeRule?.Max_Assortment_SKUs || 1200;

  const availabilityRows =
    skuAvailability.filter(
      (r) => r.Zone === zone
    );

  const availabilityMap = {};

  availabilityRows.forEach((r) => {
    availabilityMap[r.SKU_ID] = r;
  });

  const categoryStats = {};

  skuCatalog.forEach((sku) => {
    const availability =
      availabilityMap[sku.SKU_ID];

    const demandRows = demandHistory.filter(
      (r) =>
        r.Zone === zone &&
        r.Category === sku.Category
    );

    const categoryDemand = demandRows.reduce(
      (sum, r) => sum + Number(r.Orders || 0),
      0
    );

    if (!categoryStats[sku.Category]) {
      categoryStats[sku.Category] = {
        demand: categoryDemand,
        skuCount: 0,
        stockout: 0,
        availability: 0,
      };
    }

    categoryStats[sku.Category].skuCount += 1;

    categoryStats[sku.Category].stockout +=
      Number(
        availability?.Stockout_Rate_Pct || 0
      );

    categoryStats[sku.Category].availability +=
      Number(
        availability?.Current_Availability_Pct || 0
      );
  });

  const categories = Object.entries(
    categoryStats
  )
    .map(([category, stats]) => {
      const avgAvailability =
        stats.availability /
        Math.max(stats.skuCount, 1);

      const avgStockout =
        stats.stockout /
        Math.max(stats.skuCount, 1);

      const unmetDemand =
        1 - avgAvailability;

      const priority =
        stats.demand * 0.00001 +
        unmetDemand * 60 +
        avgStockout * 40;

      const recommendedSKUs = Math.min(
        stats.skuCount,
        Math.max(
          8,
          Math.round(
            stats.skuCount *
              (0.35 + unmetDemand)
          )
        )
      );

      return {
        category,
        demand: Math.round(
          stats.demand *
            demandMultiplier
        ),
        availabilityPct: Math.round(
          avgAvailability * 100
        ),
        stockoutPct: Math.round(
          avgStockout * 100
        ),
        unmetDemandPct: Math.round(
          unmetDemand * 100
        ),
        recommendedSKUs,
        priority: Math.round(
          priority * 10
        ) / 10,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  let selectedSKUs = 0;
  const selectedCategories = [];

  for (const category of categories) {
    if (
      selectedSKUs +
        category.recommendedSKUs <=
      maxSkus
    ) {
      selectedCategories.push(
        category
      );

      selectedSKUs +=
        category.recommendedSKUs;
    }
  }

  return {
    zone,
    nodeType,
    maxSkus,
    storageLimitPct,
    selectedSKUs,
    categories: selectedCategories,
  };
}

/* ---------------------------------------------------------
   6. SKU-LEVEL PLAN
--------------------------------------------------------- */

export function getSkuRecommendations({
  zone,
  selectedCategories,
  maxResults = 30,
}) {
  const categorySet = new Set(
    selectedCategories.map(
      (x) => x.category
    )
  );

  const availabilityMap = {};

  skuAvailability
    .filter((r) => r.Zone === zone)
    .forEach((r) => {
      availabilityMap[r.SKU_ID] = r;
    });

  const results = skuCatalog
    .filter((sku) =>
      categorySet.has(sku.Category)
    )
    .map((sku) => {
      const a =
        availabilityMap[sku.SKU_ID];

      const availability =
        Number(
          a?.Current_Availability_Pct || 0
        );

      const stockout =
        Number(
          a?.Stockout_Rate_Pct || 0
        );

      const score =
        sku.Base_Demand_Share * 100 +
        stockout * 40 +
        (1 - availability) * 30 +
        sku.Margin_Per_Unit /
          Math.max(
            sku.Selling_Price,
            1
          ) *
          20;

      return {
        ...sku,
        availabilityPct:
          Math.round(
            availability * 100
          ),
        stockoutPct:
          Math.round(stockout * 100),
        priority:
          Math.round(score * 10) / 10,
      };
    })
    .sort(
      (a, b) =>
        b.priority - a.priority
    )
    .slice(0, maxResults);

  return results;
}

/* ---------------------------------------------------------
   7. FULL EXPANSION PLAN
--------------------------------------------------------- */

export function buildExpansionPlan({
  zone,
  demandMultiplier = 1,
  budget = 100,
  deliveryTarget = 20,
  storageLimitPct = 85,
}) {
  const network = planNetwork({
    zone,
    demandMultiplier,
    budget,
    deliveryTarget,
  });

  const nodeType =
    network.recommendation ===
    "Phased MFC → UFC"
      ? "Small MFC"
      : network.recommendedNode
          ?.Node_Type || "Small MFC";

  const assortment =
    planAssortment({
      zone,
      nodeType,
      storageLimitPct,
      demandMultiplier,
    });

  const skuRecommendations =
    getSkuRecommendations({
      zone,
      selectedCategories:
        assortment.categories,
      maxResults: 30,
    });

  const recommendedNode =
    network.recommendedNode;

  const estimatedStorage =
    assortment.selectedSKUs * 1.6;

  const storageCapacity =
    recommendedNode
      ?.Storage_Capacity_Units || 1;

  const storageUtilization =
    estimatedStorage /
    storageCapacity;

  return {
    zone,

    recommendation:
      network.recommendation,

    opportunity:
      network.opportunity,

    node:
      recommendedNode,

    networkOptions:
      network.options,

    assortment,

    skuRecommendations,

    capacity: {
      dailyCapacity:
        recommendedNode
          ?.Daily_Capacity_Orders || 0,

      projectedDailyDemand:
        network.opportunity
          .projectedDailyDemand,

      peakDemand:
        network.opportunity
          .peakDemand,

      capacityGap: Math.max(
        0,
        network.opportunity
          .peakDemand -
          (recommendedNode
            ?.Daily_Capacity_Orders || 0)
      ),
    },

    storage: {
      estimatedUnits:
        Math.round(
          estimatedStorage
        ),

      capacityUnits:
        storageCapacity,

      utilizationPct:
        Math.round(
          storageUtilization * 100
        ),

      withinLimit:
        storageUtilization <=
        storageLimitPct / 100,
    },

    assumptions: {
      demandMultiplier,
      budget,
      deliveryTarget,
      storageLimitPct,
    },
  };
}
