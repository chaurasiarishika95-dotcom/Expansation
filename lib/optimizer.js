import demandHistory from "../data/demand_history.json";
import zones from "../data/zones.json";
import facilities from "../data/facilities.json";
import facilityZoneCoverage from "../data/facility_zone_coverage.json";
import candidates from "../data/candidate_ufcs.json";
import candidateZoneService from "../data/candidate_zone_service.json";
import skuCatalog from "../data/sku_catalog.json";
import zoneCategoryAvailability from "../data/zone_category_availability.json";

function average(values) {
  if (!values.length) return 0;

  return (
    values.reduce((sum, value) => sum + Number(value || 0), 0) /
    values.length
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* -------------------------------------------------------
   LOCATION ANALYSIS
------------------------------------------------------- */

export function rankLocations(inputCandidates = candidates) {
  const candidateList =
    Array.isArray(inputCandidates) && inputCandidates.length
      ? inputCandidates
      : candidates;

  const results = candidateList.map((candidate) => {
    const candidateId = candidate.Candidate_ID;
    const primaryZone = candidate.Primary_Zone;

    const zone = zones.find((z) => z.Zone === primaryZone);

    /* Demand in the candidate's primary market */
    const zoneDemand = demandHistory.filter(
      (row) => row.Zone === primaryZone
    );

    const dailyDemand = average(
      Object.values(
        zoneDemand.reduce((acc, row) => {
          acc[row.Date] = (acc[row.Date] || 0) + Number(row.Orders || 0);
          return acc;
        }, {})
      )
    );

    /* Existing facilities serving this zone */
    const existingFacilities = facilities.filter(
      (facility) => facility.Primary_Zone === primaryZone
    );

    const existingCapacity = existingFacilities.reduce(
      (sum, facility) => sum + Number(facility.Daily_Capacity_Orders || 0),
      0
    );

    const existingUtilization = average(
      existingFacilities.map((facility) =>
        Number(facility.Current_Utilization || 0)
      )
    );

    /* Customer/service coverage of the candidate */
    const serviceRows = candidateZoneService.filter(
      (row) => row.Candidate_ID === candidateId
    );

    const serviceableCustomers = serviceRows.reduce(
      (sum, row) => sum + Number(row.Serviceable_Customers || 0),
      0
    );

    const totalAddressableCustomers = zones.reduce(
      (sum, zone) => sum + Number(zone.Addressable_Customers || 0),
      0
    );

    const coveragePct = totalAddressableCustomers
      ? (serviceableCustomers / totalAddressableCustomers) * 100
      : 0;

    /* Weighted delivery time */
    const weightedDeliveryNumerator = serviceRows.reduce(
      (sum, row) =>
        sum +
        Number(row.Expected_Delivery_Min || 0) *
          Number(row.Serviceable_Customers || 0),
      0
    );

    const weightedDelivery =
      serviceableCustomers > 0
        ? weightedDeliveryNumerator / serviceableCustomers
        : 999;

    /* Existing network overlap */
    const existingCoverage = facilityZoneCoverage.filter(
      (row) => row.Zone === primaryZone
    );

    const overlapPct = existingCoverage.length
      ? Math.max(
          ...existingCoverage.map((row) =>
            Number(row.Coverage_Share || 0)
          )
        ) * 100
      : 0;

    /* Capacity opportunity */
    const capacityGap = Math.max(
      0,
      dailyDemand * 1.10 -
        existingCapacity * Math.max(existingUtilization, 0.75)
    );

    const capacityNeedPct = dailyDemand
      ? clamp((capacityGap / dailyDemand) * 100, 0, 100)
      : 0;

    /* Individual score components */

    // More underserved customers = better expansion opportunity
    const customerScore = clamp(
      (serviceableCustomers / 500000) * 100,
      0,
      100
    );

    // High existing utilization indicates capacity pressure
    const capacityScore = clamp(
      existingUtilization * 100,
      0,
      100
    );

    // Faster delivery = better
    const deliveryScore = clamp(
      100 - Math.max(0, weightedDelivery - 15) * 5,
      0,
      100
    );

    // Lower launch cost = better
    const costScore = clamp(
      100 - ((Number(candidate.Launch_Cost_Lakh || 0) - 60) / 40) * 100,
      0,
      100
    );

    // More capacity = better
    const capacityAvailableScore = clamp(
      (Number(candidate.Daily_Capacity_Orders || 0) / 20000) * 100,
      0,
      100
    );

    /*
      Expansion score:
      customer opportunity + capacity pressure +
      delivery performance + economics + available capacity
    */
    const score =
      customerScore * 0.30 +
      capacityScore * 0.20 +
      deliveryScore * 0.20 +
      costScore * 0.10 +
      capacityAvailableScore * 0.10 +
      capacityNeedPct * 0.10;

    return {
      ...candidate,

      // Fields retained for the UI
      coverage: Math.round(coveragePct * 10) / 10,
      incrementalCoverage: Math.round(serviceableCustomers),
      overlap: Math.round(overlapPct * 10) / 10,
      delivery: Math.round(weightedDelivery * 10) / 10,
      cost: Number(candidate.Launch_Cost_Lakh || 0),

      // Analysis outputs
      dailyDemand: Math.round(dailyDemand),
      existingCapacity: Math.round(existingCapacity),
      existingUtilization: Math.round(existingUtilization * 100),
      capacityGap: Math.round(capacityGap),
      customerScore: Math.round(customerScore),
      capacityScore: Math.round(capacityScore),
      deliveryScore: Math.round(deliveryScore),
      costScore: Math.round(costScore),

      score: Math.round(score * 10) / 10,
    };
  });

  return results.sort((a, b) => b.score - a.score);
}

/* -------------------------------------------------------
   ASSORTMENT PLANNING
------------------------------------------------------- */

export function assortmentPlan(
  inputCategories = [],
  {
    budget = 50,
    storage = 80,
    demandMultiplier = 1,
    zone = "South Delhi",
  } = {}
) {
  /*
    The assortment engine uses the SKU catalog and observed
    availability data rather than precomputed recommendations.
  */

  const zoneAvailability = zoneCategoryAvailability.filter(
    (row) => row.Zone === zone
  );

  const categoryDemand = {};

  demandHistory
    .filter((row) => row.Zone === zone)
    .forEach((row) => {
      if (!categoryDemand[row.Category]) {
        categoryDemand[row.Category] = 0;
      }

      categoryDemand[row.Category] += Number(row.Orders || 0);
    });

  const categoryRows = {};

  skuCatalog.forEach((sku) => {
    if (!categoryRows[sku.Category]) {
      categoryRows[sku.Category] = [];
    }

    categoryRows[sku.Category].push(sku);
  });

  const ranked = Object.entries(categoryRows).map(
    ([category, skus]) => {
      const demand = categoryDemand[category] || 0;

      const availabilityRow = zoneAvailability.find(
        (row) => row.Category === category
      );

      const availability = availabilityRow
        ? Number(availabilityRow.Current_Availability_Pct || 0)
        : 0.90;

      const demandGap = 1 - availability;

      const averageStorage = average(
        skus.map((sku) => Number(sku.Storage_Units || 0))
      );

      const averageValue = average(
        skus.map((sku) => Number(sku.Avg_Item_Value || 0))
      );

      /*
        Category priority is driven by:
        - observed demand
        - current selection gap
        - storage efficiency
      */
      const score =
        Math.log10(Math.max(demand, 1)) * 20 +
        demandGap * 100 * 0.60 -
        averageStorage * 4;

      const recommendedSkus = Math.min(
        skus.length,
        Math.max(3, Math.round(demand / 9000))
      );

      const categoryStorage =
        recommendedSkus * averageStorage;

      const categoryBudget =
        recommendedSkus * averageValue / 10000;

      return {
        category,
        demand: Math.round(demand * demandMultiplier),
        availability: Math.round(availability * 100),
        gap: Math.round(demandGap * 100),
        space: Number(categoryStorage.toFixed(1)),
        budget: Number(categoryBudget.toFixed(1)),
        recommendedSkus,
        score: Number(score.toFixed(2)),
      };
    }
  );

  const sorted = ranked.sort((a, b) => b.score - a.score);

  let usedStorage = 0;
  let usedBudget = 0;
  const selected = [];

  for (const category of sorted) {
    if (
      usedStorage + category.space <= storage &&
      usedBudget + category.budget <= budget
    ) {
      selected.push(category);
      usedStorage += category.space;
      usedBudget += category.budget;
    }
  }

  const coverage = Math.min(
    96,
    Math.round(
      58 +
        selected.reduce(
          (sum, category) => sum + category.recommendedSkus,
          0
        ) *
          0.9
    )
  );

  const skuSlots = selected.reduce(
    (sum, category) => sum + category.recommendedSkus,
    0
  );

  return {
    selected,
    storage: Math.round(usedStorage),
    budget: Math.round(usedBudget * 10) / 10,
    coverage,
    skuSlots,
  };
}

/* -------------------------------------------------------
   CAPACITY PLANNING
------------------------------------------------------- */

export function capacityPlan(
  forecast,
  demandMultiplier = 1
) {
  const totalExistingCapacity = facilities.reduce(
    (sum, facility) =>
      sum + Number(facility.Daily_Capacity_Orders || 0),
    0
  );

  /*
    forecast.final is the final forecast week total.
    Convert it to an approximate daily demand before
    applying the peak factor.
  */
  const forecastDaily = forecast?.final
    ? forecast.final / 7
    : 0;

  const peak = Math.round(
    forecastDaily * 1.20 * demandMultiplier
  );

  const target = Math.round(
    totalExistingCapacity * 0.85
  );

  const gap = Math.max(
    0,
    peak - target
  );

  return {
    peak,
    target,
    gap,
    existingCapacity: totalExistingCapacity,
  };
}
