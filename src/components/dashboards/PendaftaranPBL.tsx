import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, doc, onSnapshot, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { toast } from 'sonner';

export const PendaftaranPBL = () => {
  const { profile } = useAuth();
  const [groupMember, setGroupMember] = useState<any>(null);
  const [groupInfo, setGroupInfo] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [isEditingTempat, setIsEditingTempat] = useState(false);
  const [newTempat, setNewTempat] = useState('');

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'group_members'), where('student_id', '==', profile.uid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const memberData = snapshot.docs[0].data();
        setGroupMember(memberData);
        
        if (memberData.group_id && memberData.group_id !== 'pending') {
          try {
            const groupDoc = await getDoc(doc(db, 'pbl_groups', memberData.group_id));
            if (groupDoc.exists()) {
              const gData = groupDoc.data();
              // get names
              const resObj: any = { id: groupDoc.id, ...gData };
              
              if (gData.dsn_pembimbing_id) {
                 const dDoc = await getDoc(doc(db, 'users', gData.dsn_pembimbing_id));
                 if (dDoc.exists()) resObj.dsn_pembimbing_name = dDoc.data().name;
              }
              if (gData.pmb_lapangan_id) {
                 const plDoc = await getDoc(doc(db, 'users', gData.pmb_lapangan_id));
                 if (plDoc.exists()) resObj.pmb_lapangan_name = plDoc.data().name;
              }

              // Get all members
              const mQ = query(collection(db, 'group_members'), where('group_id', '==', memberData.group_id), where('status', '==', 'Approved'));
              const mSnap = await getDocs(mQ);
              const mNames: string[] = [];
              for (const mD of mSnap.docs) {
                 const stId = mD.data().student_id;
                 const stDoc = await getDoc(doc(db, 'users', stId));
                 if (stDoc.exists()) {
                    mNames.push(stDoc.data().name);
                 }
              }
              resObj.members = mNames;
              setGroupInfo(resObj);
            }
          } catch (error) {
            console.error('Error fetching group info', error);
          }
        }
      } else {
        setGroupMember(null);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'group_members'));

    return () => unsubscribe();
  }, [profile]);

  const handleUpdateTempatPbl = async () => {
    if (!groupInfo.id) return;
    try {
      await updateDoc(doc(db, 'pbl_groups', groupInfo.id), {
        tempat_pbl: newTempat
      });
      toast.success('Tempat PBL berhasil diperbarui.');
      setIsEditingTempat(false);
      setGroupInfo({...groupInfo, tempat_pbl: newTempat});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pbl_groups/${groupInfo.id}`);
      toast.error('Gagal memperbarui tempat PBL.');
    }
  };

  if (loading) return <div>Memuat data...</div>;

  if (groupMember && groupMember.status === 'Approved') {
    return (
      <div className="bg-slate-50 p-6 rounded-lg border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg">Informasi Kelompok PBL</h3>
          {groupInfo.id && (
            <Dialog open={isEditingTempat} onOpenChange={(open) => {
              setIsEditingTempat(open);
              if (open) setNewTempat(groupInfo.tempat_pbl || '');
            }}>
              <DialogTrigger render={<Button variant="outline" size="sm">Edit Tempat PBL</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Tempat PBL</DialogTitle>
                  <DialogDescription>Masukkan nama instansi atau lokasi tempat PBL kelompk Anda.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Tempat PBL</Label>
                    <Input 
                      placeholder="Contoh: PT. ABC Batam" 
                      value={newTempat}
                      onChange={(e) => setNewTempat(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditingTempat(false)}>Batal</Button>
                  <Button onClick={handleUpdateTempatPbl}>Simpan Perubahan</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm text-slate-600">Status:</span>
          <Badge variant="default">Tergabung</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500 mb-1">Nama Kelompok</p>
            <p className="font-semibold">{groupInfo.group_name || groupMember.group_id}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Tempat PBL</p>
            <p className="font-semibold">{groupInfo.tempat_pbl || <span className="text-amber-600">Belum Ditentukan</span>}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Dosen Pembimbing</p>
            <p className="font-semibold">{groupInfo.dsn_pembimbing_name || '-'}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Pembimbing Lapangan</p>
            <p className="font-semibold">{groupInfo.pmb_lapangan_name || <span className="text-amber-600">Belum Ditentukan</span>}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-slate-500 mb-1">Anggota Tim</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {groupInfo.members?.map((m: string, i: number) => (
                <li key={i} className="font-medium text-slate-800">{m}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 p-6 rounded-lg border space-y-4">
      <div>
        <h3 className="font-semibold text-lg">Status Penempatan Kelompok</h3>
        <div className="flex items-center gap-4 mt-2 mb-4">
          <span className="text-sm text-slate-600">Status:</span>
          <Badge variant="secondary">Menunggu Kelompok</Badge>
        </div>
        <p className="text-sm text-slate-500">Anda belum dimasukkan ke dalam kelompok PBL. Mohon menunggu administrator untuk menempatkan Anda ke dalam kelompok.</p>
      </div>
    </div>
  );
};
