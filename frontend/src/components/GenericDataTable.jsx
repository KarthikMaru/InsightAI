// File path: frontend/src/components/GenericDataTable.jsx
// Purpose: The Data Explorer view for a general-purpose ('generic')
// dataset — builds its table columns dynamically from whatever the
// dataset's profile says, instead of the hardcoded Order ID/Product/
// Category/... columns used for sales-shaped datasets. Self-contained:
// owns its own fetch/sort/search/pagination/export state so
// pages/DataExplorer.jsx can simply swap it in for a generic dataset.

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, Download, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Loader2, Pencil } from 'lucide-react';
import genericService from '../services/genericService';

function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-300">—</span>;
  if (type === 'date') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (type === 'boolean') return String(value);
  return String(value);
}

export default function GenericDataTable({ datasetId, datasetName }) {
  const [columns, setColumns] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ records: [], pagination: { total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setPage(1);
    setSearch('');
    setSortBy(null);
  }, [datasetId]);

  const loadRecords = useCallback(() => {
    if (!datasetId) return;
    setLoading(true);
    genericService
      .getRecords(datasetId, { page, pageSize: 20, search, sortBy, sortDir })
      .then((res) => {
        setColumns(res.columns);
        setData(res);
      })
      .catch(() => toast.error('Could not load dataset records'))
      .finally(() => setLoading(false));
  }, [datasetId, page, search, sortBy, sortDir]);

  useEffect(() => {
    const timeout = setTimeout(loadRecords, 300); // debounce search typing
    return () => clearTimeout(timeout);
  }, [loadRecords]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await genericService.export(datasetId, { search }, datasetName);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const { pagination } = data;

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-xl p-4 mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search this dataset..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 text-sm font-medium bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-60"
        >
          {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
          Export CSV
        </button>
        <Link
          to={`/datasets/${datasetId}/edit`}
          className="flex items-center gap-2 text-sm font-medium border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50"
        >
          <Pencil size={16} /> Edit Dataset
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl mt-4 overflow-x-auto relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
            <Loader2 className="animate-spin text-brand-600" size={24} />
          </div>
        )}
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none whitespace-nowrap hover:text-slate-900"
                >
                  <span className="flex items-center gap-1">
                    {col.name}
                    {sortBy === col.name && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.records.length === 0 && !loading ? (
              <tr><td colSpan={columns.length || 1} className="text-center text-slate-400 py-10">No records match your search.</td></tr>
            ) : (
              data.records.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  {columns.map((col) => (
                    <td key={col.name} className="px-4 py-2.5 whitespace-nowrap">
                      {formatCell(row[col.name], col.inferredType)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
        <p>{pagination.total} total records</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span>Page {page} of {pagination.totalPages || 1}</span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages || 1, p + 1))}
            disabled={page >= (pagination.totalPages || 1)}
            className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
