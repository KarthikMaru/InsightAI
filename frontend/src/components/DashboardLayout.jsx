// File path: frontend/src/components/DashboardLayout.jsx
// Purpose: Shared shell (sidebar + topbar) for all authenticated pages.
// Nav items not yet built (Phase 3+) render as disabled with a "soon" tag
// so the sidebar reflects the full product without dead links.

import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3, LayoutDashboard, UploadCloud, Table2, LineChart,
  Sparkles, Lightbulb, FileText, User, LogOut, Menu, ShieldCheck, LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: true },
  { to: '/upload', label: 'Upload Dataset', icon: UploadCloud, enabled: true },
  { to: '/datasets/create', label: 'Create Dataset', icon: LayoutGrid, enabled: true },
  { to: '/datasets/generate', label: 'Generate with AI', icon: Sparkles, enabled: true },
  { to: '/explorer', label: 'Data Explorer', icon: Table2, enabled: true },
  { to: '/analytics', label: 'Analytics', icon: LineChart, enabled: true },
  { to: '/ai-assistant', label: 'AI Assistant', icon: Sparkles, enabled: true },
  { to: '/ai-insights', label: 'AI Insights', icon: Lightbulb, enabled: true },
  { to: '/reports', label: 'Reports', icon: FileText, enabled: true },
  { to: '/profile', label: 'Profile', icon: User, enabled: true },
];

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside
        className={`bg-white border-r border-slate-200 flex flex-col transition-all ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          {!collapsed && (
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <BarChart3 className="text-brand-600" size={22} /> InsightAI
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="text-slate-500 hover:text-slate-800">
            <Menu size={20} />
          </button>
        </div>

        <nav className="flex-1 px-2 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, enabled }) => {
            if (!enabled) {
              return (
                <div
                  key={to}
                  title="Coming in a later phase"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 cursor-not-allowed select-none"
                >
                  <Icon size={18} />
                  {!collapsed && <span className="text-sm">{label}</span>}
                </div>
              );
            }
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <Icon size={18} />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            );
          })}

          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-2 border-t border-slate-100 pt-3 ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <ShieldCheck size={18} />
              {!collapsed && <span>Admin Dashboard</span>}
            </NavLink>
          )}
        </nav>

        <div className="px-2 py-4 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {user?.role === 'admin' ? 'Admin' : 'Business'} workspace
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center font-semibold">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
