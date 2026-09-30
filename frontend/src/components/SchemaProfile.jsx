// File path: frontend/src/components/SchemaProfile.jsx
// Purpose: Renders the automatic dataset profile (schema detection,
// per-column inferred type, missing/unique counts, sample values) for
// ANY dataset — used on the Upload page's post-upload summary and on
// the generic Dashboard/Data Explorer for datasets that aren't
// Superstore-shaped. Never assumes specific column names.

import React from 'react';
import { Hash, Type, Calendar, ToggleLeft, Tag, Fingerprint, AlignLeft } from 'lucide-react';

const TYPE_META = {
  integer: { label: 'Integer', icon: Hash, className: 'bg-blue-50 text-blue-700' },
  float: { label: 'Decimal', icon: Hash, className: 'bg-blue-50 text-blue-700' },
  date: { label: 'Date', icon: Calendar, className: 'bg-purple-50 text-purple-700' },
  boolean: { label: 'Boolean', icon: ToggleLeft, className: 'bg-amber-50 text-amber-700' },
  categorical: { label: 'Categorical', icon: Tag, className: 'bg-emerald-50 text-emerald-700' },
  identifier: { label: 'Identifier', icon: Fingerprint, className: 'bg-slate-100 text-slate-700' },
  text: { label: 'Text', icon: AlignLeft, className: 'bg-slate-100 text-slate-700' },
};

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || TYPE_META.text;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
      <Icon size={12} /> {meta.label}
    </span>
  );
}

export default function SchemaProfile({ profile, fileName, fileType }) {
  if (!profile) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-x-8 gap-y-2">
        {fileName && (
          <div>
            <p className="text-xs text-slate-500">Dataset</p>
            <p className="text-sm font-semibold text-slate-900">{fileName}</p>
          </div>
        )}
        {fileType && (
          <div>
            <p className="text-xs text-slate-500">File type</p>
            <p className="text-sm font-semibold text-slate-900 uppercase">{fileType}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-slate-500">Rows</p>
          <p className="text-sm font-semibold text-slate-900">{profile.rowCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Columns</p>
          <p className="text-sm font-semibold text-slate-900">{profile.columnCount}</p>
        </div>
        {profile.potentialTargetColumn && (
          <div>
            <p className="text-xs text-slate-500">Likely key measure</p>
            <p className="text-sm font-semibold text-slate-900">{profile.potentialTargetColumn}</p>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left font-medium px-5 py-2.5">Column</th>
              <th className="text-left font-medium px-5 py-2.5">Detected type</th>
              <th className="text-left font-medium px-5 py-2.5">Missing</th>
              <th className="text-left font-medium px-5 py-2.5">Unique</th>
              <th className="text-left font-medium px-5 py-2.5">Sample values</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profile.columns.map((col) => (
              <tr key={col.name}>
                <td className="px-5 py-2.5 font-medium text-slate-900">{col.name}</td>
                <td className="px-5 py-2.5"><TypeBadge type={col.inferredType} /></td>
                <td className="px-5 py-2.5 text-slate-600">
                  {col.missingCount > 0 ? `${col.missingCount} (${col.missingPercentage}%)` : '—'}
                </td>
                <td className="px-5 py-2.5 text-slate-600">{col.uniqueCount.toLocaleString()}</td>
                <td className="px-5 py-2.5 text-slate-500 truncate max-w-xs">
                  {(col.sampleValues || []).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
