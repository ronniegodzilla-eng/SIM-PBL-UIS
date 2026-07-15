import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
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

export const ManajemenUjian = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [dosenPenguji, setDosenPenguji] = useState<any[]>([]);
  const [settings, setSettings] = useState<{ exam: string[], revisi: string[] }>({ exam: [], revisi: [] });
  const [examReqInput, setExamReqInput] = useState('');
  const [revisiReqInput, setRevisiReqInput] = useState('');
  
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

    // Fetch Settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'requirements'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSettings({ exam: data.exam || [], revisi: data.revisi || [] });
      }
    });

    return () => {
      unsubGroups();
      unsubReports();
      unsubSchedules();
      unsubPenguji();
      unsubSettings();
    };
  }, []);

  const handleSaveSchedule = async () => {
    if (!selectedGroupId || !newSchedule.date || !newSchedule.time || !newSchedule.room || !newSchedule.penguji_id) {
      toast.error('Mohon lengkapi semua data jadwal.');
      return;
    }

    // Detect conflicts
    const currentGroup = groups.find(g => g.id === selectedGroupId);
    const newGroupPembimbingId = currentGroup?.pembimbing_id;

    for (const s of schedules) {
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

  const handleAddRequirement = async (type: 'exam' | 'revisi') => {
    const val = type === 'exam' ? examReqInput : revisiReqInput;
    if (!val.trim()) return;

    try {
      const newReqs = [...settings[type], val.trim()];
      await setDoc(doc(db, 'settings', 'requirements'), {
        [type]: newReqs
      }, { merge: true });
      if (type === 'exam') setExamReqInput('');
      else setRevisiReqInput('');
      toast.success('Syarat berhasil ditambahkan');
    } catch (error) {
      toast.error('Gagal menyimpan syarat');
    }
  };

  const handleRemoveRequirement = async (type: 'exam' | 'revisi', index: number) => {
    try {
      const newReqs = settings[type].filter((_, i) => i !== index);
      await setDoc(doc(db, 'settings', 'requirements'), {
        [type]: newReqs
      }, { merge: true });
      toast.success('Syarat berhasil dihapus');
    } catch (error) {
      toast.error('Gagal menghapus syarat');
    }
  };

  // Pilih dokumen report kanonik (report_<group_id>) agar berkas yang diunggah
  // mahasiswa selalu terbaca, meskipun ada dokumen duplikat untuk grup yang sama.
  const findReport = (groupId: string) => {
    const matches = reports.filter(r => r.group_id === groupId);
    if (matches.length === 0) return undefined;
    return matches.find(r => r.id === `report_${groupId}`) || matches[0];
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
              <CardDescription>Kelompok yang telah dinilai "Approved" oleh Dosen Pembimbing dapat dijadwalkan. Admin dapat Kembalikan laporan (Revisi) jika syarat tidak penuhi kewajiban administratif.</CardDescription>
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
                    const isEligible = report && report.status === 'Approved';

                    return (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.group_name}</TableCell>
                        <TableCell>{group.prodi || 'Tidak Spesifik'}</TableCell>
                        <TableCell>
                          {report ? (
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant={report.status === 'Approved' ? 'default' : report.status === 'Revisi' ? 'destructive' : 'secondary'}>
                                {report.status}
                              </Badge>
                              {report.status !== 'Revisi' && report.status !== 'Approved' && (
                                <Button variant="outline" size="sm" className="h-6 text-[10px] mt-1" onClick={() => handleUpdateReportStatus(report.id, 'Revisi')}>
                                  Kembalikan (Tidak MS)
                                </Button>
                              )}
                              {report.status === 'Revisi' && (
                                <Button variant="outline" size="sm" className="h-6 text-[10px] mt-1" onClick={() => handleUpdateReportStatus(report.id, 'Pending')}>
                                  Tandai Pending
                                </Button>
                              )}
                              {(report.status === 'Pending' || report.status === 'Draft') && (
                                <Button size="sm" variant="default" className="h-6 text-[10px] mt-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleUpdateReportStatus(report.id, 'Approved')}>
                                  Setujui Syarat Admin
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Syarat Pendaftaran Ujian</CardTitle>
                <CardDescription>Kustomisasi dokumen apa saja yang harus diunggah mahasiswa selain Draf Laporan & Lembar Persetujuan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="Contoh: Bukti KRS" value={examReqInput} onChange={(e) => setExamReqInput(e.target.value)} />
                  <Button onClick={() => handleAddRequirement('exam')}>Tambah</Button>
                </div>
                {settings.exam.length === 0 ? (
                  <div className="text-sm text-slate-500 py-2">Hanya syarat default (Draf & Persetujuan)</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {settings.exam.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded border text-sm">
                        <span>{req}</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleRemoveRequirement('exam', idx)}>Hapus</Button>
                      </div>
                    ))}
                  </div>
                )}
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
