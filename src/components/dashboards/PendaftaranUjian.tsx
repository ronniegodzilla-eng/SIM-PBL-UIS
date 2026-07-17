import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { uploadToGoogleDrive } from '../../lib/uploadFile';
import { ExamRegistrationSettings, isRegistrationOpen, formatDeadline } from '../../lib/examRegistration';

export const PendaftaranUjian = ({ groupMember }: { groupMember: any }) => {
  const { profile } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [drafFile, setDrafFile] = useState<File | null>(null);
  const [persetujuanFile, setPersetujuanFile] = useState<File | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  
  const [settings, setSettings] = useState<{ exam: string[], revisi: string[] }>({ exam: [], revisi: [] });
  const [examFiles, setExamFiles] = useState<{ [key: string]: File | null }>({});
  const [revisiFiles, setRevisiFiles] = useState<{ [key: string]: File | null }>({});
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [regSettings, setRegSettings] = useState<ExamRegistrationSettings | null>(null);
  const [now, setNow] = useState(new Date());

  // Evaluasi ulang status buka/tutup tiap 30 detik agar deadline yang lewat
  // saat halaman terbuka langsung terasa tanpa refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!profile || !groupMember || groupMember.group_id === 'pending') return;

    const unsubGroup = onSnapshot(doc(db, 'pbl_groups', groupMember.group_id), (docSnap) => {
      if (docSnap.exists()) {
        setGroupInfo({ id: docSnap.id, ...docSnap.data() });
      }
    });

    const qReport = query(collection(db, 'pbl_reports'), where('group_id', '==', groupMember.group_id));
    const unsubReport = onSnapshot(qReport, (snapshot) => {
      if (!snapshot.empty) {
        // Selalu gunakan dokumen kanonik report_<group_id> jika ada duplikat,
        // agar berkas yang diunggah terbaca konsisten di semua sisi (termasuk Admin).
        const reportDoc = snapshot.docs.find(d => d.id === `report_${groupMember.group_id}`) || snapshot.docs[0];
        const d = reportDoc.data();
        setReport({ id: reportDoc.id, ...d });
        if (d.report_title) setReportTitle(d.report_title);
      } else {
        setReport(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pbl_reports'));

    const qExam = query(collection(db, 'exam_schedules'), where('group_id', '==', groupMember.group_id));
    const unsubExam = onSnapshot(qExam, (snapshot) => {
      if (!snapshot.empty) {
        setExam({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setExam(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'exam_schedules'));

    // Samakan dengan sisi admin: entri kembar yang hanya beda spasi
    // (data lama) ditampilkan satu saja.
    const dedupeReqs = (arr: any[]) => {
      const out: string[] = [];
      for (const v of arr || []) {
        const str = String(v);
        if (!out.some(x => x.trim() === str.trim())) out.push(str);
      }
      return out;
    };
    const unsubSettings = onSnapshot(doc(db, 'settings', 'requirements'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSettings({ exam: dedupeReqs(data.exam), revisi: dedupeReqs(data.revisi) });
      }
    });

    const unsubReg = onSnapshot(doc(db, 'settings', 'exam_registration'), (snap) => {
      setRegSettings(snap.exists() ? (snap.data() as ExamRegistrationSettings) : null);
    });

    return () => {
      unsubGroup();
      unsubReport();
      unsubExam();
      unsubSettings();
      unsubReg();
    };
  }, [profile, groupMember]);

  const handleUploadFiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persetujuanFile || !groupMember || groupMember.group_id === 'pending' || !report) return;

    if (!isRegistrationOpen(regSettings)) {
      toast.error('Pendaftaran ujian sedang ditutup.');
      return;
    }

    for (const req of settings.exam) {
      if (!examFiles[req]) {
        toast.error(`Mohon unggah dokumen: ${req}`);
        return;
      }
    }

    try {
      setLoading(true);
      const persetujuanUrl = await uploadToGoogleDrive(persetujuanFile, `${groupMember.group_id}_persetujuan`);

      const customUrls: { [key: string]: string } = {};
      for (const req of settings.exam) {
         if (examFiles[req]) {
           const url = await uploadToGoogleDrive(examFiles[req]!, `${groupMember.group_id}_req_exam_${req.replace(/[^a-zA-Z0-9]/g, '')}`);
           customUrls[req] = url;
         }
      }

      await setDoc(doc(db, 'pbl_reports', report.id), {
        approval_url: persetujuanUrl,
        custom_exam_urls: customUrls,
        status: 'Pending'
      }, { merge: true });

      toast.success('Pendaftaran Ujian berhasil diajukan!');
      setPersetujuanFile(null);
      setExamFiles({});
    } catch (error: any) {
      if (error.message && (error.message.includes('Google Apps Script') || error.message.includes('DriveApp'))) {
        toast.error(`Error Google Drive: ${error.message}.`);
      } else {
        console.error(error);
        handleFirestoreError(error, OperationType.UPDATE, 'pbl_reports');
        toast.error('Gagal mengunggah berkas.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPendaftaran = async () => {
    if (!report) return;
    try {
      setLoading(true);
      await setDoc(doc(db, 'pbl_reports', report.id), { status: 'Pending' }, { merge: true });
      toast.success('Pendaftaran Ujian berhasil diajukan!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pbl_reports/${report.id}`);
      toast.error('Gagal mengajukan pendaftaran ujian.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadRevisi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupMember || groupMember.group_id === 'pending') return;

    // Validate if all custom revisi requirements are provided
    for (const req of settings.revisi) {
      if (!revisiFiles[req]) {
        toast.error(`Mohon unggah dokumen revisi: ${req}`);
        return;
      }
    }

    try {
      setLoading(true);

      const customRevisiUrls: { [key: string]: string } = {};
      for (const req of settings.revisi) {
         if (revisiFiles[req]) {
           const url = await uploadToGoogleDrive(revisiFiles[req]!, `${groupMember.group_id}_req_revisi_${req.replace(/[^a-zA-Z0-9]/g, '')}`);
           customRevisiUrls[req] = url;
         }
      }

      const reportId = `report_${groupMember.group_id}`;
      await setDoc(doc(db, 'pbl_reports', reportId), {
        custom_revisi_urls: customRevisiUrls,
        revisi_status: 'Pending',
        revisi_submitted_at: new Date().toISOString()
      }, { merge: true });

      toast.success('Berkas Revisi berhasil diunggah.');
      setRevisiFiles({});
    } catch (error: any) {
      if (error.message && (error.message.includes('Google Apps Script') || error.message.includes('DriveApp') || error.message.includes('Google Drive'))) {
        toast.error(`Error Google Drive: ${error.message}. Pastikan izin Google Apps Script sudah dikonfigurasi dengan benar.`);
      } else {
        console.error(error);
        handleFirestoreError(error, OperationType.UPDATE, 'pbl_reports');
        toast.error('Gagal mengunggah berkas revisi.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!groupMember || groupMember.group_id === 'pending') {
    return <div className="text-center py-8 text-slate-500">Anda belum tergabung dalam kelompok PBL.</div>;
  }

  const isBimbinganFinished = report && (report.status === 'Approved' || report.status === 'Pending' || report.approval_url);
  const isLeader = groupInfo?.leader_id === profile?.uid;
  const registrationOpen = isRegistrationOpen(regSettings, now);

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 p-6 rounded-lg border space-y-4">
        <h3 className="font-semibold text-lg">Pendaftaran Ujian PBL</h3>
        {!isLeader && (
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-md text-sm">
            Mode Lihat Saja. Hanya <strong>Ketua Kelompok</strong> yang dapat mengajukan pendaftaran ujian dan mengunggah berkas.
          </div>
        )}
        {regSettings?.mode && (
          registrationOpen ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-sm">
              <strong>Pendaftaran ujian DIBUKA</strong>
              {regSettings.mode === 'auto' && regSettings.close_at && (
                <> — ditutup pada <strong>{formatDeadline(regSettings.close_at)}</strong></>
              )}
              {regSettings.note && <div className="mt-1 text-emerald-700">{regSettings.note}</div>}
            </div>
          ) : (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm">
              <strong>Pendaftaran ujian DITUTUP.</strong>
              {regSettings.mode === 'auto' && regSettings.open_at && now.getTime() < regSettings.open_at.toDate().getTime() && (
                <> Dibuka pada <strong>{formatDeadline(regSettings.open_at)}</strong>.</>
              )}
              {regSettings.mode === 'auto' && regSettings.close_at && now.getTime() >= regSettings.close_at.toDate().getTime() && (
                <> Deadline berakhir <strong>{formatDeadline(regSettings.close_at)}</strong>.</>
              )}
              {regSettings.note && <div className="mt-1 text-red-700">{regSettings.note}</div>}
            </div>
          )
        )}
        {!isBimbinganFinished ? (
          <div className="opacity-60 pointer-events-none">
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md mb-4 text-sm font-medium">
              Form pendaftaran dibekukan. Anda harus menyelesaikan Proses Bimbingan Laporan hingga disetujui Dosen Pembimbing terlebih dahulu.
            </div>
            <form className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Lembar Persetujuan (PDF) — Bawaan Sistem *</Label>
                <Input type="file" accept=".pdf" disabled />
              </div>
              {settings.exam.map(req => (
                <div key={req} className="space-y-2">
                  <Label>{req} *</Label>
                  <Input type="file" disabled />
                </div>
              ))}
              <Button type="button" disabled>
                Ajukan Pendaftaran Ujian
              </Button>
            </form>
          </div>
        ) : report.status === 'Pending' ? (
          <div>
            <p className="text-emerald-700 font-medium">Pendaftaran berhasil diajukan.</p>
            <p className="text-sm text-slate-500">Sedang menunggu persetujuan dari Admin Prodi / Akademik.</p>
          </div>
        ) : (report.status === 'Approved' && !report.approval_url) || (report.status === 'Revisi' && report.approval_url) ? (
          <form onSubmit={handleUploadFiles} className="space-y-4 pt-2">
            {report.status === 'Revisi' && report.approval_url ? (
              <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md mb-4 text-sm font-medium">
                Pendaftaran Ujian Anda dikembalikan oleh Admin (Tidak Memenuhi Syarat). Silakan unggah ulang.
              </div>
            ) : (
              <p className="text-sm text-slate-600 mb-4">
                Draf laporan Anda telah disetujui. Silakan unggah Lembar Persetujuan yang telah ditandatangani beserta dokumen kelengkapan ujian lainnya.
              </p>
            )}
            <div className="space-y-2">
              <Label>Lembar Persetujuan (PDF) — Bawaan Sistem *</Label>
              <Input type="file" accept=".pdf" onChange={(e) => setPersetujuanFile(e.target.files?.[0] || null)} required disabled={!isLeader || !registrationOpen} />
            </div>
            {settings.exam.map(req => (
              <div key={req} className="space-y-2">
                <Label>{req} *</Label>
                <Input type="file" onChange={(e) => setExamFiles(prev => ({ ...prev, [req]: e.target.files?.[0] || null }))} required disabled={!isLeader || !registrationOpen} />
              </div>
            ))}
            <Button type="submit" disabled={loading || !persetujuanFile || !isLeader || !registrationOpen}>
              {loading ? 'Mengajukan...' : 'Ajukan Pendaftaran Ujian'}
            </Button>
          </form>
        ) : (
           <div className="flex items-center gap-2">
              <Badge variant="default">Pendaftaran Ujian Disetujui</Badge>
              <a href={report.approval_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">Lihat Lembar Persetujuan</a>
           </div>
        )}
      </div>

      {exam && (
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-100 space-y-4">
          <h3 className="font-semibold text-lg text-blue-900">Jadwal Ujian PBL</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="block text-blue-600/70 mb-1">Tanggal</span>
              <span className="font-medium text-blue-900">{new Date(exam.date).toLocaleDateString('id-ID')}</span>
            </div>
            <div>
              <span className="block text-blue-600/70 mb-1">Waktu</span>
              <span className="font-medium text-blue-900">{exam.time}</span>
            </div>
            <div>
              <span className="block text-blue-600/70 mb-1">Ruangan</span>
              <span className="font-medium text-blue-900">{exam.room}</span>
            </div>
            <div>
              <span className="block text-blue-600/70 mb-1">Status</span>
              <Badge variant="default">{exam.status}</Badge>
            </div>
          </div>
        </div>
      )}

      {report && report.status === 'Approved' && settings.revisi.length > 0 && (
        <div className="bg-emerald-50 p-6 rounded-lg border border-emerald-100 space-y-4">
          <h3 className="font-semibold text-lg text-emerald-900">Pengumpulan Revisi Laporan Pasca-Ujian</h3>
          <p className="text-sm text-emerald-800">
            Unggah dokumen yang diminta setelah Anda menyelesaikan revisi ujian.
          </p>
          
            {report.revisi_status === 'Approved' ? (
             <div className="mt-4 space-y-3">
               <div className="p-4 border border-emerald-200 bg-emerald-100 rounded text-emerald-800 text-sm font-medium">
                 Revisi Pasca-Ujian telah Diterima.
               </div>
               {report.custom_revisi_urls && (
                 <div className="flex flex-col gap-2 text-sm mt-3 border-t border-emerald-100 pt-3">
                   <p className="font-medium text-emerald-900 mb-1">Berkas Terunggah:</p>
                   {Object.entries(report.custom_revisi_urls).map(([key, url]) => (
                     <a key={key} href={url as string} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900 hover:underline">Lihat {key}</a>
                   ))}
                 </div>
               )}
             </div>
          ) : report.revisi_status === 'Pending' ? (
             <div className="mt-4 space-y-3">
               <div className="p-4 border border-emerald-200 bg-white rounded text-emerald-800 text-sm">
                 Revisi telah diajukan dan sedang menunggu validasi.
               </div>
               {report.custom_revisi_urls && (
                 <div className="flex flex-col gap-2 text-sm mt-3 border-t border-emerald-100 pt-3">
                   <p className="font-medium text-emerald-900 mb-1">Berkas Terunggah:</p>
                   {Object.entries(report.custom_revisi_urls).map(([key, url]) => (
                     <a key={key} href={url as string} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900 hover:underline">Lihat {key}</a>
                   ))}
                 </div>
               )}
             </div>
          ) : (
             <form onSubmit={handleUploadRevisi} className="space-y-4 mt-4">
               {settings.revisi.map(req => (
                 <div key={req} className="space-y-2">
                   <Label>{req}</Label>
                   <Input type="file" onChange={(e) => setRevisiFiles(prev => ({ ...prev, [req]: e.target.files?.[0] || null }))} required disabled={!isLeader} />
                 </div>
               ))}
               <Button type="submit" disabled={loading || !isLeader} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                 {loading ? 'Mengunggah...' : 'Kirim Berkas Revisi'}
               </Button>
             </form>
          )}
        </div>
      )}
    </div>
  );
};
