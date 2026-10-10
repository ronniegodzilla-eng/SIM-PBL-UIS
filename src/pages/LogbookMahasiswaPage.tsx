import React from 'react';
import { useMyMembership } from '../hooks/useMyMembership';
import { LogbookAbsensi } from '../components/dashboards/LogbookAbsensi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export const LogbookMahasiswaPage = () => {
  const { member: groupMember, loading } = useMyMembership();

  if (loading) return <div className="p-8 text-center text-slate-500">Memuat data...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logbook & Absensi</h1>
        <p className="text-muted-foreground">Kelola logbook harian dan kehadiran Anda.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logbook Harian</CardTitle>
          <CardDescription>Catat kegiatan harian Anda selama di lapangan.</CardDescription>
        </CardHeader>
        <CardContent>
          {groupMember && groupMember.status === 'Approved' ? (
            <LogbookAbsensi groupMember={groupMember} />
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
