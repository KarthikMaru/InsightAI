// File path: frontend/src/components/charts/BreakdownBarChart.jsx
// Purpose: Generic bar chart used for Category, Region, Top Products, and
// Top Customers breakdowns — all share the same "name + sales(+profit)"
// shape, just with different field names.

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const currencyFormatter = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export default function BreakdownBarChart({
  data,
  nameKey,
  title,
  layout = 'vertical', // 'vertical' = horizontal bars (good for long names)
  colorSales = '#3c54e0',
  colorProfit = '#10b981',
  showProfit = true,
}) {
  const isHorizontalBars = layout === 'vertical';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="font-semibold text-slate-900 mb-4">{title}</h3>
      {(!data || data.length === 0) ? (
        <p className="text-sm text-slate-400 py-10 text-center">No data for the selected filters.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
          <BarChart
            data={data}
            layout={isHorizontalBars ? 'vertical' : 'horizontal'}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {isHorizontalBars ? (
              <>
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#94a3b8" width={130} />
              </>
            ) : (
              <>
                <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              </>
            )}
            <Tooltip formatter={(value) => currencyFormatter(value)} />
            <Legend />
            <Bar dataKey="total_sales" name="Sales" fill={colorSales} radius={[4, 4, 4, 4]} />
            {showProfit && <Bar dataKey="total_profit" name="Profit" fill={colorProfit} radius={[4, 4, 4, 4]} />}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
