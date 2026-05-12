import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { PendaftaranPBL } from './PendaftaranPBL';
import { Button } from '../ui/button';
import { FileText, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import Markdown from 'react-markdown';
import userGuideMd from '../../docs/USER_GUIDE_MAHASISWA.md?raw';
import { Link } from 'react-router-dom';

export const MahasiswaDashboard = () => {
  const { profile } = useAuth();
  const [groupMember, setGroupMember] = useState<any>(null);
  const [logbookCount, setLogbookCount] = useState(0);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [openGuide, setOpenGuide] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'group_members'), where('student_id', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setGroupMember({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setGroupMember(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'group_members'));

    const qL = query(collection(db, 'logbooks'), where('student_id', '==', profile.uid));
    const unsubL = onSnapshot(qL, (snapshot) => {
      setLogbookCount(snapshot.size);
    });

    const qA = query(collection(db, 'attendances'), where('student_id', '==', profile.uid));
    const unsubA = onSnapshot(qA, (snapshot) => {
      setAttendanceCount(snapshot.size);
    });

    return () => {
      unsubscribe();
      unsubL();
      unsubA();
    }
  }, [profile]);

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
            Baca Panduan Mahasiswa
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto w-full sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Panduan Pengguna - Mahasiswa</DialogTitle>
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
                {userGuideMd}
              </Markdown>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(profile as any).is_grade_published && (
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader>
            <CardTitle className="text-amber-900">Hasil Penilaian Akhir PBL</CardTitle>
            <CardDescription className="text-amber-800">Berikut adalah nilai akhir Praktik Belajar Lapangan Anda.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-8">
            <div className="text-center">
               <div className="text-sm font-semibold text-amber-700 uppercase tracking-widest">Nilai Akhir</div>
               <div className="text-4xl font-extrabold text-amber-950 mt-1">{(profile as any).final_score?.toFixed(2) || '-'}</div>
            </div>
            <div className="text-center border-l border-amber-300 pl-8">
               <div className="text-sm font-semibold text-amber-700 uppercase tracking-widest">Nilai Huruf</div>
               <div className="text-4xl font-extrabold text-amber-950 mt-1">{(profile as any).letter_grade || '-'}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Status Pendaftaran</div>
            <div className="text-2xl font-bold">{groupMember ? groupMember.status : 'Belum Daftar'}</div>
            <div className="text-[0.75rem] mt-1 flex items-center gap-1 text-slate-500">
              KRS & Kelompok
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Logbook</div>
            <div className="text-2xl font-bold">{logbookCount}</div>
            <div className="text-[0.75rem] mt-1 flex items-center gap-1 text-slate-500">
              Catatan Harian
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Kehadiran</div>
            <div className="text-2xl font-bold">{attendanceCount}</div>
            <div className="text-[0.75rem] mt-1 flex items-center gap-1 text-slate-500">
              Total Absensi
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Status PBL</CardTitle>
          <CardDescription>Informasi kelompok dan pembimbing Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <PendaftaranPBL />
        </CardContent>
      </Card>
    </div>
  );
};

