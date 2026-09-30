// File path: backend/services/genericAnalyticsService.js
// Purpose: Computes statistics over an ARBITRARY dataset (any columns,
// any subject matter) using the profile built by datasetProfiler.js.
// Unlike services/analyticsService.js (which runs hand-written SQL
// against the fixed sales_records schema), this operates on the generic
// { profile, rows } representation in memory. Rows are already capped at
// config/limits.MAX_ROWS at ingestion time, so this stays bounded even
// for the largest accepted upload.

const { toNumber, toDate } = require('./valueCoercion');
const { MAX_CATEGORIES } = require('../config/limits');

function buildHistogram(values, min, max, binCount = 10) {
  if (min === max) return [{ binStart: min, binEnd: max, count: values.length }];
  const binWidth = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    binStart: Number((min + i * binWidth).toFixed(4)),
    binEnd: Number((min + (i + 1) * binWidth).toFixed(4)),
    count: 0,
  }));
  values.forEach((v) => {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / binWidth));
    bins[idx].count += 1;
  });
  return bins;
}

function numericStats(rawValues) {
  const values = rawValues.map(toNumber).filter((v) => v !== null).sort((a, b) => a - b);
  const count = values.length;
  if (count === 0) {
    return { count: 0, sum: 0, mean: null, median: null, min: null, max: null, stdDev: null, variance: null, q1: null, q3: null, outlierCount: 0, histogram: [] };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);

  const percentile = (p) => {
    const idx = (count - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return values[lower];
    return values[lower] + (values[upper] - values[lower]) * (idx - lower);
  };
  const median = percentile(0.5);
  const q1 = percentile(0.25);
  const q3 = percentile(0.75);
  const iqr = q3 - q1;
  const outlierCount = values.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length;

  return {
    count,
    sum: Number(sum.toFixed(4)),
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    min: values[0],
    max: values[count - 1],
    stdDev: Number(stdDev.toFixed(4)),
    variance: Number(variance.toFixed(4)),
    q1: Number(q1.toFixed(4)),
    q3: Number(q3.toFixed(4)),
    outlierCount,
    histogram: buildHistogram(values, values[0], values[count - 1]),
  };
}

function categoricalStats(rawValues) {
  const nonBlank = rawValues.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  const counts = new Map();
  nonBlank.forEach((v) => {
    const key = String(v).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, MAX_CATEGORIES);
  const otherCount = sorted.slice(MAX_CATEGORIES).reduce((acc, [, c]) => acc + c, 0);

  return {
    uniqueCount: counts.size,
    topCategories: top.map(([value, count]) => ({
      value,
      count,
      percentage: Number(((count / nonBlank.length) * 100).toFixed(2)),
    })),
    otherCount,
  };
}

// Buckets dates into a monthly trend (count of rows, plus sum/mean of an
// optional paired numeric column) — a sensible default granularity for
// "trends over time" that still works with as little as a few months of
// data, and degrades to daily buckets automatically for short date ranges.
function dateTrend(dateValues, numericValues) {
  const pairs = dateValues
    .map((d, i) => ({ date: toDate(d), value: numericValues ? toNumber(numericValues[i]) : null }))
    .filter((p) => p.date !== null);

  if (pairs.length === 0) return { granularity: 'month', buckets: [] };

  const spanMs = Math.max(...pairs.map((p) => p.date.getTime())) - Math.min(...pairs.map((p) => p.date.getTime()));
  const spanDays = spanMs / (1000 * 60 * 60 * 24);
  const granularity = spanDays <= 62 ? 'day' : spanDays <= 900 ? 'month' : 'year';

  const bucketKey = (d) => {
    if (granularity === 'day') return d.toISOString().slice(0, 10);
    if (granularity === 'month') return d.toISOString().slice(0, 7);
    return String(d.getFullYear());
  };

  const buckets = new Map();
  pairs.forEach(({ date, value }) => {
    const key = bucketKey(date);
    const existing = buckets.get(key) || { period: key, count: 0, sum: 0 };
    existing.count += 1;
    if (value !== null) existing.sum += value;
    buckets.set(key, existing);
  });

  const sortedBuckets = [...buckets.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
  return {
    granularity,
    buckets: sortedBuckets.map((b) => ({
      period: b.period,
      count: b.count,
      sum: Number(b.sum.toFixed(2)),
      average: Number((b.sum / b.count).toFixed(2)),
    })),
  };
}

function pearsonCorrelation(xs, ys) {
  const pairs = xs.map((x, i) => [toNumber(x), toNumber(ys[i])]).filter(([x, y]) => x !== null && y !== null);
  const n = pairs.length;
  if (n < 3) return null;

  const xMean = pairs.reduce((a, [x]) => a + x, 0) / n;
  const yMean = pairs.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0, xDenom = 0, yDenom = 0;
  pairs.forEach(([x, y]) => {
    num += (x - xMean) * (y - yMean);
    xDenom += (x - xMean) ** 2;
    yDenom += (y - yMean) ** 2;
  });
  if (xDenom === 0 || yDenom === 0) return null;
  return Number((num / Math.sqrt(xDenom * yDenom)).toFixed(4));
}

function correlationMatrix(rows, numericColumns) {
  const matrix = [];
  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      const colA = numericColumns[i];
      const colB = numericColumns[j];
      const r = pearsonCorrelation(rows.map((row) => row[colA]), rows.map((row) => row[colB]));
      if (r !== null) matrix.push({ columnA: colA, columnB: colB, correlation: r });
    }
  }
  return matrix.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

// Categorical x numeric group-by (e.g. average salary by department).
function groupByAggregate(rows, categoricalColumn, numericColumn, agg = 'mean') {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row[categoricalColumn];
    if (key === null || key === undefined || String(key).trim() === '') return;
    const value = toNumber(row[numericColumn]);
    if (value === null) return;
    const bucket = groups.get(key) || [];
    bucket.push(value);
    groups.set(key, bucket);
  });

  const results = [...groups.entries()].map(([group, values]) => {
    const sum = values.reduce((a, b) => a + b, 0);
    const aggregated = agg === 'sum' ? sum : agg === 'count' ? values.length : sum / values.length;
    return { group, value: Number(aggregated.toFixed(4)), count: values.length };
  });

  return results.sort((a, b) => b.value - a.value);
}

function suggestCharts(profile) {
  const suggestions = [];
  const { numericColumns, categoricalColumns, dateColumns } = profile;

  if (dateColumns.length > 0 && numericColumns.length > 0) {
    suggestions.push({ type: 'line', title: `${numericColumns[0]} over time`, x: dateColumns[0], y: numericColumns[0] });
  }
  if (categoricalColumns.length > 0 && numericColumns.length > 0) {
    suggestions.push({ type: 'bar', title: `${numericColumns[0]} by ${categoricalColumns[0]}`, x: categoricalColumns[0], y: numericColumns[0] });
  }
  if (numericColumns.length >= 2) {
    suggestions.push({ type: 'scatter', title: `${numericColumns[0]} vs ${numericColumns[1]}`, x: numericColumns[0], y: numericColumns[1] });
  }
  if (numericColumns.length >= 1) {
    suggestions.push({ type: 'histogram', title: `Distribution of ${numericColumns[0]}`, x: numericColumns[0] });
  }
  if (categoricalColumns.length > 0) {
    suggestions.push({ type: 'distribution', title: `${categoricalColumns[0]} breakdown`, x: categoricalColumns[0] });
  }
  if (numericColumns.length >= 3) {
    suggestions.push({ type: 'correlation_matrix', title: 'Correlation matrix', columns: numericColumns });
  }
  return suggestions;
}

function suggestKpis(profile, numericSummaries) {
  return profile.numericColumns.slice(0, 5).map((col) => ({
    column: col,
    label: col.replace(/_/g, ' '),
    sum: numericSummaries[col]?.sum,
    mean: numericSummaries[col]?.mean,
  }));
}

/**
 * Builds the full generic analytics summary for a dataset: per-column
 * numeric/categorical/date stats, correlations between numeric columns,
 * and chart/KPI suggestions based on the actual column types present.
 */
function buildFullSummary(profile, rows) {
  const numericSummaries = {};
  profile.numericColumns.forEach((col) => {
    numericSummaries[col] = numericStats(rows.map((r) => r[col]));
  });

  const categoricalSummaries = {};
  profile.categoricalColumns.forEach((col) => {
    categoricalSummaries[col] = categoricalStats(rows.map((r) => r[col]));
  });

  const dateSummaries = {};
  profile.dateColumns.forEach((col) => {
    const pairedNumeric = profile.numericColumns[0];
    dateSummaries[col] = dateTrend(
      rows.map((r) => r[col]),
      pairedNumeric ? rows.map((r) => r[pairedNumeric]) : null
    );
  });

  const correlations = profile.numericColumns.length >= 2 ? correlationMatrix(rows, profile.numericColumns) : [];

  const groupComparisons = [];
  if (profile.categoricalColumns.length > 0 && profile.numericColumns.length > 0) {
    groupComparisons.push({
      categoricalColumn: profile.categoricalColumns[0],
      numericColumn: profile.numericColumns[0],
      groups: groupByAggregate(rows, profile.categoricalColumns[0], profile.numericColumns[0], 'mean').slice(0, MAX_CATEGORIES),
    });
  }

  return {
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    numericStats: numericSummaries,
    categoricalStats: categoricalSummaries,
    dateTrends: dateSummaries,
    correlations,
    groupComparisons,
    suggestedCharts: suggestCharts(profile),
    suggestedKpis: suggestKpis(profile, numericSummaries),
  };
}

module.exports = {
  numericStats,
  categoricalStats,
  dateTrend,
  correlationMatrix,
  groupByAggregate,
  suggestCharts,
  buildFullSummary,
};
