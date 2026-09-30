// File path: frontend/src/components/charts/ProfitVsSalesChart.jsx
// Purpose: Scatter plot of profit vs. sales per order — makes it easy to
// spot high-revenue-but-low-margin (or loss-making) orders at a glance.

import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const currencyFormatter = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export default function ProfitVsSalesChart({ data }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="font-semibold text-slate-900 mb-1">Profit vs Sales (per order)</h3>
      <p className="text-xs text-slate-500 mb-4">Points below the zero line are loss-making orders.</p>
      {(!data || data.length === 0) ? (
        <p className="text-sm text-slate-400 py-10 text-center">No data for the selected filters.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number" dataKey="sales" name="Sales"
              tick={{ fontSize: 12 }} stroke="#94a3b8"
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              type="number" dataKey="profit" name="Profit"
              tick={{ fontSize: 12 }} stroke="#94a3b8"
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <ReferenceLine y={0} stroke="#f87171" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(value, name) => [currencyFormatter(value), name]}
            />
            <Scatter data={data} fill="#3c54e0" fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
