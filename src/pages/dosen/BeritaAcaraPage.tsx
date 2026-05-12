import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { BeritaAcaraDosen } from '../../components/dashboards/BeritaAcaraDosen';

export const BeritaAcaraPage = () => {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    const qGroups = query(collection(db, 'pbl_groups'), where('dsn_pembimbing_id', '==', profile.uid));
    const unsub = onSnapshot(qGroups, (snapshot) => {
      const g: any[] = [];
      snapshot.forEach(doc => g.push({ id: doc.id, ...doc.data() }));
      setGroups(g);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pbl_groups'));
    return () => unsub();
  }, [profile]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Berita Acara & Kehadiran</h1>
        <p className="text-muted-foreground">Isi Berita Acara dan absensi mahasiswa saat acara Pembukaan, Penutupan, serta Ujian PBL.</p>
      </div>
      <BeritaAcaraDosen groups={groups} />
    </div>
  );
};
