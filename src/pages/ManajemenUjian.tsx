import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, getDoc, getDocs } from 'firebase/firestore';
import { ArrowUp, ArrowDown, Pencil, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  const [editReq, setEditReq] = useState<{ type: 'exam' | 'revisi'; index: number; value: string } | null>(null);
  
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
        const t = String(v).trim();
        if (t && !out.includes(t)) out.push(t);
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

  // Baca daftar mentah dari server, normalisasi (trim + dedupe), terapkan
  // mutasi, lalu tulis kembali utuh. Dipakai untuk tambah/hapus/edit/urut.
  // Mutator boleh mengembalikan null untuk membatalkan (mis. nama duplikat).
  const mutateRequirements = async (
    type: 'exam' | 'revisi',
    mutate: (arr: string[]) => string[] | null,
    successMsg: string
  ) => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'requirements'));
      const raw: any[] = (snap.exists() ? snap.data()[type] : []) || [];
      const normalized: string[] = [];
      for (const v of raw) {
        const t = String(v).trim();
        if (t && !normalized.includes(t)) normalized.push(t);
      }
      const next = mutate(normalized);
      if (next === null) return;
      await setDoc(doc(db, 'settings', 'requirements'), { [type]: next }, { merge: true });
      toast.success(successMsg);
    } catch (error: any) {
      console.error(error);
      toast.error(`Gagal menyimpan syarat: ${error.code || error.message || 'error tidak diketahui'}`, { duration: 10000 });
    }
  };

  const handleAddRequirement = async (type: 'exam' | 'revisi') => {
    const val = (type === 'exam' ? examReqInput : revisiReqInput).trim();
    if (!val) return;
    await mutateRequirements(type, arr => {
      if (arr.includes(val)) {
        toast.error('Syarat dengan nama itu sudah ada.');
        return null;
      }
      return [...arr, val];
    }, 'Syarat berhasil ditambahkan');
    if (type === 'exam') setExamReqInput('');
    else setRevisiReqInput('');
  };

  const handleRemoveRequirement = (type: 'exam' | 'revisi', index: number) =>
    mutateRequirements(type, arr => arr.filter((_, i) => i !== index), 'Syarat berhasil dihapus');

  const handleMoveRequirement = (type: 'exam' | 'revisi', index: number, dir: -1 | 1) =>
    mutateRequirements(type, arr => {
      const j = index + dir;
      if (j < 0 || j >= arr.length) return null;
      const next = [...arr];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    }, 'Urutan syarat diperbarui');

  const handleEditRequirement = (type: 'exam' | 'revisi', index: number, newVal: string) => {
    const val = newVal.trim();
    if (!val) {
      toast.error('Nama syarat tidak boleh kosong.');
      return Promise.resolve();
    }
    return mutateRequirements(type, arr => {
      if (arr.some((x, i) => i !== index && x === val)) {
        toast.error('Syarat dengan nama itu sudah ada.');
        return null;
      }
      const next = [...arr];
      next[index] = val;
      return next;
    }, 'Syarat berhasil diubah');
  };

  // Pilih dokumen report kanonik (report_<group_id>) agar berkas yang diunggah
  // mahasiswa selalu terbaca, meskipun ada dokumen duplikat untuk grup yang sama.
  const findReport = (groupId: string) => {
    const matches = reports.filter(r => r.group_id === groupId);
    if (matches.length === 0) return undefined;
    return matches.find(r => r.id === `report_${groupId}`) || matches[0];
  };

  // ===== Ekspor PDF (jadwal ujian & rekap revisi) =====
  const addPdfHeader = (doc: jsPDF, title: string) => {
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(14);
    doc.text(title, pageW / 2, 16, { align: 'center' });
    doc.setFontSize(11);
    doc.text('Fakultas Ilmu Kesehatan (Fikes), Universitas Ibnu Sina', pageW / 2, 23, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(14, 27, pageW - 14, 27);
    doc.setFontSize(9);
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 33);
  };

  const addSignatureBlock = (doc: jsPDF) => {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = ((doc as any).lastAutoTable?.finalY || 40) + 15;
    if (y > pageH - 55) {
      doc.addPage();
      y = 25;
    }
    const x = pageW - 80;
    doc.setFontSize(11);
    doc.text(`Batam, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, x, y);
    doc.text('Koordinator PBL,', x, y + 6);
    doc.text('(....................................)', x, y + 34);
  };

  const handleExportJadwalPDF = () => {
    const rows = schedules
      .slice()
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .map((sch, i) => {
        const group = groups.find(g => g.id === sch.group_id);
        const report = findReport(sch.group_id);
        return [
          String(i + 1),
          group?.group_name || sch.group_id,
          group?.prodi || '-',
          report?.report_title || '-',
          new Date(sch.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          sch.time,
          sch.room,
          dosenPenguji.find(d => d.id === sch.penguji_id)?.name || sch.penguji_id,
        ];
      });

    if (rows.length === 0) {
      toast.error('Belum ada jadwal ujian untuk diunduh.');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });
    addPdfHeader(doc, 'JADWAL UJIAN PBL');
    autoTable(doc, {
      startY: 38,
      head: [['No', 'Kelompok', 'Prodi', 'Judul Laporan', 'Hari/Tanggal', 'Waktu', 'Ruangan', 'Dosen Penguji']],
      body: rows,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [15, 118, 110] },
    });
    addSignatureBlock(doc);
    doc.save(`Jadwal_Ujian_PBL_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleExportRevisiPDF = () => {
    // Semua kelompok yang sudah terjadwal ujian ikut dicetak, termasuk yang
    // belum mengunggah revisi — berguna sebagai form monitoring.
    const scheduledGroups = groups.filter(g => schedules.some(sch => sch.group_id === g.id));
    if (scheduledGroups.length === 0) {
      toast.error('Belum ada kelompok terjadwal ujian untuk diunduh.');
      return;
    }

    const rows = scheduledGroups.map((g, i) => {
      const report = findReport(g.id);
      const hasRevisi = !!report?.custom_revisi_urls;
      return [
        String(i + 1),
        g.group_name,
        g.prodi || '-',
        hasRevisi ? (report?.revisi_status || 'Pending') : 'Belum Unggah',
        report?.revisi_submitted_at ? new Date(report.revisi_submitted_at).toLocaleDateString('id-ID') : '-',
        hasRevisi ? Object.keys(report!.custom_revisi_urls).join(', ') : '-',
      ];
    });

    const doc = new jsPDF();
    addPdfHeader(doc, 'REKAP REVISI PASCA-UJIAN PBL');
    autoTable(doc, {
      startY: 38,
      head: [['No', 'Kelompok', 'Prodi', 'Status Revisi', 'Tgl Pengumpulan', 'Berkas']],
      body: rows,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [15, 118, 110] },
    });
    addSignatureBlock(doc);
    doc.save(`Rekap_Revisi_PBL_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Field `status` dipakai dua tahap (bimbingan dosen & verifikasi admin),
  // jadi tahap sebenarnya diturunkan dari kombinasi status + approval_url:
  // approval_url baru terisi setelah mahasiswa mengunggah berkas syarat ujian.
  type ReportStage = 'Bimbingan' | 'MenungguBerkas' | 'MenungguValidasi' | 'DikembalikanAdmin' | 'Tervalidasi';
  const getReportStage = (report: any): ReportStage => {
    // registered_at = penanda baru; approval_url = data lama (field bawaan
    // Lembar Persetujuan yang sudah dihapus dari form).
    const registered = !!(report.registered_at || report.approval_url);
    if (report.status === 'Pending') return 'MenungguValidasi';
    if (report.status === 'Approved') return registered ? 'Tervalidasi' : 'MenungguBerkas';
    if (report.status === 'Revisi') return registered ? 'DikembalikanAdmin' : 'Bimbingan';
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
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[16rem]">
                  <CardTitle>Daftar Kelompok & Eligibilitas Ujian</CardTitle>
                  <CardDescription className="mt-1">Persetujuan Dosen Pembimbing hanya menyelesaikan tahap bimbingan. Kelompok baru dapat dijadwalkan setelah mahasiswa mengunggah berkas syarat ujian dan Admin memvalidasinya ("Setujui Syarat Admin"). Admin dapat mengembalikan berkas (Tidak MS) jika kewajiban administratif belum terpenuhi.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportJadwalPDF}>
                  <Download className="w-4 h-4 mr-2" /> Unduh PDF Jadwal
                </Button>
              </div>
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
                              {report.approval_url && (
                                <a href={report.approval_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Lembar Persetujuan</a>
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
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[16rem]">
                  <CardTitle>Validasi Revisi Pasca-Ujian</CardTitle>
                  <CardDescription className="mt-1">Tinjau dokumen syarat revisi yang diunggah oleh kelompok pasca-ujian.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportRevisiPDF}>
                  <Download className="w-4 h-4 mr-2" /> Unduh PDF Rekap
                </Button>
              </div>
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
                <CardDescription>Dokumen yang wajib diunggah mahasiswa saat pendaftaran ujian. Urutan di daftar ini sama dengan urutan tampil pada form mahasiswa.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="Contoh: Bukti KRS" value={examReqInput} onChange={(e) => setExamReqInput(e.target.value)} />
                  <Button onClick={() => handleAddRequirement('exam')}>Tambah</Button>
                </div>
                <div className="flex flex-col gap-2">
                  {settings.exam.length === 0 ? (
                    <div className="text-sm text-slate-500 py-1">Belum ada syarat — mahasiswa dapat mengajukan pendaftaran tanpa unggahan.</div>
                  ) : (
                    settings.exam.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded border text-sm">
                        {editReq && editReq.type === 'exam' && editReq.index === idx ? (
                          <>
                            <Input value={editReq.value} onChange={e => setEditReq({ ...editReq, value: e.target.value })} className="h-7 text-sm" autoFocus />
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" className="h-6 px-2 text-[11px]" onClick={async () => { await handleEditRequirement('exam', idx, editReq.value); setEditReq(null); }}>Simpan</Button>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setEditReq(null)}>Batal</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 break-words">{req}</span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === 0} title="Naikkan urutan" onClick={() => handleMoveRequirement('exam', idx, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === settings.exam.length - 1} title="Turunkan urutan" onClick={() => handleMoveRequirement('exam', idx, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit nama" onClick={() => setEditReq({ type: 'exam', index: idx, value: req })}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleRemoveRequirement('exam', idx)}>Hapus</Button>
                            </div>
                          </>
                        )}
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
                    {                    settings.revisi.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded border text-sm">
                        {editReq && editReq.type === 'revisi' && editReq.index === idx ? (
                          <>
                            <Input value={editReq.value} onChange={e => setEditReq({ ...editReq, value: e.target.value })} className="h-7 text-sm" autoFocus />
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" className="h-6 px-2 text-[11px]" onClick={async () => { await handleEditRequirement('revisi', idx, editReq.value); setEditReq(null); }}>Simpan</Button>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setEditReq(null)}>Batal</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 break-words">{req}</span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === 0} title="Naikkan urutan" onClick={() => handleMoveRequirement('revisi', idx, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === settings.revisi.length - 1} title="Turunkan urutan" onClick={() => handleMoveRequirement('revisi', idx, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit nama" onClick={() => setEditReq({ type: 'revisi', index: idx, value: req })}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleRemoveRequirement('revisi', idx)}>Hapus</Button>
                            </div>
                          </>
                        )}
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
