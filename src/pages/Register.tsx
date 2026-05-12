import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, ProgramStudi, Jalur } from '../contexts/AuthContext';
import { loginWithGoogle, db, auth, handleFirestoreError, OperationType } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';

export const Register = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [prodi, setProdi] = useState<ProgramStudi | ''>('');
  const [jalur, setJalur] = useState<Jalur | ''>('');

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !prodi || !jalur) {
      toast.error('Silakan isi semua kolom.');
      return;
    }

    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDocRef = doc(db, 'users', user.uid);
      
      const isAdmin = user.email === 'ronniegodzilla@gmail.com';
      
      const userData: any = {
        uid: user.uid,
        name: name,
        email: user.email,
        role: isAdmin ? 'Admin' : 'Mahasiswa',
        account_status: isAdmin ? 'Active' : 'Pending',
        createdAt: new Date().toISOString()
      };

      if (!isAdmin) {
        userData.prodi = prodi;
        userData.jalur = jalur;
      }

      await setDoc(userDocRef, userData);

      if (isAdmin) {
        toast.success('Registrasi Admin berhasil!');
      } else {
        toast.success('Registrasi berhasil! Menunggu validasi Admin.');
      }
      auth.signOut();
      navigate('/login');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Email sudah terdaftar. Silakan login.');
      } else if (error.code === 'auth/weak-password') {
        toast.error('Password terlalu lemah. Minimal 6 karakter.');
      } else {
        toast.error('Gagal melakukan registrasi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Registrasi Mahasiswa</CardTitle>
          <CardDescription>
            Daftar untuk mengikuti Pengalaman Belajar Lapangan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleEmailRegister} className="space-y-4">
            <div className="space-y-2 text-left">
              <Label htmlFor="name">Nama Lengkap</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>
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
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
                minLength={6}
              />
            </div>
            <div className="space-y-2 text-left">
              <Label>Program Studi</Label>
              <Select value={prodi} onValueChange={(val: any) => setProdi(val)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Program Studi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S1 Kesehatan dan Keselamatan Kerja">S1 Kesehatan dan Keselamatan Kerja</SelectItem>
                  <SelectItem value="S1 Kesehatan Lingkungan">S1 Kesehatan Lingkungan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-left">
              <Label>Jalur</Label>
              <Select value={jalur} onValueChange={(val: any) => setJalur(val)} required>
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Menyimpan...' : 'Daftar'}
            </Button>
          </form>

          <div className="text-sm text-center text-slate-500 mt-4 space-y-2">
            <div>
              Sudah punya akun? <Link to="/login" className="text-primary hover:underline">Login di sini</Link>
            </div>
            <div className="pt-2 border-t text-xs">
              <Link to="/" className="text-slate-500 hover:text-primary flex items-center justify-center gap-1">
                &larr; Kembali ke Halaman Utama
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
