// File path: frontend/src/pages/CreateDataset.jsx
// Purpose: "Create Dataset" workflow — the second of the three ways to
// get a dataset into InsightAI (Upload / Create / Generate with AI).
// The user names the dataset and declares its columns (name + type);
// it's created with zero rows and the user lands in the Dataset Editor
// to start adding data. Uses the exact same generic dataset tables as
// an upload, so it's immediately usable everywhere else in the app.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Trash2, Loader2, ArrowRight, LayoutGrid } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import editService, { EDITABLE_TYPES } from '../services/editService';

let nextRowKey = 1;

export default function CreateDataset() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [columns, setColumns] = useState([
    { key: nextRowKey++, name: '', dataType: 'Text' },
    { key: nextRowKey++, name: '', dataType: 'Text' },
  ]);
  const [saving, setSaving] = useState(false);

  const updateColumn = (key, field, value) => {
    setColumns((cols) => cols.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  };

  const addColumnRow = () => setColumns((cols) => [...cols, { key: nextRowKey++, name: '', dataType: 'Text' }]);
  const removeColumnRow = (key) => setColumns((cols) => (cols.length > 1 ? cols.filter((c) => c.key !== key) : cols));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Give your dataset a name');
    const cleanColumns = columns.map((c) => ({ name: c.name.trim(), dataType: c.dataType })).filter((c) => c.name);
    if (cleanColumns.length === 0) return toast.error('Add at least one column');
    const names = cleanColumns.map((c) => c.name.toLowerCase());
    if (new Set(names).size !== names.length) return toast.error('Column names must be unique');

    setSaving(true);
    try {
      const result = await editService.createManual(name.trim(), cleanColumns);
      toast.success('Dataset created — start adding rows!');
      navigate(`/datasets/${result.dataset.id}/edit`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not create dataset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="flex items-center gap-3">
          <LayoutGrid className="text-brand-600" size={26} />
          <h1 className="text-2xl font-bold text-slate-900">Create Dataset</h1>
        </div>
        <p className="text-slate-600 mt-1">
          Define a dataset from scratch — give it a name and describe its columns. You can add rows and edit
          everything afterward in the Dataset Editor.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Dataset Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Employees"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Columns</label>
              <button
                type="button"
                onClick={addColumnRow}
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                <Plus size={16} /> Add Column
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_180px_40px] bg-slate-50 text-xs font-medium text-slate-500 px-4 py-2">
                <span>Column Name</span>
                <span>Data Type</span>
                <span />
              </div>
              <div className="divide-y divide-slate-100">
                {columns.map((col) => (
                  <div key={col.key} className="grid grid-cols-[1fr_180px_40px] items-center gap-2 px-4 py-2">
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => updateColumn(col.key, 'name', e.target.value)}
                      placeholder="e.g. employee_id"
                      className="px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <select
                      value={col.dataType}
                      onChange={(e) => updateColumn(col.key, 'dataType', e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {EDITABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeColumnRow(col.key)}
                      className="text-slate-400 hover:text-red-600 justify-self-center"
                      title="Remove column"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
            {saving ? 'Creating...' : 'Create Dataset & Start Editing'}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
