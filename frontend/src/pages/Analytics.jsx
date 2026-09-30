// File path: frontend/src/pages/Analytics.jsx
// Purpose: The filterable analytics workspace — date range, category, and
// region filters applied across KPIs, trend, category/region/product/
// customer breakdowns, and a profit-vs-sales scatter.

import React, { useEffect, useState, useCallback } from 'react';
import { DollarSign, TrendingUp, ShoppingCart, Users, Receipt, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import DatasetSelector from '../components/DatasetSelector';
import FilterBar from '../components/FilterBar';
import KpiCard from '../components/KpiCard';
import MonthlyTrendChart from '../components/charts/MonthlyTrendChart';
import BreakdownBarChart from '../components/charts/BreakdownBarChart';
import ProfitVsSalesChart from '../components/charts/ProfitVsSalesChart';
import DynamicKpiCards from '../components/DynamicKpiCards';
import DynamicChartGrid from '../components/DynamicChartGrid';
import useDatasets from '../hooks/useDatasets';
import analyticsService from '../services/analyticsService';
import genericService from '../services/genericService';

const EMPTY_FILTERS = { startDate: null, endDate: null, category: null, region: null };

export default function Analytics() {
  const { datasets, selectedId, selectDataset, loading: loadingDatasets } = useDatasets();
  const selectedDataset = datasets.find((d) => d.id === selectedId);
  const isGeneric = selectedDataset?.dataset_type === 'generic';

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ categories: [], regions: [] });

  const [sales, setSales] = useState(null);
  const [products, setProducts] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [regions, setRegions] = useState(null);
  const [generic, setGeneric] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

  // Load filter options whenever the dataset changes
  useEffect(() => {
    if (!selectedId || isGeneric) return;
    setFilters(EMPTY_FILTERS);
    analyticsService.getFilterOptions(selectedId).then(setFilterOptions);
  }, [selectedId, isGeneric]);

  const loadAll = useCallback(() => {
    if (!selectedId) return;
    setLoadingData(true);

    if (isGeneric) {
      genericService
        .getAnalytics(selectedId)
        .then((res) => setGeneric(res))
        .finally(() => setLoadingData(false));
      return;
    }

    Promise.all([
      analyticsService.getSalesAnalytics(selectedId, filters),
      analyticsService.getProductAnalytics(selectedId, filters),
      analyticsService.getCustomerAnalytics(selectedId, filters),
      analyticsService.getRegionAnalytics(selectedId, filters),
    ])
      .then(([s, p, c, r]) => {
        setSales(s);
        setProducts(p);
        setCustomers(c);
        setRegions(r);
      })
      .finally(() => setLoadingData(false));
  }, [selectedId, isGeneric, filters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
            <p className="text-slate-600 mt-1">
              {isGeneric ? 'Statistical breakdowns automatically generated from your data.' : 'SQL-powered breakdowns of your business data.'}
            </p>
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
            <p className="text-slate-600 text-sm mt-1 mb-5">Upload any dataset to see analytics here.</p>
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700"
            >
              Go to Upload
            </Link>
          </div>
        ) : (
          <>
            {!isGeneric && (
              <div className="mt-6">
                <FilterBar
                  filters={filters}
                  onChange={setFilters}
                  options={filterOptions}
                  onClear={() => setFilters(EMPTY_FILTERS)}
                />
              </div>
            )}

            {loadingData || (!isGeneric && !sales) || (isGeneric && !generic) ? (
              <p className="text-slate-500 mt-8 text-sm">Crunching the numbers...</p>
            ) : isGeneric ? (
              <div className="mt-6 space-y-6">
                <DynamicKpiCards profile={generic.profile} numericStats={generic.summary.numericStats} />
                <DynamicChartGrid profile={generic.profile} summary={generic.summary} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
                  <KpiCard icon={DollarSign} label="Total Revenue" value={sales.kpis.total_revenue} format="currency" accent="brand" />
                  <KpiCard icon={TrendingUp} label="Total Profit" value={sales.kpis.total_profit} format="currency" accent="emerald" />
                  <KpiCard icon={ShoppingCart} label="Total Orders" value={sales.kpis.total_orders} accent="amber" />
                  <KpiCard icon={Users} label="Total Customers" value={sales.kpis.total_customers} accent="rose" />
                  <KpiCard icon={Receipt} label="Avg Order Value" value={sales.kpis.avg_order_value} format="currency" accent="brand" />
                </div>

                <div className="mt-6">
                  <MonthlyTrendChart data={sales.monthlyTrend} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <BreakdownBarChart data={products.categoryPerformance} nameKey="category" title="Category Performance" />
                  <BreakdownBarChart data={regions.regionalPerformance} nameKey="region" title="Regional Performance" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <BreakdownBarChart data={products.topProducts} nameKey="product" title="Top 10 Products" />
                  <BreakdownBarChart data={customers.topCustomers} nameKey="customer" title="Top Customers" showProfit={false} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <ProfitVsSalesChart data={regions.profitVsSales} />
                  <BreakdownBarChart data={products.weakProducts} nameKey="product" title="Weakest Performing Products (by profit)" />
                </div>

                <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap gap-8 text-sm">
                  <div>
                    <p className="text-slate-500">Repeat customers</p>
                    <p className="text-lg font-semibold text-slate-900">{customers.repeatCustomers} of {customers.totalCustomers}</p>
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
