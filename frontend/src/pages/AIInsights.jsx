// File path: frontend/src/pages/AIInsights.jsx
// Purpose: Shows cached automated insights (sales/customer/regional/
// product) for the selected dataset, with a button to regenerate them
// from the latest data via Gemini.

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lightbulb, RefreshCcw, TrendingUp, Users, MapPin, Package, UploadCloud, Loader2, Sparkles, AlertCircle, Compass, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import DatasetSelector from '../components/DatasetSelector';
import useDatasets from '../hooks/useDatasets';
import aiService from '../services/aiService';

// Sales-shaped datasets use the first four categories (geminiService.
// generateAutomatedInsights); general-purpose datasets use the latter
// four (geminiService.generateGenericAutomatedInsights). Both sets are
// registered here — and any future/unrecognized category still renders
// via the fallback below — so insights are never silently generated,
// saved, and then hidden just because the frontend doesn't recognize
// their category name.
const CATEGORY_META = {
  sales: { label: 'Sales', icon: TrendingUp, color: 'text-brand-600 bg-brand-50' },
  customer: { label: 'Customer', icon: Users, color: 'text-rose-600 bg-rose-50' },
  regional: { label: 'Regional', icon: MapPin, color: 'text-amber-600 bg-amber-50' },
  product: { label: 'Product', icon: Package, color: 'text-emerald-600 bg-emerald-50' },
  overview: { label: 'Overview', icon: Compass, color: 'text-brand-600 bg-brand-50' },
  quality: { label: 'Data Quality', icon: AlertCircle, color: 'text-amber-600 bg-amber-50' },
  patterns: { label: 'Patterns', icon: Sparkles, color: 'text-emerald-600 bg-emerald-50' },
  relationships: { label: 'Relationships', icon: Link2, color: 'text-rose-600 bg-rose-50' },
};
const FALLBACK_META = { label: 'Other', icon: Lightbulb, color: 'text-slate-600 bg-slate-100' };

export default function AIInsights() {
  const { datasets, selectedId, selectDataset, loading: loadingDatasets } = useDatasets();
  const [insights, setInsights] = useState([]);
  const [isStale, setIsStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadCached = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const result = await aiService.getCachedInsights(selectedId);
      setInsights(result.insights);
      setIsStale(result.isStale);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const fresh = await aiService.generateInsights(selectedId);
      setInsights(fresh);
      setIsStale(false);
      toast.success('Insights refreshed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not generate insights');
    } finally {
      setGenerating(false);
    }
  };

  const grouped = insights.reduce((acc, insight) => {
    acc[insight.category] = acc[insight.category] || [];
    acc[insight.category].push(insight);
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Lightbulb className="text-brand-600" size={22} /> AI Insights
            </h1>
            <p className="text-slate-600 mt-1 text-sm">Automated, data-grounded insights across your business.</p>
          </div>
          <div className="flex items-center gap-3">
            {datasets.length > 0 && (
              <DatasetSelector datasets={datasets} selectedId={selectedId} onChange={selectDataset} />
            )}
            {datasets.length > 0 && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-60"
              >
                {generating ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                {generating ? 'Generating...' : 'Regenerate insights'}
              </button>
            )}
          </div>
        </div>

        {loadingDatasets ? (
          <p className="text-slate-500 mt-8 text-sm">Loading your datasets...</p>
        ) : datasets.length === 0 ? (
          <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <UploadCloud className="mx-auto text-brand-600 mb-3" size={36} />
            <h2 className="font-semibold text-slate-900 text-lg">Upload a dataset first</h2>
            <p className="text-slate-600 text-sm mt-1 mb-5">AI Insights need your data to work from.</p>
            <Link to="/upload" className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700">
              Go to Upload
            </Link>
          </div>
        ) : loading ? (
          <p className="text-slate-500 mt-8 text-sm">Loading insights...</p>
        ) : insights.length === 0 ? (
          <div className="mt-8 bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500">
            No insights yet for this dataset. Click <span className="font-medium">Regenerate insights</span> above to generate some.
          </div>
        ) : (
          <>
            {isStale && (
              <div className="mt-6 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
                <AlertCircle size={16} className="shrink-0" />
                This dataset has changed since these insights were generated — click <span className="font-medium mx-1">Regenerate insights</span> for up-to-date results.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {Object.entries(grouped).map(([key, items]) => {
                const meta = CATEGORY_META[key] || FALLBACK_META;
                const Icon = meta.icon;
                return (
                  <div key={key} className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.color}`}>
                        <Icon size={16} />
                      </div>
                      <h2 className="font-semibold text-slate-900">{meta.label} Insights</h2>
                    </div>
                    <div className="space-y-4">
                      {items.map((insight) => (
                        <div key={insight.id} className="border-l-2 border-slate-100 pl-3">
                          <p className="font-medium text-slate-800 text-sm">{insight.title}</p>
                          <p className="text-slate-600 text-sm mt-0.5">{insight.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
