import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AuthActionHandler } from './pages/AuthActionHandler';
import { Dashboard } from './pages/Dashboard';
import { ManajemenMahasiswa } from './pages/ManajemenMahasiswa';
import { ManajemenStaff } from './pages/ManajemenStaff';
import { ManajemenKelompok } from './pages/ManajemenKelompok';
import { ManajemenUser } from './pages/ManajemenUser';
import { ManajemenInformasi } from './pages/ManajemenInformasi';
import { ManajemenUjian } from './pages/ManajemenUjian';
import { ManajemenRubrik } from './pages/ManajemenRubrik';
import { RekapNilai } from './pages/RekapNilai';
import { Penilaian } from './pages/Penilaian';
import { LogbookMahasiswaPage } from './pages/LogbookMahasiswaPage';
import { BimbinganMahasiswaPage } from './pages/BimbinganMahasiswaPage';
import { UjianMahasiswaPage } from './pages/UjianMahasiswaPage';
import { PenilaianTemanMahasiswaPage } from './pages/PenilaianTemanMahasiswaPage';
import { RekapLogbookPage } from './pages/dosen/RekapLogbookPage';
import { BimbinganLaporanPage } from './pages/dosen/BimbinganLaporanPage';
import { BeritaAcaraPage } from './pages/dosen/BeritaAcaraPage';
import { PersetujuanAbsensiPage } from './pages/dosen/PersetujuanAbsensiPage';
import { MonitoringKinerja } from './pages/MonitoringKinerja';
import { Landing } from './pages/Landing'; // We will create this
import { Toaster } from './components/ui/sonner';
import { AIChat } from './components/AIChat';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/__/auth/action" element={<AuthActionHandler />} />
          <Route path="/auth/action" element={<AuthActionHandler />} />
          
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/manajemen-mahasiswa" element={<ManajemenMahasiswa />} />
            <Route path="/manajemen-staff" element={<ManajemenStaff />} />
            <Route path="/manajemen-kelompok" element={<ManajemenKelompok />} />
            <Route path="/manajemen-informasi" element={<ManajemenInformasi />} />
            <Route path="/manajemen-ujian" element={<ManajemenUjian />} />
            <Route path="/manajemen-user" element={<ManajemenUser />} />
            <Route path="/manajemen-rubrik" element={<ManajemenRubrik />} />
            <Route path="/rekap-nilai" element={<RekapNilai />} />
            <Route path="/monitoring-kinerja" element={<MonitoringKinerja />} />
            <Route path="/penilaian" element={<Penilaian />} />
            <Route path="/logbook" element={<LogbookMahasiswaPage />} />
            <Route path="/ujian" element={<UjianMahasiswaPage />} />
            <Route path="/penilaian-teman" element={<PenilaianTemanMahasiswaPage />} />
            <Route path="/berita-acara" element={<BeritaAcaraPage />} />
            <Route path="/rekap-logbook" element={<RekapLogbookPage />} />
            <Route path="/bimbingan-laporan-mahasiswa" element={<BimbinganMahasiswaPage />} />
            <Route path="/bimbingan-laporan" element={<BimbinganLaporanPage />} />
            <Route path="/persetujuan-absensi" element={<PersetujuanAbsensiPage />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      <AIChat />
      <Toaster position="top-center" />
    </AuthProvider>
  );
}
