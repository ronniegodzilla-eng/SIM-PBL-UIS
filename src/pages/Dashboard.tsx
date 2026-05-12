import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

// Role-specific dashboards
import { AdminDashboard } from '../components/dashboards/AdminDashboard';
import { MahasiswaDashboard } from '../components/dashboards/MahasiswaDashboard';
import { DosenDashboard } from '../components/dashboards/DosenDashboard';

export const Dashboard = () => {
  const { profile } = useAuth();

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-slate-500">Selamat datang kembali, {profile.name}</p>
      </div>

      {(profile.role === 'Admin' || profile.role === 'AdminProdi') && <AdminDashboard />}
      {profile.role === 'Mahasiswa' && <MahasiswaDashboard />}
      {(profile.role === 'Dosen' || profile.role === 'PembimbingLapangan') && (
        <DosenDashboard role={profile.role} />
      )}
    </div>
  );
};
