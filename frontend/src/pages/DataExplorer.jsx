// File path: frontend/src/pages/DataExplorer.jsx
// Purpose: Browsable, searchable, sortable table over a dataset's raw
// sales records, with category/region filters and CSV export.

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Search, Download, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, UploadCloud, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import DatasetSelector from '../components/DatasetSelector';
import GenericDataTable from '../components/GenericDataTable';
import useDatasets from '../hooks/useDatasets';
import analyticsService from '../services/analyticsService';
import explorerService from '../services/explorerService';

const COLUMNS = [
  { key: 'order_id', label: 'Order ID' },
  { key: 'order_date', label: 'Date' },
  { key: 'product', label: 'Product' },
  { key: 'category', label: 'Category' },
  { key: 'region', label: 'Region' },
  { key: 'customer', label: 'Customer' },
  { key: 'quantity', label: 'Qty' },
  { key: 'sales', label: 'Sales' },
  { key: 'profit', label: 'Profit' },
  { key: 'discount', label: 'Discount' },
];

export default function DataExplorer() {
  const { datasets, selectedId, selectDataset, loading: loadingDatasets } = useDatasets();
  const selectedDataset = datasets.find((d) => d.id === selectedId);
  const isGeneric = selectedDataset?.dataset_type === 'generic';

  const [filterOptions, setFilterOptions] = useState({ categories: [], regions: [] });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [sortBy, setSortBy] = useState('order_date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ records: [], pagination: { total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!selectedId || isGeneric) return;
    analyticsService.getFilterOptions(selectedId).then(setFilterOptions);
    setPage(1);
    setSearch('');
    setCategory('');
    setRegion('');
  }, [selectedId, isGeneric]);

  const loadRecords = useCallback(() => {
    if (!selectedId || isGeneric) return;
    setLoading(true);
    explorerService
      .getRecords(selectedId, { page, pageSize: 20, search, sortBy, sortDir, category, region })
      .then(setData)
      .finally(() => setLoading(false));
  }, [selectedId, isGeneric, page, search, sortBy, sortDir, category, region]);

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
    const dataset = datasets.find((d) => d.id === selectedId);
    setExporting(true);
    try {
      await explorerService.export(selectedId, { search, category, region }, dataset?.name);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const { pagination } = data;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Data Explorer</h1>
            <p className="text-slate-600 mt-1 text-sm">Search, sort, and export your dataset's records.</p>
          </div>
          {datasets.length > 0 && (
            <DatasetSelector datasets={datasets} selectedId={selectedId} onChange={selectDataset} />
          )}
        </div>

        {loadingDatasets ? (
          <p className="text-slate-500 mt-8 text-sm">Loading your datasets...</p>
        ) : datasets.length === 0 ? (
          <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <UploadCloud className="mx-auto text-brand-600 mb-3" size={36} />
            <h2 className="font-semibold text-slate-900 text-lg">Upload a dataset first</h2>
            <p className="text-slate-600 text-sm mt-1 mb-5">Explore your raw records here once you have data.</p>
            <Link to="/upload" className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700">
              Go to Upload
            </Link>
          </div>
        ) : (
          <>
            {isGeneric ? (
              <GenericDataTable datasetId={selectedId} datasetName={selectedDataset?.name} />
            ) : (
              <>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mt-6 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search order ID, product, customer..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                className="text-sm border border-slate-300 rounded-lg px-2 py-2"
              >
                <option value="">All categories</option>
                {filterOptions.categories?.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={region}
                onChange={(e) => { setRegion(e.target.value); setPage(1); }}
                className="text-sm border border-slate-300 rounded-lg px-2 py-2"
              >
                <option value="">All regions</option>
                {filterOptions.regions?.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 text-sm font-medium bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-60"
              >
                {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                Export CSV
              </button>
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
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none whitespace-nowrap hover:text-slate-900"
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          {sortBy === col.key && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.records.length === 0 && !loading ? (
                    <tr><td colSpan={COLUMNS.length} className="text-center text-slate-400 py-10">No records match your filters.</td></tr>
                  ) : (
                    data.records.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.order_id}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{new Date(row.order_date).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.product}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.category}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.region}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.customer}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.quantity}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">${Number(row.sales).toFixed(2)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">${Number(row.profit).toFixed(2)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{(Number(row.discount) * 100).toFixed(0)}%</td>
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
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
