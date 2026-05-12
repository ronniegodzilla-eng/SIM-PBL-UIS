import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Checkbox } from '../components/ui/checkbox';
import { CheckCircle2, XCircle } from 'lucide-react';
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

                // Check Grades
                const groupGrades = grades.filter(g => g.group_id === group.id);
                const hasNilaiDP = groupGrades.some(g => g.role === 'DosenPembimbing');
                const hasNilaiPL = groupGrades.some(g => g.role === 'PembimbingLapangan');
                const hasNilaiPenguji = groupGrades.some(g => g.role === 'DosenPenguji');

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
                       {hasNilaiDP ? <Badge variant="default" className="bg-green-500">Sudah</Badge> : <Badge variant="destructive">Belum</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                       {hasNilaiPL ? <Badge variant="default" className="bg-green-500">Sudah</Badge> : <Badge variant="destructive">Belum</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                       {hasNilaiPenguji ? <Badge variant="default" className="bg-green-500">Sudah</Badge> : <Badge variant="destructive">Belum</Badge>}
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
            Menu bagi admin untuk mengabsen kehadiran Dosen Pembimbing pada acara pembukaan, penutupan, dan pengabdian masyarakat.
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
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={!!group.dp_hadir_penutupan} 
                        onCheckedChange={(checked) => handleToggleKehadiran(group.id, 'dp_hadir_penutupan', !!group.dp_hadir_penutupan)} 
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={!!group.dp_hadir_pengabdian} 
                        onCheckedChange={(checked) => handleToggleKehadiran(group.id, 'dp_hadir_pengabdian', !!group.dp_hadir_pengabdian)} 
                      />
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
                const mhsUser = users.find(u => u.uid === member.student_id);
                const nameDisplay = mhsUser ? `${mhsUser.student_id || '-'} - ${mhsUser.name}` : member.student_id;

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
