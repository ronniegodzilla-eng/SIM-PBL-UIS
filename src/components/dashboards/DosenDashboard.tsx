import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, FileText, CheckCircle, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import Markdown from 'react-markdown';
import userGuideMd from '../../docs/USER_GUIDE_DOSEN.md?raw';
import userGuidePLMd from '../../docs/USER_GUIDE_PEMBIMBING_LAPANGAN.md?raw';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export const DosenDashboard = ({ role }: { role: string }) => {
  const { profile } = useAuth();
  const [dplGroups, setDplGroups] = useState<any[]>([]);
  const [plGroups, setPlGroups] = useState<any[]>([]);
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [pendingLogbooks, setPendingLogbooks] = useState(0);
  const [pendingAttendances, setPendingAttendances] = useState(0);
  const [openGuide, setOpenGuide] = useState(false);
  
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);

  const navigate = useNavigate();

  const handleSetLeader = async (groupId: string, studentId: string) => {
    try {
      await updateDoc(doc(db, 'pbl_groups', groupId), {
        leader_id: studentId
      });
      toast.success('Ketua kelompok berhasil ditetapkan.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pbl_groups/${groupId}`);
      toast.error('Gagal menetapkan ketua kelompok');
    }
  };

  useEffect(() => {
    if (!profile) return;

    let unsubs: (() => void)[] = [];

    if (role === 'DosenPembimbing' || role === 'Dosen') {
      const qDpl = query(collection(db, 'pbl_groups'), where('dsn_pembimbing_id', '==', profile.uid));
      const uDpl = onSnapshot(qDpl, (snapshot) => {
        setDplGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'pbl_groups'));
      unsubs.push(uDpl);
    }

    if (role === 'PembimbingLapangan' || role === 'Dosen') {
      const qPl = query(collection(db, 'pbl_groups'), where('pmb_lapangan_id', '==', profile.uid));
      const uPl = onSnapshot(qPl, (snapshot) => {
        setPlGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'pbl_groups'));
      unsubs.push(uPl);
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [profile, role]);

  // Jadwal ujian yang relevan: sebagai Dosen Penguji ATAU sebagai pembimbing
  // (DPL/PL) dari kelompok yang dijadwalkan. Dokumen exam_schedules tidak
  // punya field pembimbing_id — relasi pembimbing ada di dokumen kelompok,
  // jadi jadwal kelompok bimbingan diturunkan dari dplGroups/plGroups.
  useEffect(() => {
    if (!profile) return;

    const supervisedIds = new Set([...dplGroups, ...plGroups].map(g => g.id));
    const unsubExam = onSnapshot(collection(db, 'exam_schedules'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(d => {
        const data: any = { id: d.id, ...d.data() };
        if (data.penguji_id === profile.uid || supervisedIds.has(data.group_id)) {
          list.push(data);
        }
      });
      list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      setExamSchedules(list);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'exam_schedules'));

    return () => unsubExam();
  }, [profile, dplGroups, plGroups]);

  useEffect(() => {
    const unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'Mahasiswa')), (snapshot) => {
      setAllStudents(snapshot.docs.map(doc => doc.data()));
    });
    const unsubMembers = onSnapshot(collection(db, 'group_members'), (snapshot) => {
       setAllMembers(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})));
    });
    const unsubAllGroups = onSnapshot(collection(db, 'pbl_groups'), (snapshot) => {
       setAllGroups(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})));
    });
    return () => {
      unsubStudents();
      unsubMembers();
      unsubAllGroups();
    }
  }, []);

  useEffect(() => {
    const allGroups = [...plGroups, ...dplGroups];
    if (allGroups.length === 0) {
      setPendingLogbooks(0);
      setPendingAttendances(0);
      return;
    }

    const groupIds = allGroups.map(g => g.id);
    const qMembers = query(collection(db, 'group_members'));
    
    let currentUnsubLogs: (() => void) | null = null;
    let currentUnsubAtts: (() => void) | null = null;

    const unsubMembers = onSnapshot(qMembers, (snapshot) => {
      if (currentUnsubLogs) {
        currentUnsubLogs();
        currentUnsubLogs = null;
      }
      if (currentUnsubAtts) {
        currentUnsubAtts();
        currentUnsubAtts = null;
      }

      const sIds: string[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (groupIds.includes(data.group_id) && !sIds.includes(data.student_id)) {
          sIds.push(data.student_id);
        }
      });

      if (sIds.length === 0) {
        setPendingLogbooks(0);
        setPendingAttendances(0);
        return;
      }

      const qLogbooks = query(collection(db, 'logbooks'), where('status', '==', 'Pending'));
      currentUnsubLogs = onSnapshot(qLogbooks, (snapLogs) => {
        let count = 0;
        snapLogs.forEach((lDoc) => {
          if (sIds.includes(lDoc.data().student_id)) count++;
        });
        setPendingLogbooks(count);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'logbooks'));

      const qAttendances = query(collection(db, 'attendances'), where('status', '==', 'Pending'));
      currentUnsubAtts = onSnapshot(qAttendances, (snapAtts) => {
        let count = 0;
        snapAtts.forEach((aDoc) => {
          if (sIds.includes(aDoc.data().student_id)) count++;
        });
        setPendingAttendances(count);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendances'));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'group_members'));

    return () => {
      unsubMembers();
      if (currentUnsubLogs) currentUnsubLogs();
      if (currentUnsubAtts) currentUnsubAtts();
    };
  }, [plGroups, dplGroups]);

  const totalGroups = dplGroups.length + plGroups.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-muted/30 p-4 rounded-xl border">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            Butuh Bantuan?
          </h2>
          <p className="text-sm text-slate-500">Baca panduan pengguna untuk mengetahui fitur dan alur aplikasi. Atau tanya AI asisten kami di pojok bawah.</p>
        </div>
        <Dialog open={openGuide} onOpenChange={setOpenGuide}>
          <DialogTrigger render={<Button className="whitespace-nowrap" />}>
            <FileText className="w-4 h-4 mr-2" />
            Baca Panduan {role === 'PembimbingLapangan' ? 'Pembimbing Lapangan' : 'Dosen'}
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto w-full sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Panduan Pengguna - {role === 'PembimbingLapangan' ? 'Pembimbing Lapangan' : 'Dosen'}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 prose prose-slate prose-sm md:prose-base dark:prose-invert max-w-none">
              <Markdown
                components={{
                  a: ({ node, href, children, ...props }) => {
                    if (href && href.startsWith('/')) {
                      return (
                        <Link
                          to={href}
                          onClick={() => setOpenGuide(false)}
                          className="text-indigo-600 hover:text-indigo-800 underline"
                          {...(props as any)}
                        >
                          {children}
                        </Link>
                      );
                    }
                    return (
                      <a href={href} className="text-indigo-600 hover:text-indigo-800 underline" {...props}>
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {role === 'PembimbingLapangan' ? userGuidePLMd : userGuideMd}
              </Markdown>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-[0.8rem] text-muted-foreground mb-1">Kelompok Bimbingan</div>
              <div className="text-2xl font-bold">{dplGroups.length}</div>
            </div>
            <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-[0.8rem] text-muted-foreground mb-1">Jadwal Ujian</div>
              <div className="text-2xl font-bold">{examSchedules.length}</div>
            </div>
            <div className="h-10 w-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
              <Calendar className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {(plGroups.length > 0 || dplGroups.length > 0 || role === 'PembimbingLapangan') && (
          <>
            <Card 
              className="cursor-pointer hover:border-orange-200 hover:shadow-sm transition-all"
              onClick={() => navigate('/persetujuan-absensi?tab=logbook')}
            >
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-[0.8rem] text-muted-foreground mb-1">Persetujuan Logbook</div>
                  <div className="text-2xl font-bold text-orange-600">{pendingLogbooks}</div>
                </div>
                <div className="h-10 w-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:border-emerald-200 hover:shadow-sm transition-all"
              onClick={() => navigate('/persetujuan-absensi?tab=absensi')}
            >
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-[0.8rem] text-muted-foreground mb-1">Persetujuan Absensi</div>
                  <div className="text-2xl font-bold text-emerald-600">{pendingAttendances}</div>
                </div>
                <div className="h-10 w-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Kelompok Bimbingan (DPL)
            </CardTitle>
            <CardDescription>Daftar kelompok PBL yang Anda bimbing.</CardDescription>
          </CardHeader>
          <CardContent>
            {dplGroups.length === 0 ? (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded border border-dashed">
                Belum ada kelompok yang ditugaskan kepada Anda.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {dplGroups.map(group => {
                  const members = allMembers.filter(m => m.group_id === group.id && m.status === 'Approved');
                  const memberDetails = members.map(m => {
                    const student = allStudents.find(s => s.uid === m.student_id);
                    return { ...m, ...student };
                  });

                  return (
                  <div key={group.id} className="border border-slate-100 bg-slate-50 rounded-lg p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-sm mb-1">{group.group_name}</h4>
                        <Badge variant="outline" className="text-xs">{group.status}</Badge>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate('/penilaian')}
                      >
                        Beri Nilai
                      </Button>
                    </div>
                    {memberDetails.length > 0 && (
                      <div className="border-t pt-3">
                        <div className="text-xs font-semibold text-slate-500 mb-2">Anggota Kelompok:</div>
                        <ul className="text-sm space-y-2">
                          {memberDetails.map((m, i) => (
                            <li key={i} className="flex justify-between items-center bg-white border p-2 rounded-md">
                              <div>
                                <span className={group.leader_id === m.student_id ? "font-semibold" : ""}>{m.name || 'Unknown Student'}</span>
                                {group.leader_id === m.student_id && <Badge className="ml-2 bg-indigo-100 text-indigo-700 text-[10px]" variant="secondary">Ketua</Badge>}
                              </div>
                              {group.leader_id !== m.student_id && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-xs h-7 px-2"
                                  onClick={() => handleSetLeader(group.id, m.student_id)}
                                >
                                  Jadikan Ketua
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              Jadwal Ujian
            </CardTitle>
            <CardDescription>Jadwal ujian di mana Anda ditugaskan (Penguji/Pembimbing).</CardDescription>
          </CardHeader>
          <CardContent>
            {examSchedules.length === 0 ? (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded border border-dashed">
                Tidak ada jadwal ujian saat ini.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {examSchedules.map(schedule => {
                   const group = allGroups.find(g => g.id === schedule.group_id);
                   const dateStr = schedule.date
                     ? new Date(schedule.date).toLocaleDateString('id-ID', {
                         weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                       })
                     : 'Belum Diatur';
                   const asPenguji = schedule.penguji_id === profile?.uid;
                   return (
                    <div key={schedule.id} className="border border-slate-100 bg-slate-50 rounded-lg p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm mb-1 truncate">{group?.group_name || schedule.group_id}</h4>
                        <div className="text-xs text-slate-500">
                          {dateStr}{schedule.time ? ` • ${schedule.time}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                          {schedule.room ? `Ruang ${schedule.room}` : 'Ruang TBA'}
                        </Badge>
                        <div className="text-[10px] text-slate-500">{asPenguji ? 'Sebagai Penguji' : 'Sebagai Pembimbing'}</div>
                      </div>
                    </div>
                   );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

