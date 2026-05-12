import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
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

export const DosenDashboard = ({ role }: { role: string }) => {
  const { profile } = useAuth();
  const [dplGroups, setDplGroups] = useState<any[]>([]);
  const [plGroups, setPlGroups] = useState<any[]>([]);
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [pendingLogbooks, setPendingLogbooks] = useState(0);
  const [pendingAttendances, setPendingAttendances] = useState(0);
  const [openGuide, setOpenGuide] = useState(false);
  const navigate = useNavigate();

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

    if (role === 'DosenPenguji' || role === 'Dosen' || role === 'Penguji') {
      const qExam1 = query(collection(db, 'exam_schedules'), where('penguji_id', '==', profile.uid));
      const uExam1 = onSnapshot(qExam1, (snapshot) => {
        setExamSchedules(prev => {
          const map = new Map(prev.map(e => [e.id, e]));
          snapshot.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
          return Array.from(map.values());
        });
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'exam_schedules'));
      unsubs.push(uExam1);

      // Also if DPL it acts as pembimbing_id on exam_schedules, let's fetch those too
      const qExam2 = query(collection(db, 'exam_schedules'), where('pembimbing_id', '==', profile.uid));
      const uExam2 = onSnapshot(qExam2, (snapshot) => {
         setExamSchedules(prev => {
          const map = new Map(prev.map(e => [e.id, e]));
          snapshot.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
          return Array.from(map.values());
        });
      });
      unsubs.push(uExam2);
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [profile, role]);

  useEffect(() => {
    if (plGroups.length === 0) return;

    const groupIds = plGroups.map(g => g.id);
    const qMembers = query(collection(db, 'group_members'));
    
    const unsubMembers = onSnapshot(qMembers, (snapshot) => {
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
      const unsubLogs = onSnapshot(qLogbooks, (snapLogs) => {
        let count = 0;
        snapLogs.forEach((lDoc) => {
          if (sIds.includes(lDoc.data().student_id)) count++;
        });
        setPendingLogbooks(count);
      });

      const qAttendances = query(collection(db, 'attendances'), where('status', '==', 'Pending'));
      const unsubAtts = onSnapshot(qAttendances, (snapAtts) => {
        let count = 0;
        snapAtts.forEach((aDoc) => {
          if (sIds.includes(aDoc.data().student_id)) count++;
        });
        setPendingAttendances(count);
      });

      return () => {
        unsubLogs();
        unsubAtts();
      };
    });

    return () => {
      unsubMembers();
    };
  }, [plGroups]);

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

        {(plGroups.length > 0 || role === 'PembimbingLapangan') && (
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
                {dplGroups.map(group => (
                  <div key={group.id} className="border border-slate-100 bg-slate-50 rounded-lg p-4 flex items-center justify-between">
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
                ))}
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
                   let dateStr = "Belum Diatur";
                   if (schedule.exam_date) {
                      dateStr = new Date(schedule.exam_date).toLocaleDateString('id-ID', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      });
                   }
                   return (
                    <div key={schedule.id} className="border border-slate-100 bg-slate-50 rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-sm mb-1">{dateStr}</h4>
                        <div className="text-xs text-slate-500">
                          {schedule.start_time && schedule.end_time ? `${schedule.start_time} - ${schedule.end_time}` : 'Waktu belum diatur'}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                        {schedule.location || 'Lokasi TBA'}
                      </Badge>
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

