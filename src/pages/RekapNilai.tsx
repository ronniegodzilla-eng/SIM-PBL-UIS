import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, getDocs, where, doc, updateDoc, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Download, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type SortConfig = { key: string, direction: 'asc' | 'desc' } | null;

export const RekapNilai = () => {
  const { profile } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [grades, setGrades] = useState<any>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const getNilaiHuruf = (nilai: number) => {
    if (nilai > 89.99) return "A";
    if (nilai > 84.99) return "A-";
    if (nilai > 79.99) return "B+";
    if (nilai > 74.99) return "B";
    if (nilai > 69.99) return "B-";
    if (nilai > 64.99) return "C+";
    if (nilai > 59.99) return "C";
    if (nilai > 54.99) return "C-";
    return "D";
  };

  const [isEditActive, setIsEditActive] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const qStudents = query(collection(db, 'users'), where('role', '==', 'Mahasiswa'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const s: any[] = [];
      snapshot.forEach(doc => s.push({ id: doc.id, ...doc.data() }));
      setStudents(s);
    });

    const qGroups = query(collection(db, 'pbl_groups'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      const g: any[] = [];
      snapshot.forEach(doc => g.push({ id: doc.id, ...doc.data() }));
      setGroups(g);
    });

    const qMembers = query(collection(db, 'group_members'), where('status', '==', 'Approved'));
    const unsubMembers = onSnapshot(qMembers, (snapshot) => {
      const m: any[] = [];
      snapshot.forEach(doc => m.push({ id: doc.id, ...doc.data() }));
      setGroupMembers(m);
    });

    const qGrades = query(collection(db, 'grades'));
    const unsubGrades = onSnapshot(qGrades, (snapshot) => {
       const gradesMap: any = {};
       snapshot.forEach(doc => {
         const data = doc.data();

         // Defense-in-depth: never count a grade a student gave to themselves.
         // Server rules now block this, but legacy data may still contain it.
         if (data.evaluator_id && data.student_id && data.evaluator_id === data.student_id) return;

         if (!gradesMap[data.student_id]) gradesMap[data.student_id] = {};

         // If it's peer review, we might have multiple peer grades.
         // For simplicity, we just average them.
         if (data.category === 'PeerReview') {
            if (!gradesMap[data.student_id]['PeerReview']) gradesMap[data.student_id]['PeerReview'] = [];
            gradesMap[data.student_id]['PeerReview'].push(data.score);
         } else {
            gradesMap[data.student_id][data.category] = data.score;
         }
       });
       
       // Calculate averages for peer review
       Object.keys(gradesMap).forEach(sId => {
         if (gradesMap[sId]['PeerReview'] && gradesMap[sId]['PeerReview'].length > 0) {
           const sum = gradesMap[sId]['PeerReview'].reduce((a:number, b:number) => a + b, 0);
           gradesMap[sId]['PeerReview'] = sum / gradesMap[sId]['PeerReview'].length;
         }
       });
       
       setGrades(gradesMap);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'main'), (doc) => {
      if (doc.exists()) {
        setIsEditActive(doc.data().is_edit_active || false);
      }
    });

    return () => {
      unsubStudents();
      unsubGroups();
      unsubMembers();
      unsubGrades();
      unsubSettings();
    };
  }, [profile]);

  if (profile?.role !== 'Admin' && profile?.role !== 'AdminProdi' && profile?.role !== 'Dosen') {
    return <div className="p-8 text-center">Akses Ditolak</div>;
  }

  const isAdmin = profile?.role === 'Admin' || profile?.role === 'AdminProdi';

  const filteredStudents = students.filter(student => {
    if (isAdmin) return true;
    const member = groupMembers.find(m => m.student_id === student.id);
    const group = groups.find(g => g.id === member?.group_id);
    return group && group.dsn_pembimbing_id === profile.uid;
  });

  const handleToggleEdit = async (checked: boolean) => {
    try {
      await setDoc(doc(db, 'settings', 'main'), { is_edit_active: checked }, { merge: true });
      toast.success(checked ? 'Edit nilai diaktifkan' : 'Edit nilai dinonaktifkan');
    } catch (error) {
      toast.error('Gagal mengubah pengaturan edit nilai');
    }
  };

  const handlePublishNilai = async (studentId: string, finalScore: number, letterGrade: string) => {
    try {
      await updateDoc(doc(db, 'users', studentId), {
        is_grade_published: true,
        final_score: finalScore,
        letter_grade: letterGrade
      });
      toast.success('Nilai mahasiswa berhasil di-publish');
    } catch (error) {
      toast.error('Gagal mem-publish nilai');
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const processedStudents = useMemo(() => {
    const enriched = filteredStudents.map(student => {
      const member = groupMembers.find(m => m.student_id === student.id);
      const group = groups.find(g => g.id === member?.group_id);
      const sGrades = grades[student.id] || {};
      
      const sosialisasiScore = sGrades['KehadiranSosialisasi'] || 0;
      const plScore = sGrades['PembimbingLapangan'] || 0;
      const dpScore = sGrades['DosenPembimbing'] || 0;
      const pengujiScore = sGrades['DosenPenguji'] || 0;
      const peerScore = sGrades['PeerReview'] || 0;
      const finalScore = (sosialisasiScore * 0.1) + (plScore * 0.1) + (dpScore * 0.5) + (pengujiScore * 0.2) + (peerScore * 0.1);
      
      return {
        ...student,
        group_name: group ? group.group_name : '-',
        prodi: group?.prodi || student.prodi || 'Tidak Spesifik',
        sosialisasiScore,
        plScore,
        dpScore,
        pengujiScore,
        peerScore,
        finalScore,
        letterGrade: finalScore > 0 ? getNilaiHuruf(finalScore) : '-'
      };
    });

    const searched = enriched.filter(student => 
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (student.id_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.group_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (sortConfig !== null) {
      searched.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return searched;
  }, [filteredStudents, groupMembers, groups, grades, searchQuery, sortConfig]);

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (!sortConfig || sortConfig.key !== columnKey) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 text-primary" /> : <ArrowDown className="ml-2 h-4 w-4 text-primary" />;
  };

  const handleExportExcel = () => {
    const dataToExport = processedStudents.map(student => ({
      'NIM/Email': student.id_number || student.email,
      'Nama Mahasiswa': student.name,
      'Kelompok': student.group_name,
      'Prodi': student.prodi,
      'Kehadiran Sosialisasi (10%)': student.sosialisasiScore ? student.sosialisasiScore.toFixed(1) : '-',
      'Pembimbing Lapangan (10%)': student.plScore ? student.plScore.toFixed(1) : '-',
      'Dosen Pembimbing (50%)': student.dpScore ? student.dpScore.toFixed(1) : '-',
      'Dosen Penguji (20%)': student.pengujiScore ? student.pengujiScore.toFixed(1) : '-',
      'Peer Review (10%)': student.peerScore ? student.peerScore.toFixed(1) : '-',
      'Nilai Akhir': student.finalScore > 0 ? student.finalScore.toFixed(2) : '-',
      'Nilai Huruf': student.letterGrade,
      'Status Publish': student.is_grade_published ? 'Published' : 'Belum Publish'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap_Nilai');
    XLSX.writeFile(workbook, 'Rekapitulasi_Nilai_PBL.xlsx');
  };

  const handleExportPdf = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("REKAPITULASI NILAI PRAKTIK BELAJAR LAPANGAN", 148, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (!isAdmin) {
      doc.text(`Dosen Pembimbing: ${profile?.name}`, 14, 30);
    }
    
    const tableData = processedStudents.map((s, index) => [
      index + 1,
      s.id_number || '-',
      s.name,
      s.prodi,
      s.group_name,
      s.sosialisasiScore ? s.sosialisasiScore.toFixed(1) : '-',
      s.plScore ? s.plScore.toFixed(1) : '-',
      s.dpScore ? s.dpScore.toFixed(1) : '-',
      s.pengujiScore ? s.pengujiScore.toFixed(1) : '-',
      s.peerScore ? s.peerScore.toFixed(1) : '-',
      s.finalScore > 0 ? s.finalScore.toFixed(2) : '-',
      s.letterGrade || '-'
    ]);

    autoTable(doc, {
      startY: isAdmin ? 35 : 35,
      head: [['No', 'NIM', 'Nama', 'Prodi', 'Kelompok', 'Kehadiran', 'PL', 'DP', 'Penguji', 'Peer', 'Akhir', 'Huruf']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });
    
    doc.save(`Rekapitulasi_Nilai_PBL${isAdmin ? '' : '_' + profile?.name}.pdf`);
  };

  const isDosen = profile?.role === 'Dosen';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rekapitulasi Nilai PBL</h1>
          <p className="text-muted-foreground">Tinjau nilai akhir seluruh mahasiswa.</p>
        </div>
        <div className="relative w-full sm:w-80 lg:w-96 shadow-sm rounded-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input 
            className="pl-10 h-11 border-slate-300 bg-white focus-visible:ring-primary text-base placeholder:text-slate-400" 
            placeholder="Cari nama, NIM, atau kelompok..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Data Nilai Mahasiswa</CardTitle>
            <CardDescription>Berdasarkan input dari Pembimbing Lapangan, Dosen Pembimbing, Penguji, dan Teman Sejawat.</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="flex items-center space-x-2">
                <Switch id="edit-mode" checked={isEditActive} onCheckedChange={handleToggleEdit} />
                <Label htmlFor="edit-mode">Izinkan Edit Nilai</Label>
              </div>
            )}
            {(isAdmin || isDosen) && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleExportExcel}>
                  <Download className="mr-2 h-4 w-4" /> Excel
                </Button>
                <Button variant="outline" onClick={handleExportPdf}>
                  <Download className="mr-2 h-4 w-4" /> PDF
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                  <div className="flex items-center">NIM & Nama <SortIcon columnKey="name" /></div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('prodi')}>
                  <div className="flex items-center">Prodi <SortIcon columnKey="prodi" /></div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('group_name')}>
                  <div className="flex items-center">Kelompok <SortIcon columnKey="group_name" /></div>
                </TableHead>
                <TableHead className="text-center cursor-pointer" onClick={() => handleSort('sosialisasiScore')}>
                  <div className="flex items-center justify-center">Kehadiran (10%) <SortIcon columnKey="sosialisasiScore" /></div>
                </TableHead>
                <TableHead className="text-center cursor-pointer" onClick={() => handleSort('plScore')}>
                  <div className="flex items-center justify-center">PL (10%) <SortIcon columnKey="plScore" /></div>
                </TableHead>
                <TableHead className="text-center cursor-pointer" onClick={() => handleSort('dpScore')}>
                  <div className="flex items-center justify-center">DP (50%) <SortIcon columnKey="dpScore" /></div>
                </TableHead>
                <TableHead className="text-center cursor-pointer" onClick={() => handleSort('pengujiScore')}>
                  <div className="flex items-center justify-center">Penguji (20%) <SortIcon columnKey="pengujiScore" /></div>
                </TableHead>
                <TableHead className="text-center cursor-pointer" onClick={() => handleSort('peerScore')}>
                  <div className="flex items-center justify-center">Peer (10%) <SortIcon columnKey="peerScore" /></div>
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort('finalScore')}>
                  <div className="flex items-center justify-end">Nilai Akhir <SortIcon columnKey="finalScore" /></div>
                </TableHead>
                <TableHead className="text-center">Nilai Huruf</TableHead>
                {isAdmin && <TableHead className="text-center">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedStudents.map(student => (
                <TableRow key={student.id}>
                  <TableCell>
                    <div className="font-medium">{student.name}</div>
                    <div className="text-xs text-slate-500">{student.id_number || student.email}</div>
                  </TableCell>
                  <TableCell className="text-xs">{student.prodi}</TableCell>
                  <TableCell>{student.group_name}</TableCell>
                  <TableCell className="text-center">{student.sosialisasiScore ? student.sosialisasiScore.toFixed(1) : '-'}</TableCell>
                  <TableCell className="text-center">{student.plScore ? student.plScore.toFixed(1) : '-'}</TableCell>
                  <TableCell className="text-center">{student.dpScore ? student.dpScore.toFixed(1) : '-'}</TableCell>
                  <TableCell className="text-center">{student.pengujiScore ? student.pengujiScore.toFixed(1) : '-'}</TableCell>
                  <TableCell className="text-center">{student.peerScore ? student.peerScore.toFixed(1) : '-'}</TableCell>
                  <TableCell className="text-right font-bold text-primary">
                      {student.finalScore > 0 ? student.finalScore.toFixed(2) : '-'}
                  </TableCell>
                  <TableCell className="text-center font-bold">
                      {student.letterGrade}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-center">
                        {student.is_grade_published ? (
                          <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">Published</span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handlePublishNilai(student.id, student.finalScore, student.letterGrade)}>
                              Publish
                          </Button>
                        )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
