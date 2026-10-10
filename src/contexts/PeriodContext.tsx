import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, QueryConstraint } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { setUploadFolder } from '../lib/uploadFile';
import type { ExamRegistrationSettings } from '../lib/examRegistration';

// Satu periode = satu siklus PBL (PBL berlangsung sekali setahun).
// Dokumen: periods/{periodId}. Penunjuk periode aktif: settings/active_period
// ({ period_id }). Semua data operasional (kelompok, anggota, logbook,
// absensi, laporan, jadwal ujian, berita acara, nilai) membawa field
// period_id sehingga periode lama tetap utuh sebagai arsip.
export interface Period {
  id: string;
  name: string;
  tahun_ajaran: string;
  status: 'Active' | 'Closed';
  createdAt: string;
  closedAt?: string;
  // Pengaturan yang dulu global (settings/*) kini melekat per periode.
  exam_registration?: ExamRegistrationSettings;
  requirements?: Record<string, any>;
  is_edit_active?: boolean;
}

interface PeriodContextType {
  periods: Period[];
  activePeriodId: string | null;
  activePeriod: Period | null;
  // Periode yang sedang dilihat & menjadi tujuan penulisan. Admin dapat
  // memilih periode lama (arsip); peran lain selalu = periode aktif.
  periodId: string | null;
  period: Period | null;
  isArchive: boolean;
  canSelectPeriod: boolean;
  setSelectedPeriodId: (id: string | null) => void;
  loading: boolean;
}

const PeriodContext = createContext<PeriodContextType>({
  periods: [],
  activePeriodId: null,
  activePeriod: null,
  periodId: null,
  period: null,
  isArchive: false,
  canSelectPeriod: false,
  setSelectedPeriodId: () => {},
  loading: true,
});

export const usePeriod = () => useContext(PeriodContext);

const SELECTED_KEY = 'selected_period_id';

const readStoredSelection = (): string | null => {
  try {
    return sessionStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
};

export const PeriodProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [activeLoaded, setActiveLoaded] = useState(false);
  const [selectedPeriodId, setSelectedPeriodIdState] = useState<string | null>(readStoredSelection);

  useEffect(() => {
    const unsubPeriods = onSnapshot(collection(db, 'periods'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Period));
      list.sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''));
      setPeriods(list);
      setPeriodsLoaded(true);
    }, (error) => {
      console.error('Gagal memuat daftar periode', error);
      setPeriodsLoaded(true);
    });

    const unsubActive = onSnapshot(doc(db, 'settings', 'active_period'), (snap) => {
      setActivePeriodId(snap.exists() ? (snap.data().period_id || null) : null);
      setActiveLoaded(true);
    }, (error) => {
      console.error('Gagal memuat periode aktif', error);
      setActiveLoaded(true);
    });

    return () => {
      unsubPeriods();
      unsubActive();
    };
  }, []);

  const canSelectPeriod = profile?.role === 'Admin' || profile?.role === 'AdminProdi';

  const setSelectedPeriodId = (id: string | null) => {
    setSelectedPeriodIdState(id);
    try {
      if (id) sessionStorage.setItem(SELECTED_KEY, id);
      else sessionStorage.removeItem(SELECTED_KEY);
    } catch {
      // sessionStorage tidak tersedia — pilihan cukup disimpan di state.
    }
  };

  const value = useMemo<PeriodContextType>(() => {
    const activePeriod = periods.find(p => p.id === activePeriodId) || null;
    const selectedExists = !!selectedPeriodId && periods.some(p => p.id === selectedPeriodId);
    const periodId = canSelectPeriod && selectedExists ? selectedPeriodId : activePeriodId;
    const period = periods.find(p => p.id === periodId) || null;
    return {
      periods,
      activePeriodId,
      activePeriod,
      periodId,
      period,
      isArchive: !!periodId && periodId !== activePeriodId,
      canSelectPeriod,
      setSelectedPeriodId,
      loading: !periodsLoaded || !activeLoaded,
    };
  }, [periods, activePeriodId, selectedPeriodId, canSelectPeriod, periodsLoaded, activeLoaded]);

  // Berkas yang diunggah selama periode ini disimpan di subfolder Drive
  // bernama sesuai periode (lihat docs/SECURITY_SETUP.md).
  useEffect(() => {
    setUploadFolder(value.period?.name || null);
  }, [value.period?.name]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
};

// Query koleksi yang dibatasi pada satu periode.
export const periodQuery = (collectionName: string, periodId: string, ...constraints: QueryConstraint[]) =>
  query(collection(db, collectionName), where('period_id', '==', periodId), ...constraints);

// ID periode diturunkan dari tahun ajaran, mis. "2025/2026" -> "pbl-2025-2026".
export const periodIdFromTahunAjaran = (tahunAjaran: string) =>
  `pbl-${tahunAjaran.trim().replace(/[^0-9A-Za-z]+/g, '-').replace(/^-+|-+$/g, '')}`;
