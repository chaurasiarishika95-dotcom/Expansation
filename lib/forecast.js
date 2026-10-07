import demandHistory from "../data/demand_history.json";

function getFilteredHistory(zone) {
  if (!zone || zone === "ALL") {
    return demandHistory;
  }

  return demandHistory.filter((row) => row.Zone === zone);
}

function groupByDate(rows) {
  const grouped = {};

  rows.forEach((row) => {
    const date = row.Date;

    if (!grouped[date]) {
      grouped[date] = 0;
    }

    grouped[date] += Number(row.Orders || 0);
  });

  return grouped;
}

function calculateTrend(dailyData) {
  const dates = Object.keys(dailyData).sort();

  if (dates.length < 28) {
    return 1;
  }

  const recentDates = dates.slice(-14);
  const previousDates = dates.slice(-28, -14);

  const recentAverage =
    recentDates.reduce((sum, date) => sum + dailyData[date], 0) /
    recentDates.length;

  const previousAverage =
    previousDates.reduce((sum, date) => sum + dailyData[date], 0) /
    previousDates.length;

  if (!previousAverage) {
    return 1;
  }

  // Limit the effect of the observed trend so a noisy synthetic
  // dataset does not create unrealistic forecasts.
  const rawTrend = recentAverage / previousAverage;

  return Math.max(0.90, Math.min(1.10, rawTrend));
}

function calculateDayOfWeekFactors(rows) {
  const byDay = {};
  const overall = [];

  rows.forEach((row) => {
    const date = new Date(row.Date);
    const day = date.getDay();

    if (!byDay[day]) {
      byDay[day] = [];
    }

    byDay[day].push(Number(row.Orders || 0));
    overall.push(Number(row.Orders || 0));
  });

  const overallAverage =
    overall.reduce((sum, value) => sum + value, 0) /
    Math.max(overall.length, 1);

  const factors = {};

  for (let day = 0; day < 7; day++) {
    const values = byDay[day] || [];

    if (!values.length || !overallAverage) {
      factors[day] = 1;
      continue;
    }

    const average =
      values.reduce((sum, value) => sum + value, 0) / values.length;

    factors[day] = Math.max(
      0.90,
      Math.min(1.10, average / overallAverage)
    );
  }

  return factors;
}

export function forecastDemand({
  baseline,
  demandMultiplier = 1,
  zone = "ALL",
  horizonDays = 30,
} = {}) {
  const rows = getFilteredHistory(zone);
  const dailyData = groupByDate(rows);

  const dates = Object.keys(dailyData).sort();

  if (!dates.length) {
    return {
      weekly: [],
      final: 0,
      low: 0,
      high: 0,
      confidence: 0,
    };
  }

  // Use the latest 28 days of actual synthetic demand.
  const recentDates = dates.slice(-28);

  const recentAverage =
    recentDates.reduce((sum, date) => sum + dailyData[date], 0) /
    recentDates.length;

  // The baseline parameter is retained for backwards compatibility,
  // but the application now derives baseline demand from the dataset.
  const calculatedBaseline = Math.round(recentAverage);

  const trendFactor = calculateTrend(dailyData);
  const dayFactors = calculateDayOfWeekFactors(
    rows.filter((row) => recentDates.includes(row.Date))
  );

  const lastDate = new Date(dates[dates.length - 1]);

  const projectedDaily = [];

  for (let i = 1; i <= horizonDays; i++) {
    const futureDate = new Date(lastDate);
    futureDate.setDate(lastDate.getDate() + i);

    const dayOfWeek = futureDate.getDay();
    const seasonalityFactor = dayFactors[dayOfWeek] || 1;

    const projectedOrders = Math.round(
      calculatedBaseline *
        trendFactor *
        seasonalityFactor *
        demandMultiplier
    );

    projectedDaily.push({
      date: futureDate.toISOString().split("T")[0],
      orders: projectedOrders,
    });
  }

  // Convert the daily forecast into four planning weeks.
  const weekly = [];

  for (let week = 0; week < 4; week++) {
    const start = week * 7;
    const end = Math.min(start + 7, projectedDaily.length);

    const orders = projectedDaily
      .slice(start, end)
      .reduce((sum, day) => sum + day.orders, 0);

    weekly.push({
      week: `W${week + 1}`,
      orders,
    });
  }

  const final = weekly[weekly.length - 1]?.orders || 0;

  // Confidence is based on how stable the historical demand is.
  const historicalValues = recentDates.map((date) => dailyData[date]);

  const mean =
    historicalValues.reduce((sum, value) => sum + value, 0) /
    historicalValues.length;

  const variance =
    historicalValues.reduce(
      (sum, value) => sum + Math.pow(value - mean, 2),
      0
    ) / historicalValues.length;

  const standardDeviation = Math.sqrt(variance);

  const coefficientOfVariation = mean
    ? standardDeviation / mean
    : 1;

  const confidence = Math.max(
    65,
    Math.min(
      92,
      Math.round(90 - coefficientOfVariation * 100)
    )
  );

  return {
    weekly,
    final,
    low: Math.round(final * 0.935),
    high: Math.round(final * 1.065),
    confidence,

    // Additional information for the UI / decision engine
    baseline: calculatedBaseline,
    trendFactor: Number(trendFactor.toFixed(3)),
    demandMultiplier,
    zone,
    historicalDaysUsed: recentDates.length,
  };
}

export const forecastMethod =
  "Forecast derived from synthetic demand history using recent baseline demand, observed trend and day-of-week seasonality. The forecasting layer can later be replaced by a production time-series or ML model without changing downstream decision logic.";
