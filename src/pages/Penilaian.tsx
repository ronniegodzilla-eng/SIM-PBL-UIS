import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, getDocs, setDoc, doc, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Search, ArrowUp, ArrowDown } from 'lucide-react';

export const Penilaian = () => {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [grades, setGrades] = useState<any>({}); 
  const [rubric, setRubric] = useState<any>({ criteria: [] });
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [graderRoleKey, setGraderRoleKey] = useState('DosenPenguji');
  const [isEditActive, setIsEditActive] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'name', direction: 'asc' });

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'main'), (doc) => {
      if (doc.exists()) {
        setIsEditActive(doc.data().is_edit_active || false);
      }
    });

    return () => unsubSettings();
  }, [])

  useEffect(() => {
    if (!profile) return;

    let roleName = profile.role;
    if (roleName === 'PembimbingLapangan' || roleName === 'Dosen') {
       // Just default Dosen to DosenPembimbing rubric if they aren't explicit, but actually they might grade on both? 
       // For simplicity, map regular Dosen to DosenPembimbing here, or let them switch?
       // Usually they are assigned specifically. We'll map Dosen generically to DosenPembimbing's rubric
       setGraderRoleKey(roleName === 'Dosen' ? 'DosenPembimbing' : roleName);
    } else if (roleName === 'Admin' || roleName === 'AdminProdi') {
       setGraderRoleKey('Sosialisasi');
    } else {
       setGraderRoleKey('DosenPenguji');
    }

    // It depends on graderRoleKey state now:
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const unsubRubric = onSnapshot(doc(db, 'rubrics', graderRoleKey), (doc) => {
      if (doc.exists()) {
        setRubric(doc.data());
      } else {
        setRubric({ criteria: [] });
      }
    });

    return () => unsubRubric();
  }, [graderRoleKey]);

  useEffect(() => {
    if (!profile) return;

    let qGroups;
    if (profile.role === 'PembimbingLapangan') {
      qGroups = query(collection(db, 'pbl_groups'), where('pmb_lapangan_id', '==', profile.uid));
    } else if (profile.role === 'Dosen' || profile.role === 'Admin' || profile.role === 'AdminProdi') {
      qGroups = query(collection(db, 'pbl_groups')); 
    } else {
      return; 
    }

    const unsubGroups = onSnapshot(qGroups, async (snapshot) => {
      let g: any[] = [];
      snapshot.forEach(doc => g.push({ id: doc.id, ...doc.data() }));

      if (profile.role === 'Dosen') {
        const qSchedules = query(collection(db, 'exam_schedules'), where('penguji_id', '==', profile.uid));
        const schedSnapshot = await getDocs(qSchedules);
        const pengujiGroupIds = schedSnapshot.docs.map(doc => doc.data().group_id);
        g = g.filter(group => pengujiGroupIds.includes(group.id) || group.dsn_pembimbing_id === profile.uid);
      }
      
      setGroups(g);

      // We still want to see their group name if they have one
      const groupIds = g.map(group => group.id);
      const qMembers = query(collection(db, 'group_members'), where('status', '==', 'Approved'));
      const memberSnapshot = await getDocs(qMembers);
      const members: any[] = [];
      const studentIdsInGroups: string[] = [];
      
      memberSnapshot.forEach(doc => {
        const m = doc.data();
        if (groupIds.includes(m.group_id) || profile.role === 'Admin' || profile.role === 'AdminProdi') {
          // If Admin, store all members so we can match their groups
          members.push({ id: doc.id, ...m });
          if (groupIds.includes(m.group_id)) {
            studentIdsInGroups.push(m.student_id);
          }
        }
      });
      setGroupMembers(members);

      // Fetch students
      const qStudents = query(collection(db, 'users'), where('role', '==', 'Mahasiswa'));
      const studSnapshot = await getDocs(qStudents);
      const studs: any[] = [];
      const finalStudentIds: string[] = [];

      studSnapshot.forEach(doc => {
        const isTargeted = studentIdsInGroups.includes(doc.id);
        const isAdmin = profile.role === 'Admin' || profile.role === 'AdminProdi';
        
        if (isTargeted || isAdmin) {
          studs.push({ id: doc.id, ...doc.data() });
          finalStudentIds.push(doc.id);
        }
      });

      setStudents(studs);

      if (finalStudentIds.length > 0) {
        const qGrades = query(collection(db, 'grades'));
        const unsubGrades = onSnapshot(qGrades, (gradeSnap) => {
          const gradesMap: any = {};
          gradeSnap.forEach(d => {
            const grad = d.data();
            if (finalStudentIds.includes(grad.student_id)) {
               if (!gradesMap[grad.student_id]) gradesMap[grad.student_id] = {};
               gradesMap[grad.student_id][grad.category] = { score: grad.score, detail: grad.rubric_scores };
            }
          });
          setGrades(gradesMap);
        });
        return () => unsubGrades();
      } else {
        setGrades({});
      }
    });

    return () => unsubGroups();
  }, [profile]);

  const handleScoreChange = (critId: string, val: string) => {
     let num = Number(val);
     if (num < 0) num = 0;
     if (num > 100) num = 100;
     setRubricScores(prev => ({ ...prev, [critId]: num }));
  }

  const handleSaveScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedStudent) return;

    if (!rubric.criteria || rubric.criteria.length === 0) {
      toast.error('Rubrik belum dikonfigurasi. Hubungi Admin.');
      return;
    }

    let totalScore = 0;
    for (const c of rubric.criteria) {
       const s = rubricScores[c.id] || 0;
       totalScore += (s * c.weight) / 100;
    }

    try {
      setLoading(true);

      const mem = groupMembers.find(m => m.student_id === selectedStudent.id);
      const gradeId = `${selectedStudent.id}_${graderRoleKey}`;
      await setDoc(doc(db, 'grades', gradeId), {
        student_id: selectedStudent.id,
        group_member_id: mem?.id,
        evaluator_id: profile.uid,
        category: graderRoleKey,
        score: totalScore,
        rubric_scores: rubricScores,
        createdAt: new Date().toISOString()
      }, { merge: true });

      toast.success('Nilai berhasil disimpan');
      setSelectedStudent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'grades');
      toast.error('Gagal menyimpan nilai');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSetSosialisasi = async (student: any, score: number) => {
    if (!profile) return;
    try {
      const mem = groupMembers.find(m => m.student_id === student.id);
      const gradeId = `${student.id}_Sosialisasi`;
      await setDoc(doc(db, 'grades', gradeId), {
        student_id: student.id,
        group_member_id: mem?.id,
        evaluator_id: profile.uid,
        category: 'Sosialisasi',
        score: score,
        rubric_scores: { kehadiran: score },
        createdAt: new Date().toISOString()
      }, { merge: true });
      toast.success('Kehadiran Sosialisasi berhasil disimpan');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'grades');
      toast.error('Gagal menyimpan kehadiran');
    }
  };

  const openScoringDialog = (student: any) => {
     setSelectedStudent(student);
     const existing = grades[student.id]?.[graderRoleKey]?.detail;
     if (existing) {
        setRubricScores(existing);
     } else {
        const initialMap: any = {};
        rubric?.criteria?.forEach((c: any) => initialMap[c.id] = 0);
        setRubricScores(initialMap);
     }
  };

  const handleSort = (field: string) => {
    if (sortConfig.field === field) {
      setSortConfig({ field, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ field, direction: 'asc' });
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortConfig.field !== field) return <ArrowDown className="ml-2 h-4 w-4 text-slate-300 inline-block opacity-0 group-hover:opacity-100" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 inline-block" /> : <ArrowDown className="ml-2 h-4 w-4 inline-block" />;
  };

  const getFilteredAndSortedStudents = () => {
    return students
      .filter((s) => {
        const member = groupMembers.find(m => m.student_id === s.id);
        const group = groups.find(g => g.id === member?.group_id);
        const q = searchQuery.toLowerCase();
        const studentNameMatches = s.name?.toLowerCase().includes(q);
        const stundentProdiMatches = s.prodi?.toLowerCase().includes(q);
        const groupMatches = group?.group_name?.toLowerCase().includes(q);
        return studentNameMatches || stundentProdiMatches || groupMatches || q === '';
      })
      .sort((a, b) => {
        let valA, valB;
        if (sortConfig.field === 'name') {
          valA = a.name || '';
          valB = b.name || '';
        } else if (sortConfig.field === 'group') {
          const m1 = groupMembers.find(m => m.student_id === a.id);
          const g1 = groups.find(g => g.id === m1?.group_id);
          valA = g1?.group_name || '';
          const m2 = groupMembers.find(m => m.student_id === b.id);
          const g2 = groups.find(g => g.id === m2?.group_id);
          valB = g2?.group_name || '';
        } else if (sortConfig.field === 'prodi') {
          valA = a.prodi || '';
          valB = b.prodi || '';
        } else if (sortConfig.field === 'score') {
          valA = grades[a.id]?.[graderRoleKey]?.score || -1;
          valB = grades[b.id]?.[graderRoleKey]?.score || -1;
        } else {
          valA = '';
          valB = '';
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
  };

  const displayedStudents = getFilteredAndSortedStudents();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Penilaian PBL</h1>
          <p className="text-muted-foreground">Berikan nilai kepada mahasiswa secara perorangan sesuai rubrik.</p>
        </div>
        <div className="relative w-full sm:w-80 lg:w-96 shadow-sm rounded-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input 
            className="pl-10 h-11 border-slate-300 bg-white focus-visible:ring-primary text-base placeholder:text-slate-400" 
            placeholder="Cari nama, prodi, kelompok..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Daftar Mahasiswa {graderRoleKey === 'Sosialisasi' ? '(Penilaian Administrasi)' : `(Sebagai ${graderRoleKey})`}
          </CardTitle>
          <CardDescription>Pilih mahasiswa untuk memberikan nilai.</CardDescription>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="text-center py-8 text-slate-500">Belum ada data mahasiswa yang dapat dinilai.</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700 cursor-pointer group" onClick={() => handleSort('name')}>
                      Mahasiswa <SortIcon field="name" />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 cursor-pointer group" onClick={() => handleSort('group')}>
                      Info Kelompok <SortIcon field="group" />
                    </TableHead>
                    {graderRoleKey === 'Sosialisasi' && (
                      <TableHead className="font-semibold text-slate-700 cursor-pointer group" onClick={() => handleSort('prodi')}>
                        Prodi <SortIcon field="prodi" />
                      </TableHead>
                    )}
                    <TableHead className="text-center font-semibold text-slate-700 cursor-pointer group" onClick={() => handleSort('score')}>
                      Nilai Saya <SortIcon field="score" />
                    </TableHead>
                    <TableHead className="text-right font-semibold text-slate-700">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedStudents.map(student => {
                    const member = groupMembers.find(m => m.student_id === student.id);
                    const group = groups.find(g => g.id === member?.group_id);
                    const studentGrades = grades[student.id] || {};
                    const myScore = studentGrades[graderRoleKey]?.score;

                    return (
                      <TableRow key={student.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium">
                          <div className="text-base">{student.name}</div>
                          <div className="text-xs text-slate-500">{student.nim || student.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-slate-900">{group ? group.group_name : '-'}</div>
                          {graderRoleKey !== 'Sosialisasi' && (
                            <div className="text-xs text-slate-500">{student.prodi || '-'}</div>
                          )}
                        </TableCell>
                        {graderRoleKey === 'Sosialisasi' && (
                          <TableCell>
                             <div className="text-sm text-slate-900">{student.prodi || '-'}</div>
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                           {myScore !== undefined ? <span className="font-bold text-primary text-base">{Number(myScore).toFixed(1)}</span> : <span className="text-slate-400">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {graderRoleKey === 'Sosialisasi' ? (
                            <div className="flex justify-end gap-2">
                               <Button 
                                 size="sm" 
                                 variant={myScore === 100 ? "default" : "outline"} 
                                 onClick={() => handleQuickSetSosialisasi(student, 100)}
                                 className={myScore === 100 ? "bg-green-600 hover:bg-green-700" : ""}
                               >
                                 Hadir
                               </Button>
                               <Button 
                                 size="sm" 
                                 variant={myScore === 0 ? "destructive" : "outline"} 
                                 onClick={() => handleQuickSetSosialisasi(student, 0)}
                               >
                                 Tidak Hadir
                               </Button>
                            </div>
                          ) : (
                            <Dialog>
                              <DialogTrigger render={
                                <Button 
                                  size="sm" 
                                  variant={myScore !== undefined ? "secondary" : "default"}
                                  onClick={() => openScoringDialog(student)}
                                  disabled={myScore !== undefined && !isEditActive}
                                  className={myScore === undefined ? "bg-primary hover:bg-primary/90 text-primary-foreground font-medium" : "font-medium"}
                                >
                                  {myScore !== undefined ? 'Edit Nilai' : 'Beri Nilai'}
                                </Button>
                              } />
                              <DialogContent className="max-w-xl">
                              <DialogHeader>
                                <DialogTitle>Beri Nilai: {selectedStudent?.name}</DialogTitle>
                                <DialogDescription>Masukkan nilai 0-100 untuk setiap kriteria.</DialogDescription>
                              </DialogHeader>
                              <form onSubmit={handleSaveScore} className="space-y-4">
                                {rubric.criteria?.length > 0 ? (
                                  <div className="space-y-3">
                                     {rubric.criteria.map((c: any) => (
                                        <div key={c.id} className="grid grid-cols-4 items-center gap-4">
                                          <div className="col-span-3">
                                             <Label>{c.label}</Label>
                                             <div className="text-xs text-slate-500">Bobot: {c.weight}%</div>
                                          </div>
                                          <Input 
                                            type="number" 
                                            min="0" 
                                            max="100" 
                                            value={rubricScores[c.id] || 0} 
                                            onChange={(e) => handleScoreChange(c.id, e.target.value)}
                                            required 
                                          />
                                        </div>
                                     ))}
                                  </div>
                                ) : (
                                  <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded">
                                    Belum ada kriteria penilaian. Harap hubungi Admin untuk mengatur Rubrik.
                                  </div>
                                )}
                                
                                <div className="pt-4 border-t flex justify-between items-center text-lg font-bold">
                                  <span>Estimasi Total: </span>
                                  <span>
                                    {rubric.criteria ? rubric.criteria.reduce((sum: number, c: any) => sum + ((rubricScores[c.id] || 0) * c.weight / 100), 0).toFixed(1) : 0}
                                  </span>
                                </div>

                                <DialogFooter>
                                  <Button type="submit" disabled={loading || !rubric.criteria || rubric.criteria.length === 0}>
                                    {loading ? 'Menyimpan...' : 'Simpan Nilai'}
                                  </Button>
                                </DialogFooter>
                              </form>
                            </DialogContent>
                          </Dialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
