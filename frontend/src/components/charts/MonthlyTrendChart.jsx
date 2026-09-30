// File path: frontend/src/components/charts/MonthlyTrendChart.jsx
// Purpose: Line chart of monthly sales vs profit, from /api/analytics/sales.

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const currencyFormatter = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export default function MonthlyTrendChart({ data, title = 'Monthly Sales & Profit Trend' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="font-semibold text-slate-900 mb-4">{title}</h3>
      {(!data || data.length === 0) ? (
        <p className="text-sm text-slate-400 py-10 text-center">No data for the selected filters.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => currencyFormatter(value)} />
            <Legend />
            <Line type="monotone" dataKey="sales" name="Sales" stroke="#3c54e0" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
