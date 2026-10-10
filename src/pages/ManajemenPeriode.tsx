import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Period, periodIdFromTahunAjaran, periodQuery, usePeriod } from '../contexts/PeriodContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  LETTER_GRADES,
  backfillPeriodId,
  copyPublishedGradesToMembers,
  readLegacySettings,
  startNewPeriod,
} from '../lib/periodMigration';

const TAHUN_AJARAN_PATTERN = /^\d{4}\/\d{4}$/;

const validateTahunAjaran = (value: string, periods: Period[]): string | null => {
  const v = value.trim();
  if (!TAHUN_AJARAN_PATTERN.test(v)) return 'Format tahun ajaran harus seperti 2026/2027.';
  const [a, b] = v.split('/').map(Number);
  if (b !== a + 1) return 'Tahun kedua harus satu tahun setelah tahun pertama.';
  if (periods.some(p => p.id === periodIdFromTahunAjaran(v) && p.status === 'Closed')) {
    return 'Periode untuk tahun ajaran ini sudah pernah ditutup.';
  }
  return null;
};

interface EvalRow {
  student_id: string;
  name: string;
  id_number: string;
  group_name: string;
  letter_grade: string;
  reason: string;
  defaultLulus: boolean;
}

export const ManajemenPeriode = () => {
  const { profile } = useAuth();
  const { periods, activePeriodId, activePeriod, setSelectedPeriodId, loading } = usePeriod();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const appendLog = (msg: string) => setLog(prev => [...prev, msg]);

  // Inisialisasi periode pertama
  const [initTahun, setInitTahun] = useState('');

  // Wizard periode baru
  const [newTahun, setNewTahun] = useState('');
  const [minGrade, setMinGrade] = useState('C-');
  const [evalRows, setEvalRows] = useState<EvalRow[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Aktifkan ulang periode lama
  const [reactivateTarget, setReactivateTarget] = useState<Period | null>(null);

  const isAdmin = profile?.role === 'Admin' || profile?.role === 'AdminProdi';

  // Evaluasi kelulusan dihitung ulang saat batas nilai berubah.
  const [rawEval, setRawEval] = useState<{ members: any[]; users: Record<string, any>; groups: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!rawEval) {
      setEvalRows(null);
      return;
    }
    const minIdx = LETTER_GRADES.indexOf(minGrade);
    const rows: EvalRow[] = [];
    const seen = new Set<string>();
    rawEval.members.forEach(m => {
      const u = rawEval.users[m.student_id];
      // Akun yang sudah dihapus dilewati: tidak ada yang perlu dibawa/ditandai.
      if (!u || seen.has(m.student_id)) return;
      seen.add(m.student_id);
      let reason = '';
      let lulus = false;
      if (m.status !== 'Approved' || !m.group_id || m.group_id === 'pending') {
        reason = 'Belum tergabung dalam kelompok';
      } else if (!m.is_grade_published) {
        reason = 'Nilai akhir belum dipublikasikan';
      } else {
        const idx = LETTER_GRADES.indexOf(m.letter_grade);
        if (idx === -1 || idx > minIdx) {
          reason = `Nilai ${m.letter_grade || '-'} di bawah batas lulus`;
        } else {
          reason = `Nilai ${m.letter_grade}`;
          lulus = true;
        }
      }
      rows.push({
        student_id: m.student_id,
        name: u.name || m.student_id,
        id_number: u.id_number || '-',
        group_name: rawEval.groups[m.group_id] || '-',
        letter_grade: m.is_grade_published ? (m.letter_grade || '-') : '-',
        reason,
        defaultLulus: lulus,
      });
    });
    rows.sort((a, b) => Number(a.defaultLulus) - Number(b.defaultLulus) || a.name.localeCompare(b.name));
    setEvalRows(rows);
  }, [rawEval, minGrade]);

  const decisions = useMemo(() => (evalRows || []).map(r => ({
    student_id: r.student_id,
    lulus: overrides[r.student_id] ?? r.defaultLulus,
  })), [evalRows, overrides]);

  const passedCount = decisions.filter(d => d.lulus).length;
  const carriedCount = decisions.length - passedCount;

  if (!isAdmin) {
    return <div className="p-8 text-center">Akses Ditolak</div>;
  }
  if (loading) {
    return <div className="p-8 text-center text-slate-500">Memuat data periode...</div>;
  }

  const handleInitialize = async () => {
    const err = validateTahunAjaran(initTahun, periods);
    if (err) {
      toast.error(err);
      return;
    }
    const tahun = initTahun.trim();
    const id = periodIdFromTahunAjaran(tahun);
    setBusy(true);
    setLog([]);
    try {
      const legacy = await readLegacySettings();
      await setDoc(doc(db, 'periods', id), {
        name: `PBL ${tahun}`,
        tahun_ajaran: tahun,
        status: 'Active',
        createdAt: new Date().toISOString(),
        requirements: legacy.requirements || {},
        ...(legacy.exam_registration ? { exam_registration: legacy.exam_registration } : {}),
        is_edit_active: legacy.is_edit_active || false,
      }, { merge: true });
      appendLog(`Periode PBL ${tahun} dibuat; pengaturan lama (syarat berkas, deadline ujian, edit nilai) disalin.`);

      const n = await backfillPeriodId(id, appendLog);
      appendLog(`${n} dokumen lama ditandai sebagai milik PBL ${tahun}.`);
      await copyPublishedGradesToMembers(id, appendLog);

      await setDoc(doc(db, 'settings', 'active_period'), { period_id: id, updatedAt: new Date().toISOString() });
      appendLog(`PBL ${tahun} kini menjadi periode aktif.`);
      toast.success('Periode pertama berhasil diinisialisasi.');
      setInitTahun('');
    } catch (error: any) {
      console.error(error);
      appendLog(`GAGAL: ${error.code || error.message}`);
      toast.error(`Inisialisasi gagal: ${error.code || error.message}. Pastikan firestore.rules terbaru sudah dipublish. Proses aman diulang.`, { duration: 15000 });
    } finally {
      setBusy(false);
    }
  };

  const handleRepairMissing = async () => {
    if (!activePeriodId) return;
    setBusy(true);
    setLog([]);
    try {
      const n = await backfillPeriodId(activePeriodId, appendLog);
      appendLog(`${n} dokumen tanpa periode dimasukkan ke ${activePeriod?.name || activePeriodId}.`);
      toast.success('Pemeriksaan selesai.');
    } catch (error: any) {
      console.error(error);
      appendLog(`GAGAL: ${error.code || error.message}`);
      toast.error(`Gagal: ${error.code || error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleEvaluate = async () => {
    if (!activePeriodId) return;
    const err = validateTahunAjaran(newTahun, periods);
    if (err) {
      toast.error(err);
      return;
    }
    if (periodIdFromTahunAjaran(newTahun) === activePeriodId) {
      toast.error('Tahun ajaran baru sama dengan periode aktif.');
      return;
    }
    setBusy(true);
    try {
      const [membersSnap, usersSnap, groupsSnap] = await Promise.all([
        getDocs(periodQuery('group_members', activePeriodId)),
        getDocs(query(collection(db, 'users'), where('role', '==', 'Mahasiswa'))),
        getDocs(periodQuery('pbl_groups', activePeriodId)),
      ]);
      const users: Record<string, any> = {};
      usersSnap.forEach(d => { users[d.id] = d.data(); });
      const groups: Record<string, string> = {};
      groupsSnap.forEach(d => { groups[d.id] = d.data().group_name; });
      setOverrides({});
      setRawEval({ members: membersSnap.docs.map(d => ({ id: d.id, ...d.data() })), users, groups });
    } catch (error: any) {
      console.error(error);
      toast.error(`Gagal memuat data evaluasi: ${error.code || error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStartNewPeriod = async () => {
    if (!activePeriodId || !evalRows) return;
    setConfirmOpen(false);
    const tahun = newTahun.trim();
    setBusy(true);
    setLog([]);
    try {
      await startNewPeriod({
        oldPeriodId: activePeriodId,
        newPeriod: {
          id: periodIdFromTahunAjaran(tahun),
          name: `PBL ${tahun}`,
          tahun_ajaran: tahun,
          // Daftar syarat berkas biasanya sama dari tahun ke tahun.
          requirements: activePeriod?.requirements || {},
        },
        decisions,
        log: appendLog,
      });
      setSelectedPeriodId(null);
      setRawEval(null);
      setNewTahun('');
      toast.success(`PBL ${tahun} kini aktif.`);
    } catch (error: any) {
      console.error(error);
      appendLog(`GAGAL: ${error.code || error.message}`);
      toast.error(`Gagal memulai periode baru: ${error.code || error.message}. Proses aman diulang dengan data yang sama.`, { duration: 15000 });
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    const target = reactivateTarget;
    setReactivateTarget(null);
    if (!target) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      if (activePeriodId && activePeriodId !== target.id) {
        batch.update(doc(db, 'periods', activePeriodId), { status: 'Closed', closedAt: now });
      }
      batch.update(doc(db, 'periods', target.id), { status: 'Active' });
      batch.set(doc(db, 'settings', 'active_period'), { period_id: target.id, updatedAt: now });
      await batch.commit();
      setSelectedPeriodId(null);
      toast.success(`${target.name} kini menjadi periode aktif.`);
    } catch (error: any) {
      console.error(error);
      toast.error(`Gagal mengaktifkan periode: ${error.code || error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manajemen Periode PBL</h1>
        <p className="text-slate-500">
          PBL berlangsung sekali setahun. Setiap periode menyimpan kelompok, logbook, laporan, ujian, dan nilainya sendiri;
          periode yang ditutup tetap tersimpan sebagai arsip yang hanya dapat dilihat admin.
        </p>
      </div>

      {/* Tampil sampai periode pertama aktif; proses idempoten sehingga dapat
          diulang bila sebelumnya terputus. */}
      {!activePeriodId && !periods.some(p => p.status === 'Closed') && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle>Inisialisasi Periode Pertama</CardTitle>
            <CardDescription>
              Semua data yang sudah ada (kelompok, logbook, nilai, dsb.) akan ditandai sebagai milik periode ini,
              lalu periode ini diaktifkan. Pastikan <code>firestore.rules</code> terbaru sudah dipublish sebelum menjalankan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="init-tahun">Tahun ajaran data saat ini</Label>
              <Input id="init-tahun" placeholder="mis. 2025/2026" value={initTahun} onChange={e => setInitTahun(e.target.value)} disabled={busy} />
            </div>
            <Button onClick={handleInitialize} disabled={busy || !initTahun.trim()}>
              {busy ? 'Memproses...' : 'Inisialisasi & Aktifkan'}
            </Button>
          </CardContent>
        </Card>
      )}

      {periods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daftar Periode</CardTitle>
            <CardDescription>
              Periode aktif: <strong>{activePeriod?.name || 'belum ada'}</strong>. Pilih "Lihat" untuk membuka arsip periode lama di seluruh halaman admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Tahun Ajaran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead>Ditutup</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(p => {
                  const isActive = p.id === activePeriodId;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.tahun_ajaran}</TableCell>
                      <TableCell>
                        {isActive ? <Badge>Aktif</Badge> : <Badge variant="secondary">Arsip</Badge>}
                      </TableCell>
                      <TableCell>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('id-ID') : '-'}</TableCell>
                      <TableCell>{p.closedAt ? new Date(p.closedAt).toLocaleDateString('id-ID') : '-'}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => setSelectedPeriodId(isActive ? null : p.id)}>
                          Lihat
                        </Button>
                        {!isActive && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setReactivateTarget(p)}>
                            Jadikan aktif
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activePeriodId && (
        <Card>
          <CardHeader>
            <CardTitle>Mulai Periode Baru</CardTitle>
            <CardDescription>
              Menutup {activePeriod?.name || 'periode aktif'} dan membuka periode berikutnya. Mahasiswa yang belum lulus atau
              tidak berprogres otomatis disalin ke periode baru sebagai calon anggota kelompok (ditandai "mengulang");
              data lama mereka tetap tersimpan di arsip.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="new-tahun">Tahun ajaran periode baru</Label>
                <Input id="new-tahun" placeholder="mis. 2026/2027" value={newTahun} onChange={e => { setNewTahun(e.target.value); setRawEval(null); }} disabled={busy} className="w-48" />
              </div>
              <div className="space-y-2">
                <Label>Nilai huruf minimum lulus</Label>
                <Select value={minGrade} onValueChange={(v: any) => setMinGrade(v)}>
                  <SelectTrigger className="w-32">
                    <SelectValue>{minGrade}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LETTER_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handleEvaluate} disabled={busy || !newTahun.trim()}>
                Evaluasi Mahasiswa
              </Button>
            </div>

            {evalRows && (
              <div className="space-y-3">
                <div className="text-sm text-slate-600">
                  {evalRows.length} mahasiswa pada {activePeriod?.name}: <strong className="text-emerald-700">{passedCount} lulus</strong>,{' '}
                  <strong className="text-amber-700">{carriedCount} disalin ke periode baru</strong>. Centang/hapus centang untuk mengoreksi.
                  Mahasiswa yang belum pernah dimasukkan ke kelompok mana pun tetap muncul sebagai calon anggota di periode baru.
                </div>
                <div className="max-h-[420px] overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Lulus</TableHead>
                        <TableHead>NIM</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>Kelompok</TableHead>
                        <TableHead>Nilai</TableHead>
                        <TableHead>Keterangan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evalRows.map(r => {
                        const lulus = overrides[r.student_id] ?? r.defaultLulus;
                        return (
                          <TableRow key={r.student_id}>
                            <TableCell>
                              <Checkbox
                                checked={lulus}
                                onCheckedChange={(checked) => setOverrides(prev => ({ ...prev, [r.student_id]: !!checked }))}
                              />
                            </TableCell>
                            <TableCell>{r.id_number}</TableCell>
                            <TableCell>{r.name}</TableCell>
                            <TableCell>{r.group_name}</TableCell>
                            <TableCell>{r.letter_grade}</TableCell>
                            <TableCell className={lulus ? 'text-emerald-700' : 'text-amber-700'}>
                              {lulus ? 'Lulus' : 'Disalin ke periode baru'} — {r.reason}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <Button onClick={() => setConfirmOpen(true)} disabled={busy}>
                  Tutup {activePeriod?.name} & Mulai PBL {newTahun.trim()}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activePeriodId && (
        <Card>
          <CardHeader>
            <CardTitle>Pemeliharaan</CardTitle>
            <CardDescription>
              Masukkan dokumen yang belum memiliki periode (mis. ditulis dari tab browser lama saat pembaruan sistem) ke periode aktif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleRepairMissing} disabled={busy}>
              Periksa Data Tanpa Periode
            </Button>
          </CardContent>
        </Card>
      )}

      {log.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Log Proses</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-50 border rounded-md p-3 whitespace-pre-wrap">{log.join('\n')}</pre>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mulai PBL {newTahun.trim()}?</DialogTitle>
            <DialogDescription>
              {activePeriod?.name} akan ditutup dan menjadi arsip. {passedCount} mahasiswa ditandai lulus dan
              {' '}{carriedCount} mahasiswa disalin ke periode baru. Mahasiswa, dosen, dan pembimbing hanya akan melihat data
              periode baru. Pendaftaran ujian periode baru dalam keadaan ditutup sampai Anda membukanya di Manajemen Ujian.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button onClick={handleStartNewPeriod}>Ya, mulai periode baru</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reactivateTarget} onOpenChange={(open) => { if (!open) setReactivateTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aktifkan kembali {reactivateTarget?.name}?</DialogTitle>
            <DialogDescription>
              {activePeriod ? `${activePeriod.name} akan ditutup. ` : ''}Mahasiswa, dosen, dan pembimbing akan kembali bekerja pada {reactivateTarget?.name}.
              Gunakan hanya untuk koreksi; status lulus mahasiswa yang sudah ditandai tidak diubah.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReactivateTarget(null)}>Batal</Button>
            <Button onClick={handleReactivate}>Aktifkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
