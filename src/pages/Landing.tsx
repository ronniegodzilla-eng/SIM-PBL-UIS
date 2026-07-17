import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Calendar, Users, Briefcase, Activity, ChevronRight, FileText } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';

export const Landing = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('mode') === 'resetPassword') {
      navigate(`/auth/action?${searchParams.toString()}`);
    }
  }, [searchParams, navigate]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data
  const [stats, setStats] = useState({
    mahasiswa: 0,
    kelompok: 0,
    dosen: 0,
    logbook: 0,
  });

  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<Record<string, any>>({});
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [logbooks, setLogbooks] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Tunggu status login diketahui dulu, supaya koleksi yang aksesnya
    // butuh login (logbooks/attendances) tidak dibaca sebagai anonim.
    if (!authReady) return;

    const fetchData = async () => {
      let mCount = 0;
      let dCount = 0;
      let groupsCount = 0;
      let lCount = 0;
      
      try {
        // Fetch Users manually to count them and get Dosen info
        const usersSnap = await getDocs(collection(db, 'users'));
        const usersData: Record<string, any> = {};
        usersSnap.forEach(doc => {
          const data = doc.data();
          usersData[doc.id] = data;
          if (data.role === 'Mahasiswa') mCount++;
          if (['Dosen'].includes(data.role)) dCount++;
        });
        setUsers(usersData);
      } catch (e) {
        console.warn("Failed fetching users", e);
      }

      try {
        // Fetch Groups
        const groupsSnap = await getDocs(collection(db, 'pbl_groups'));
        const groupsData: any[] = [];
        groupsSnap.forEach(doc => groupsData.push({ id: doc.id, ...doc.data() }));
        setGroups(groupsData);
        groupsCount = groupsData.length;
      } catch (e) {
        console.warn("Failed fetching groups", e);
      }

      try {
        // Fetch Group Members (Approved only)
        const membersSnap = await getDocs(query(collection(db, 'group_members'), where('status', '==', 'Approved')));
        const membersData: any[] = [];
        membersSnap.forEach(doc => membersData.push({ id: doc.id, ...doc.data() }));
        setGroupMembers(membersData);
      } catch (e) {
        console.warn("Failed fetching members", e);
      }

      try {
        // Fetch Exams
        const examSnap = await getDocs(collection(db, 'exam_schedules'));
        const examData: any[] = [];
        examSnap.forEach(doc => examData.push({ id: doc.id, ...doc.data() }));
        
        // Sort exam schedules by date
        examData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setExamSchedules(examData);
      } catch (e) {
        console.warn("Failed fetching exams", e);
      }

      // Logbook & absensi hanya boleh dibaca pengguna login (aturan Firestore).
      // Untuk pengunjung anonim, lewati saja — statistiknya ditampilkan "—".
      if (currentUser) {
        try {
          // Fetch Logbooks
          const logbooksSnap = await getDocs(collection(db, 'logbooks'));
          const logbooksData: any[] = [];
          logbooksSnap.forEach(doc => logbooksData.push({ id: doc.id, ...doc.data() }));
          setLogbooks(logbooksData);
          lCount = logbooksData.length;
        } catch (e) {
          console.warn("Failed fetching logbooks", e);
        }

        try {
          // Fetch Attendances
          const attSnap = await getDocs(collection(db, 'attendances'));
          const attData: any[] = [];
          attSnap.forEach(doc => attData.push({ id: doc.id, ...doc.data() }));
          setAttendances(attData);
        } catch (e) {
          console.warn("Failed fetching attendances", e);
        }
      } else {
        setLogbooks([]);
        setAttendances([]);
      }

      try {
        // Fetch Announcements
        const annSnap = await getDocs(collection(db, 'announcements'));
        const annData: any[] = [];
        annSnap.forEach(doc => annData.push({ id: doc.id, ...doc.data() }));
        annData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAnnouncements(annData);
      } catch (e) {
        console.warn("Failed fetching announcements", e);
      }

      setStats({
        mahasiswa: mCount,
        kelompok: groupsCount,
        dosen: dCount,
        logbook: lCount,
      });
      
      setLoading(false);
    };

    fetchData();
  }, [authReady, currentUser]);

  const groupsK3 = groups.filter(g => g.prodi === 'S1 Kesehatan dan Keselamatan Kerja');
  const groupsKesling = groups.filter(g => g.prodi === 'S1 Kesehatan Lingkungan');
  const groupsLain = groups.filter(g => g.prodi !== 'S1 Kesehatan dan Keselamatan Kerja' && g.prodi !== 'S1 Kesehatan Lingkungan');

  const getGroupMembers = (groupId: string) => {
    return groupMembers.filter(m => m.group_id === groupId).map(m => users[m.student_id]?.name || 'Unknown');
  };

  const getGroupStats = (groupId: string) => {
    const members = groupMembers.filter(m => m.group_id === groupId);
    const memberIds = members.map(m => m.student_id);
    const gLogs = logbooks.filter(l => memberIds.includes(l.student_id));
    const gAtts = attendances.filter(a => memberIds.includes(a.student_id));
    return { logs: gLogs.length, atts: gAtts.length };
  };

  const GroupCard = ({ group }: { group: any }) => {
    const membersList = getGroupMembers(group.id);
    const gStats = getGroupStats(group.id);
    return (
      <Card className="shadow-sm hover:border-teal-200 transition-colors h-full flex flex-col">
        <CardContent className="p-5 flex-1 flex flex-col space-y-3">
          <div className="font-bold text-slate-800 line-clamp-2 leading-tight" title={group.group_name}>{group.group_name}</div>
          
          <div className="space-y-1.5 flex-1">
            <div className="text-sm text-slate-700 flex items-start gap-2">
              <Briefcase className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" /> 
              <span className="line-clamp-2 leading-snug">{group.tempat_pbl || <span className="text-amber-600/70 italic">Tempat PBL belum ditentukan</span>}</span>
            </div>
          </div>
          
          <div className="pt-3 border-t space-y-2 mt-auto">
            <div className="text-xs text-slate-600 grid grid-cols-[16px_1fr] gap-2 items-start">
              <Users className="w-4 h-4 text-slate-400" />
              <div>
                <span className="font-semibold block mb-0.5">Anggota ({membersList.length}):</span>
                {membersList.length > 0 ? (
                  <span className="line-clamp-2 leading-tight text-slate-500">{membersList.join(', ')}</span>
                ) : <span className="text-slate-400 italic">Belum ada anggota</span>}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-3 p-2 bg-slate-50 rounded-md border border-slate-100">
              <div className="text-center">
                <div className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">Logbook</div>
                <div className="font-bold text-slate-700 text-lg">{currentUser ? gStats.logs : '—'}</div>
              </div>
              <div className="text-center border-l border-slate-200">
                <div className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">Absensi</div>
                <div className="font-bold text-slate-700 text-lg">{currentUser ? gStats.atts : '—'}</div>
              </div>
            </div>
            
            <div className="pt-2 flex flex-col gap-1 mt-2">
               <div className="text-xs text-slate-500 flex justify-between">
                 <span>DPL:</span>
                 <span className="font-medium text-slate-700 truncate ml-2 text-right">{users[group.dsn_pembimbing_id]?.name || '-'}</span>
               </div>
               <div className="text-xs text-slate-500 flex justify-between">
                 <span>PL:</span>
                 <span className="font-medium text-slate-700 truncate ml-2 text-right">{users[group.pmb_lapangan_id]?.name || '-'}</span>
               </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-teal-800 text-white flex items-center justify-center font-bold text-xl shadow-sm">
              P
            </div>
            <span className="font-bold text-xl text-teal-900 tracking-tight">Sistem PBL</span>
          </div>
          <div>
            {currentUser && (
              <Link to="/dashboard" className={buttonVariants({ className: "bg-teal-700 hover:bg-teal-800 text-white shadow-sm transition-all h-9 px-4" })}>
                Kembali ke Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-900 via-teal-800 to-emerald-900 py-24 px-4 relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-[10%] right-[10%] w-[30%] h-[30%] rounded-full bg-amber-400 blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10 flex flex-col items-center">
          <img src="https://uis.ac.id/wp-content/uploads/2026/04/cropped-logouis-270x270.png" alt="Logo Universitas Ibnu Sina" className="w-24 h-24 md:w-32 md:h-32 object-contain drop-shadow-lg mb-2" />
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white drop-shadow-sm leading-tight mt-0">
            Sistem Informasi <span className="text-amber-400">PBL</span>
          </h1>
          <p className="text-lg md:text-xl text-teal-50/90 max-w-2xl mx-auto font-medium">
            Fakultas Ilmu Kesehatan (Fikes), Universitas Ibnu Sina
          </p>
          {!currentUser && (
            <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/login" className={buttonVariants({ size: "lg", className: "w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-teal-950 font-bold px-8 h-12 shadow-md transition-all hover:scale-[1.02]" })}>
                Login Akun <ChevronRight className="ml-2 w-4 h-4"/>
              </Link>
              <Link to="/register" className={buttonVariants({ size: "lg", variant: "outline", className: "w-full sm:w-auto bg-transparent border-teal-200/30 text-teal-50 hover:bg-teal-800/50 hover:text-white px-8 h-12 transition-all hover:border-teal-200/50" })}>
                Daftar Mahasiswa
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">
        
        {/* Infografis Progress */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-600" />
            <h2 className="text-2xl font-bold text-slate-800">Infografis Progress PBL</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Card className="border-t-4 border-t-teal-500 shadow-sm">
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-500 mb-1">Mahasiswa Aktif</div>
                <div className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.mahasiswa}</div>
              </CardContent>
            </Card>
            <Card className="border-t-4 border-t-emerald-500 shadow-sm">
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-500 mb-1">Total Kelompok</div>
                <div className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.kelompok}</div>
              </CardContent>
            </Card>
            <Card className="border-t-4 border-t-amber-500 shadow-sm">
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-500 mb-1">Dosen Terlibat</div>
                <div className="text-4xl font-bold text-slate-800">{loading ? '-' : stats.dosen}</div>
              </CardContent>
            </Card>
            <Card className="border-t-4 border-t-yellow-500 shadow-sm">
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-500 mb-1">Logbook Tercatat</div>
                <div className="text-4xl font-bold text-slate-800">{loading ? '-' : (currentUser ? stats.logbook : '—')}</div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Announcements Section */}
        {announcements.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-teal-600" />
              <h2 className="text-2xl font-bold text-slate-800">Informasi & Pengumuman</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {announcements.map((ann, i) => (
                <Card key={ann.id || i} className="shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={ann.type === 'Pengumuman' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100' : 'bg-blue-100 text-blue-800 hover:bg-blue-100'}>
                        {ann.type}
                      </Badge>
                      <span className="text-xs text-slate-500 font-medium whitespace-nowrap ml-2">
                        {new Date(ann.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                    <CardTitle className="text-lg leading-tight text-slate-800">{ann.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 text-sm text-slate-600 whitespace-pre-wrap">
                    {ann.content}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Jadwal Ujian */}
          <section className="lg:col-span-1 space-y-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-teal-600" />
              <h2 className="text-2xl font-bold text-slate-800">Jadwal Ujian</h2>
            </div>
            
            {loading ? (
              <div className="text-slate-500 py-8 text-center bg-white rounded-lg border border-dashed border-slate-300">Memuat jadwal...</div>
            ) : examSchedules.length > 0 ? (
              <div className="space-y-4">
                {examSchedules.map((exam, i) => {
                  const groupTarget = groups.find(g => g.id === exam.group_id);
                  const isPast = new Date(exam.date) < new Date(new Date().setHours(0,0,0,0));
                  return (
                    <Card key={i} className={`shadow-sm transition-all hover:shadow-md ${isPast ? 'opacity-60 bg-slate-50' : 'border-l-4 border-l-teal-500'}`}>
                      <CardContent className="p-4 flex gap-4">
                        <div className="bg-teal-50 text-teal-700 font-bold rounded-lg p-3 text-center min-w-[70px] h-fit border border-teal-100">
                          <div className="text-xs uppercase">{new Date(exam.date).toLocaleDateString('id-ID', { month: 'short' })}</div>
                          <div className="text-2xl leading-none my-1">{new Date(exam.date).getDate()}</div>
                          <div className="text-xs text-teal-600/80">{new Date(exam.date).getFullYear()}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-800 truncate" title={groupTarget?.group_name || 'Kelompok Umum'}>
                            {groupTarget?.group_name || 'Tidak Diketahui'}
                          </h3>
                          <div className="text-sm text-slate-500 mt-1 space-y-1">
                            <div className="flex items-center gap-1.5 line-clamp-1"><Calendar className="w-3.5 h-3.5 text-teal-500"/> {exam.time}</div>
                            <div className="flex items-center gap-1.5 line-clamp-1"><Briefcase className="w-3.5 h-3.5 text-amber-500"/> Ruang {exam.room || 'Menyusul'}</div>
                            <div className="flex items-center gap-1.5 line-clamp-1"><Users className="w-3.5 h-3.5 text-teal-500"/> Pembimbing: {users[groupTarget?.dsn_pembimbing_id]?.name || 'Menyusul'}</div>
                            <div className="flex items-center gap-1.5 line-clamp-1"><FileText className="w-3.5 h-3.5 text-teal-500"/> Penguji: {users[exam.penguji_id]?.name || 'Menyusul'}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
               <div className="text-slate-500 py-8 text-center bg-white rounded-lg border border-dashed border-slate-300">Belum ada jadwal ujian yang dirilis.</div>
            )}
          </section>

          {/* Daftar Kelompok K3 & Kesling */}
          <section className="lg:col-span-2 space-y-8">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-teal-600" />
              <h2 className="text-2xl font-bold text-slate-800">Daftar Kelompok & Tempat PBL</h2>
            </div>
            
            {loading ? (
              <div className="text-slate-500 py-8 text-center bg-white rounded-lg border border-dashed border-slate-300">Memuat kelompok...</div>
            ) : (
              <div className="space-y-8">
                {/* K3 */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                    <span className="w-2 h-6 bg-teal-500 rounded-sm"></span> Prodi K3
                    <Badge className="ml-2 bg-teal-100 text-teal-800 hover:bg-teal-200 border-none">{groupsK3.length} Kel.</Badge>
                  </h3>
                  {groupsK3.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupsK3.map((group, i) => (
                        <GroupCard key={i} group={group} />
                      ))}
                    </div>
                  ) : <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-dashed border-slate-200">Tidak ada kelompok K3</div>}
                </div>

                {/* Kesling */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                    <span className="w-2 h-6 bg-emerald-500 rounded-sm"></span> Prodi Kesehatan Lingkungan
                    <Badge className="ml-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-none">{groupsKesling.length} Kel.</Badge>
                  </h3>
                  {groupsKesling.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupsKesling.map((group, i) => (
                        <GroupCard key={i} group={group} />
                      ))}
                    </div>
                  ) : <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-dashed border-slate-200">Tidak ada kelompok Kesling</div>}
                </div>
                
                {/* Lainnya */}
                {groupsLain.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <span className="w-2 h-6 bg-slate-400 rounded-sm"></span> Umum / Lintas Prodi
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupsLain.map((group, i) => (
                        <GroupCard key={i} group={group} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm space-y-2">
          <div>&copy; {new Date().getFullYear()} Sistem Informasi Praktek Belajar Lapangan. Hak Cipta Dilindungi.</div>
          <div>Program Studi Keselamatan dan Kesehatan Kerja & Kesehatan Lingkungan</div>
          <div className="text-slate-500 text-xs pt-4">oleh RSEducation Email: ronniegodzilla@gmail.com</div>
        </div>
      </footer>
    </div>
  );
};
