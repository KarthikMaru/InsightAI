// File path: frontend/src/pages/NotFound.jsx
// Purpose: Catch-all page for unmatched frontend routes.

import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function NotFound() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <div className="flex items-center gap-2 justify-center mb-6 text-slate-900 font-bold text-xl">
          <BarChart3 className="text-brand-600" size={24} /> InsightAI
        </div>
        <p className="text-7xl font-bold text-slate-200">404</p>
        <h1 className="text-xl font-semibold text-slate-900 mt-2">Page not found</h1>
        <p className="text-slate-500 mt-2">The page you're looking for doesn't exist or has moved.</p>
        <Link
          to={isAuthenticated ? '/dashboard' : '/'}
          className="inline-flex items-center gap-2 mt-6 bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700"
        >
          <ArrowLeft size={16} /> {isAuthenticated ? 'Back to Dashboard' : 'Back to Home'}
        </Link>
      </div>
    </div>
  );
}
