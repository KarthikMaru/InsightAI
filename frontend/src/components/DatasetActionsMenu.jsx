// File path: frontend/src/components/DatasetActionsMenu.jsx
// Purpose: The action menu for a row in the dataset management list —
// every action the "Dataset Management" requirement asks for, in one
// place: Open, Edit, Analyze, AI Insights, AI Assistant, Export (in any
// supported format), Duplicate (independent copy), Rename, Delete.

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  MoreVertical, FolderOpen, Pencil, LineChart, Sparkles, MessageSquare,
  Download, Copy, Type, Trash2, Loader2, ChevronRight,
} from 'lucide-react';
import datasetService from '../services/datasetService';
import genericService from '../services/genericService';

const SELECTED_DATASET_KEY = 'insightai_selected_dataset';

const EXPORT_FORMATS = [
  { format: 'csv', label: 'CSV' },
  { format: 'json', label: 'JSON' },
  { format: 'xlsx', label: 'Excel (.xlsx)' },
  { format: 'sql', label: 'SQL' },
  { format: 'xml', label: 'XML' },
];

export default function DatasetActionsMenu({ dataset, onChanged, onDeleted }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) { setOpen(false); setExportOpen(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openWith = (path) => {
    localStorage.setItem(SELECTED_DATASET_KEY, String(dataset.id));
    navigate(path);
    setOpen(false);
  };

  const handleRename = async () => {
    setOpen(false);
    const newName = window.prompt('Rename dataset:', dataset.name);
    if (!newName || newName.trim() === dataset.name) return;
    try {
      await datasetService.rename(dataset.id, newName.trim());
      toast.success('Dataset renamed');
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not rename dataset');
    }
  };

  const handleDuplicate = async () => {
    setOpen(false);
    setBusy(true);
    try {
      await datasetService.duplicate(dataset.id);
      toast.success('Dataset duplicated');
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not duplicate dataset');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (format) => {
    setExportOpen(false);
    setOpen(false);
    try {
      if (dataset.dataset_type === 'generic') {
        await genericService.exportAs(dataset.id, format, dataset.name);
      } else {
        toast.error('Export in this format is available for general-purpose datasets. Use CSV export from Data Explorer for sales datasets.');
      }
    } catch (err) {
      toast.error('Export failed');
    }
  };

  const isGeneric = dataset.dataset_type === 'generic' && dataset.status === 'ready';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        title="Dataset actions"
      >
        {busy ? <Loader2 className="animate-spin" size={18} /> : <MoreVertical size={18} />}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 text-sm">
          <button onClick={() => openWith('/dashboard')} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"><FolderOpen size={15} /> Open</button>
          {isGeneric && <button onClick={() => openWith(`/datasets/${dataset.id}/edit`)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"><Pencil size={15} /> Edit</button>}
          <button onClick={() => openWith('/analytics')} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"><LineChart size={15} /> Analyze</button>
          <button onClick={() => openWith('/ai-insights')} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"><Sparkles size={15} /> AI Insights</button>
          <button onClick={() => openWith('/ai-assistant')} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"><MessageSquare size={15} /> AI Assistant</button>

          <div className="border-t border-slate-100 my-1" />

          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 text-left"
            >
              <span className="flex items-center gap-2"><Download size={15} /> Export</span>
              <ChevronRight size={13} />
            </button>
            {exportOpen && (
              <div className="absolute right-full top-0 mr-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                {EXPORT_FORMATS.map((f) => (
                  <button key={f.format} onClick={() => handleExport(f.format)} className="w-full px-3 py-2 hover:bg-slate-50 text-left">{f.label}</button>
                ))}
              </div>
            )}
          </div>

          <button onClick={handleDuplicate} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"><Copy size={15} /> Duplicate</button>
          <button onClick={handleRename} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"><Type size={15} /> Rename</button>

          <div className="border-t border-slate-100 my-1" />
          <button onClick={() => { setOpen(false); onDeleted(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600 text-left"><Trash2 size={15} /> Delete</button>
        </div>
      )}
    </div>
  );
}
