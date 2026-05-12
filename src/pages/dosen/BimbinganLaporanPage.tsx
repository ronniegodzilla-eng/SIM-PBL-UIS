import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { BimbinganLaporan } from '../../components/dashboards/BimbinganLaporan';
import { DiskusiKelompok } from '../../components/dashboards/DiskusiKelompok';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

export const BimbinganLaporanPage = () => {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  useEffect(() => {
    if (!profile) return;
    const qGroups = query(collection(db, 'pbl_groups'), where('dsn_pembimbing_id', '==', profile.uid));
    const unsub = onSnapshot(qGroups, (snapshot) => {
      const g: any[] = [];
      snapshot.forEach(doc => g.push({ id: doc.id, ...doc.data() }));
      setGroups(g);
      if (g.length > 0 && !selectedGroupId) {
        setSelectedGroupId(g[0].id);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pbl_groups'));
    return () => unsub();
  }, [profile, selectedGroupId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bimbingan Laporan & Diskusi PBL</h1>
        <p className="text-muted-foreground">Review draf laporan dan diskusikan perkembangan dengan kelompok.</p>
      </div>
      
      <Tabs defaultValue="laporan" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="laporan">Review Laporan</TabsTrigger>
          <TabsTrigger value="diskusi">Ruang Diskusi</TabsTrigger>
        </TabsList>
        
        <TabsContent value="laporan">
          <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
             <BimbinganLaporan groups={groups} role={profile?.role as any} />
          </div>
        </TabsContent>

        <TabsContent value="diskusi">
          <div className="flex flex-col space-y-4">
            <div className="w-full max-w-xs">
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Kelompok" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.group_name || g.name || `Kelompok ${g.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedGroupId ? (
              <DiskusiKelompok groupId={selectedGroupId} />
            ) : (
              <div className="text-center py-8 text-slate-500 bg-slate-50 border rounded-lg">
                Pilih kelompok untuk memulai diskusi.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
