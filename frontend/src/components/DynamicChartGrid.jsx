// File path: frontend/src/components/DynamicChartGrid.jsx
// Purpose: Renders visualizations chosen from the ACTUAL column types
// present in a dataset (see backend genericAnalyticsService.buildFullSummary)
// — never assumes sales/profit/region. A date + numeric column pair gets
// a trend line; a categorical + numeric pair gets a group bar chart; a
// categorical column alone gets a frequency breakdown; a numeric column
// alone gets a histogram; 2+ numeric columns get a ranked correlation
// list. Any section with no supporting data is simply omitted.

import React from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

function ChartCard({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="font-semibold text-slate-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ message = 'Not enough data to chart this yet.' }) {
  return <p className="text-sm text-slate-400 py-10 text-center">{message}</p>;
}

function humanize(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function TrendChart({ column, trend }) {
  if (!trend || trend.buckets.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={trend.buckets} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <Tooltip />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="count" name="Row count" stroke="#3c54e0" strokeWidth={2.5} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="sum" name={`Sum`} stroke="#10b981" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function GroupBarChart({ comparison }) {
  if (!comparison || comparison.groups.length === 0) return <EmptyState />;
  const data = comparison.groups.slice(0, 12);
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis type="category" dataKey="group" tick={{ fontSize: 12 }} stroke="#94a3b8" width={130} />
        <Tooltip />
        <Bar dataKey="value" name={humanize(comparison.numericColumn)} fill="#3c54e0" radius={[4, 4, 4, 4]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoryChart({ column, stats }) {
  if (!stats || stats.topCategories.length === 0) return <EmptyState />;
  const data = stats.topCategories.slice(0, 10);
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis type="category" dataKey="value" tick={{ fontSize: 12 }} stroke="#94a3b8" width={130} />
        <Tooltip />
        <Bar dataKey="count" name="Count" fill="#f59e0b" radius={[4, 4, 4, 4]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HistogramChart({ column, stats }) {
  if (!stats || !stats.histogram || stats.histogram.length === 0) return <EmptyState />;
  const data = stats.histogram.map((b) => ({ ...b, label: b.binStart.toFixed(1) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
        <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <Tooltip />
        <Bar dataKey="count" name="Frequency" fill="#3c54e0" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CorrelationList({ correlations }) {
  if (!correlations || correlations.length === 0) return <EmptyState message="Need at least two numeric columns to compute correlations." />;
  return (
    <div className="divide-y divide-slate-100">
      {correlations.slice(0, 8).map((c) => {
        const strength = Math.abs(c.correlation);
        const barColor = strength > 0.6 ? '#3c54e0' : strength > 0.3 ? '#f59e0b' : '#cbd5e1';
        return (
          <div key={`${c.columnA}-${c.columnB}`} className="py-3 flex items-center gap-4">
            <div className="w-48 shrink-0 text-sm text-slate-700 truncate">
              {humanize(c.columnA)} vs {humanize(c.columnB)}
            </div>
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full"
                style={{ width: `${strength * 100}%`, backgroundColor: barColor }}
              />
            </div>
            <div className="w-14 text-right text-sm font-medium text-slate-900">{c.correlation.toFixed(2)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function DynamicChartGrid({ profile, summary }) {
  if (!profile || !summary) return null;

  const dateCol = (profile.dateColumns || [])[0];
  const trend = dateCol ? summary.dateTrends?.[dateCol] : null;

  const comparison = summary.groupComparisons?.[0];
  const catCol = (profile.categoricalColumns || [])[0];
  const catStats = catCol ? summary.categoricalStats?.[catCol] : null;

  const numCol = (profile.numericColumns || [])[0];
  const numStats = numCol ? summary.numericStats?.[numCol] : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {dateCol && (
          <ChartCard title={`${humanize(dateCol)} trend (${trend?.granularity || 'auto'})`}>
            <TrendChart column={dateCol} trend={trend} />
          </ChartCard>
        )}
        {comparison && (
          <ChartCard title={`Average ${humanize(comparison.numericColumn)} by ${humanize(comparison.categoricalColumn)}`}>
            <GroupBarChart comparison={comparison} />
          </ChartCard>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {catCol && (
          <ChartCard title={`${humanize(catCol)} breakdown`}>
            <CategoryChart column={catCol} stats={catStats} />
          </ChartCard>
        )}
        {numCol && (
          <ChartCard title={`Distribution of ${humanize(numCol)}`}>
            <HistogramChart column={numCol} stats={numStats} />
          </ChartCard>
        )}
      </div>

      {(profile.numericColumns || []).length >= 2 && (
        <ChartCard title="Strongest correlations">
          <CorrelationList correlations={summary.correlations} />
        </ChartCard>
      )}

      {!dateCol && !comparison && !catCol && !numCol && (
        <ChartCard title="Visualizations">
          <EmptyState message="Not enough structured columns were detected to suggest a chart for this dataset." />
        </ChartCard>
      )}
    </div>
  );
}
