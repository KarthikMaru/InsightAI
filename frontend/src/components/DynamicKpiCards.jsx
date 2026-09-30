// File path: frontend/src/components/DynamicKpiCards.jsx
// Purpose: Generates KPI cards for ANY dataset based on its actual
// numeric columns — no hardcoded "Total Sales / Total Profit / Total
// Orders". If the dataset has `salary`, it shows salary stats; if it has
// `temperature`, it shows temperature stats; if it has no numeric
// columns at all, it falls back to row/column counts only.

import React from 'react';
import { Hash, Layers, Rows3, Columns3 } from 'lucide-react';
import KpiCard from './KpiCard';

const ACCENTS = ['brand', 'emerald', 'amber', 'rose'];

function humanize(columnName) {
  return columnName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DynamicKpiCards({ profile, numericStats }) {
  if (!profile) return null;

  const numericCards = (profile.numericColumns || []).slice(0, 4).map((col, i) => {
    const stats = numericStats?.[col];
    if (!stats || stats.count === 0) return null;
    return (
      <KpiCard
        key={col}
        icon={Hash}
        label={`Average ${humanize(col)}`}
        value={stats.mean}
        accent={ACCENTS[i % ACCENTS.length]}
      />
    );
  }).filter(Boolean);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard icon={Rows3} label="Total Rows" value={profile.rowCount} accent="brand" />
      <KpiCard icon={Columns3} label="Total Columns" value={profile.columnCount} accent="emerald" />
      {numericCards}
      {numericCards.length === 0 && (
        <KpiCard icon={Layers} label="Categorical Columns" value={(profile.categoricalColumns || []).length} accent="amber" />
      )}
    </div>
  );
}
