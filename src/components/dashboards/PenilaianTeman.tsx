import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot, getDocs, setDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { toast } from 'sonner';

export const PenilaianTeman = ({ groupMember }: { groupMember: any }) => {
  const { profile } = useAuth();
  const [peers, setPeers] = useState<any[]>([]);
  const [rubric, setRubric] = useState<any>({ criteria: [] });
  const [grades, setGrades] = useState<any>({});
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile || !groupMember || groupMember.status !== 'Approved') return;

    // Get the PeerReview Rubric
    const unsubRubric = onSnapshot(doc(db, 'rubrics', 'PeerReview'), (doc) => {
      if (doc.exists()) {
        setRubric(doc.data());
      } else {
        setRubric({ criteria: [] });
      }
    });

    // Get peers in the same group (excluding self)
    const fetchPeers = async () => {
      const qMembers = query(collection(db, 'group_members'), where('group_id', '==', groupMember.group_id), where('status', '==', 'Approved'));
      const memberSnapshot = await getDocs(qMembers);
      
      const peerIds: string[] = [];
      const memberMap: any = {};
      memberSnapshot.forEach(doc => {
         const m = doc.data();
         if (m.student_id !== profile.uid) {
            peerIds.push(m.student_id);
            memberMap[m.student_id] = { id: doc.id, ...m };
         }
      });

      if (peerIds.length > 0) {
        const qStudents = query(collection(db, 'users'), where('role', '==', 'Mahasiswa'));
        const studSnapshot = await getDocs(qStudents);
        const studs: any[] = [];
        studSnapshot.forEach(doc => {
          if (peerIds.includes(doc.id)) {
            studs.push({ ...doc.data(), member_id: memberMap[doc.id].id });
          }
        });
        setPeers(studs);
        
        // Listen to grades I HAVE GIVEN to them
        const qGrades = query(collection(db, 'grades'), where('evaluator_id', '==', profile.uid), where('category', '==', 'PeerReview'));
        const unsubGrades = onSnapshot(qGrades, (gradeSnap) => {
            const gradesMap: any = {};
            gradeSnap.forEach(d => {
              const grad = d.data();
              gradesMap[grad.student_id] = { score: grad.score, detail: grad.rubric_scores };
            });
            setGrades(gradesMap);
        });
        return () => unsubGrades();
      }
    };
    fetchPeers();

    return () => unsubRubric();
  }, [profile, groupMember]);

  const handleScoreChange = (critId: string, val: string) => {
     let num = Number(val);
     // constraint not more than 100
     if (num < 0) num = 0;
     if (num > 100) num = 100;
     setRubricScores(prev => ({ ...prev, [critId]: num }));
  }

  const handleSaveScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedStudent) return;

    if (!rubric.criteria || rubric.criteria.length === 0) {
      toast.error('Rubrik Penilaian Teman belum dikonfigurasi. Hubungi Admin.');
      return;
    }

    let totalScore = 0;
    for (const c of rubric.criteria) {
       const s = rubricScores[c.id] || 0;
       totalScore += (s * c.weight) / 100;
    }

    try {
      setLoading(true);

      const gradeId = `${selectedStudent.uid}_Peer_${profile.uid}`;
      await setDoc(doc(db, 'grades', gradeId), {
        student_id: selectedStudent.uid,
        group_member_id: selectedStudent.member_id,
        evaluator_id: profile.uid,
        category: 'PeerReview',
        score: totalScore,
        rubric_scores: rubricScores,
        createdAt: new Date().toISOString()
      }, { merge: true });

      toast.success('Pemberian nilai ke teman berhasil');
      setSelectedStudent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'grades');
      toast.error('Gagal menyimpan nilai');
    } finally {
      setLoading(false);
    }
  };

  const openScoringDialog = (student: any) => {
     setSelectedStudent(student);
     const existing = grades[student.uid]?.detail; // uid used properly
     if (existing) {
        setRubricScores(existing);
     } else {
        const initialMap: any = {};
        rubric?.criteria?.forEach((c: any) => initialMap[c.id] = 0);
        setRubricScores(initialMap);
     }
  };

  return (
    <div className="space-y-4">
       <p className="text-sm text-slate-500">Berikan penilaian objektif untuk rekan satu kelompok Anda dalam mengerjakan proyek PBL ini.</p>
       
       <Table>
          <TableHeader>
             <TableRow>
                <TableHead>Nama Rekan</TableHead>
                <TableHead className="text-center">Nilai Saya</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
             </TableRow>
          </TableHeader>
          <TableBody>
             {peers.map(peer => {
                const myScore = grades[peer.uid]?.score;
                return (
                   <TableRow key={peer.uid}>
                      <TableCell className="font-medium">{peer.name}</TableCell>
                      <TableCell className="text-center">
                         {myScore !== undefined ? <span className="font-bold text-primary">{Number(myScore).toFixed(1)}</span> : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                         <Dialog>
                          <DialogTrigger render={
                            <Button 
                              size="sm" 
                              variant={myScore !== undefined ? "secondary" : "default"}
                              onClick={() => openScoringDialog(peer)}
                            >
                              {myScore !== undefined ? 'Edit Nilai' : 'Beri Nilai'}
                            </Button>
                          } />
                          <DialogContent className="max-w-xl">
                            <DialogHeader>
                              <DialogTitle>Penilaian Teman: {selectedStudent?.name}</DialogTitle>
                              <DialogDescription>Masukkan nilai 0-100 untuk setiap kriteria kerja sama.</DialogDescription>
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
                                  Belum ada kriteria penilaian teman. Harap hubungi Admin.
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
                                  {loading ? 'Kirim Penilaian' : 'Simpan Nilai'}
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                   </TableRow>
                )
             })}
          </TableBody>
       </Table>
       
       {peers.length === 0 && (
          <div className="text-center py-8 text-slate-500 border rounded-lg">
             Tidak ada anggota lain dalam kelompok Anda.
          </div>
       )}
    </div>
  );
};
