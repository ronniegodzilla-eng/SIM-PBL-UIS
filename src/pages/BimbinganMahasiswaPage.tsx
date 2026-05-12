import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { BimbinganMahasiswa } from '../components/dashboards/BimbinganMahasiswa';
import { DiskusiKelompok } from '../components/dashboards/DiskusiKelompok';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export const BimbinganMahasiswaPage = () => {
  const { profile } = useAuth();
  const [groupMember, setGroupMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'group_members'), where('student_id', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setGroupMember({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      else setGroupMember(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile]);

  if (loading) return <div className="p-8 text-center text-slate-500">Memuat data...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bimbingan Laporan & Diskusi</h1>
        <p className="text-muted-foreground">Proses bimbingan draf laporan PBL dan ruang diskusi kelompok.</p>
      </div>

      {groupMember && groupMember.status === 'Approved' ? (
        <Tabs defaultValue="laporan" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="laporan">Laporan PBL</TabsTrigger>
            <TabsTrigger value="diskusi">Ruang Diskusi</TabsTrigger>
          </TabsList>
          
          <TabsContent value="laporan">
            <Card>
              <CardHeader>
                <CardTitle>Unggah Draf & Revisi</CardTitle>
                <CardDescription>Bimbingan dilakukan secara iteratif hingga laporan disetujui.</CardDescription>
              </CardHeader>
              <CardContent>
                <BimbinganMahasiswa groupMember={groupMember} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="diskusi">
            <DiskusiKelompok groupId={groupMember.group_id} />
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8 text-slate-500 bg-slate-50 border rounded-lg">
              Anda belum tergabung dalam kelompok PBL atau pendaftaran belum disetujui.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
