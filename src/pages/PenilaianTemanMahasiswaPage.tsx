import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { PenilaianTeman } from '../components/dashboards/PenilaianTeman';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export const PenilaianTemanMahasiswaPage = () => {
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
