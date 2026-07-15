import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, getDocs, writeBatch, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { BulkImportUsers } from '../components/dashboards/BulkImportUsers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../components/ui/dropdown-menu';
import { MoreHorizontal, Key, Trash, UserCog, Edit2, Search, ArrowUp, ArrowDown, Replace } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { generateTempPassword } from '../lib/utils';

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
  const [manualPassword, setManualPassword] = useState('');
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  // Siapkan password acak setiap kali dialog reset dibuka.
  useEffect(() => {
    if (userToReset) setManualPassword(generateTempPassword());
  }, [userToReset]);
  
  const [isMigrateDialogOpen, setIsMigrateDialogOpen] = useState(false);
  const [userToMigrate, setUserToMigrate] = useState<UserProfile | null>(null);
  const [targetMigrationUid, setTargetMigrationUid] = useState<string>('');
  const [isMigrating, setIsMigrating] = useState(false);

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
      const userObj = allUsers.find(u => u.uid === userToReset);
      if (userObj && userObj.email) {
        const { sendPasswordResetEmail } = await import('firebase/auth');
        await sendPasswordResetEmail(auth, userObj.email);
        toast.success(
          `Link reset password terkirim ke ${userObj.email}. Minta pengguna memeriksa Inbox/Spam. ` +
          `Jika email tidak kunjung tiba, kemungkinan alamat ini berbeda dengan email login yang terdaftar — cek di Firebase Console > Authentication.`,
          { duration: 15000 }
        );
      } else {
        toast.error('Email pengguna tidak ditemukan.');
      }
    } catch (error: any) {
      console.error(error);
      // Firebase membatasi ketat frekuensi email reset; tanpa pesan spesifik,
      // admin mengira fiturnya rusak padahal cukup menunggu beberapa menit.
      if (error.code === 'auth/too-many-requests') {
        toast.error('Terlalu banyak permintaan reset dalam waktu singkat (batas keamanan Firebase). Tunggu 5-10 menit, lalu coba lagi.', { duration: 15000 });
      } else if (error.code === 'auth/user-not-found') {
        toast.error('Email ini tidak terdaftar di sistem login (Firebase Auth). Kemungkinan akun dibuat dengan email berbeda — cek di Firebase Console > Authentication.', { duration: 15000 });
      } else if (error.code === 'auth/invalid-email') {
        toast.error('Format email pengguna ini tidak valid.');
      } else if (error.code === 'auth/network-request-failed') {
        toast.error('Koneksi internet bermasalah. Coba lagi.');
      } else {
        toast.error(`Gagal mengirim link reset password. (${error.code || error.message || 'error tidak diketahui'})`, { duration: 10000 });
      }
    } finally {
      setUserToReset(null);
    }
  };

  // Reset password langsung (tanpa email) via backend Admin SDK.
  const handleDirectReset = async () => {
    if (!userToReset) return;
    if (manualPassword.length < 6) {
      toast.error('Password minimal 6 karakter.');
      return;
    }
    try {
      setIsSettingPassword(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error('Sesi Anda berakhir. Silakan login ulang.');
        return;
      }
      const resp = await fetch('/api/admin-reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUid: userToReset, newPassword: manualPassword })
      });
      const data = await resp.json().catch(() => ({} as any));
      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      try { await navigator.clipboard.writeText(manualPassword); } catch { /* clipboard optional */ }
      toast.success(
        `Password berhasil disetel: ${manualPassword} (tersalin ke clipboard). Sampaikan secara aman — pengguna wajib menggantinya saat login.`,
        { duration: 60000 }
      );
      setUserToReset(null);
    } catch (error: any) {
      console.error(error);
      toast.error(`Gagal menyetel password: ${error.message || 'error tidak diketahui'}`, { duration: 12000 });
    } finally {
      setIsSettingPassword(false);
    }
  };

  const executeMigration = async () => {
    if (!userToMigrate) return;
    if (!targetMigrationUid) {
      toast.error('Gagal: Anda harus memilih "Akun BARU" di pilihan bawah untuk melanjutkan migrasi.');
      return;
    }
    if (userToMigrate.uid === targetMigrationUid) {
      toast.error('Akun target tidak boleh sama dengan akun lama.');
      return;
    }

    setIsMigrating(true);
    try {
      const oldUid = userToMigrate.uid;
      const newUid = targetMigrationUid;
      const batch = writeBatch(db);

      // 1. Group Members
      const gmQuery = query(collection(db, 'group_members'), where('student_id', '==', oldUid));
      const gmDocs = await getDocs(gmQuery);
      gmDocs.forEach(d => batch.update(d.ref, { student_id: newUid }));

      // 2. PBL Groups (if leader)
      const groupQuery = query(collection(db, 'pbl_groups'), where('leader_id', '==', oldUid));
      const groupDocs = await getDocs(groupQuery);
      groupDocs.forEach(d => batch.update(d.ref, { leader_id: newUid }));

      // 3. Logbooks
      const logbookQuery = query(collection(db, 'logbooks'), where('student_id', '==', oldUid));
      const logbookDocs = await getDocs(logbookQuery);
      logbookDocs.forEach(d => batch.update(d.ref, { student_id: newUid }));

      // 4. Attendances
      const attQuery = query(collection(db, 'attendances'), where('student_id', '==', oldUid));
      const attDocs = await getDocs(attQuery);
      attDocs.forEach(d => batch.update(d.ref, { student_id: newUid }));

      // 5. Grades (as student)
      const gradesQuery = query(collection(db, 'grades'), where('student_id', '==', oldUid));
      const gradesDocs = await getDocs(gradesQuery);
      gradesDocs.forEach(d => {
        batch.update(d.ref, { student_id: newUid });
        // NOTE: we don't change grade ID as doc ID is static, but logic relies on student_id field
      });

      // 6. Grades (as evaluator - for peers or dosen)
      const gradesEvalQuery = query(collection(db, 'grades'), where('evaluator_id', '==', oldUid));
      const gradesEvalDocs = await getDocs(gradesEvalQuery);
      gradesEvalDocs.forEach(d => batch.update(d.ref, { evaluator_id: newUid }));

      // Update old user to Blocked so they can't be used
      batch.update(doc(db, 'users', oldUid), { account_status: 'Blocked', email: `MIGRATED_${userToMigrate.email}` });

      // Update new user to have the old user's role and approved status
      batch.update(doc(db, 'users', newUid), { 
        role: userToMigrate.role, 
        account_status: userToMigrate.account_status,
        name: userToMigrate.name
      });

      await batch.commit();

      toast.success(`Berhasil memigrasikan data dari ${userToMigrate.name} ke akun baru.`);
      setIsMigrateDialogOpen(false);
      setUserToMigrate(null);
      setTargetMigrationUid('');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal melakukan migrasi data: ' + err.message);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', userToDelete));
      toast.success('Pengguna berhasil dihapus');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userToDelete}`);
      toast.error('Gagal menghapus pengguna');
    } finally {
      setUserToDelete(null);
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
                <TableHead className="cursor-pointer" onClick={() => handleSort('lastLogin' as keyof UserProfile)}>
                  Terakhir Login <SortIcon field={'lastLogin' as keyof UserProfile} />
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
                  <TableCell className="text-xs text-slate-500">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleString('id-ID', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    }) : '-'}
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
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => {
                              setUserToMigrate(u);
                              setIsMigrateDialogOpen(true);
                            }}>
                              <Replace className="mr-2 h-4 w-4 text-amber-600" />
                              <span className="text-amber-600">Migrasi Data UID</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setUserToDelete(u.uid)} className="text-red-600">
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

      <Dialog open={isMigrateDialogOpen} onOpenChange={(open) => !open && !isMigrating && setIsMigrateDialogOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Migrasi Data Akun (Pemindahan UID)</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-slate-500">
              Gunakan fitur ini JIKA mahasiswa mendaftar ulang dengan email baru karena email lamanya tidak aktif. Anda dapat memindahkan semua Logbook, Nilai, dan Kelompok mereka dari akun lama ini ke akun mereka yang baru terdaftar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="p-3 bg-slate-50 rounded-md border text-sm">
              <p className="font-semibold mb-1">Cara Kerja:</p>
              <ul className="list-decimal pl-4 space-y-1 text-slate-600">
                <li>Minta Mahasiswa mendaftar ulang di aplikasi dengan email baru mereka yg aktif.</li>
                <li>Setelah mereka mendaftar, pilih Akun LAMA mereka di daftar pengguna, lalu klik <strong>"Migrasi Data UID"</strong>.</li>
                <li>Pilih Akun BARU mereka di bawah ini. Semua data akan ditransfer!</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Dari Akun LAMA (Data akan dipindahkan dari sini):</Label>
              <div className="p-3 bg-red-50 text-red-900 border border-red-200 rounded-md">
                <strong>{userToMigrate?.name}</strong> - {userToMigrate?.email}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ke Akun BARU (Tujuan pemindahan data):</Label>
              <Select value={targetMigrationUid} onValueChange={setTargetMigrationUid} disabled={isMigrating}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Akun Baru Mahasiswa..." />
                </SelectTrigger>
                <SelectContent className="max-h-[250px]">
                  {allUsers
                    .filter(u => u.uid !== userToMigrate?.uid)
                    .map(u => (
                      <SelectItem key={u.uid} value={u.uid}>
                        {u.name} ({u.email}) - {u.account_status}
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMigrateDialogOpen(false)} disabled={isMigrating}>Batal</Button>
            <Button onClick={executeMigration} disabled={isMigrating} className="bg-amber-600 hover:bg-amber-700 text-white">
              {isMigrating ? 'Memproses...' : 'Jalankan Migrasi Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!userToReset} onOpenChange={(open) => !open && setUserToReset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password Pengguna</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-slate-500">
              Pilih salah satu cara di bawah ini.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Opsi 1: Setel langsung */}
            <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
              <div>
                <div className="font-semibold text-sm text-slate-800">Opsi 1 — Setel Password Langsung (disarankan)</div>
                <p className="text-xs text-slate-500 mt-1">
                  Password baru langsung aktif tanpa email — cocok saat email pengguna bermasalah.
                  Pengguna akan diwajibkan mengganti password ini saat login.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-password">Password Baru</Label>
                <div className="flex gap-2">
                  <Input
                    id="manual-password"
                    value={manualPassword}
                    onChange={(e) => setManualPassword(e.target.value)}
                    minLength={6}
                    className="font-mono"
                  />
                  <Button type="button" variant="outline" onClick={() => setManualPassword(generateTempPassword())}>
                    Acak Ulang
                  </Button>
                </div>
              </div>
              <Button onClick={handleDirectReset} disabled={isSettingPassword || manualPassword.length < 6} className="w-full">
                {isSettingPassword ? 'Menyetel...' : 'Setel Password Ini'}
              </Button>
            </div>

            {/* Opsi 2: Kirim email */}
            <div className="border rounded-lg p-4 space-y-3">
              <div>
                <div className="font-semibold text-sm text-slate-800">Opsi 2 — Kirim Email Reset</div>
                <p className="text-xs text-slate-500 mt-1">
                  Pengguna menerima email berisi link resmi Firebase untuk mengatur password barunya sendiri.
                  Hanya berfungsi jika email pengguna masih aktif; periksa juga folder Spam.
                </p>
              </div>
              <Button variant="outline" onClick={confirmResetPassword} className="w-full border-amber-500 text-amber-700 hover:bg-amber-50">
                Kirim Email Reset
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setUserToReset(null)}>Batal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Hapus Pengguna</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-slate-500">
              Apakah Anda yakin ingin menghapus pengguna ini secara permanen?
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserToDelete(null)}>Batal</Button>
            <Button onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

