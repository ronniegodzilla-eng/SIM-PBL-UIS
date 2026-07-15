import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, secondaryAuth } from '../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { generateTempPassword } from '../lib/utils';
import { UserProfile, useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export const ManajemenStaff = () => {
  const { profile } = useAuth();
  const [staffUsers, setStaffUsers] = useState<UserProfile[]>([]);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'Dosen' });

  useEffect(() => {
    const qStaff = query(collection(db, 'users'), where('role', 'in', ['AdminProdi', 'Dosen', 'PembimbingLapangan']));
    const unsubStaff = onSnapshot(qStaff, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => users.push(doc.data() as UserProfile));
      setStaffUsers(users);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsubStaff();
  }, []);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreatingStaff(true);
      
      const tempPassword = generateTempPassword();
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newStaff.email, tempPassword);
      const newUserId = userCredential.user.uid;
      
      await setDoc(doc(db, 'users', newUserId), {
        uid: newUserId,
        name: newStaff.name,
        email: newStaff.email,
        role: newStaff.role,
        account_status: 'Active',
        mustChangePassword: true,
        createdAt: new Date().toISOString()
      });
      
      await signOut(secondaryAuth);

      try { await navigator.clipboard.writeText(tempPassword); } catch { /* clipboard optional */ }
      toast.success(`Akun staff berhasil dibuat. Password sementara: ${tempPassword} (sudah disalin ke clipboard — sampaikan secara aman ke pemilik akun)`, { duration: 60000 });
      setNewStaff({ name: '', email: '', role: 'Dosen' });
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Email sudah terdaftar.');
      } else {
        toast.error('Gagal membuat akun staff');
      }
    } finally {
      setIsCreatingStaff(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manajemen Staff</h1>
        <p className="text-slate-500">Kelola akun Dosen Pembimbing, Penguji, dan Pembimbing Lapangan.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Daftar Staff</CardTitle>
            <CardDescription>Semua staff yang terdaftar di sistem.</CardDescription>
          </div>
          <Dialog>
            <DialogTrigger render={<Button>Tambah Staff</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Akun Staff</DialogTitle>
                <DialogDescription>
                  Buat akun untuk Dosen atau Pembimbing Lapangan.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateStaff} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Lengkap</Label>
                  <Input id="name" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Peran</Label>
                  <Select value={newStaff.role} onValueChange={val => setNewStaff({...newStaff, role: val})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Peran" />
                    </SelectTrigger>
                    <SelectContent>
                      {profile?.role === 'Admin' && (
                        <SelectItem value="AdminProdi">Admin Prodi</SelectItem>
                      )}
                      <SelectItem value="Dosen">Dosen</SelectItem>
                      <SelectItem value="PembimbingLapangan">Pembimbing Lapangan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isCreatingStaff}>
                    {isCreatingStaff ? 'Menyimpan...' : 'Simpan'}
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
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffUsers.map((user) => (
                <TableRow key={user.uid}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.account_status === 'Active' ? 'default' : 'secondary'}>
                      {user.account_status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
