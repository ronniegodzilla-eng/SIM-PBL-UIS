import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ManajemenPBL } from '../components/dashboards/ManajemenPBL';

export const ManajemenKelompok = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manajemen Kelompok PBL</h1>
        <p className="text-slate-500">Pembagian kelompok dan penetapan pembimbing.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kelompok PBL</CardTitle>
          <CardDescription>Kelola kelompok, anggota, dan pembimbing.</CardDescription>
        </CardHeader>
        <CardContent>
          <ManajemenPBL />
        </CardContent>
      </Card>
    </div>
  );
};
