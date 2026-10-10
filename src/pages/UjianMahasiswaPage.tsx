import React from 'react';
import { useMyMembership } from '../hooks/useMyMembership';
import { PendaftaranUjian } from '../components/dashboards/PendaftaranUjian';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export const UjianMahasiswaPage = () => {
  const { member: groupMember, loading } = useMyMembership();

  if (loading) return <div className="p-8 text-center text-slate-500">Memuat data...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pendaftaran Ujian</h1>
        <p className="text-muted-foreground">Persiapkan dan jadwalkan ujian PBL kelompok Anda.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendaftaran Ujian PBL</CardTitle>
          <CardDescription>Unggah draf laporan dan lihat jadwal ujian.</CardDescription>
        </CardHeader>
        <CardContent>
          {groupMember && groupMember.status === 'Approved' ? (
            <PendaftaranUjian groupMember={groupMember} />
          ) : (
            <div className="text-center py-8 text-slate-500">
              Anda belum tergabung dalam kelompok PBL atau pendaftaran belum disetujui.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
