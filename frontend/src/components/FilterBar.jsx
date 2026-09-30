// File path: frontend/src/components/FilterBar.jsx
// Purpose: Date range + category + region filter controls, used on the
// Analytics page. Options are populated from /api/analytics/filters so
// only values that actually exist in the selected dataset are offered.

import React from 'react';
import { Filter, X } from 'lucide-react';

export default function FilterBar({ filters, onChange, options, onClear }) {
  const hasActiveFilters = filters.startDate || filters.endDate || filters.category || filters.region;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm font-medium mr-2">
        <Filter size={16} /> Filters
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">From</label>
        <input
          type="date"
          value={filters.startDate || ''}
          onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
          className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">To</label>
        <input
          type="date"
          value={filters.endDate || ''}
          onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
          className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Category</label>
        <select
          value={filters.category || ''}
          onChange={(e) => onChange({ ...filters, category: e.target.value || null })}
          className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          {options.categories?.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Region</label>
        <select
          value={filters.region || ''}
          onChange={(e) => onChange({ ...filters, region: e.target.value || null })}
          className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All regions</option>
          {options.regions?.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-600 ml-auto"
        >
          <X size={14} /> Clear filters
        </button>
      )}
    </div>
  );
}
