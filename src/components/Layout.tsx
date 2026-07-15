import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logout, db, storage, handleFirestoreError, OperationType, auth } from '../firebase';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc, getDocs, query, collection, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from './ui/button';
import { LogOut, User as UserIcon, LayoutDashboard, Settings, X, Users, UserCog, UsersIcon, Group, FileText, Calendar, Menu, Home } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from './ui/sheet';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { uploadToGoogleDrive } from '../lib/uploadFile';

export const Layout = () => {
  const { user, profile, loading, isImpersonating, stopImpersonating, originalProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editName, setEditName] = useState(profile?.name || '');
  const [uploading, setUploading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Force password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [isChangePwdOpen, setIsChangePwdOpen] = useState(false);

  const [isDPL, setIsDPL] = useState(false);
  const [isPenguji, setIsPenguji] = useState(false);
  const [isPL, setIsPL] = useState(false);

  useEffect(() => {
    const checkRoles = async () => {
      if (!profile || profile.role !== 'Dosen') return;

      try {
        const pblQuery = query(collection(db, 'pbl_groups'), where('dsn_pembimbing_id', '==', profile.uid));
        const pblSnap = await getDocs(pblQuery);
        setIsDPL(!pblSnap.empty);

        const examQuery = query(collection(db, 'exam_schedules'), where('penguji_id', '==', profile.uid));
        const examSnap = await getDocs(examQuery);
        setIsPenguji(!examSnap.empty);

        const plQuery = query(collection(db, 'pbl_groups'), where('pmb_lapangan_id', '==', profile.uid));
        const plSnap = await getDocs(plQuery);
        setIsPL(!plSnap.empty);
      } catch (error) {
        console.error("Failed to check roles:", error);
      }
    };

    checkRoles();
  }, [profile]);

  useEffect(() => {
    if (profile) {
      setEditName(profile.name);
    }
  }, [profile]);

  // Auto-fix admin role if it was accidentally set to Mahasiswa
  useEffect(() => {
    const fixAdminRole = async () => {
      if (user?.email === 'ronniegodzilla@gmail.com' && profile && profile.role !== 'Admin') {
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            role: 'Admin',
            account_status: 'Active'
          });
          toast.success('Role Superadmin berhasil dipulihkan. Silakan refresh halaman.');
        } catch (error) {
          console.error('Failed to fix admin role:', error);
        }
      }
    };
    fixAdminRole();
  }, [user, profile]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!user || !profile) {
    return <Navigate to="/" replace />;
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUploading(true);
      await updateDoc(doc(db, 'users', profile.uid), {
        name: editName
      });
      toast.success('Profil berhasil diperbarui');
      setIsProfileOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
      toast.error('Gagal memperbarui profil');
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    try {
      setUploading(true);
      const photoURL = await uploadToGoogleDrive(file, `profile_${profile.uid}`);
      
      await updateDoc(doc(db, 'users', profile.uid), {
        photoURL
      });
      toast.success('Foto profil berhasil diperbarui');
    } catch (error: any) {
      console.error(error);
      if (error.message && (error.message.includes('Google Apps Script') || error.message.includes('DriveApp'))) {
        toast.error(`Error Google Drive: ${error.message}.`);
      } else {
        toast.error('Gagal mengunggah foto');
      }
    } finally {
      setUploading(false);
    }
  };

  const getDriveImageUrl = (url: string) => {
    if (!url) return url;
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
    }
    return url;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Password baru dan konfirmasi tidak cocok');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    try {
      setChangingPassword(true);
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        await updateDoc(doc(db, 'users', profile.uid), {
          mustChangePassword: false
        });
        toast.success('Password berhasil diubah');
        setNewPassword('');
        setConfirmPassword('');
        setIsChangePwdOpen(false);
      }
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/requires-recent-login') {
        toast.error('Sesi Anda telah berakhir. Silakan login ulang untuk mengubah password.');
        logout();
      } else {
        toast.error('Gagal mengubah password');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const navItems = [
    { name: 'Halaman Depan', path: '/', icon: Home },
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  ];

  if (profile?.role === 'Admin' || profile?.role === 'AdminProdi') {
    navItems.push({ name: 'Manajemen Mahasiswa', path: '/manajemen-mahasiswa', icon: Users });
    navItems.push({ name: 'Manajemen Staff', path: '/manajemen-staff', icon: UserCog });
    navItems.push({ name: 'Manajemen Kelompok', path: '/manajemen-kelompok', icon: Group });
    navItems.push({ name: 'Manajemen Informasi', path: '/manajemen-informasi', icon: FileText });
    navItems.push({ name: 'Manajemen Ujian', path: '/manajemen-ujian', icon: FileText });
    navItems.push({ name: 'Manajemen User', path: '/manajemen-user', icon: UsersIcon });
    navItems.push({ name: 'Manajemen Rubrik', path: '/manajemen-rubrik', icon: FileText });
    navItems.push({ name: 'Rekap Logbook', path: '/rekap-logbook', icon: FileText });
    navItems.push({ name: 'Absensi Sosialisasi', path: '/penilaian', icon: FileText });
    navItems.push({ name: 'Rekap Nilai', path: '/rekap-nilai', icon: LayoutDashboard });
    navItems.push({ name: 'Monitoring Kinerja', path: '/monitoring-kinerja', icon: FileText });
  }

  if (['PembimbingLapangan', 'Penguji'].includes(profile?.role || '') || (profile?.role === 'Dosen' && (isDPL || isPenguji || isPL))) {
    navItems.push({ name: 'Penilaian', path: '/penilaian', icon: FileText });
  }

  if (profile?.role === 'Dosen' && isDPL) {
    navItems.push({ name: 'Berita Acara & Kehadiran', path: '/berita-acara', icon: Calendar });
    navItems.push({ name: 'Rekap Logbook', path: '/rekap-logbook', icon: FileText });
    navItems.push({ name: 'Bimbingan Laporan', path: '/bimbingan-laporan', icon: FileText });
  }

  if (profile?.role === 'PembimbingLapangan' || (profile?.role === 'Dosen' && isPL)) {
    navItems.push({ name: 'Persetujuan Harian', path: '/persetujuan-absensi', icon: FileText });
  }

  if (profile?.role === 'Mahasiswa') {
    navItems.push({ name: 'Logbook & Absensi', path: '/logbook', icon: FileText });
    navItems.push({ name: 'Bimbingan Laporan', path: '/bimbingan-laporan-mahasiswa', icon: FileText });
    navItems.push({ name: 'Pendaftaran Ujian', path: '/ujian', icon: FileText });
    navItems.push({ name: 'Penilaian Teman', path: '/penilaian-teman', icon: Users });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Force Password Change Modal */}
      <Dialog open={!!((profile as any)?.mustChangePassword && !isImpersonating)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Password Default</DialogTitle>
            <DialogDescription>
              Demi keamanan, Anda diwajibkan untuk mengubah password default sebelum dapat menggunakan aplikasi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Password Baru</Label>
              <Input 
                id="new-password" 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                required 
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
              <Input 
                id="confirm-password" 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                required 
                minLength={6}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={changingPassword} className="w-full">
                {changingPassword ? 'Menyimpan...' : 'Ubah Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-60 bg-sidebar text-sidebar-foreground flex-col py-6 shrink-0">
        <div className="px-6 pb-8 font-bold text-xl flex items-center gap-2.5">
          <div className="w-6 h-6 bg-primary rounded-md shrink-0"></div>
          <span className="truncate">Sistem Informasi PBL</span>
        </div>
        
        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "px-6 py-3 flex items-center gap-3 text-sm border-l-[3px] transition-colors",
                  isActive 
                    ? "text-white bg-sidebar-accent border-primary" 
                    : "text-slate-400 border-transparent hover:text-white hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {isImpersonating && (
          <div className="bg-yellow-500 text-white px-4 py-2 flex flex-col sm:flex-row items-center justify-between shrink-0 gap-2 text-center sm:text-left">
            <div className="text-sm font-medium">
              Anda sedang login sebagai <strong>{profile.name}</strong> ({profile.role}).
            </div>
            <Button size="sm" variant="secondary" onClick={stopImpersonating} className="w-full sm:w-auto">
              <X className="w-4 h-4 mr-2" />
              Kembali ke Admin
            </Button>
          </div>
        )}
        {/* Top Nav */}
        <header className="h-16 bg-card border-b flex items-center justify-between px-4 sm:px-8 shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile Sidebar Toggle */}
            <nav className="md:hidden">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger render={
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle navigation menu</span>
                  </Button>
                } />
                <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground border-r-0">
                  <SheetHeader className="p-6 text-left border-b border-border/10">
                    <SheetTitle className="font-bold text-xl flex items-center gap-2.5 text-white">
                      <div className="w-6 h-6 bg-primary rounded-md shrink-0"></div>
                      <span className="truncate">Sistem Informasi PBL</span>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="py-4 flex flex-col gap-1 h-full overflow-y-auto">
                    {navItems.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.name}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "px-6 py-3 flex items-center gap-3 text-sm border-l-[3px] transition-colors",
                            isActive 
                              ? "text-white bg-sidebar-accent border-primary" 
                              : "text-slate-400 border-transparent hover:text-white hover:bg-sidebar-accent/50"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.name}
                        </Link>
                      )
                    })}
                  </div>
                </SheetContent>
              </Sheet>
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-[0.85rem] font-semibold leading-none mb-1">{profile.name}</div>
              <div className="text-[0.75rem] text-muted-foreground leading-none">{profile.role}</div>
            </div>
            
            <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="ghost" size="icon" className="rounded-full bg-slate-200 h-8 w-8 hover:bg-slate-300 overflow-hidden">
                    {(profile as any).photoURL ? (
                      <img src={getDriveImageUrl((profile as any).photoURL)} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon className="h-4 w-4 text-slate-600" />
                    )}
                  </Button>
                } />
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{profile.name}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DialogTrigger nativeButton={false} render={
                    <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Edit Profil</span>
                    </DropdownMenuItem>
                  } />
                  <DropdownMenuItem onClick={() => setIsChangePwdOpen(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Ubah Password</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => logout()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Profil</DialogTitle>
                  <DialogDescription>Perbarui informasi profil dan foto Anda.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Foto Profil</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                        {(profile as any).photoURL ? (
                          <img src={getDriveImageUrl((profile as any).photoURL)} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <UserIcon className="h-8 w-8 text-slate-400" />
                        )}
                      </div>
                      <Input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} className="max-w-xs" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Lengkap</Label>
                    <Input id="name" value={editName} onChange={e => setEditName(e.target.value)} required />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={uploading}>
                      {uploading ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Manual Change Password Modal */}
            <Dialog open={isChangePwdOpen} onOpenChange={setIsChangePwdOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Ubah Password</DialogTitle>
                  <DialogDescription>
                    Perbarui keamanan akun Anda
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Password Baru</Label>
                    <Input 
                      id="new-password" 
                      type="password" 
                      value={newPassword} 
                      onChange={e => setNewPassword(e.target.value)} 
                      required 
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
                    <Input 
                      id="confirm-password" 
                      type="password" 
                      value={confirmPassword} 
                      onChange={e => setConfirmPassword(e.target.value)} 
                      required 
                      minLength={6}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsChangePwdOpen(false)}>Batal</Button>
                    <Button type="submit" disabled={changingPassword}>
                      {changingPassword ? 'Menyimpan...' : 'Perbarui Password'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
                   
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-auto p-4 md:p-8 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
