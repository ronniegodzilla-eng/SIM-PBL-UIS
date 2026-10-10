import React from 'react';
import { useMyMembership } from '../hooks/useMyMembership';
import { PenilaianTeman } from '../components/dashboards/PenilaianTeman';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export const PenilaianTemanMahasiswaPage = () => {
  const { member: groupMember, loading } = useMyMembership();

  if (loading) return <div className="p-8 text-center text-slate-500">Memuat data...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Penilaian Teman</h1>
        <p className="text-muted-foreground">Berikan nilai kepada teman satu kelompok Anda.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Penilaian Teman Kelompok (Peer Review)</CardTitle>
          <CardDescription>Pilih dan nilai partisipasi rekan kelompok secara objektif.</CardDescription>
        </CardHeader>
        <CardContent>
          {groupMember && groupMember.status === 'Approved' ? (
            <PenilaianTeman groupMember={groupMember} />
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
