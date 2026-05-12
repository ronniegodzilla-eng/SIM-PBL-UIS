import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export const ManajemenRubrik = () => {
  const { profile } = useAuth();
  const [rubrics, setRubrics] = useState<any[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('DosenPembimbing');
  const [criteria, setCriteria] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const qRubrics = query(collection(db, 'rubrics'));
    const unsub = onSnapshot(qRubrics, (snapshot) => {
      const r: any[] = [];
      snapshot.forEach(doc => r.push({ id: doc.id, ...doc.data() }));
      setRubrics(r);
    });

    return () => unsub();
  }, [profile]);

  useEffect(() => {
    const existing = rubrics.find(r => r.role === selectedRole);
    if (existing && existing.criteria) {
      setCriteria(existing.criteria);
    } else {
      setCriteria([{ id: Date.now().toString(), label: '', weight: 0 }]);
    }
  }, [selectedRole, rubrics]);

  const handleAddCriterion = () => {
    setCriteria([...criteria, { id: Date.now().toString(), label: '', weight: 0 }]);
  };

  const handleRemoveCriterion = (id: string) => {
    setCriteria(criteria.filter(c => c.id !== id));
  };

  const handleCriterionChange = (id: string, field: string, value: string | number) => {
    setCriteria(criteria.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleSaveRubric = async () => {
    const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight), 0);
    if (totalWeight !== 100) {
      toast.error(`Total bobot harus 100. Saat ini: ${totalWeight}`);
      return;
    }

    try {
      setLoading(true);
      await setDoc(doc(db, 'rubrics', selectedRole), {
        role: selectedRole,
        criteria: criteria.map(c => ({ ...c, weight: Number(c.weight) })),
        updatedAt: new Date().toISOString()
      });
      toast.success('Rubrik berhasil disimpan');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rubrics');
      toast.error('Gagal menyimpan rubrik');
    } finally {
      setLoading(false);
    }
  };

  if (profile?.role !== 'Admin' && profile?.role !== 'AdminProdi') {
    return <div className="p-8 text-center">Akses Ditolak</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manajemen Rubrik Penilaian</h1>
        <p className="text-muted-foreground">Kustomisasi parameter dan bobot penilaian untuk tiap role.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Rubrik</CardTitle>
          <CardDescription>Pilih peran yang ingin dikonfigurasi rubriknya.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="w-1/3">
            <Label>Peran Penilai</Label>
             <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DosenPembimbing">Dosen Pembimbing</SelectItem>
                <SelectItem value="DosenPenguji">Dosen Penguji</SelectItem>
                <SelectItem value="PembimbingLapangan">Pembimbing Lapangan</SelectItem>
                <SelectItem value="PeerReview">Penilaian Teman Kelompok</SelectItem>
                <SelectItem value="KehadiranSosialisasi">Kehadiran Sosialisasi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex justify-between items-center">
               <h3 className="font-semibold">Kriteria Penilaian</h3>
               <Button size="sm" variant="outline" onClick={handleAddCriterion}>+ Tambah Kriteria</Button>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Kriteria / Parameter</TableHead>
                  <TableHead className="w-32">Bobot (%)</TableHead>
                  <TableHead className="w-24 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criteria.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Input 
                        value={c.label} 
                        onChange={(e) => handleCriterionChange(c.id, 'label', e.target.value)} 
                        placeholder="Cth: Kedisiplinan / Penguasaan Materi"
                        required
                      />
                    </TableCell>
                    <TableCell>
                       <Input 
                        type="number" 
                        min="0"
                        max="100"
                        value={c.weight} 
                        onChange={(e) => handleCriterionChange(c.id, 'weight', e.target.value)} 
                        required
                      />
                    </TableCell>
                    <TableCell className="text-right">
                       <Button size="sm" variant="destructive" onClick={() => handleRemoveCriterion(c.id)}>Hapus</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className={`text-right font-medium ${criteria.reduce((s, c) => s + Number(c.weight), 0) !== 100 ? 'text-red-500' : 'text-green-600'}`}>
              Total Bobot: {criteria.reduce((s, c) => s + Number(c.weight), 0)}%
            </div>
            <Button onClick={handleSaveRubric} disabled={loading} className="w-full">
               {loading ? 'Menyimpan...' : 'Simpan Rubrik'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
