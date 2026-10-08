import demandHistory from "../data/demand_history.json";
import searchDemand from "../data/search_demand.json";
import facilities from "../data/facilities.json";
import candidateNodes from "../data/candidate_nodes.json";
import candidateZoneService from "../data/candidate_zone_service.json";
import skuCatalog from "../data/sku_catalog.json";
import skuAvailability from "../data/sku_availability.json";
import nodeTypeRules from "../data/node_type_rules.json";

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

/* =========================================================
   DEMAND
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
    dailyDemand[row.Date] =
      (dailyDemand[row.Date] || 0) +
      Number(row.Orders || 0);
  });

  const values = Object.values(dailyDemand);

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

    baseline: Math.round(baseline),

    recentDemand:
      Math.round(recentAvg),

    trendPct:
      Math.round(trend * 1000) / 10,

    projectedDaily:
      Math.round(projectedDaily),

    peakDaily:
      Math.round(peakDaily),

    historicalDays:
      values.length,
  };
}

/* =========================================================
   NETWORK OPPORTUNITY
========================================================= */

export function getNetworkOpportunity(
  zone,
  demandMultiplier = 1
) {
  const demand = getZoneDemand(
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

  const utilization = avg(
    existingFacilities.map(
      (facility) =>
        Number(
          facility.Current_Utilization || 0
        )
    )
  );

  const delivery = avg(
    existingFacilities.map(
      (facility) =>
        Number(
          facility.Avg_Delivery_Min || 0
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
      delivery - 20
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
    selectionPressure * 0.20 +
    utilizationPressure * 0.20;

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
      Math.round(
        utilization * 100
      ),

    avgDelivery:
      Math.round(delivery),

    deliveryGap:
      Math.round(deliveryGap),

    searchDemand:
      searchVolume,

    unavailableSearches,

    selectionGapPct:
      Math.round(
        selectionGap * 100
      ),

    capacityGap:
      Math.round(capacityGap),

    opportunityScore:
      Math.round(
        opportunityScore
      ),
  };
}

/* =========================================================
   NODE OPTION EVALUATION
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
    opportunity.selectionGapPct >=
    20
      ? 2500
      : opportunity.selectionGapPct >=
        10
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

  const costScore =
    clamp(
      100 -
        (candidate.Launch_Cost_Lakh /
          100) *
          70,
      10,
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

  const score =
    deliveryScore * 0.25 +
    capacityScore * 0.30 +
    assortmentScore * 0.20 +
    storageScore * 0.10 +
    costScore * 0.15;

  return {
    ...candidate,

    expectedDelivery:
      delivery,

    deliveryScore:
      Math.round(
        deliveryScore
      ),

    capacityScore:
      Math.round(
        capacityScore
      ),

    assortmentScore:
      Math.round(
        assortmentScore
      ),

    storageScore:
      Math.round(
        storageScore
      ),

    costScore:
      Math.round(
        costScore
      ),

    score:
      Math.round(
        score * 10
      ) / 10,

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
   NETWORK STRATEGY DECISION
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
      demandMultiplier
    );

  const candidates =
    candidateNodes.filter(
      (candidate) =>
        candidate.Primary_Zone ===
        zone
    );

  const evaluated =
    candidates
      .map((candidate) =>
        evaluateNode(
          candidate,
          opportunity,
          budget,
          deliveryTarget
        )
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  const mfc =
    evaluated.find(
      (option) =>
        option.Node_Type ===
        "Small MFC"
    );

  const ufc =
    evaluated.find(
      (option) =>
        option.Node_Type ===
        "UFC"
    );

  const reasons = [];

  /*
   * PHASED DECISION
   *
   * Use phased expansion when:
   * - demand is growing
   * - current network is already pressured
   * - MFC can handle today's demand
   * - UFC is more appropriate for future demand
   */

  const phasedEligible =
    mfc &&
    ufc &&
    mfc.withinBudget &&
    opportunity.utilization >=
      80 &&
    opportunity.demandTrendPct >=
      3 &&
    opportunity.peakDemand <=
      mfc.Daily_Capacity_Orders &&
    opportunity.peakDemand <
      ufc.Daily_Capacity_Orders;

  /*
   * UFC DECISION
   */

  const ufcRequired =
    ufc &&
    ufc.withinBudget &&
    (
      opportunity.peakDemand >
        mfc?.Daily_Capacity_Orders ||

      opportunity.selectionGapPct >=
        18 ||

      opportunity.avgDelivery >
        deliveryTarget &&
      ufc.deliveryFit
    );

  let recommendation;

  if (phasedEligible) {
    recommendation =
      "Phased MFC → UFC";

    reasons.push(
      "Current demand can be served by a Small MFC."
    );

    reasons.push(
      "Demand trend and network pressure support a phased expansion path."
    );

    reasons.push(
      "UFC provides the required future capacity and assortment headroom."
    );
  } else if (ufcRequired) {
    recommendation =
      "UFC";

    if (
      opportunity.peakDemand >
      (mfc?.Daily_Capacity_Orders || 0)
    ) {
      reasons.push(
        "Peak demand exceeds Small MFC capacity."
      );
    }

    if (
      opportunity.selectionGapPct >=
      18
    ) {
      reasons.push(
        "The selection gap requires broader assortment capacity."
      );
    }

    if (
      opportunity.avgDelivery >
        deliveryTarget &&
      ufc?.deliveryFit
    ) {
      reasons.push(
        "UFC is better aligned with the delivery-time target."
      );
    }
  } else if (
    mfc &&
    mfc.withinBudget
  ) {
    recommendation =
      "Small MFC";

    reasons.push(
      "Small MFC provides sufficient capacity for the current scenario."
    );

    reasons.push(
      "Lower launch cost makes it more capital-efficient."
    );
  } else if (
    ufc &&
    ufc.withinBudget
  ) {
    recommendation =
      "UFC";

    reasons.push(
      "UFC is the best affordable option under the current constraints."
    );
  } else {
    recommendation =
      "No viable node";

    reasons.push(
      "Neither node option fits the current budget."
    );
  }

  let recommendedNode;

  if (
    recommendation ===
    "Phased MFC → UFC"
  ) {
    recommendedNode = mfc;
  } else if (
    recommendation === "UFC"
  ) {
    recommendedNode = ufc;
  } else {
    recommendedNode = mfc;
  }

  /*
   * Add structured comparison rows.
   */

  const comparison = [];

  if (mfc) {
    comparison.push({
      strategy: "Small MFC",
      nodeType: "Small MFC",
      cost:
        mfc.Launch_Cost_Lakh,
      capacity:
        mfc.Daily_Capacity_Orders,
      assortment:
        mfc.Max_Assortment_SKUs,
      delivery:
        mfc.expectedDelivery,
      score: mfc.score,
      withinBudget:
        mfc.withinBudget,
      capacityFit:
        mfc.capacityFit,
      deliveryFit:
        mfc.deliveryFit,
      assortmentFit:
        mfc.assortmentFit,
      recommended:
        recommendation ===
        "Small MFC",
    });
  }

  if (ufc) {
    comparison.push({
      strategy: "UFC",
      nodeType: "UFC",
      cost:
        ufc.Launch_Cost_Lakh,
      capacity:
        ufc.Daily_Capacity_Orders,
      assortment:
        ufc.Max_Assortment_SKUs,
      delivery:
        ufc.expectedDelivery,
      score: ufc.score,
      withinBudget:
        ufc.withinBudget,
      capacityFit:
        ufc.capacityFit,
      deliveryFit:
        ufc.deliveryFit,
      assortmentFit:
        ufc.assortmentFit,
      recommended:
        recommendation ===
        "UFC",
    });
  }

  if (mfc && ufc) {
    comparison.push({
      strategy:
        "Phased MFC → UFC",
      nodeType:
        "Phased",
      cost:
        mfc.Launch_Cost_Lakh,
      futureCost:
        ufc.Launch_Cost_Lakh,
      capacity:
        mfc.Daily_Capacity_Orders,
      futureCapacity:
        ufc.Daily_Capacity_Orders,
      assortment:
        mfc.Max_Assortment_SKUs,
      futureAssortment:
        ufc.Max_Assortment_SKUs,
      delivery:
        mfc.expectedDelivery,
      futureDelivery:
        ufc.expectedDelivery,
      score:
        Math.round(
          ((mfc.score +
            ufc.score) /
            2) *
            10
        ) / 10,
      withinBudget:
        mfc.withinBudget,
      capacityFit:
        mfc.capacityFit,
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

    options: evaluated,

    comparison,
  };
}

/* =========================================================
   ASSORTMENT PLANNING
========================================================= */

export function planAssortment({
  zone,
  nodeType = "UFC",
  storageLimitPct = 85,
  demandMultiplier = 1,
}) {
  const nodeRule =
    nodeTypeRules.find(
      (rule) =>
        rule.Node_Type ===
        nodeType
    );

  const maxSkus =
    nodeRule?.Max_Assortment_SKUs ||
    1200;

  const availabilityRows =
    skuAvailability.filter(
      (row) =>
        row.Zone === zone
    );

  const availabilityMap =
    Object.fromEntries(
      availabilityRows.map(
        (row) => [
          row.SKU_ID,
          row,
        ]
      )
    );

  /*
   * Aggregate category demand once.
   */

  const categoryDemand = {};

  demandHistory
    .filter(
      (row) =>
        row.Zone === zone
    )
    .forEach((row) => {
      categoryDemand[row.Category] =
        (categoryDemand[row.Category] ||
          0) +
        Number(row.Orders || 0);
    });

  const categoryStats = {};

  skuCatalog.forEach((sku) => {
    const availability =
      availabilityMap[
        sku.SKU_ID
      ];

    if (
      !categoryStats[
        sku.Category
      ]
    ) {
      categoryStats[
        sku.Category
      ] = {
        skuCount: 0,
        stockout: 0,
        availability: 0,
      };
    }

    categoryStats[
      sku.Category
    ].skuCount += 1;

    categoryStats[
      sku.Category
    ].stockout += Number(
      availability?.Stockout_Rate_Pct ||
        0
    );

    categoryStats[
      sku.Category
    ].availability += Number(
      availability?.Current_Availability_Pct ||
        0
    );
  });

  const categories =
    Object.entries(
      categoryStats
    )
      .map(
        ([category, stats]) => {
          const avgAvailability =
            stats.availability /
            Math.max(
              stats.skuCount,
              1
            );

          const avgStockout =
            stats.stockout /
            Math.max(
              stats.skuCount,
              1
            );

          const unmetDemand =
            1 -
            avgAvailability;

          const demand =
            (categoryDemand[
              category
            ] || 0) *
            demandMultiplier;

          const priority =
            demand *
              0.00001 +
            unmetDemand *
              60 +
            avgStockout *
              40;

          const recommendedSKUs =
            Math.min(
              stats.skuCount,
              Math.max(
                8,
                Math.round(
                  stats.skuCount *
                    (0.35 +
                      unmetDemand)
                )
              )
            );

          return {
            category,

            demand:
              Math.round(
                demand
              ),

            availabilityPct:
              Math.round(
                avgAvailability *
                  100
              ),

            stockoutPct:
              Math.round(
                avgStockout *
                  100
              ),

            unmetDemandPct:
              Math.round(
                unmetDemand *
                  100
              ),

            recommendedSKUs,

            priority:
              Math.round(
                priority * 10
              ) / 10,
          };
        }
      )
      .sort(
        (a, b) =>
          b.priority -
          a.priority
      );

  let selectedSKUs = 0;

  const selectedCategories = [];

  for (
    const category of categories
  ) {
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
    categories:
      selectedCategories,
  };
}

/* =========================================================
   SKU RECOMMENDATIONS
========================================================= */

export function getSkuRecommendations({
  zone,
  selectedCategories,
  maxResults = 30,
}) {
  const categorySet =
    new Set(
      selectedCategories.map(
        (item) =>
          item.category
      )
    );

  const availabilityMap =
    Object.fromEntries(
      skuAvailability
        .filter(
          (row) =>
            row.Zone === zone
        )
        .map(
          (row) => [
            row.SKU_ID,
            row,
          ]
        )
    );

  return skuCatalog
    .filter((sku) =>
      categorySet.has(
        sku.Category
      )
    )
    .map((sku) => {
      const availability =
        availabilityMap[
          sku.SKU_ID
        ];

      const availabilityPct =
        Number(
          availability
            ?.Current_Availability_Pct ||
            0
        );

      const stockoutPct =
        Number(
          availability
            ?.Stockout_Rate_Pct ||
            0
        );

      const marginRate =
        sku.Margin_Per_Unit /
        Math.max(
          sku.Selling_Price,
          1
        );

      const priority =
        sku.Base_Demand_Share *
          100 +
        stockoutPct * 40 +
        (1 -
          availabilityPct) *
          30 +
        marginRate * 20;

      return {
        ...sku,

        availabilityPct:
          Math.round(
            availabilityPct *
              100
          ),

        stockoutPct:
          Math.round(
            stockoutPct *
              100
          ),

        priority:
          Math.round(
            priority * 10
          ) / 10,
      };
    })
    .sort(
      (a, b) =>
        b.priority -
        a.priority
    )
    .slice(
      0,
      maxResults
    );
}

/* =========================================================
   FULL EXPANSION PLAN
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

  const nodeType =
    network.recommendation ===
    "UFC"
      ? "UFC"
      : "Small MFC";

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
    assortment.selectedSKUs *
    1.6;

  const storageCapacity =
    recommendedNode
      ?.Storage_Capacity_Units ||
    1;

  const storageUtilization =
    estimatedStorage /
    storageCapacity;

  return {
    zone,

    recommendation:
      network.recommendation,

    decisionReasons:
      network.reasons,

    opportunity:
      network.opportunity,

    node:
      recommendedNode,

    networkOptions:
      network.options,

    networkComparison:
      network.comparison,

    assortment,

    skuRecommendations,

    capacity: {
      dailyCapacity:
        recommendedNode
          ?.Daily_Capacity_Orders ||
        0,

      projectedDailyDemand:
        network.opportunity
          .projectedDailyDemand,

      peakDemand:
        network.opportunity
          .peakDemand,

      capacityGap:
        Math.max(
          0,
          network.opportunity
            .peakDemand -
            (recommendedNode
              ?.Daily_Capacity_Orders ||
              0)
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
          storageUtilization *
            100
        ),

      withinLimit:
        storageUtilization <=
        storageLimitPct /
          100,
    },

    assumptions: {
      demandMultiplier,
      budget,
      deliveryTarget,
      storageLimitPct,
    },
  };
}
