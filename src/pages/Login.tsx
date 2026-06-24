import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loginWithGoogle, db, auth } from '../firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

export const Login = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('mode') === 'resetPassword') {
      navigate(`/auth/action?${searchParams.toString()}`);
    }
  }, [searchParams, navigate]);

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Silakan isi email dan password.');
      return;
    }

    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check if user has a profile
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const profile = userDoc.data();
        if (profile.account_status === 'Pending') {
          toast.error('Akun Anda masih dalam status Pending. Menunggu validasi Admin.');
          auth.signOut();
        } else if (profile.account_status === 'Blocked') {
          toast.error('Akun Anda telah diblokir.');
          auth.signOut();
        } else {
          await updateDoc(userDocRef, {
            lastLogin: new Date().toISOString()
          });
          toast.success('Login berhasil!');
          navigate('/dashboard');
        }
      } else {
        // No profile, redirect to register
        toast.info('Mohon lengkapi profil Anda terlebih dahulu.');
        navigate('/register');
      }
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        toast.error('Email atau password salah.');
      } else {
        toast.error('Gagal login. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast.error('Silakan masukkan email Anda.');
      return;
    }

    try {
      setIsResetting(true);
      await sendPasswordResetEmail(auth, resetEmail);
      toast.success('Jika email tersebut terdaftar, tautan reset password akan dikirim ke Inbox atau folder Spam Anda.');
      setIsResetDialogOpen(false);
      setResetEmail('');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/user-not-found') {
        toast.error('Pengguna dengan email ini tidak ditemukan (pastikan ejaan benar).');
      } else if (error.code === 'auth/invalid-email') {
        toast.error('Format email tidak valid.');
      } else {
        toast.error('Gagal mengirim email reset password. Coba lagi nanti.');
      }
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Login PBL</CardTitle>
          <CardDescription>
            Aplikasi Manajemen Ujian Pengalaman Belajar Lapangan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2 text-left">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="nama@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2 text-left">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Button 
                  type="button" 
                  variant="link" 
                  className="px-0 font-normal h-auto text-xs text-primary"
                  onClick={() => setIsResetDialogOpen(true)}
                >
                  Lupa Password?
                </Button>
              </div>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
            <Button 
              type="submit"
              className="w-full" 
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Login'}
            </Button>
          </form>

          <div className="text-sm text-center text-slate-500 mt-4 space-y-2">
            <div>
              Belum punya akun? <Link to="/register" className="text-primary hover:underline">Daftar sebagai Mahasiswa</Link>
            </div>
            <div className="pt-2 border-t text-xs">
              <Link to="/" className="text-slate-500 hover:text-primary flex items-center justify-center gap-1">
                &larr; Kembali ke Halaman Utama
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Masukkan alamat email yang Anda gunakan untuk mendaftar. Kami akan mengirimkan tautan untuk mengatur ulang password Anda.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input 
                  id="reset-email" 
                  type="email" 
                  placeholder="nama@email.com" 
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required 
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsResetDialogOpen(false)}
                disabled={isResetting}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isResetting || !resetEmail}>
                {isResetting ? 'Mengirim...' : 'Kirim Link Reset'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

