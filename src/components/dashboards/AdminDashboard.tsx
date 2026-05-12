import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { RekapitulasiPBL } from './RekapitulasiPBL';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { BookOpen, FileText } from 'lucide-react';
import Markdown from 'react-markdown';
import userGuideAdminMd from '../../docs/USER_GUIDE_ADMIN.md?raw';
import { Link } from 'react-router-dom';

export const AdminDashboard = () => {
  const { profile } = useAuth();
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [totalMahasiswa, setTotalMahasiswa] = useState(0);
  const [totalNonMahasiswa, setTotalNonMahasiswa] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [openGuide, setOpenGuide] = useState(false);

  useEffect(() => {
    // Listen for all users
    const qAll = query(collection(db, 'users'));
    const unsubAll = onSnapshot(qAll, (snapshot) => {
      const users: UserProfile[] = [];
      let mhsCount = 0;
      let nonMhsCount = 0;
      
      snapshot.forEach((doc) => {
        const data = doc.data() as UserProfile;
        users.push(data);
        if (data.role === 'Mahasiswa') {
          mhsCount++;
        } else {
          nonMhsCount++;
        }
      });
      
      setAllUsers(users);
      setTotalMahasiswa(mhsCount);
      setTotalNonMahasiswa(nonMhsCount);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubAll();
    };
  }, []);

  const handleResetSystem = async () => {
    if (resetConfirmation !== 'RESET') {
      toast.error('Gagal memverifikasi kode reset.');
      return;
    }

    setIsResetDialogOpen(false);
    setIsResetting(true);
    setResetConfirmation('');
    toast.info("Memulai penghapusan data... Harap jangan tutup halaman ini.");

    try {
      const collectionsToClear = [
        'pbl_groups',
        'group_members',
        'logbooks',
        'attendances',
        'pbl_reports',
        'exam_schedules',
        'berita_acara',
        'grades'
      ];

      for (const collName of collectionsToClear) {
        const snapshot = await getDocs(collection(db, collName));
        const promises = snapshot.docs.map(d => deleteDoc(doc(db, collName, d.id)));
        await Promise.all(promises);
      }

      const usersSnapshot = await getDocs(collection(db, 'users'));
      const userDeletePromises = usersSnapshot.docs.map(document => {
        const data = document.data() as UserProfile;
        if (data.role !== 'Admin' && (data.role as any) !== 'Superadmin') {
           return deleteDoc(doc(db, 'users', document.id));
        }
      });
      
      await Promise.all(userDeletePromises.filter(p => p !== undefined));

      toast.success("Sistem berhasil direset. Semua user (kecuali admin) & data PBL telah dihapus.");
    } catch (error: any) {
      console.error(error);
      toast.error("Gagal melakukan reset sistem: " + error.message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-muted/30 p-4 rounded-xl border">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            Butuh Bantuan?
          </h2>
          <p className="text-sm text-slate-500">Baca panduan pengguna untuk mengetahui fitur dan alur aplikasi. Atau tanya AI asisten kami di pojok bawah.</p>
        </div>
        <Dialog open={openGuide} onOpenChange={setOpenGuide}>
          <DialogTrigger render={<Button className="whitespace-nowrap" />}>
            <FileText className="w-4 h-4 mr-2" />
            Baca Panduan Admin / Koordinator
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto w-full sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Panduan Pengguna - Admin / Koordinator</DialogTitle>
            </DialogHeader>
            <div className="mt-4 prose prose-slate prose-sm md:prose-base dark:prose-invert max-w-none">
              <Markdown
                components={{
                  a: ({ node, href, children, ...props }) => {
                    if (href && href.startsWith('/')) {
                      return (
                        <Link
                          to={href}
                          onClick={() => setOpenGuide(false)}
                          className="text-indigo-600 hover:text-indigo-800 underline"
                          {...(props as any)}
                        >
                          {children}
                        </Link>
                      );
                    }
                    return (
                      <a href={href} className="text-indigo-600 hover:text-indigo-800 underline" {...props}>
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {userGuideAdminMd}
              </Markdown>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Ikhtisar</h2>
        
        <Button variant="destructive" disabled={isResetting} onClick={() => setIsResetDialogOpen(true)}>
          {isResetting ? "Mereset..." : "Reset Sistem (Wipe Data)"}
        </Button>
        <Dialog open={isResetDialogOpen} onOpenChange={(open) => {
          setIsResetDialogOpen(open);
          if (!open) setResetConfirmation('');
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-red-600">Peringatan: Reset Sistem</DialogTitle>
              <DialogDescription>
                Tindakan ini akan <strong>menghapus SEMUA data</strong> (Mahasiswa, Dosen, Kelompok, Logbook, Nilai) kecuali akun Admin. Tindakan ini tidak dapat dibatalkan.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-slate-500 mb-2">Ketik <strong>RESET</strong> untuk mengonfirmasi:</p>
              <Input
                value={resetConfirmation}
                onChange={(e) => setResetConfirmation(e.target.value)}
                placeholder="RESET"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>Batal</Button>
              <Button variant="destructive" onClick={handleResetSystem} disabled={resetConfirmation !== 'RESET'}>Lanjutkan Reset</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Total Mahasiswa</div>
            <div className="text-2xl font-bold">{totalMahasiswa}</div>
            <div className="text-[0.75rem] mt-1 flex items-center gap-1 text-slate-500">
              Pengguna Mahasiswa
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Total Non-Mahasiswa</div>
            <div className="text-2xl font-bold">{totalNonMahasiswa}</div>
            <div className="text-[0.75rem] mt-1 flex items-center gap-1 text-slate-500">
              Admin, Dosen, Pembimbing
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Kelompok PBL</div>
            <div className="text-2xl font-bold">0</div>
            <div className="text-[0.75rem] mt-1 flex items-center gap-1 text-slate-500">
              Aktif
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rekapitulasi & Infografis</CardTitle>
          <CardDescription>Ringkasan data pelaksanaan PBL.</CardDescription>
        </CardHeader>
        <CardContent>
          <RekapitulasiPBL />
        </CardContent>
      </Card>
    </div>
  );
};
