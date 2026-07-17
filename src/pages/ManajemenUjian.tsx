import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, getDoc, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ExamRegistrationSettings, isRegistrationOpen, formatDeadline, timestampToLocalInput, localInputToTimestamp } from '../lib/examRegistration';

export const ManajemenUjian = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [dosenPenguji, setDosenPenguji] = useState<any[]>([]);
  const [settings, setSettings] = useState<{ exam: string[], revisi: string[] }>({ exam: [], revisi: [] });
  const [examReqInput, setExamReqInput] = useState('');
  const [revisiReqInput, setRevisiReqInput] = useState('');
  
  // Pengaturan deadline pendaftaran ujian
  const [regSettings, setRegSettings] = useState<ExamRegistrationSettings | null>(null);
  const [regMode, setRegMode] = useState<'auto' | 'open' | 'closed'>('auto');
  const [regOpenAt, setRegOpenAt] = useState('');
  const [regCloseAt, setRegCloseAt] = useState('');
  const [regNote, setRegNote] = useState('');
  const [savingReg, setSavingReg] = useState(false);

  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [newSchedule, setNewSchedule] = useState({ date: '', time: '', room: '', penguji_id: '' });

  useEffect(() => {
    // Fetch Groups
    const qGroups = query(collection(db, 'pbl_groups'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      const g: any[] = [];
      snapshot.forEach((doc) => g.push({ id: doc.id, ...doc.data() }));
      setGroups(g);
    });

    // Fetch Reports
    const qReports = query(collection(db, 'pbl_reports'));
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      const r: any[] = [];
      snapshot.forEach((doc) => r.push({ id: doc.id, ...doc.data() }));
      setReports(r);
    });

    // Fetch Schedules
    const qSchedules = query(collection(db, 'exam_schedules'));
    const unsubSchedules = onSnapshot(qSchedules, (snapshot) => {
      const s: any[] = [];
      snapshot.forEach((doc) => s.push({ id: doc.id, ...doc.data() }));
      setSchedules(s);
    });

    // Fetch Dosen Penguji and Dosen
    const qPenguji = query(collection(db, 'users'));
    const unsubPenguji = onSnapshot(qPenguji, (snapshot) => {
      const p: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.role === 'DosenPenguji' || data.role === 'Dosen') {
          p.push({ id: doc.id, ...data });
        }
      });
      setDosenPenguji(p);
    });

    // Fetch Settings. Data lama bisa berisi entri kembar yang hanya beda
    // spasi (era sebelum trim) — tampilkan satu saja agar konsisten.
    const dedupeReqs = (arr: any[]) => {
      const out: string[] = [];
      for (const v of arr || []) {
        const str = String(v);
        if (!out.some(x => x.trim() === str.trim())) out.push(str);
      }
      return out;
    };
    const unsubSettings = onSnapshot(doc(db, 'settings', 'requirements'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSettings({ exam: dedupeReqs(data.exam), revisi: dedupeReqs(data.revisi) });
      }
    });

    // Fetch pengaturan deadline pendaftaran ujian
    const unsubReg = onSnapshot(doc(db, 'settings', 'exam_registration'), (snap) => {
      const data = snap.exists() ? (snap.data() as ExamRegistrationSettings) : null;
      setRegSettings(data);
      setRegMode(data?.mode || 'auto');
      setRegOpenAt(timestampToLocalInput(data?.open_at));
      setRegCloseAt(timestampToLocalInput(data?.close_at));
      setRegNote(data?.note || '');
    });

    return () => {
      unsubGroups();
      unsubReports();
      unsubSchedules();
      unsubPenguji();
      unsubSettings();
      unsubReg();
    };
  }, []);

  const handleSaveSchedule = async () => {
    if (!selectedGroupId || !newSchedule.date || !newSchedule.time || !newSchedule.room || !newSchedule.penguji_id) {
      toast.error('Mohon lengkapi semua data jadwal.');
      return;
    }

    // Detect conflicts terhadap data TERBARU dari server (bukan state lokal
    // yang bisa basi) untuk memperkecil peluang bentrok saat dua admin
    // menjadwalkan bersamaan.
    const currentGroup = groups.find(g => g.id === selectedGroupId);
    const newGroupPembimbingId = currentGroup?.pembimbing_id;

    let latestSchedules = schedules;
    try {
      const freshSnap = await getDocs(collection(db, 'exam_schedules'));
      latestSchedules = freshSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch { /* jika gagal, pakai state lokal sebagai fallback */ }

    for (const s of latestSchedules) {
      // Skip if we're just updating the same group
      if (s.group_id === selectedGroupId) continue;

      if (s.date === newSchedule.date && s.time === newSchedule.time) {
        // Room conflict
        if (s.room === newSchedule.room) {
          toast.error(`Konflik Ruangan! Ruang ${s.room} sudah digunakan oleh kelompok lain pada waktu tersebut.`);
          return;
        }

        // Lecturer conflict
        const sGroup = groups.find(g => g.id === s.group_id);
        const sPembimbingId = sGroup?.pembimbing_id;

        const newExamLecturers = [newSchedule.penguji_id];
        if (newGroupPembimbingId) newExamLecturers.push(newGroupPembimbingId);

        const existingExamLecturers = [s.penguji_id];
        if (sPembimbingId) existingExamLecturers.push(sPembimbingId);

        // Check intersection
        for (const lecturerId of newExamLecturers) {
          if (existingExamLecturers.includes(lecturerId)) {
            const lecturerName = dosenPenguji.find(d => d.id === lecturerId)?.name || 'Dosen';
            toast.error(`Konflik Jadwal Dosen! ${lecturerName} sudah memiliki jadwal ujian pada waktu tersebut.`);
            return;
          }
        }
      }
    }

    try {
      const scheduleId = `exam_${selectedGroupId}`;
      await setDoc(doc(db, 'exam_schedules', scheduleId), {
        group_id: selectedGroupId,
        date: newSchedule.date,
        time: newSchedule.time,
        room: newSchedule.room,
        penguji_id: newSchedule.penguji_id,
        status: 'Scheduled',
        createdAt: new Date().toISOString()
      });

      toast.success('Jadwal ujian berhasil disimpan.');
      setIsScheduleDialogOpen(false);
      setNewSchedule({ date: '', time: '', room: '', penguji_id: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exam_schedules');
      toast.error('Gagal menyimpan jadwal ujian.');
    }
  };

  const handleSaveRegSettings = async () => {
    try {
      setSavingReg(true);
      await setDoc(doc(db, 'settings', 'exam_registration'), {
        mode: regMode,
        open_at: localInputToTimestamp(regOpenAt),
        close_at: localInputToTimestamp(regCloseAt),
        note: regNote.trim()
      }, { merge: true });
      toast.success('Pengaturan deadline pendaftaran disimpan');
    } catch (error) {
      toast.error('Gagal menyimpan pengaturan deadline');
    } finally {
      setSavingReg(false);
    }
  };

  const handleAddRequirement = async (type: 'exam' | 'revisi') => {
    const val = type === 'exam' ? examReqInput : revisiReqInput;
    if (!val.trim()) return;

    try {
      // arrayUnion menghindari read-modify-write: dua admin yang menambah
      // bersamaan tidak akan saling menimpa daftar syarat.
      await setDoc(doc(db, 'settings', 'requirements'), {
        [type]: arrayUnion(val.trim())
      }, { merge: true });
      if (type === 'exam') setExamReqInput('');
      else setRevisiReqInput('');
      toast.success('Syarat berhasil ditambahkan');
    } catch (error: any) {
      console.error(error);
      toast.error(`Gagal menyimpan syarat: ${error.code || error.message || 'error tidak diketahui'}`, { duration: 10000 });
    }
  };

  const handleRemoveRequirement = async (type: 'exam' | 'revisi', index: number) => {
    try {
      const target = settings[type][index];
      // Baca array mentah dari server: bisa berisi varian kembar yang hanya
      // beda spasi (data lama). Hapus semuanya sekaligus agar tidak ada sisa
      // yang tetap tampil di sisi mahasiswa.
      const snap = await getDoc(doc(db, 'settings', 'requirements'));
      const rawArr: any[] = (snap.exists() ? snap.data()[type] : []) || [];
      const targets = rawArr.filter(v => String(v).trim() === target.trim());
      if (targets.length === 0) {
        toast.success('Syarat sudah tidak ada di server.');
        return;
      }
      await setDoc(doc(db, 'settings', 'requirements'), {
        [type]: arrayRemove(...targets)
      }, { merge: true });
      toast.success('Syarat berhasil dihapus');
    } catch (error: any) {
      console.error(error);
      toast.error(`Gagal menghapus syarat: ${error.code || error.message || 'error tidak diketahui'}`, { duration: 10000 });
    }
  };

  // Pilih dokumen report kanonik (report_<group_id>) agar berkas yang diunggah
  // mahasiswa selalu terbaca, meskipun ada dokumen duplikat untuk grup yang sama.
  const findReport = (groupId: string) => {
    const matches = reports.filter(r => r.group_id === groupId);
    if (matches.length === 0) return undefined;
    return matches.find(r => r.id === `report_${groupId}`) || matches[0];
  };

  // Field `status` dipakai dua tahap (bimbingan dosen & verifikasi admin),
  // jadi tahap sebenarnya diturunkan dari kombinasi status + approval_url:
  // approval_url baru terisi setelah mahasiswa mengunggah berkas syarat ujian.
  type ReportStage = 'Bimbingan' | 'MenungguBerkas' | 'MenungguValidasi' | 'DikembalikanAdmin' | 'Tervalidasi';
  const getReportStage = (report: any): ReportStage => {
    if (report.status === 'Pending') return 'MenungguValidasi';
    if (report.status === 'Approved') return report.approval_url ? 'Tervalidasi' : 'MenungguBerkas';
    if (report.status === 'Revisi') return report.approval_url ? 'DikembalikanAdmin' : 'Bimbingan';
    return 'Bimbingan';
  };

  const STAGE_LABEL: Record<ReportStage, string> = {
    Bimbingan: 'Proses Bimbingan',
    MenungguBerkas: 'Disetujui Pembimbing — Menunggu Berkas',
    MenungguValidasi: 'Menunggu Validasi Admin',
    DikembalikanAdmin: 'Dikembalikan (Tidak MS)',
    Tervalidasi: 'Tervalidasi',
  };

  const handleUpdateReportStatus = async (reportId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'pbl_reports', reportId), {
        status: status
      });
      toast.success(`Status berhasil diubah menjadi ${status}`);
    } catch (error) {
      toast.error('Gagal mengubah status');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manajemen Ujian PBL</h1>
        <p className="text-slate-500">Kelola eligibilitas dan jadwal ujian kelompok PBL.</p>
      </div>

      <Tabs defaultValue="jadwal">
        <TabsList className="mb-4">
          <TabsTrigger value="jadwal">Jadwal Ujian & Validasi Laporan</TabsTrigger>
          <TabsTrigger value="revisi">Validasi Revisi Pasca-Ujian</TabsTrigger>
          <TabsTrigger value="pengaturan">Pengaturan Syarat</TabsTrigger>
        </TabsList>

        <TabsContent value="jadwal">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Kelompok & Eligibilitas Ujian</CardTitle>
              <CardDescription>Persetujuan Dosen Pembimbing hanya menyelesaikan tahap bimbingan. Kelompok baru dapat dijadwalkan setelah mahasiswa mengunggah berkas syarat ujian dan Admin memvalidasinya ("Setujui Syarat Admin"). Admin dapat mengembalikan berkas (Tidak MS) jika kewajiban administratif belum terpenuhi.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kelompok</TableHead>
                    <TableHead>Prodi</TableHead>
                    <TableHead>Status Laporan</TableHead>
                    <TableHead>Berkas</TableHead>
                    <TableHead>Jadwal Ujian</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => {
                    const report = findReport(group.id);
                    const schedule = schedules.find(s => s.group_id === group.id);
                    const stage = report ? getReportStage(report) : null;
                    const isEligible = stage === 'Tervalidasi';

                    return (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.group_name}</TableCell>
                        <TableCell>{group.prodi || 'Tidak Spesifik'}</TableCell>
                        <TableCell>
                          {report && stage ? (
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant={stage === 'Tervalidasi' ? 'default' : stage === 'DikembalikanAdmin' ? 'destructive' : 'secondary'}>
                                {STAGE_LABEL[stage]}
                              </Badge>
                              {stage === 'MenungguValidasi' && (
                                <>
                                  <Button size="sm" variant="default" className="h-6 text-[10px] mt-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleUpdateReportStatus(report.id, 'Approved')}>
                                    Setujui Syarat Admin
                                  </Button>
                                  <Button variant="outline" size="sm" className="h-6 text-[10px] mt-1" onClick={() => handleUpdateReportStatus(report.id, 'Revisi')}>
                                    Kembalikan (Tidak MS)
                                  </Button>
                                </>
                              )}
                              {stage === 'DikembalikanAdmin' && (
                                <Button variant="outline" size="sm" className="h-6 text-[10px] mt-1" onClick={() => handleUpdateReportStatus(report.id, 'Pending')}>
                                  Tandai Pending
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-sm">Belum Unggah</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {report ? (
                            <div className="flex flex-col gap-1 text-xs">
                              {report.report_title && (
                                <span className="font-semibold text-slate-800 break-words mb-1">{report.report_title}</span>
                              )}
                              {report.report_url ? (
                                <a href={report.report_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Draf Laporan</a>
                              ) : (
                                <span className="text-slate-400 italic">Draf Laporan: belum diunggah</span>
                              )}
                              {report.approval_url ? (
                                <a href={report.approval_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Lembar Persetujuan</a>
                              ) : (
                                <span className="text-slate-400 italic">Lembar Persetujuan: belum diunggah</span>
                              )}
                              {settings.exam.map((req) => (
                                report.custom_exam_urls?.[req] ? (
                                  <a key={req} href={report.custom_exam_urls[req] as string} target="_blank" rel="noreferrer" className="text-primary hover:underline">{req}</a>
                                ) : (
                                  <span key={req} className="text-slate-400 italic">{req}: belum diunggah</span>
                                )
                              ))}
                              {report.custom_exam_urls && Object.entries(report.custom_exam_urls)
                                .filter(([key]) => !settings.exam.includes(key))
                                .map(([key, url]) => (
                                  <a key={key} href={url as string} target="_blank" rel="noreferrer" className="text-primary hover:underline">{key}</a>
                                ))}
                              {report.custom_revisi_urls && Object.entries(report.custom_revisi_urls).map(([key, url]) => (
                                <a key={`revisi-${key}`} href={url as string} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700 hover:underline">(Revisi) {key}</a>
                              ))}
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {schedule ? (
                            <div className="text-xs space-y-1">
                              <div className="font-medium text-slate-900">{new Date(schedule.date).toLocaleDateString('id-ID')} {schedule.time}</div>
                              <div className="text-slate-500 flex items-center gap-1">
                                <span className="font-semibold text-slate-700">Ruang:</span> {schedule.room}
                              </div>
                              <div className="text-slate-500 flex items-center gap-1">
                                <span className="font-semibold text-slate-700">Penguji:</span> {dosenPenguji.find(d => d.id === schedule.penguji_id)?.name || schedule.penguji_id}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-sm">Belum Dijadwalkan</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            disabled={!isEligible}
                            onClick={() => {
                              setSelectedGroupId(group.id);
                              if (schedule) {
                                setNewSchedule({
                                  date: schedule.date,
                                  time: schedule.time,
                                  room: schedule.room,
                                  penguji_id: schedule.penguji_id
                                });
                              } else {
                                setNewSchedule({ date: '', time: '', room: '', penguji_id: '' });
                              }
                              setIsScheduleDialogOpen(true);
                            }}
                          >
                            {schedule ? 'Edit Jadwal' : 'Atur Jadwal'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revisi">
          <Card>
            <CardHeader>
              <CardTitle>Validasi Revisi Pasca-Ujian</CardTitle>
              <CardDescription>Tinjau dokumen syarat revisi yang diunggah oleh kelompok pasca-ujian.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kelompok</TableHead>
                    <TableHead>Prodi</TableHead>
                    <TableHead>Status Revisi</TableHead>
                    <TableHead>Berkas Revisi</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.filter(g => schedules.some(s => s.group_id === g.id)).map((group) => {
                    const report = findReport(group.id);
                    if (!report || !report.custom_revisi_urls) return null;

                    return (
                      <TableRow key={`revisi-${group.id}`}>
                        <TableCell className="font-medium">{group.group_name}</TableCell>
                        <TableCell>{group.prodi || 'Tidak Spesifik'}</TableCell>
                        <TableCell>
                          <Badge variant={report.revisi_status === 'Approved' ? 'default' : report.revisi_status === 'Revisi' ? 'destructive' : 'secondary'}>
                            {report.revisi_status || 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            {Object.entries(report.custom_revisi_urls).map(([key, url]) => (
                                <a key={key} href={url as string} target="_blank" rel="noreferrer" className="text-primary hover:underline">{key}</a>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                             {report.revisi_status !== 'Approved' && (
                               <Button size="sm" onClick={async () => {
                                 try {
                                    await updateDoc(doc(db, 'pbl_reports', report.id), { revisi_status: 'Approved' });
                                    toast.success('Revisi Diterima');
                                 } catch (e) { toast.error('Gagal menerima revisi') }
                               }}>Terima</Button>
                             )}
                             {report.revisi_status !== 'Revisi' && (
                               <Button variant="outline" size="sm" onClick={async () => {
                                 try {
                                    await updateDoc(doc(db, 'pbl_reports', report.id), { revisi_status: 'Revisi', custom_revisi_urls: null });
                                    toast.success('Revisi Dikembalikan');
                                 } catch (e) { toast.error('Gagal mengembalikan revisi') }
                               }}>Kembalikan</Button>
                             )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {groups.filter(g => schedules.some(s => s.group_id === g.id) && findReport(g.id)?.custom_revisi_urls).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-500 py-6">Belum ada kelompok yang mengunggah revisi pasca-ujian.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pengaturan">
          <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Deadline Pendaftaran Ujian</CardTitle>
                  <CardDescription className="mt-1">
                    Atur kapan mahasiswa dapat mengajukan pendaftaran ujian (termasuk unggah ulang setelah dikembalikan).
                  </CardDescription>
                </div>
                <Badge variant={isRegistrationOpen(regSettings) ? 'default' : 'destructive'} className="text-sm px-3 py-1">
                  {isRegistrationOpen(regSettings) ? 'PENDAFTARAN DIBUKA' : 'PENDAFTARAN DITUTUP'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={regMode} onValueChange={(val: any) => setRegMode(val)}>
                    <SelectTrigger>
                      <SelectValue>
                        {regMode === 'auto' ? 'Ikuti Jadwal' : regMode === 'open' ? 'Buka Manual' : 'Tutup Manual'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Ikuti Jadwal</SelectItem>
                      <SelectItem value="open">Buka Manual (abaikan jadwal)</SelectItem>
                      <SelectItem value="closed">Tutup Manual (abaikan jadwal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dibuka Sejak (opsional)</Label>
                  <Input type="datetime-local" value={regOpenAt} onChange={e => setRegOpenAt(e.target.value)} disabled={regMode !== 'auto'} />
                </div>
                <div className="space-y-2">
                  <Label>Deadline (Ditutup Pada)</Label>
                  <Input type="datetime-local" value={regCloseAt} onChange={e => setRegCloseAt(e.target.value)} disabled={regMode !== 'auto'} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Catatan untuk Mahasiswa (opsional)</Label>
                <Input placeholder="Contoh: Pendaftaran diperpanjang hingga 20 Juli 2026" value={regNote} onChange={e => setRegNote(e.target.value)} />
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-slate-500">
                  {regMode === 'auto'
                    ? (regCloseAt || regOpenAt
                        ? `Mengikuti jadwal${regSettings?.open_at ? ` — dibuka ${formatDeadline(regSettings.open_at)}` : ''}${regSettings?.close_at ? ` — ditutup ${formatDeadline(regSettings.close_at)}` : ''}`
                        : 'Belum ada jadwal — pendaftaran dianggap terbuka.')
                    : regMode === 'open' ? 'Pendaftaran dipaksa TERBUKA, jadwal diabaikan.' : 'Pendaftaran dipaksa TERTUTUP, jadwal diabaikan.'}
                </p>
                <Button onClick={handleSaveRegSettings} disabled={savingReg}>
                  {savingReg ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Syarat Pendaftaran Ujian</CardTitle>
                <CardDescription>"Lembar Persetujuan (PDF)" adalah syarat bawaan sistem dan selalu diminta saat pendaftaran ujian. Tambahkan dokumen lain di sini — tidak perlu menambahkan Lembar Persetujuan lagi.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="Contoh: Bukti KRS" value={examReqInput} onChange={(e) => setExamReqInput(e.target.value)} />
                  <Button onClick={() => handleAddRequirement('exam')}>Tambah</Button>
                </div>
                <div className="flex flex-col gap-2">
                  {/* Syarat bawaan sistem — selalu tampil di form mahasiswa,
                      tidak bisa dihapus karena menjadi penanda pengajuan. */}
                  <div className="flex items-center justify-between bg-slate-100 p-2 rounded border text-sm">
                    <span>Lembar Persetujuan (PDF)</span>
                    <Badge variant="secondary" className="text-[10px]">Bawaan Sistem</Badge>
                  </div>
                  {settings.exam.length === 0 ? (
                    <div className="text-sm text-slate-500 py-1">Belum ada syarat tambahan.</div>
                  ) : (
                    settings.exam.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded border text-sm">
                        <span>{req}</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleRemoveRequirement('exam', idx)}>Hapus</Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Syarat Pengumpulan Revisi</CardTitle>
                <CardDescription>Kustomisasi dokumen untuk pengumpulan revisi paska-ujian.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="Contoh: Bukti Bebas Pustaka" value={revisiReqInput} onChange={(e) => setRevisiReqInput(e.target.value)} />
                  <Button onClick={() => handleAddRequirement('revisi')}>Tambah</Button>
                </div>
                {settings.revisi.length === 0 ? (
                  <div className="text-sm text-slate-500 py-2">Belum ada syarat khusus yang diatur</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {settings.revisi.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded border text-sm">
                        <span>{req}</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleRemoveRequirement('revisi', idx)}>Hapus</Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atur Jadwal Ujian PBL</DialogTitle>
            <DialogDescription>
              Tentukan waktu, tempat, dan dosen penguji untuk kelompok ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tanggal</Label>
                <Input type="date" value={newSchedule.date} onChange={e => setNewSchedule({...newSchedule, date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Waktu</Label>
                <Input type="time" value={newSchedule.time} onChange={e => setNewSchedule({...newSchedule, time: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ruangan</Label>
              <Input placeholder="Contoh: Ruang Sidang 1" value={newSchedule.room} onChange={e => setNewSchedule({...newSchedule, room: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Dosen Penguji</Label>
                            <Select value={newSchedule.penguji_id} onValueChange={val => setNewSchedule({...newSchedule, penguji_id: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Dosen Penguji">
                    {newSchedule.penguji_id ? dosenPenguji.find(d => d.id === newSchedule.penguji_id)?.name || newSchedule.penguji_id : "Pilih Dosen Penguji"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {dosenPenguji.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSaveSchedule}>Simpan Jadwal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
