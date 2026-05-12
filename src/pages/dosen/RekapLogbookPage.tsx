import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { RekapLogbookDosen } from '../../components/dashboards/RekapLogbookDosen';

export const RekapLogbookPage = () => {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    
    let qGroups;
    if (profile.role === 'Admin' || profile.role === 'AdminProdi') {
      qGroups = query(collection(db, 'pbl_groups'));
    } else {
      qGroups = query(collection(db, 'pbl_groups'), where('dsn_pembimbing_id', '==', profile.uid));
    }
    
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
        <h1 className="text-2xl font-bold tracking-tight">Rekap Logbook & Absensi Harian</h1>
        <p className="text-muted-foreground">Melihat data kegiatan harian mahasiswa yang telah divalidasi oleh Pembimbing Lapangan.</p>
      </div>
      <RekapLogbookDosen groups={groups} />
    </div>
  );
};
