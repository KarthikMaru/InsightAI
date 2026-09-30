// File path: frontend/src/context/AuthContext.jsx
// Purpose: Global authentication state — current user, token persistence,
// and register/login/logout actions consumed by pages via useAuth().

import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('insightai_user');
    const token = localStorage.getItem('insightai_token');
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const persistSession = (token, userData) => {
    localStorage.setItem('insightai_token', token);
    localStorage.setItem('insightai_user', JSON.stringify(userData));
    setUser(userData);
  };

  const register = async ({ name, email, password, businessName }) => {
    const { data } = await api.post('/auth/register', { name, email, password, businessName });
    persistSession(data.token, data.user);
    return data;
  };

  const login = async ({ email, password }) => {
    const { data } = await api.post('/auth/login', { email, password });
    persistSession(data.token, data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('insightai_token');
    localStorage.removeItem('insightai_user');
    setUser(null);
  };

  // Called after a successful profile update so the sidebar/header (which
  // read `user` from context) reflect the new name immediately.
  const updateUser = (partialUser) => {
    setUser((prev) => {
      const next = { ...prev, ...partialUser };
      localStorage.setItem('insightai_user', JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout, updateUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
