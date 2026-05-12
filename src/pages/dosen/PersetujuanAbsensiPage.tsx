import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { PersetujuanLogbook } from '../../components/dashboards/PersetujuanLogbook';

export const PersetujuanAbsensiPage = () => {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    
    let qGroups;
    if (profile.role === 'PembimbingLapangan') {
      qGroups = query(collection(db, 'pbl_groups'), where('pmb_lapangan_id', '==', profile.uid));
    } else {
      qGroups = query(collection(db, 'pbl_groups')); // Fallback
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
        <h1 className="text-2xl font-bold tracking-tight">Persetujuan Harian</h1>
        <p className="text-muted-foreground">Persetujuan kegiatan harian dan kehadiran mahasiswa bimbingan Anda.</p>
      </div>
      <div className="bg-white rounded-lg border">
        <div className="p-6">
           <PersetujuanLogbook groups={groups} />
        </div>
      </div>
    </div>
  );
};
