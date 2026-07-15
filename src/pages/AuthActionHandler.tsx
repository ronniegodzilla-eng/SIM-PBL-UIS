import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../firebase';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export const AuthActionHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');
  
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isValidCode, setIsValidCode] = useState<boolean | null>(null);

  useEffect(() => {
    if (mode === 'resetPassword' && oobCode) {
      verifyPasswordResetCode(auth, oobCode)
        .then((emailRes) => {
          setEmail(emailRes);
          setIsValidCode(true);
        })
        .catch((error) => {
          console.error(error);
          setIsValidCode(false);
          toast.error('Tautan reset password tidak valid atau sudah kadaluarsa.');
        });
    } else {
      navigate('/login');
    }
  }, [mode, oobCode, navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password minimal 6 karakter.');
      return;
    }
    
    if (!oobCode) return;

    try {
      setLoading(true);
      await confirmPasswordReset(auth, oobCode, newPassword);
      toast.success('Password berhasil diubah. Silakan login dengan password baru.');
      navigate('/login');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/expired-action-code') {
        toast.error('Tautan reset password sudah kadaluarsa. Minta tautan baru lewat "Lupa Password" di halaman login.', { duration: 12000 });
        setIsValidCode(false);
      } else if (error.code === 'auth/invalid-action-code') {
        toast.error('Tautan reset password sudah pernah dipakai atau tidak valid. Minta tautan baru lewat "Lupa Password".', { duration: 12000 });
        setIsValidCode(false);
      } else if (error.code === 'auth/weak-password') {
        toast.error('Password terlalu lemah. Gunakan minimal 6 karakter.');
      } else if (error.code === 'auth/network-request-failed') {
        toast.error('Koneksi internet bermasalah. Coba lagi.');
      } else {
        toast.error('Gagal mengubah password: ' + (error.code || error.message || 'Error tidak diketahui'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (isValidCode === null) {
    return <div className="min-h-screen flex items-center justify-center">Memverifikasi tautan...</div>;
  }

  if (isValidCode === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Tautan Tidak Valid</CardTitle>
            <CardDescription>Tautan reset password Anda telah kadaluarsa atau tidak valid.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/login')} className="w-full">Kembali ke Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Buat Password Baru</CardTitle>
          <CardDescription>
            Masukkan password baru Anda untuk akun <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2 text-left">
              <Label htmlFor="new-password">Password Baru</Label>
              <Input 
                id="new-password" 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required 
                minLength={6}
              />
            </div>
            <Button 
              type="submit"
              className="w-full" 
              disabled={loading}
            >
              {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
