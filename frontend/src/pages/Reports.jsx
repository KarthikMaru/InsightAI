// File path: frontend/src/pages/Reports.jsx
// Purpose: Lets the user generate PDF reports (monthly sales, product
// performance, regional, customer) for a dataset, and re-download or
// delete previously generated ones.

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, Download, Trash2, Loader2, UploadCloud, TrendingUp, Package, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import DatasetSelector from '../components/DatasetSelector';
import useDatasets from '../hooks/useDatasets';
import reportService from '../services/reportService';

const REPORT_TYPES = [
  { key: 'monthly_sales', label: 'Monthly Sales Report', icon: TrendingUp, description: 'Revenue, profit, and order trend by month.' },
  { key: 'product_performance', label: 'Product Performance Report', icon: Package, description: 'Top products, category breakdown, and weak performers.' },
  { key: 'regional', label: 'Regional Performance Report', icon: MapPin, description: 'Sales and profit by region.' },
  { key: 'customer', label: 'Customer Report', icon: Users, description: 'Top customers and repeat customer rate.' },
];

export default function Reports() {
  const { datasets, selectedId, selectDataset, loading: loadingDatasets } = useDatasets();
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [generatingType, setGeneratingType] = useState(null);

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const list = await reportService.list();
      setReports(list);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleGenerate = async (reportType) => {
    if (!selectedId) return;
    setGeneratingType(reportType);
    try {
      await reportService.generate(selectedId, reportType);
      toast.success('Report generated');
      loadReports();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not generate report');
    } finally {
      setGeneratingType(null);
    }
  };

  const handleDownload = async (report) => {
    try {
      await reportService.download(report);
    } catch (err) {
      toast.error('Could not download report');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this report?')) return;
    try {
      await reportService.remove(id);
      toast.success('Report deleted');
      loadReports();
    } catch (err) {
      toast.error('Could not delete report');
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
            <p className="text-slate-600 mt-1 text-sm">Generate downloadable PDF reports from your data.</p>
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
            <p className="text-slate-600 text-sm mt-1 mb-5">Reports are generated from your uploaded data.</p>
            <Link to="/upload" className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700">
              Go to Upload
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              {REPORT_TYPES.map(({ key, label, icon: Icon, description }) => (
                <div key={key} className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="text-brand-600" size={20} />
                    <h3 className="font-semibold text-slate-900 text-sm">{label}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">{description}</p>
                  <button
                    onClick={() => handleGenerate(key)}
                    disabled={generatingType === key}
                    className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-brand-700 disabled:opacity-60"
                  >
                    {generatingType === key ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                    {generatingType === key ? 'Generating...' : 'Generate PDF'}
                  </button>
                </div>
              ))}
            </div>

            <h2 className="text-lg font-semibold text-slate-900 mt-10 mb-3">Your reports</h2>
            {loadingReports ? (
              <p className="text-slate-500 text-sm">Loading reports...</p>
            ) : reports.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500">
                No reports generated yet.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {reports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <FileText className="text-brand-600" size={20} />
                      <div>
                        <p className="font-medium text-slate-900 text-sm capitalize">{r.report_type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">
                          {r.dataset_name} · {new Date(r.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleDownload(r)} className="text-brand-600 hover:text-brand-800" title="Download">
                        <Download size={18} />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-red-600" title="Delete">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
