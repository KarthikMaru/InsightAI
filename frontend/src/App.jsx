// File path: frontend/src/App.jsx
// Purpose: Top-level route table. More routes (Upload, Analytics, AI
// Assistant, Reports, Admin) are added in later phases.

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Analytics from './pages/Analytics';
import AIAssistant from './pages/AIAssistant';
import AIInsights from './pages/AIInsights';
import Reports from './pages/Reports';
import DataExplorer from './pages/DataExplorer';
import CreateDataset from './pages/CreateDataset';
import GenerateDataset from './pages/GenerateDataset';
import DatasetEditor from './pages/DatasetEditor';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <Upload />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Analytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-assistant"
        element={
          <ProtectedRoute>
            <AIAssistant />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-insights"
        element={
          <ProtectedRoute>
            <AIInsights />
          </ProtectedRoute>
        }
      />
      <Route
        path="/explorer"
        element={
          <ProtectedRoute>
            <DataExplorer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/datasets/create"
        element={
          <ProtectedRoute>
            <CreateDataset />
          </ProtectedRoute>
        }
      />
      <Route
        path="/datasets/generate"
        element={
          <ProtectedRoute>
            <GenerateDataset />
          </ProtectedRoute>
        }
      />
      <Route
        path="/datasets/:id/edit"
        element={
          <ProtectedRoute>
            <DatasetEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
