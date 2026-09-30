// File path: frontend/src/pages/Landing.jsx
// Purpose: Public marketing landing page with CTAs to login/register.

import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Sparkles, ShieldCheck } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl text-slate-900">
          <BarChart3 className="text-brand-600" size={26} />
          InsightAI
        </div>
        <div className="flex gap-3">
          <Link to="/login" className="px-4 py-2 rounded-lg text-slate-700 font-medium hover:bg-slate-100">
            Log in
          </Link>
          <Link to="/register" className="px-4 py-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700">
            Get started free
          </Link>
        </div>
      </nav>

      <header className="max-w-4xl mx-auto text-center px-6 pt-20 pb-16">
        <h1 className="text-5xl font-bold text-slate-900 leading-tight">
          Turn raw sales data into <span className="text-brand-600">AI-powered decisions</span>
        </h1>
        <p className="mt-6 text-lg text-slate-600">
          Upload your business data, get real-time dashboards, SQL-grade analytics,
          and a Gemini-powered assistant that explains what's happening and why.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link to="/register" className="px-6 py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700">
            Start analyzing your data
          </Link>
          <Link to="/login" className="px-6 py-3 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50">
            I already have an account
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 px-6 pb-24">
        {[
          { icon: BarChart3, title: 'Real analytics', text: 'KPI cards, trend charts, and category/region breakdowns powered by real SQL queries.' },
          { icon: Sparkles, title: 'AI business assistant', text: 'Ask questions in plain English and get insights grounded in your own data.' },
          { icon: ShieldCheck, title: 'Built for real teams', text: 'JWT auth, role-based access, and safe query validation from day one.' },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <Icon className="text-brand-600 mb-3" size={28} />
            <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
            <p className="text-slate-600 text-sm">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
