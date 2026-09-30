// File path: frontend/src/pages/Admin.jsx
// Purpose: Admin-only view of platform-wide stats, users, datasets (with
// delete for inappropriate content), and recent activity.

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, Database, FileText, Sparkles, ShieldCheck, Trash2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import KpiCard from '../components/KpiCard';
import adminService from '../services/adminService';
import datasetService from '../services/datasetService';

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statsData, usersData, datasetsData, activitiesData] = await Promise.all([
        adminService.getStats(),
        adminService.getUsers(),
        adminService.getDatasets(),
        adminService.getActivities(),
      ]);
      setStats(statsData);
      setUsers(usersData);
      setDatasets(datasetsData);
      setActivities(activitiesData);
    } catch (err) {
      toast.error('Could not load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleDeleteDataset = async (id) => {
    if (!window.confirm('Delete this dataset? This will remove it for its owner too.')) return;
    try {
      await datasetService.remove(id);
      toast.success('Dataset deleted');
      loadAll();
    } catch (err) {
      toast.error('Could not delete dataset');
    }
  };

  if (loading || !stats) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto px-8 py-10">
          <p className="text-slate-500 text-sm">Loading admin dashboard...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="text-brand-600" size={22} /> Admin Dashboard
        </h1>
        <p className="text-slate-600 mt-1 text-sm">Platform-wide visibility across all businesses.</p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
          <KpiCard icon={Users} label="Total Users" value={stats.totalUsers} accent="brand" />
          <KpiCard icon={Database} label="Total Datasets" value={stats.totalDatasets} accent="emerald" />
          <KpiCard icon={FileText} label="Records Processed" value={stats.totalRecordsProcessed} accent="amber" />
          <KpiCard icon={Sparkles} label="AI Queries" value={stats.totalAiQueries} accent="rose" />
          <KpiCard icon={FileText} label="Reports Generated" value={stats.totalReports} accent="brand" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Users</h2>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {users.map((u) => (
                <div key={u.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                    {u.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Datasets</h2>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {datasets.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.owner_email} · {d.row_count} rows · {d.status}</p>
                  </div>
                  <button onClick={() => handleDeleteDataset(d.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 mt-6">
          <h2 className="font-semibold text-slate-900 mb-4">Recent Activity</h2>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {activities.map((a) => (
              <div key={a.id} className="py-2.5 text-sm flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-800">{a.user_name || 'Unknown user'}</span>{' '}
                  <span className="text-slate-500">{a.action.replace(/_/g, ' ')}</span>
                </div>
                <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
