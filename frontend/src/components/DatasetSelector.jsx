// File path: frontend/src/components/DatasetSelector.jsx
// Purpose: Dropdown to pick which dataset the Dashboard/Analytics page
// should analyze. Persists the last-picked dataset in localStorage so
// it's remembered across visits.

import React from 'react';
import { Database } from 'lucide-react';

export default function DatasetSelector({ datasets, selectedId, onChange }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
      <Database size={16} className="text-slate-400" />
      <select
        value={selectedId || ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-sm font-medium text-slate-800 bg-transparent focus:outline-none"
      >
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.row_count} rows)
          </option>
        ))}
      </select>
    </div>
  );
}
