import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { BulkImportUsers } from '../components/dashboards/BulkImportUsers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { MoreHorizontal, Key, Trash, UserCog, Edit2, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';

export const ManajemenUser = () => {
  const { profile, impersonateUser } = useAuth();
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [isEditNameDialogOpen, setIsEditNameDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof UserProfile>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [userToReset, setUserToReset] = useState<string | null>(null);

  const handleSort = (field: keyof UserProfile) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    const qAll = query(collection(db, 'users'));
    const unsubAll = onSnapshot(qAll, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => users.push(doc.data() as UserProfile));
      setAllUsers(users);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsubAll();
  }, []);

  const confirmResetPassword = async () => {
    if (!userToReset) return;
    try {
      await updateDoc(doc(db, 'users', userToReset), {
        mustChangePassword: true
      });
      toast.success('Berhasil mereset. (Mohon diingat: Di environment real, perubahan password DB Auth memerlukan admin SDK/Cloud Function. Sistem ini akan memaksa user ganti pass)');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userToReset}`);
      toast.error('Gagal mereset password');
    } finally {
      setUserToReset(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus pengguna ini? Tindakan ini tidak dapat dibatalkan.')) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        toast.success('Pengguna berhasil dihapus');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
        toast.error('Gagal menghapus pengguna');
      }
    }
  };

  const handleChangeRole = async () => {
    if (!selectedUser || !newRole) return;
    try {
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        role: newRole
      });
      toast.success('Role pengguna berhasil diubah');
      setIsRoleDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${selectedUser.uid}`);
      toast.error('Gagal mengubah role');
    }
  };

  const handleEditName = async () => {
    if (!selectedUser || !newName.trim()) return;
    try {
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        name: newName.trim()
      });
      toast.success('Nama pengguna berhasil diubah');
      setIsEditNameDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${selectedUser.uid}`);
      toast.error('Gagal mengubah nama');
    }
  };

  const filteredAndSortedUsers = allUsers
    .filter(u => 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.account_status.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = String(a[sortField] || '').toLowerCase();
      const bVal = String(b[sortField] || '').toLowerCase();
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const SortIcon = ({ field }: { field: keyof UserProfile }) => {
    if (sortField !== field) return <ArrowDown className="ml-2 h-4 w-4 text-slate-300 inline-block" />;
    return sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 inline-block" /> : <ArrowDown className="ml-2 h-4 w-4 inline-block" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manajemen User</h1>
          <p className="text-slate-500">Kelola semua pengguna sistem.</p>
        </div>
        <div className="relative w-full max-w-sm lg:max-w-md shadow-sm rounded-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input 
            className="pl-10 h-11 border-slate-300 bg-white focus-visible:ring-primary text-base placeholder:text-slate-400" 
            placeholder="Cari pengguna..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Semua Pengguna</CardTitle>
            <CardDescription>Daftar semua pengguna yang terdaftar di sistem.</CardDescription>
          </div>
          <BulkImportUsers />
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
                <TableHead className="cursor-pointer" onClick={() => handleSort('role')}>
                  Peran <SortIcon field="role" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('account_status')}>
                  Status <SortIcon field="account_status" />
                </TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedUsers.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={u.account_status === 'Active' ? 'default' : 'secondary'}>
                      {u.account_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {u.uid !== profile?.uid && (
                        <Button size="sm" variant="outline" onClick={() => impersonateUser(u.uid)}>
                          Login Sebagai
                        </Button>
                      )}
                      
                      {profile?.role === 'Admin' && u.uid !== profile?.uid && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Buka menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          } />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(u);
                              setNewName(u.name);
                              setIsEditNameDialogOpen(true);
                            }}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              <span>Edit Nama</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(u);
                              setNewRole(u.role);
                              setIsRoleDialogOpen(true);
                            }}>
                              <UserCog className="mr-2 h-4 w-4" />
                              <span>Ubah Role</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setUserToReset(u.uid)}>
                              <Key className="mr-2 h-4 w-4" />
                              <span>Reset Password</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteUser(u.uid)} className="text-red-600">
                              <Trash className="mr-2 h-4 w-4" />
                              <span>Hapus Pengguna</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Role Pengguna</DialogTitle>
            <DialogDescription>
              Ubah peran untuk {selectedUser?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role Baru</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="AdminProdi">Admin Prodi</SelectItem>
                  <SelectItem value="Dosen">Dosen</SelectItem>
                  <SelectItem value="PembimbingLapangan">Pembimbing Lapangan</SelectItem>
                  <SelectItem value="Mahasiswa">Mahasiswa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Batal</Button>
            <Button onClick={handleChangeRole}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isEditNameDialogOpen} onOpenChange={setIsEditNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Nama Pengguna</DialogTitle>
            <DialogDescription>
              Ubah nama untuk pengguna ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nama Lengkap</Label>
              <Input 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Masukkan nama lengkap"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditNameDialogOpen(false)}>Batal</Button>
            <Button onClick={handleEditName}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!userToReset} onOpenChange={(open) => !open && setUserToReset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password Pengguna</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-slate-500">
              Apakah Anda yakin ingin mereset password pengguna ini menjadi <strong>"ubahsaya"</strong>?
              <br /><br />
              Pengguna akan diwajibkan untuk mengganti password tersebut pada saat login berikutnya.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserToReset(null)}>Batal</Button>
            <Button onClick={confirmResetPassword} className="bg-amber-600 hover:bg-amber-700">Ya, Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
