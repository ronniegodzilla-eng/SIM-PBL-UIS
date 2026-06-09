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
    
    let unsubs: (() => void)[] = [];
    
    if (profile.role === 'PembimbingLapangan') {
      const qGroups = query(collection(db, 'pbl_groups'), where('pmb_lapangan_id', '==', profile.uid));
      unsubs.push(onSnapshot(qGroups, (snapshot) => {
        const g: any[] = [];
        snapshot.forEach(doc => g.push({ id: doc.id, ...doc.data() }));
        setGroups(g);
      }));
    } else if (profile.role === 'Dosen') {
      const qDpl = query(collection(db, 'pbl_groups'), where('dsn_pembimbing_id', '==', profile.uid));
      const qPl = query(collection(db, 'pbl_groups'), where('pmb_lapangan_id', '==', profile.uid));
      
      let dplGroups: any[] = [];
      let plGroups: any[] = [];
      
      const updateGroups = () => {
        const map = new Map();
        dplGroups.forEach(g => map.set(g.id, g));
        plGroups.forEach(g => map.set(g.id, g));
        setGroups(Array.from(map.values()));
      };

      unsubs.push(onSnapshot(qDpl, (snapshot) => {
        dplGroups = [];
        snapshot.forEach(doc => dplGroups.push({ id: doc.id, ...doc.data() }));
        updateGroups();
      }));
      
      unsubs.push(onSnapshot(qPl, (snapshot) => {
        plGroups = [];
        snapshot.forEach(doc => plGroups.push({ id: doc.id, ...doc.data() }));
        updateGroups();
      }));
    } else {
      const qGroups = query(collection(db, 'pbl_groups'));
      unsubs.push(onSnapshot(qGroups, (snapshot) => {
        const g: any[] = [];
        snapshot.forEach(doc => g.push({ id: doc.id, ...doc.data() }));
        setGroups(g);
      }));
    }
    
    return () => unsubs.forEach(fn => fn());
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
