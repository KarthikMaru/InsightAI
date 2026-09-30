// File path: frontend/src/pages/GenerateDataset.jsx
// Purpose: "Generate Dataset with AI" — the third of the three ways to
// get a dataset into InsightAI. The user describes what they want in
// plain language; the backend asks Gemini for a schema+rows, validates
// and repairs it through the exact same pipeline an uploaded JSON file
// goes through (never trusting the AI's output as-is — see
// backend/controllers/datasetController.js's generateAiDataset), and the
// result becomes a normal editable dataset like any other.

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import SchemaProfile from '../components/SchemaProfile';
import editService from '../services/editService';

const EXAMPLE_PROMPTS = [
  'Create a dataset of 500 employees with employee ID, name, age, department, salary, joining date and performance score.',
  'Create a student performance dataset with 200 rows containing student ID, branch, semester, marks, attendance and placement status.',
  'Generate 100 e-commerce transactions with transaction ID, amount, currency, payment method, and timestamp.',
];

export default function GenerateDataset() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [rowCount, setRowCount] = useState(50);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return toast.error('Describe the dataset you want to generate');
    setGenerating(true);
    setResult(null);
    setError(null);
    try {
      const res = await editService.generateWithAi(prompt.trim(), rowCount);
      setResult(res);
      toast.success('Dataset generated!');
    } catch (err) {
      // Never claim success on failure — show exactly what went wrong.
      setError(err.response?.data?.message || 'Could not generate a dataset. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="flex items-center gap-3">
          <Sparkles className="text-brand-600" size={26} />
          <h1 className="text-2xl font-bold text-slate-900">Generate Dataset with AI</h1>
        </div>
        <p className="text-slate-600 mt-1">
          Describe the dataset you want in plain language — InsightAI will infer a schema, generate realistic sample
          rows, and let you review and edit everything before it's saved.
        </p>

        <form onSubmit={handleGenerate} className="mt-6 space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="e.g. Create a dataset of 500 employees with employee ID, name, age, department, salary, joining date and performance score."
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrompt(p)}
                className="text-xs text-slate-500 border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-50 text-left"
              >
                {p.length > 55 ? p.slice(0, 55) + '…' : p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600">Number of rows</label>
            <input
              type="number"
              min={1}
              max={300}
              value={rowCount}
              onChange={(e) => setRowCount(e.target.value)}
              className="w-24 px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
            />
            <span className="text-xs text-slate-400">(capped at 300 per generation to keep results reliable)</span>
          </div>

          <button
            type="submit"
            disabled={generating}
            className="flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-60"
          >
            {generating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            {generating ? 'Generating...' : 'Generate Dataset'}
          </button>
        </form>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 flex items-start gap-3">
            <AlertTriangle className="text-red-600 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-red-800">Generation failed</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="font-medium text-emerald-800">
                {result.dataset.name} — {result.rowsInserted.toLocaleString()} rows generated
              </p>
              {result.duplicateIdWarnings?.length > 0 && (
                <p className="text-sm text-amber-700 mt-1 flex items-center gap-1">
                  <AlertTriangle size={14} /> Column(s) {result.duplicateIdWarnings.join(', ')} contain duplicate values — review before relying on them as unique IDs.
                </p>
              )}
            </div>

            <SchemaProfile profile={result.profile} fileName={result.dataset.name} fileType="AI-generated" />

            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/datasets/${result.dataset.id}/edit`)}
                className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700"
              >
                Review & Edit Dataset <ArrowRight size={16} />
              </button>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 font-medium px-5 py-2.5 rounded-lg hover:bg-slate-50"
              >
                Open Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
