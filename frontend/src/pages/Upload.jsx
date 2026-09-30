// File path: frontend/src/pages/Upload.jsx
// Purpose: Lets the user drag-and-drop or browse for a dataset file
// (CSV, JSON, Excel, XML, or SQL), upload it, see the automatically
// generated schema/profile, or load the bundled sample dataset instead.
// Also lists previously uploaded datasets with delete + open.
//
// UPDATED: no longer CSV-only, and no longer states a required column
// list — any dataset is accepted and profiled automatically. The
// post-upload panel now shows the full detected schema (via
// SchemaProfile) instead of just a row count.

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  UploadCloud, FileSpreadsheet, Sparkles, CheckCircle2,
  AlertTriangle, Loader2, ArrowRight, Info, LayoutGrid,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import SchemaProfile from '../components/SchemaProfile';
import DatasetActionsMenu from '../components/DatasetActionsMenu';
import datasetService, { ACCEPTED_UPLOAD_EXTENSIONS } from '../services/datasetService';

function StatusBadge({ status }) {
  const styles = {
    ready: 'bg-emerald-50 text-emerald-700',
    processing: 'bg-amber-50 text-amber-700',
    failed: 'bg-red-50 text-red-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function DatasetTypeBadge({ type }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full ${
        type === 'sales' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
      }`}
    >
      {type === 'sales' ? 'Sales schema' : 'General dataset'}
    </span>
  );
}

export default function Upload() {
  const [datasets, setDatasets] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [samplingLoading, setSamplingLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const fileInputRef = useRef(null);

  const loadDatasets = async () => {
    setLoadingList(true);
    try {
      const list = await datasetService.list();
      setDatasets(list);
    } catch (err) {
      toast.error('Could not load your datasets');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setLastResult(null);
    try {
      const result = await datasetService.upload(file);
      setLastResult(result);
      toast.success(`Uploaded ${result.rowsInserted.toLocaleString()} rows successfully`);
      loadDatasets();
    } catch (err) {
      const message = err.response?.data?.message || 'Upload failed';
      toast.error(message);
      setLastResult({ error: message });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleUseSample = async () => {
    setSamplingLoading(true);
    setLastResult(null);
    try {
      const result = await datasetService.useSample();
      setLastResult(result);
      toast.success('Sample dataset loaded!');
      loadDatasets();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load sample dataset');
    } finally {
      setSamplingLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this dataset? This cannot be undone.')) return;
    try {
      await datasetService.remove(id);
      toast.success('Dataset deleted');
      loadDatasets();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete dataset');
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Upload Dataset</h1>
        <p className="text-slate-600 mt-1">
          Upload a dataset to automatically profile, analyze and visualize your data.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-6 border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            dragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_UPLOAD_EXTENSIONS}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-brand-600">
              <Loader2 className="animate-spin" size={32} />
              <p className="font-medium">Uploading and processing your file...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-600">
              <UploadCloud size={32} className="text-brand-600" />
              <p className="font-medium text-slate-800">Drag & drop your file here, or click to browse</p>
              <p className="text-xs text-slate-500">
                Accepted formats: CSV · JSON · Excel (.xlsx / .xls) · XML · SQL
              </p>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                <Info size={12} /> Your dataset's schema is detected automatically — no fixed columns required.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400">OR</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <button
          onClick={handleUseSample}
          disabled={samplingLoading}
          className="mt-4 w-full flex items-center justify-center gap-2 border border-brand-200 bg-brand-50 text-brand-700 font-medium py-3 rounded-xl hover:bg-brand-100 disabled:opacity-60"
        >
          {samplingLoading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          {samplingLoading ? 'Loading sample data...' : 'Explore with sample dataset (Superstore, 3,000 rows)'}
        </button>

        <Link
          to="/datasets/create"
          className="mt-3 w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-700 font-medium py-3 rounded-xl hover:bg-slate-50"
        >
          <LayoutGrid size={18} /> Create a dataset from scratch
        </Link>

        <Link
          to="/datasets/generate"
          className="mt-3 w-full flex items-center justify-center gap-2 border border-purple-200 bg-purple-50 text-purple-700 font-medium py-3 rounded-xl hover:bg-purple-100"
        >
          <Sparkles size={18} /> Generate a dataset with AI
        </Link>

        {/* Result panel */}
        {lastResult && (
          <div className="mt-6 space-y-4">
            {lastResult.error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex items-start gap-3">
                <AlertTriangle className="text-red-600 mt-0.5" size={20} />
                <div>
                  <p className="font-medium text-red-800">Upload failed</p>
                  <p className="text-sm text-red-700 mt-1">{lastResult.error}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3">
                  <CheckCircle2 className="text-emerald-600 mt-0.5" size={20} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-emerald-800">
                        {lastResult.dataset?.name} — {lastResult.rowsInserted.toLocaleString()} rows inserted
                      </p>
                      <DatasetTypeBadge type={lastResult.datasetType} />
                    </div>
                    {lastResult.truncated && (
                      <p className="text-sm text-emerald-700 mt-1">
                        The file had {lastResult.totalRowsSeen.toLocaleString()} rows/columns; it was truncated to the maximum supported size for analysis.
                      </p>
                    )}
                    {lastResult.rowsRejected > 0 && (
                      <p className="text-sm text-emerald-700 mt-1">
                        {lastResult.rowsRejected} row(s) were skipped due to validation issues (e.g. missing values or bad dates).
                      </p>
                    )}
                  </div>
                </div>

                {lastResult.profile && (
                  <>
                    <h3 className="text-sm font-semibold text-slate-700">Detected schema & data quality</h3>
                    <SchemaProfile profile={lastResult.profile} fileName={lastResult.dataset?.name} fileType={lastResult.fileType} />
                  </>
                )}

                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700"
                  >
                    Open Dataset <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/ai-insights"
                    className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 font-medium px-5 py-2.5 rounded-lg hover:bg-slate-50"
                  >
                    Generate AI Insights
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {/* Dataset list */}
        <h2 className="text-lg font-semibold text-slate-900 mt-10 mb-3">Your datasets</h2>
        {loadingList ? (
          <p className="text-slate-500 text-sm">Loading datasets...</p>
        ) : datasets.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500">
            No datasets yet. Upload a file or load the sample dataset above to get started.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Name</th>
                  <th className="text-left font-medium px-5 py-2.5">Source</th>
                  <th className="text-left font-medium px-5 py-2.5">Rows</th>
                  <th className="text-left font-medium px-5 py-2.5">Status</th>
                  <th className="text-left font-medium px-5 py-2.5">Created</th>
                  <th className="text-left font-medium px-5 py-2.5">Last Updated</th>
                  <th className="px-5 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {datasets.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="text-brand-600 shrink-0" size={18} />
                        <div>
                          <p className="font-medium text-slate-900">{d.name}</p>
                          {d.dataset_type && <DatasetTypeBadge type={d.dataset_type} />}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600 capitalize">
                      {d.is_sample ? 'Sample' : (d.source_type || 'uploaded').replace('_', ' ')}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{d.row_count?.toLocaleString?.() ?? d.row_count}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{new Date(d.uploaded_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3">
                      <DatasetActionsMenu
                        dataset={d}
                        onChanged={loadDatasets}
                        onDeleted={() => handleDelete(d.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
