// File path: frontend/src/pages/Profile.jsx
// Purpose: View/edit account name and business info, and change password.

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { User, Building2, Lock, Loader2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import profileService from '../services/profileService';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [profileForm, setProfileForm] = useState({ name: '', businessName: '', industry: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    profileService
      .get()
      .then(({ user: u, business }) => {
        setProfileForm({
          name: u.name || '',
          businessName: business?.business_name || '',
          industry: business?.industry || '',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { user: updatedUser } = await profileService.update(profileForm);
      updateUser(updatedUser);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await profileService.changePassword(passwordForm);
      toast.success('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change password');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto px-8 py-10">
          <p className="text-slate-500 text-sm">Loading profile...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-8 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
          <p className="text-slate-600 mt-1 text-sm">Manage your account and business details.</p>
        </div>

        {/* Account & Business info */}
        <form onSubmit={handleProfileSubmit} className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="text-brand-600" size={18} />
            <h2 className="font-semibold text-slate-900">Account</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
              />
              <p className="text-xs text-slate-400 mt-1">Email cannot be changed.</p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Building2 className="text-brand-600" size={18} />
              <h2 className="font-semibold text-slate-900">Business</h2>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Business name</label>
              <input
                type="text"
                value={profileForm.businessName}
                onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Industry (optional)</label>
              <input
                type="text"
                value={profileForm.industry}
                onChange={(e) => setProfileForm({ ...profileForm, industry: e.target.value })}
                placeholder="e.g. Retail, SaaS, Manufacturing"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="mt-5 flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-60"
          >
            {savingProfile && <Loader2 className="animate-spin" size={16} />}
            Save changes
          </button>
        </form>

        {/* Change password */}
        <form onSubmit={handlePasswordSubmit} className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="text-brand-600" size={18} />
            <h2 className="font-semibold text-slate-900">Change Password</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current password</label>
              <input
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm new password</label>
              <input
                type="password"
                required
                minLength={8}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingPassword}
            className="mt-5 flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-slate-700 disabled:opacity-60"
          >
            {savingPassword && <Loader2 className="animate-spin" size={16} />}
            Update password
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
