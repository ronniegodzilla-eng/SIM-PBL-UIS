import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Checkbox } from '../components/ui/checkbox';
import { CheckCircle2, XCircle, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import { generateBeritaAcaraPdf } from '../lib/beritaAcaraPdf';
import { toast } from 'sonner';

interface GroupData {
  id: string;
  group_name: string;
  dsn_pembimbing_id?: string;
  pmb_lapangan_id?: string;
  dsn_penguji_id?: string; // from exam_schedules
  dp_hadir_pembukaan?: boolean;
  dp_hadir_penutupan?: boolean;
  dp_hadir_pengabdian?: boolean;
}

export const MonitoringKinerja = () => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [beritaAcara, setBeritaAcara] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [logbooks, setLogbooks] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [
          groupsSnap, 
          usersSnap,
          beritaSnap,
          gradesSnap,
          examSnap,
          membersSnap,
          logbooksSnap
        ] = await Promise.all([
          getDocs(collection(db, 'pbl_groups')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'berita_acara')),
          getDocs(collection(db, 'grades')),
          getDocs(collection(db, 'exam_schedules')),
          getDocs(collection(db, 'group_members')),
          getDocs(collection(db, 'logbooks'))
        ]);

        setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as GroupData)));
        setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setBeritaAcara(beritaSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setGrades(gradesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setExamSchedules(examSnap.docs.map(d => ({id: d.id, ...d.data()})));
        setGroupMembers(membersSnap.docs.map(d => ({id: d.id, ...d.data()})));
        setLogbooks(logbooksSnap.docs.map(d => ({id: d.id, ...d.data()})));
        
      } catch (error) {
        console.error("Error fetching monitoring data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div>Memuat data monitoring...</div>;

  const getUserName = (id?: string) => {
    if (!id) return '-';
    return users.find(u => u.uid === id || u.id === id)?.name || id;
  };

  // Status pengisian nilai per kelompok: Belum / Sebagian (x dari y anggota) /
  // Sudah lengkap.
  const NilaiBadge = ({ count, total }: { count: number; total: number }) => {
    if (total === 0) return <span className="text-xs text-slate-400">-</span>;
    if (count === 0) return <Badge variant="destructive">Belum</Badge>;
    if (count < total) return <Badge className="bg-amber-500">Sebagian ({count}/{total})</Badge>;
    return <Badge variant="default" className="bg-green-500">Sudah ({count}/{total})</Badge>;
  };

  // Kehadiran dosen menurut berita acara yang ia isi sendiri.
  const KEGIATAN = ['Pembukaan', 'Penutupan', 'Pengabdian pada Masyarakat', 'Ujian'] as const;

  const findBA = (groupId: string, type: string) =>
    beritaAcara.find(b => b.group_id === groupId && b.type === type);

  const BAHadirBadge = ({ groupId, type }: { groupId: string; type: string }) => {
    const ba = findBA(groupId, type);
    if (!ba) return <div className="text-[10px] text-slate-400 mt-1">BA belum diisi</div>;
    if (ba.dosen_hadir === true) return <div className="text-[10px] text-green-600 mt-1">BA: Hadir</div>;
    if (ba.dosen_hadir === false) return <div className="text-[10px] text-red-600 mt-1">BA: Tidak Hadir</div>;
    return <div className="text-[10px] text-amber-600 mt-1">BA: belum dikonfirmasi</div>;
  };

  // Anggota kelompok (dokumen users) untuk lampiran daftar hadir pada PDF.
  const studentsOfGroup = (groupId: string) => {
    const ids = groupMembers
      .filter(m => m.group_id === groupId && m.status === 'Approved')
      .map(m => m.student_id);
    return users.filter(u => ids.includes(u.uid) || ids.includes(u.id));
  };

  // Unduh seluruh berita acara milik satu dosen untuk satu jenis kegiatan
  // (satu kelompok = satu halaman).
  const handleDownloadBA = (dosenId: string, type: string) => {
    const list = beritaAcara.filter(b => b.dosen_id === dosenId && b.type === type);
    if (list.length === 0) {
      toast.error('Belum ada berita acara untuk dosen & kegiatan ini.');
      return;
    }
    const dosenName = getUserName(dosenId);
    const inputs = list.map(ba => ({
      berita: ba,
      group: groups.find(g => g.id === ba.group_id),
      students: studentsOfGroup(ba.group_id),
      dosenName,
    }));
    generateBeritaAcaraPdf(
      inputs,
      `Berita_Acara_${type.replace(/\s+/g, '_')}_${dosenName.replace(/\s+/g, '_')}.pdf`
    );
    toast.success(`${list.length} berita acara diunduh`);
  };

  // Daftar dosen pembimbing yang punya kelompok (untuk rekap per dosen).
  const dosenPembimbingIds = Array.from(
    new Set(groups.map(g => g.dsn_pembimbing_id).filter(Boolean) as string[])
  );

  const handleToggleKehadiran = async (groupId: string, field: 'dp_hadir_pembukaan' | 'dp_hadir_penutupan' | 'dp_hadir_pengabdian', currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'pbl_groups', groupId), {
        [field]: !currentValue
      });
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, [field]: !currentValue } : g));
      toast.success('Kehadiran dosen pembimbing berhasil diperbarui');
    } catch (error) {
      console.error(error);
      toast.error('Gagal memperbarui kehadiran');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Monitoring Kinerja</h1>
        <p className="text-muted-foreground">
          Pantau progres pengisian nilai dan administrasi oleh Dosen dan Mahasiswa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status Administrasi per Kelompok PBL</CardTitle>
          <CardDescription>
            Menampilkan ringkasan kelengkapan Berita Acara dan Penilaian oleh Dosen Pembimbing, Pembimbing Lapangan, dan Dosen Penguji.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kelompok</TableHead>
                <TableHead>Dosen Pembimbing</TableHead>
                <TableHead className="text-center">BA Pembukaan</TableHead>
                <TableHead className="text-center">BA Penutupan</TableHead>
                <TableHead className="text-center">BA Pengabdian</TableHead>
                <TableHead className="text-center">BA Ujian</TableHead>
                <TableHead className="text-center">Nilai DP</TableHead>
                <TableHead className="text-center">Nilai PL</TableHead>
                <TableHead className="text-center">Nilai Penguji</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(group => {
                const groupBA = beritaAcara.filter(b => b.group_id === group.id);
                const hasPembukaan = groupBA.some(b => b.type === 'Pembukaan');
                const hasPenutupan = groupBA.some(b => b.type === 'Penutupan');
                const hasPengabdian = groupBA.some(b => b.type === 'Pengabdian pada Masyarakat');
                const hasUjian = groupBA.some(b => b.type === 'Ujian');

                // Check Grades. Dokumen grades TIDAK punya field group_id dan
                // kategorinya disimpan di field 'category' (bukan 'role'), jadi
                // kaitkan lewat student_id -> group_members.
                const memberStudentIds = groupMembers
                  .filter(m => m.group_id === group.id && m.status === 'Approved')
                  .map(m => m.student_id);
                const totalAnggota = memberStudentIds.length;
                const groupGrades = grades.filter(g => memberStudentIds.includes(g.student_id));

                // Hitung berapa mahasiswa yang sudah dinilai per kategori
                // (pakai Set: kategori penguji bisa punya >1 penilai).
                const countDinilai = (cat: string) =>
                  new Set(groupGrades.filter(g => g.category === cat).map(g => g.student_id)).size;

                const nilaiDPCount = countDinilai('DosenPembimbing');
                const nilaiPLCount = countDinilai('PembimbingLapangan');
                const nilaiPengujiCount = countDinilai('DosenPenguji');

                const exam = examSchedules.find(e => e.group_id === group.id);
                const pengujiName = getUserName(exam?.penguji_id);

                return (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.group_name}</TableCell>
                    <TableCell>
                      <div className="text-sm">DP: {getUserName(group.dsn_pembimbing_id)}</div>
                      <div className="text-sm">PL: {getUserName(group.pmb_lapangan_id)}</div>
                      <div className="text-sm">Penguji: {pengujiName !== '-' ? pengujiName : 'Belum Ditentukan'}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      {hasPembukaan ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">
                       {hasPenutupan ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">
                       {hasPengabdian ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">
                       {hasUjian ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">
                       <NilaiBadge count={nilaiDPCount} total={totalAnggota} />
                    </TableCell>
                    <TableCell className="text-center">
                       <NilaiBadge count={nilaiPLCount} total={totalAnggota} />
                    </TableCell>
                    <TableCell className="text-center">
                       <NilaiBadge count={nilaiPengujiCount} total={totalAnggota} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-4">Belum ada kelompok data.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kehadiran Dosen Pembimbing pada Kegiatan Utama</CardTitle>
          <CardDescription>
            Centang = catatan kehadiran versi admin. Keterangan "BA" di bawahnya adalah kehadiran yang dikonfirmasi sendiri oleh Dosen Pembimbing saat mengisi berita acara.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kelompok PBL</TableHead>
                <TableHead>Dosen Pembimbing</TableHead>
                <TableHead className="text-center">Hadir Pembukaan</TableHead>
                <TableHead className="text-center">Hadir Penutupan</TableHead>
                <TableHead className="text-center">Hadir Pengabdian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(group => {
                return (
                  <TableRow key={'hadir-' + group.id}>
                    <TableCell className="font-medium">{group.group_name}</TableCell>
                    <TableCell>{getUserName(group.dsn_pembimbing_id)}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={!!group.dp_hadir_pembukaan} 
                        onCheckedChange={(checked) => handleToggleKehadiran(group.id, 'dp_hadir_pembukaan', !!group.dp_hadir_pembukaan)} 
                      />
                      <BAHadirBadge groupId={group.id} type="Pembukaan" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={!!group.dp_hadir_penutupan} 
                        onCheckedChange={(checked) => handleToggleKehadiran(group.id, 'dp_hadir_penutupan', !!group.dp_hadir_penutupan)} 
                      />
                      <BAHadirBadge groupId={group.id} type="Penutupan" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={!!group.dp_hadir_pengabdian} 
                        onCheckedChange={(checked) => handleToggleKehadiran(group.id, 'dp_hadir_pengabdian', !!group.dp_hadir_pengabdian)} 
                      />
                      <BAHadirBadge groupId={group.id} type="Pengabdian pada Masyarakat" />
                    </TableCell>
                  </TableRow>
                );
              })}
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4">Belum ada kelompok data.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Berita Acara per Dosen &amp; Kegiatan</CardTitle>
          <CardDescription>
            Unduh berita acara tiap dosen per jenis kegiatan. Bila dosen membimbing beberapa kelompok, seluruhnya digabung dalam satu PDF (satu kelompok per halaman).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dosen Pembimbing</TableHead>
                {KEGIATAN.map(k => (
                  <TableHead key={k} className="text-center">{k === 'Pengabdian pada Masyarakat' ? 'Pengabdian' : k}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dosenPembimbingIds.map(dosenId => {
                const dosenGroups = groups.filter(g => g.dsn_pembimbing_id === dosenId);
                return (
                  <TableRow key={'ba-' + dosenId}>
                    <TableCell className="font-medium">
                      <div>{getUserName(dosenId)}</div>
                      <div className="text-xs text-slate-500">{dosenGroups.length} kelompok bimbingan</div>
                    </TableCell>
                    {KEGIATAN.map(k => {
                      const list = beritaAcara.filter(b => b.dosen_id === dosenId && b.type === k);
                      const hadirCount = list.filter(b => b.dosen_hadir === true).length;
                      return (
                        <TableCell key={k} className="text-center">
                          {list.length === 0 ? (
                            <span className="text-xs text-slate-400">Belum ada BA</span>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDownloadBA(dosenId, k)}>
                                <Download className="w-3 h-3 mr-1" /> {list.length} BA
                              </Button>
                              <span className="text-[10px] text-slate-500">Hadir: {hadirCount}/{list.length}</span>
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              {dosenPembimbingIds.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4">Belum ada dosen pembimbing yang ditugaskan.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status Administrasi Mahasiswa</CardTitle>
          <CardDescription>
            Menampilkan ringkasan pengisian presensi (logbook) dan penilaian teman sejawat oleh mahasiswa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NIM - Nama Mahasiswa</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead className="text-center">Jumlah Logbook (Hadir & Izin/Sakit)</TableHead>
                <TableHead className="text-center">Logbook Divalidasi</TableHead>
                <TableHead className="text-center">Status Peer Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupMembers.filter(m => m.status === 'Approved').map(member => {
                const group = groups.find(g => g.id === member.group_id);
                // NIM tersimpan di field id_number pada dokumen users.
                const mhsUser = users.find(u => u.uid === member.student_id || u.id === member.student_id);
                const nameDisplay = mhsUser ? `${mhsUser.id_number || '-'} - ${mhsUser.name}` : member.student_id;

                const mhsLogbooks = logbooks.filter(l => l.student_id === member.student_id);
                const validatedLogbooks = mhsLogbooks.filter(l => l.status === 'Approved').length;
                const mhsPeerReviews = grades.filter(p => p.evaluator_id === member.student_id && p.category === 'PeerReview');

                // Assuming a group size of N, expected peer reviews is N-1. Just checking if > 0 for now.
                const hasPeerReview = mhsPeerReviews.length > 0;

                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{nameDisplay}</TableCell>
                    <TableCell>{group ? group.group_name : '-'}</TableCell>
                    <TableCell className="text-center">{mhsLogbooks.length}</TableCell>
                    <TableCell className="text-center">
                      <span className={validatedLogbooks === mhsLogbooks.length && mhsLogbooks.length > 0 ? "text-green-600 font-bold" : (validatedLogbooks === 0 ? "text-red-500 font-bold" : "text-amber-500 font-bold")}>
                        {validatedLogbooks} / {mhsLogbooks.length}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {hasPeerReview ? <Badge variant="default" className="bg-green-500">Sudah Mengisi</Badge> : <Badge variant="destructive">Belum Mengisi</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {groupMembers.filter(m => m.status === 'Approved').length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4">Belum ada data mahasiswa dalam kelompok.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
