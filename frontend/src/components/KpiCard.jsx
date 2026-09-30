// File path: frontend/src/components/KpiCard.jsx
// Purpose: A single KPI stat card used across Dashboard and Analytics.

import React from 'react';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);

export default function KpiCard({ icon: Icon, label, value, format = 'number', accent = 'brand' }) {
  const display =
    format === 'currency' ? formatCurrency(value) : new Intl.NumberFormat('en-US').format(value || 0);

  const accentStyles = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accentStyles[accent]}`}>
            <Icon size={18} />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-2">{display}</p>
    </div>
  );
}
