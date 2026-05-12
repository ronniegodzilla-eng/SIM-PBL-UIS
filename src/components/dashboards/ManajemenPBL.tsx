import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Trash2, Edit2, Search, Crown, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const ManajemenPBL = () => {
  const [groups, setGroups] = useState<any[]>([]);
  const [dosenPembimbing, setDosenPembimbing] = useState<UserProfile[]>([]);
  const [pembimbingLapangan, setPembimbingLapangan] = useState<UserProfile[]>([]);
  const [allMahasiswa, setAllMahasiswa] = useState<UserProfile[]>([]);
  const [allGroupMembers, setAllGroupMembers] = useState<any[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ group_name: '', dsn_pembimbing_id: '', pmb_lapangan_id: '', prodi: '', tempat_pbl: '' });
  const [selectedMahasiswa, setSelectedMahasiswa] = useState<string>('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [groupToDelete, setGroupToDelete] = useState<any>(null);
  const [memberToRemove, setMemberToRemove] = useState<any>(null);

  useEffect(() => {
    // Listen for all group members
    const qAllMembers = query(collection(db, 'group_members'));
    const unsubAllMembers = onSnapshot(qAllMembers, (snapshot) => {
      const members: any[] = [];
      snapshot.forEach((doc) => members.push({ id: doc.id, ...doc.data() }));
      setAllGroupMembers(members);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'group_members'));

    // Listen for groups
    const qGroups = query(collection(db, 'pbl_groups'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      const g: any[] = [];
      snapshot.forEach((doc) => g.push({ id: doc.id, ...doc.data() }));
      setGroups(g);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pbl_groups'));

    // Listen for All Mahasiswa
    const qMahasiswa = query(collection(db, 'users'), where('role', '==', 'Mahasiswa'));
    const unsubMahasiswa = onSnapshot(qMahasiswa, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => users.push(doc.data() as UserProfile));
      setAllMahasiswa(users);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    // Listen for Dosen Pembimbing and regular Dosen
    const qDosen = query(collection(db, 'users'), where('role', 'in', ['DosenPembimbing', 'Dosen']));
    const unsubDosen = onSnapshot(qDosen, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => users.push(doc.data() as UserProfile));
      setDosenPembimbing(users);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    // Listen for Pembimbing Lapangan
    const qPL = query(collection(db, 'users'), where('role', '==', 'PembimbingLapangan'));
    const unsubPL = onSnapshot(qPL, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => users.push(doc.data() as UserProfile));
      setPembimbingLapangan(users);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubAllMembers();
      unsubGroups();
      unsubMahasiswa();
      unsubDosen();
      unsubPL();
    };
  }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!newGroup.prodi) {
      toast.error('Pilih Program Studi untuk kelompok ini');
      return;
    }
    try {
      setIsCreatingGroup(true);
      const groupId = `group_${Date.now()}`;
      
      await setDoc(doc(db, 'pbl_groups', groupId), {
        group_name: newGroup.group_name,
        dsn_pembimbing_id: newGroup.dsn_pembimbing_id,
        pmb_lapangan_id: newGroup.pmb_lapangan_id,
        prodi: newGroup.prodi,
        tempat_pbl: newGroup.tempat_pbl,
        status: 'Active',
        createdAt: new Date().toISOString()
      });
      
      toast.success('Kelompok PBL berhasil dibuat.');
      setNewGroup({ group_name: '', dsn_pembimbing_id: '', pmb_lapangan_id: '', prodi: '', tempat_pbl: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'pbl_groups');
      toast.error('Gagal membuat kelompok PBL');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleSetLeader = async (groupId: string, studentId: string) => {
    try {
      await updateDoc(doc(db, 'pbl_groups', groupId), {
        leader_id: studentId
      });
      toast.success('Ketua kelompok berhasil ditetapkan.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pbl_groups/${groupId}`);
      toast.error('Gagal menetapkan ketua kelompok');
    }
  };

  const handleRemoveLeader = async (groupId: string) => {
    try {
      await updateDoc(doc(db, 'pbl_groups', groupId), {
        leader_id: null
      });
      toast.success('Ketua kelompok berhasil dibatalkan.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pbl_groups/${groupId}`);
      toast.error('Gagal membatalkan ketua kelompok');
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    
    try {
      await updateDoc(doc(db, 'pbl_groups', editingGroup.id), {
        group_name: editingGroup.group_name,
        dsn_pembimbing_id: editingGroup.dsn_pembimbing_id,
        pmb_lapangan_id: editingGroup.pmb_lapangan_id,
        tempat_pbl: editingGroup.tempat_pbl || '',
        prodi: editingGroup.prodi || null
      });
      toast.success('Kelompok PBL berhasil diperbarui.');
      setIsEditDialogOpen(false);
      setEditingGroup(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pbl_groups/${editingGroup.id}`);
      toast.error('Gagal memperbarui kelompok PBL');
    }
  };

  const handleAssignToGroup = async (memberId: string, groupId: string) => {
    if (!groupId) return;
    try {
      await updateDoc(doc(db, 'group_members', memberId), {
        group_id: groupId,
        status: 'Approved'
      });
      toast.success('Mahasiswa berhasil dimasukkan ke kelompok.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `group_members/${memberId}`);
      toast.error('Gagal memasukkan mahasiswa ke kelompok.');
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;
    try {
      await deleteDoc(doc(db, 'pbl_groups', groupToDelete.id));
      toast.success('Kelompok berhasil dihapus.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `pbl_groups/${groupToDelete.id}`);
      toast.error('Gagal menghapus kelompok.');
    } finally {
      setGroupToDelete(null);
    }
  };

  const handleAddMahasiswaToGroup = async (groupId: string, studentId: string) => {
    if (!studentId) return;
    try {
      // Check if they already have a group_members doc
      const existingMember = allGroupMembers.find(m => m.student_id === studentId);
      
      if (existingMember) {
        // Update existing
        await updateDoc(doc(db, 'group_members', existingMember.id), {
          group_id: groupId,
          status: 'Approved'
        });
      } else {
        // Create new
        const memberId = `member_${studentId}`;
        await setDoc(doc(db, 'group_members', memberId), {
          group_id: groupId,
          student_id: studentId,
          status: 'Approved',
          createdAt: new Date().toISOString()
        });
      }
      
      toast.success('Mahasiswa berhasil ditambahkan ke kelompok.');
      setSelectedMahasiswa('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `group_members`);
      toast.error('Gagal menambahkan mahasiswa ke kelompok.');
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      await updateDoc(doc(db, 'group_members', memberToRemove.id), {
        group_id: 'pending',
        status: 'Pending'
      });
      toast.success('Mahasiswa berhasil dikeluarkan dari kelompok.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `group_members/${memberToRemove.id}`);
      toast.error('Gagal mengeluarkan mahasiswa dari kelompok.');
    } finally {
      setMemberToRemove(null);
    }
  };

  // Get available mahasiswa (not in any group)
  const availableMahasiswa = allMahasiswa.filter(mhs => {
    const memberDoc = allGroupMembers.find(m => m.student_id === mhs.uid);
    return !memberDoc || memberDoc.status !== 'Approved' || memberDoc.group_id === 'pending';
  });

  const handleExportGroupsToExcel = () => {
    const dataToExport = groups.map(g => {
      const gMembers = allGroupMembers.filter(m => m.group_id === g.id && m.status === 'Approved');
      const gStudents = allMahasiswa.filter(s => gMembers.some(gm => gm.student_id === s.uid));
      const leader = gStudents.find(s => s.uid === g.leader_id);
      
      return {
        'Nama Kelompok': g.group_name,
        'Prodi': g.prodi || '-',
        'Tempat PBL': g.tempat_pbl || '-',
        'Dosen Pembimbing': dosenPembimbing.find(d => d.uid === g.dsn_pembimbing_id)?.name || '-',
        'Pembimbing Lapangan': pembimbingLapangan.find(pl => pl.uid === g.pmb_lapangan_id)?.name || '-',
        'Daftar Anggota': gStudents.map(s => s.name).join(', '),
        'Ketua Kelompok': leader?.name || '-',
        'Status': g.status,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daftar_Kelompok_PBL');
    XLSX.writeFile(workbook, 'Daftar_Kelompok_PBL.xlsx');
  };

  const handleExportGroupsToPdf = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("DAFTAR KELOMPOK PRAKTIK BELAJAR LAPANGAN", 148, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    const tableData = groups.map((g, index) => {
      const gMembers = allGroupMembers.filter(m => m.group_id === g.id && m.status === 'Approved');
      const gStudents = gMembers.map(gm => allMahasiswa.find(s => s.uid === gm.student_id)).filter(Boolean);
      
      return [
        index + 1,
        g.group_name,
        g.prodi || '-',
        dosenPembimbing.find(d => d.uid === g.dsn_pembimbing_id)?.name || '-',
        pembimbingLapangan.find(pl => pl.uid === g.pmb_lapangan_id)?.name || '-',
        gStudents.map(s => s?.name).join(', '),
        g.status
      ];
    });

    autoTable(doc, {
      startY: 30,
      head: [['No', 'Kelompok', 'Prodi', 'Dsn Pembimbing', 'Pem. Lapangan', 'Anggota', 'Status']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save('Daftar_Kelompok_PBL.pdf');
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold">Daftar Kelompok PBL</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportGroupsToExcel}>
              <Download className="w-4 h-4 mr-2" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportGroupsToPdf}>
              <Download className="w-4 h-4 mr-2" /> PDF
            </Button>
            <Dialog>
              <DialogTrigger render={<Button size="sm">Buat Kelompok Baru</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Buat Kelompok PBL</DialogTitle>
                <DialogDescription>
                  Tentukan nama kelompok dan pembimbingnya.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="group_name">Nama Kelompok</Label>
                  <Input id="group_name" value={newGroup.group_name} onChange={e => setNewGroup({...newGroup, group_name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>Program Studi Kelompok</Label>
                  <Select value={newGroup.prodi} onValueChange={(val: any) => setNewGroup({...newGroup, prodi: val})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Program Studi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="S1 Kesehatan dan Keselamatan Kerja">S1 Kesehatan dan Keselamatan Kerja</SelectItem>
                      <SelectItem value="S1 Kesehatan Lingkungan">S1 Kesehatan Lingkungan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dsn_pembimbing">Dosen Pembimbing</Label>
                  <Select value={newGroup.dsn_pembimbing_id} onValueChange={val => setNewGroup({...newGroup, dsn_pembimbing_id: val})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Dosen Pembimbing">
                        {newGroup.dsn_pembimbing_id ? dosenPembimbing.find(d => d.uid === newGroup.dsn_pembimbing_id)?.name : "Pilih Dosen Pembimbing"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {dosenPembimbing.map(d => (
                        <SelectItem key={d.uid} value={d.uid}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pmb_lapangan">Pembimbing Lapangan (Opsional)</Label>
                  <Select value={newGroup.pmb_lapangan_id} onValueChange={val => setNewGroup({...newGroup, pmb_lapangan_id: val === 'none' ? '' : val})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Pembimbing Lapangan">
                         {newGroup.pmb_lapangan_id && newGroup.pmb_lapangan_id !== 'none' ? pembimbingLapangan.find(p => p.uid === newGroup.pmb_lapangan_id)?.name : "Pilih Pembimbing Lapangan (Opsional)"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Belum Ditentukan</SelectItem>
                      {pembimbingLapangan.map(p => (
                        <SelectItem key={p.uid} value={p.uid}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tempat_pbl">Tempat PBL (Opsional)</Label>
                  <Input id="tempat_pbl" value={newGroup.tempat_pbl} onChange={e => setNewGroup({...newGroup, tempat_pbl: e.target.value})} placeholder="Contoh: PT. ABC Batam" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isCreatingGroup || !newGroup.dsn_pembimbing_id}>
                    {isCreatingGroup ? 'Menyimpan...' : 'Simpan'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>
        
        {groups.length === 0 ? (
          <div className="text-center py-8 text-slate-500 border rounded-lg">Belum ada kelompok PBL.</div>
        ) : (
          <>
            <div className="space-y-8">
              {(Object.entries(
                groups.reduce((acc, group) => {
                  const prodiName = group.prodi || "Program Studi Tidak Spesifik";
                  if (!acc[prodiName]) acc[prodiName] = [];
                  acc[prodiName].push(group);
                  return acc;
                }, {} as Record<string, any[]>)
              ) as unknown as [string, any[]][]).map(([prodi, prodiGroups]) => (
                <div key={prodi} className="space-y-4">
                  <div className="flex items-center gap-3 border-b pb-2">
                    <div className="h-2 w-2 bg-primary rounded-full"></div>
                    <h4 className="text-base font-semibold text-slate-800">{prodi}</h4>
                    <Badge variant="secondary" className="ml-auto">{prodiGroups.length} Kelompok</Badge>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {prodiGroups.map(group => {
                    const groupMembers = allGroupMembers.filter(m => m.group_id === group.id && m.status === 'Approved');
                    
                    return (
                      <div key={group.id} className="border rounded-lg p-4 space-y-4 bg-white relative group">
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingGroup(group);
                              setIsEditDialogOpen(true);
                            }}
                            title="Edit Kelompok"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setGroupToDelete(group)}
                            title="Hapus Kelompok"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex justify-between items-start pr-20">
                          <h4 className="font-semibold">{group.group_name}</h4>
                          <Badge>{group.status}</Badge>
                        </div>
                        <div className="text-sm text-slate-500 space-y-1">
                          <p><span className="font-medium">Dosen:</span> {dosenPembimbing.find(d => d.uid === group.dsn_pembimbing_id)?.name || 'Unknown'}</p>
                          <p><span className="font-medium">Lapangan:</span> {pembimbingLapangan.find(p => p.uid === group.pmb_lapangan_id)?.name || 'Unknown'}</p>
                        </div>
                        
                        <div className="pt-2 border-t">
                          <div className="text-sm font-medium mb-2">Anggota ({groupMembers.length})</div>
                          {groupMembers.length > 0 ? (
                            <ul className="text-sm space-y-2 mb-3">
                              {groupMembers.map(m => {
                                const mhs = allMahasiswa.find(u => u.uid === m.student_id);
                                return (
                                  <li key={m.id} className="flex items-center justify-between text-slate-600 bg-slate-50 p-1 rounded">
                                    <div className="flex items-center gap-2">
                                      {group.leader_id === m.student_id ? (
                                        <Crown className="h-4 w-4 text-amber-500" />
                                      ) : (
                                        <span className="w-4" /> // placeholder
                                      )}
                                      <span>{mhs?.name || m.student_id}</span>
                                    </div>
                                    <div className="flex items-center">
                                      {group.leader_id !== m.student_id ? (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                                          onClick={() => handleSetLeader(group.id, m.student_id)}
                                          title="Jadikan Ketua Kelompok"
                                        >
                                          <Crown className="h-3 w-3" />
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-slate-400 hover:text-amber-700 hover:bg-amber-50"
                                          onClick={() => handleRemoveLeader(group.id)}
                                          title="Batalkan Ketua Kelompok"
                                        >
                                          <Crown className="h-3 w-3 opacity-50 relative line-through" />
                                        </Button>
                                      )}
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => setMemberToRemove({ id: m.id, name: mhs?.name || m.student_id, groupName: group.group_name })}
                                        title="Keluarkan dari kelompok"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <div className="text-xs text-slate-400 mb-3 italic">Belum ada anggota</div>
                          )}
                          
                          {(() => {
                            const availableForGroup = availableMahasiswa.filter(mhs => {
                              if (group.prodi) {
                                return mhs.prodi === group.prodi;
                              }
                              return true;
                            });

                            const filteredAvailableForGroup = availableForGroup.filter(mhs => 
                              mhs.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) || 
                              ((mhs as any).id_number || '').toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                              mhs.email.toLowerCase().includes(studentSearchQuery.toLowerCase())
                            );

                            return (
                              <Dialog onOpenChange={(open) => {
                                if (!open) {
                                  setStudentSearchQuery('');
                                  setSelectedMahasiswa('');
                                }
                              }}>
                                <DialogTrigger render={<Button size="sm" variant="outline" className="w-full">Tambah Anggota</Button>} />
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Tambah Anggota ke {group.group_name}</DialogTitle>
                                    <DialogDescription>
                                      Pilih mahasiswa{group.prodi ? ` (${group.prodi})` : ''} yang belum memiliki kelompok.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                      <Label>Cari Mahasiswa</Label>
                                      <div className="relative w-full shadow-sm rounded-md">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                        <Input 
                                          className="pl-10 h-11 border-slate-300 bg-white focus-visible:ring-primary text-base placeholder:text-slate-400"
                                          placeholder="Ketik nama, NIM, atau email..." 
                                          value={studentSearchQuery}
                                          onChange={(e) => setStudentSearchQuery(e.target.value)}
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Daftar Mahasiswa Tersedia</Label>
                                      <Select value={selectedMahasiswa} onValueChange={setSelectedMahasiswa}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Pilih Mahasiswa...">
                                            {selectedMahasiswa && selectedMahasiswa !== 'none' ? availableForGroup.find(m => m.uid === selectedMahasiswa)?.name : "Pilih Mahasiswa..."}
                                          </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                          {filteredAvailableForGroup.length === 0 ? (
                                            <SelectItem value="none" disabled>Tidak ada mahasiswa ditemukan</SelectItem>
                                          ) : (
                                            filteredAvailableForGroup.map(mhs => (
                                              <SelectItem key={mhs.uid} value={mhs.uid}>{mhs.name}</SelectItem>
                                            ))
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <Button 
                                      className="w-full" 
                                      disabled={!selectedMahasiswa || selectedMahasiswa === 'none'}
                                      onClick={() => {
                                        handleAddMahasiswaToGroup(group.id, selectedMahasiswa);
                                        setStudentSearchQuery('');
                                      }}
                                    >
                                      Tambahkan
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            );
                          })()}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Kelompok PBL</DialogTitle>
                <DialogDescription>
                  Perbarui nama kelompok dan pembimbingnya.
                </DialogDescription>
              </DialogHeader>
              {editingGroup && (
                <form onSubmit={handleEditGroup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_group_name">Nama Kelompok</Label>
                    <Input 
                      id="edit_group_name" 
                      value={editingGroup.group_name} 
                      onChange={e => setEditingGroup({...editingGroup, group_name: e.target.value})} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Program Studi Kelompok</Label>
                    <Select value={editingGroup.prodi || 'Semua'} onValueChange={(val: any) => setEditingGroup({...editingGroup, prodi: val === 'Semua' ? null : val})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Program Studi" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Semua">Semua Program Studi (Tidak Dibatasi)</SelectItem>
                        <SelectItem value="S1 Kesehatan dan Keselamatan Kerja">S1 Kesehatan dan Keselamatan Kerja</SelectItem>
                        <SelectItem value="S1 Kesehatan Lingkungan">S1 Kesehatan Lingkungan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_dsn_pembimbing">Dosen Pembimbing</Label>
                    <Select 
                      value={editingGroup.dsn_pembimbing_id} 
                      onValueChange={val => setEditingGroup({...editingGroup, dsn_pembimbing_id: val})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Dosen Pembimbing">
                          {editingGroup.dsn_pembimbing_id ? dosenPembimbing.find(d => d.uid === editingGroup.dsn_pembimbing_id)?.name : "Pilih Dosen Pembimbing"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {dosenPembimbing.map(d => (
                          <SelectItem key={d.uid} value={d.uid}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_pmb_lapangan">Pembimbing Lapangan (Opsional)</Label>
                    <Select 
                      value={editingGroup.pmb_lapangan_id} 
                      onValueChange={val => setEditingGroup({...editingGroup, pmb_lapangan_id: val === 'none' ? '' : val})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Pembimbing Lapangan">
                          {editingGroup.pmb_lapangan_id && editingGroup.pmb_lapangan_id !== 'none' ? pembimbingLapangan.find(p => p.uid === editingGroup.pmb_lapangan_id)?.name : "Pilih Pembimbing Lapangan (Opsional)"}
                        </SelectValue>
                      </SelectTrigger>
                        <SelectContent>
                        <SelectItem value="none">Belum Ditentukan</SelectItem>
                        {pembimbingLapangan.map(p => (
                          <SelectItem key={p.uid} value={p.uid}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_tempat_pbl">Tempat PBL (Opsional)</Label>
                    <Input id="edit_tempat_pbl" value={editingGroup.tempat_pbl || ''} onChange={e => setEditingGroup({...editingGroup, tempat_pbl: e.target.value})} placeholder="Contoh: PT. ABC Batam" />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={!editingGroup.dsn_pembimbing_id}>
                      Simpan Perubahan
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
          </>
        )}
      </div>

      <Dialog open={!!groupToDelete} onOpenChange={(open) => !open && setGroupToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Hapus</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus kelompok <strong>{groupToDelete?.group_name}</strong>? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setGroupToDelete(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDeleteGroup}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keluarkan Anggota</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin mengeluarkan <strong>{memberToRemove?.name}</strong> dari kelompok <strong>{memberToRemove?.groupName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setMemberToRemove(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember}>
              Keluarkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
