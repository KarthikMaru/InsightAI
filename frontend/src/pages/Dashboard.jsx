// File path: frontend/src/pages/Dashboard.jsx
// Purpose: Main landing page after login. Shows KPI cards, the monthly
// sales/profit trend, and category/region breakdowns for the selected
// dataset (no filters — see Analytics page for the filterable version).

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud, ArrowRight, DollarSign, TrendingUp, ShoppingCart, Users, Receipt } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import DatasetSelector from '../components/DatasetSelector';
import KpiCard from '../components/KpiCard';
import MonthlyTrendChart from '../components/charts/MonthlyTrendChart';
import BreakdownBarChart from '../components/charts/BreakdownBarChart';
import DynamicKpiCards from '../components/DynamicKpiCards';
import DynamicChartGrid from '../components/DynamicChartGrid';
import useDatasets from '../hooks/useDatasets';
import { useAuth } from '../context/AuthContext';
import analyticsService from '../services/analyticsService';
import genericService from '../services/genericService';

export default function Dashboard() {
  const { user } = useAuth();
  const { datasets, selectedId, selectDataset, loading: loadingDatasets } = useDatasets();
  const selectedDataset = datasets.find((d) => d.id === selectedId);
  const isGeneric = selectedDataset?.dataset_type === 'generic';

  const [summary, setSummary] = useState(null);
  const [generic, setGeneric] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (!selectedId || !selectedDataset) return;
    setLoadingSummary(true);
    setSummary(null);
    setGeneric(null);

    const load = isGeneric
      ? genericService.getAnalytics(selectedId).then((res) => setGeneric(res))
      : analyticsService.getDashboardSummary(selectedId).then((res) => setSummary(res));

    load.finally(() => setLoadingSummary(false));
  }, [selectedId, isGeneric]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.name} 👋</h1>
            <p className="text-slate-600 mt-1">Here's what's happening with your data.</p>
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
            <h2 className="font-semibold text-slate-900 text-lg">No datasets yet</h2>
            <p className="text-slate-600 text-sm mt-1 mb-5">
              Upload any dataset (CSV, JSON, Excel, XML, or SQL), or try the sample Superstore dataset to explore InsightAI right away.
            </p>
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700"
            >
              Upload a dataset <ArrowRight size={16} />
            </Link>
          </div>
        ) : loadingSummary || (!summary && !generic) ? (
          <p className="text-slate-500 mt-8 text-sm">Crunching the numbers...</p>
        ) : isGeneric ? (
          <div className="mt-8 space-y-6">
            <DynamicKpiCards profile={generic.profile} numericStats={generic.summary.numericStats} />
            <DynamicChartGrid profile={generic.profile} summary={generic.summary} />
            <div className="text-right">
              <Link to="/explorer" className="text-sm text-brand-600 font-medium hover:underline inline-flex items-center gap-1">
                Open Data Explorer <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
              <KpiCard icon={DollarSign} label="Total Revenue" value={summary.kpis.total_revenue} format="currency" accent="brand" />
              <KpiCard icon={TrendingUp} label="Total Profit" value={summary.kpis.total_profit} format="currency" accent="emerald" />
              <KpiCard icon={ShoppingCart} label="Total Orders" value={summary.kpis.total_orders} accent="amber" />
              <KpiCard icon={Users} label="Total Customers" value={summary.kpis.total_customers} accent="rose" />
              <KpiCard icon={Receipt} label="Avg Order Value" value={summary.kpis.avg_order_value} format="currency" accent="brand" />
            </div>

            <div className="mt-6">
              <MonthlyTrendChart data={summary.monthlyTrend} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <BreakdownBarChart
                data={summary.categoryPerformance}
                nameKey="category"
                title="Sales by Category"
              />
              <BreakdownBarChart
                data={summary.regionalPerformance}
                nameKey="region"
                title="Sales by Region"
              />
            </div>

            <div className="mt-6">
              <BreakdownBarChart
                data={summary.topProducts}
                nameKey="product"
                title="Top 5 Products"
              />
            </div>

            <div className="mt-6 text-right">
              <Link to="/analytics" className="text-sm text-brand-600 font-medium hover:underline inline-flex items-center gap-1">
                Open full Analytics with filters <ArrowRight size={14} />
              </Link>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
