import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, secondaryAuth } from '../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { UserProfile, ProgramStudi, Jalur } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { generateTempPassword } from '../lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Edit2, MoreHorizontal, ArrowDown, ArrowUp, Search } from 'lucide-react';

export const ManajemenMahasiswa = () => {
  const [allMahasiswa, setAllMahasiswa] = useState<UserProfile[]>([]);
  const [isCreatingMahasiswa, setIsCreatingMahasiswa] = useState(false);
  const [newMahasiswa, setNewMahasiswa] = useState({ name: '', email: '', prodi: '' as ProgramStudi | '', jalur: '' as Jalur | '' });
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMahasiswa, setEditingMahasiswa] = useState<UserProfile | null>(null);
  const [editProdi, setEditProdi] = useState<ProgramStudi | ''>('');
  const [editJalur, setEditJalur] = useState<Jalur | ''>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof UserProfile>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedPendingUsers, setSelectedPendingUsers] = useState<string[]>([]);

  const handleSort = (field: keyof UserProfile) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    const qMhs = query(collection(db, 'users'), where('role', '==', 'Mahasiswa'));
    const unsubMhs = onSnapshot(qMhs, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => users.push(doc.data() as UserProfile));
      setAllMahasiswa(users);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsubMhs();
  }, []);

  const handleApproveUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        account_status: 'Active'
      });
      toast.success('Akun mahasiswa berhasil divalidasi');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      toast.error('Gagal memvalidasi akun');
    }
  };

  const handleMassApprove = async () => {
    if (selectedPendingUsers.length === 0) return;
    
    try {
      const promises = selectedPendingUsers.map(userId => 
        updateDoc(doc(db, 'users', userId), {
          account_status: 'Active'
        })
      );
      await Promise.all(promises);
      toast.success(`${selectedPendingUsers.length} akun mahasiswa berhasil divalidasi`);
      setSelectedPendingUsers([]);
    } catch (error) {
       toast.error('Gagal memvalidasi sebagian/semua akun');
    }
  };

  const handleEditMahasiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMahasiswa || !editProdi || !editJalur) return;

    try {
      await updateDoc(doc(db, 'users', editingMahasiswa.uid), {
        prodi: editProdi,
        jalur: editJalur
      });
      toast.success('Data mahasiswa berhasil diperbarui');
      setIsEditDialogOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingMahasiswa.uid}`);
      toast.error('Gagal memperbarui data mahasiswa');
    }
  };

  const handleCreateMahasiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMahasiswa.prodi || !newMahasiswa.jalur) {
      toast.error('Pilih prodi dan jalur.');
      return;
    }
    try {
      setIsCreatingMahasiswa(true);
      
      const tempPassword = generateTempPassword();
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newMahasiswa.email, tempPassword);
      const newUserId = userCredential.user.uid;
      
      await setDoc(doc(db, 'users', newUserId), {
        uid: newUserId,
        name: newMahasiswa.name,
        email: newMahasiswa.email,
        role: 'Mahasiswa',
        prodi: newMahasiswa.prodi,
        jalur: newMahasiswa.jalur,
        account_status: 'Active',
        mustChangePassword: true,
        createdAt: new Date().toISOString()
      });
      
      await signOut(secondaryAuth);
      
      try { await navigator.clipboard.writeText(tempPassword); } catch { /* clipboard optional */ }
      toast.success(`Akun mahasiswa berhasil dibuat. Password sementara: ${tempPassword} (sudah disalin ke clipboard — sampaikan secara aman ke mahasiswa)`, { duration: 60000 });
      setNewMahasiswa({ name: '', email: '', prodi: '', jalur: '' });
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Email sudah terdaftar.');
      } else {
        toast.error('Gagal membuat akun mahasiswa');
      }
    } finally {
      setIsCreatingMahasiswa(false);
    }
  };

  const filteredAndSortedMahasiswa = allMahasiswa
    .filter(mhs => 
      mhs.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      mhs.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mhs.prodi || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mhs.jalur || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = String(a[sortField] || '').toLowerCase();
      const bVal = String(b[sortField] || '').toLowerCase();
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const pendingUsers = filteredAndSortedMahasiswa.filter(m => m.account_status === 'Pending');
  const activeUsers = filteredAndSortedMahasiswa.filter(m => m.account_status === 'Active');

  const SortIcon = ({ field }: { field: keyof UserProfile }) => {
    if (sortField !== field) return <ArrowDown className="ml-2 h-4 w-4 text-slate-300 inline-block" />;
    return sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 inline-block" /> : <ArrowDown className="ml-2 h-4 w-4 inline-block" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manajemen Mahasiswa</h1>
        <p className="text-slate-500">Kelola data dan status akun mahasiswa secara detail.</p>
      </div>

      <div className="flex items-center space-x-2 w-full max-w-sm lg:max-w-md">
        <div className="relative w-full shadow-sm rounded-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input 
            className="pl-10 h-11 border-slate-300 bg-white focus-visible:ring-primary text-base placeholder:text-slate-400" 
            placeholder="Cari mahasiswa..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {pendingUsers.length > 0 && (
        <Card className="border-orange-200 shadow-sm">
          <CardHeader className="bg-orange-50/50 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-orange-800">Validasi Mahasiswa Tertunda</CardTitle>
              <CardDescription>Pendaftar mandiri yang menunggu verifikasi admin.</CardDescription>
            </div>
            {selectedPendingUsers.length > 0 && (
              <Button onClick={handleMassApprove} size="sm">
                Setujui Terpilih ({selectedPendingUsers.length})
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <div className="flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 w-4 h-4 cursor-pointer"
                        checked={pendingUsers.length > 0 && selectedPendingUsers.length === pendingUsers.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPendingUsers(pendingUsers.map(u => u.uid));
                          } else {
                            setSelectedPendingUsers([]);
                          }
                        }}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                    Nama <SortIcon field="name" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('email')}>
                    Email <SortIcon field="email" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('prodi')}>
                    Program Studi <SortIcon field="prodi" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('jalur')}>
                    Jalur <SortIcon field="jalur" />
                  </TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((user) => (
                  <TableRow key={user.uid}>
                    <TableCell className="text-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 w-4 h-4 cursor-pointer"
                        checked={selectedPendingUsers.includes(user.uid)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPendingUsers(prev => [...prev, user.uid]);
                          } else {
                            setSelectedPendingUsers(prev => prev.filter(id => id !== user.uid));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.prodi || '-'}</TableCell>
                    <TableCell>{user.jalur || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => handleApproveUser(user.uid)}>Setujui</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Daftar Semua Mahasiswa</CardTitle>
            <CardDescription>Semua rekam jejak akun mahasiswa.</CardDescription>
          </div>
          <Dialog>
            <DialogTrigger render={<Button>Tambah Mahasiswa</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Akun Mahasiswa</DialogTitle>
                <DialogDescription>
                  Buat akun mahasiswa secara manual. Password sementara dibuat acak dan ditampilkan setelah akun berhasil dibuat.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateMahasiswa} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mhs-name">Nama Lengkap</Label>
                  <Input id="mhs-name" value={newMahasiswa.name} onChange={e => setNewMahasiswa({...newMahasiswa, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mhs-email">Email</Label>
                  <Input id="mhs-email" type="email" value={newMahasiswa.email} onChange={e => setNewMahasiswa({...newMahasiswa, email: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>Program Studi</Label>
                  <Select value={newMahasiswa.prodi} onValueChange={(val: any) => setNewMahasiswa({...newMahasiswa, prodi: val})} required>
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
                  <Label>Jalur</Label>
                  <Select value={newMahasiswa.jalur} onValueChange={(val: any) => setNewMahasiswa({...newMahasiswa, jalur: val})} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Jalur" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Reg A">Reg A</SelectItem>
                      <SelectItem value="Reg B">Reg B</SelectItem>
                      <SelectItem value="Reg C">Reg C</SelectItem>
                      <SelectItem value="RPL">RPL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isCreatingMahasiswa}>
                    {isCreatingMahasiswa ? 'Menyimpan...' : 'Simpan'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                  Nama <SortIcon field="name" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('email')}>
                  Email <SortIcon field="email" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('prodi')}>
                  Program Studi <SortIcon field="prodi" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('jalur')}>
                  Jalur <SortIcon field="jalur" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('account_status')}>
                  Status <SortIcon field="account_status" />
                </TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeUsers.map((user) => (
                <TableRow key={user.uid}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.prodi || '-'}</TableCell>
                  <TableCell>{user.jalur || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={user.account_status === 'Active' ? 'default' : 'secondary'}>{user.account_status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Buka menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      } />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setEditingMahasiswa(user);
                          setEditProdi(user.prodi || '');
                          setEditJalur(user.jalur || '');
                          setIsEditDialogOpen(true);
                        }}>
                          <Edit2 className="mr-2 h-4 w-4" />
                          <span>Edit Info Akademik</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Info Akademik</DialogTitle>
            <DialogDescription>
              Ubah program studi dan jalur masuk mahasiswa.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditMahasiswa} className="space-y-4">
            <div className="space-y-2">
              <Label>Program Studi</Label>
              <Select value={editProdi} onValueChange={(val: any) => setEditProdi(val)} required>
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
              <Label>Jalur Masuk</Label>
              <Select value={editJalur} onValueChange={(val: any) => setEditJalur(val)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Jalur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Reg A">Reg A</SelectItem>
                  <SelectItem value="Reg B">Reg B</SelectItem>
                  <SelectItem value="Reg C">Reg C</SelectItem>
                  <SelectItem value="RPL">RPL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit">Simpan Perubahan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
