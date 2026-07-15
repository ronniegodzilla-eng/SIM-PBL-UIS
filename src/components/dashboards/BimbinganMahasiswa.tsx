import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';

export const BimbinganMahasiswa = ({ groupMember }: { groupMember: any }) => {
  const { profile } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [drafFile, setDrafFile] = useState<File | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  const [groupInfo, setGroupInfo] = useState<any>(null);

  useEffect(() => {
    if (!profile || !groupMember || groupMember.group_id === 'pending') return;

    const qGroup = query(collection(db, 'pbl_groups'));
    const unsubGroup = onSnapshot(doc(db, 'pbl_groups', groupMember.group_id), (docSnap) => {
      if (docSnap.exists()) {
        setGroupInfo({ id: docSnap.id, ...docSnap.data() });
      }
    });

    const qReport = query(collection(db, 'pbl_reports'), where('group_id', '==', groupMember.group_id));
    const unsubReport = onSnapshot(qReport, (snapshot) => {
      if (!snapshot.empty) {
        // Selalu gunakan dokumen kanonik report_<group_id> jika ada duplikat,
        // agar riwayat dan berkas terbaca konsisten di semua sisi.
        const reportDoc = snapshot.docs.find(d => d.id === `report_${groupMember.group_id}`) || snapshot.docs[0];
        const d = reportDoc.data();
        setReport({ id: reportDoc.id, ...d });
        if (d.report_title) setReportTitle(d.report_title);
      } else {
        setReport(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pbl_reports'));

    return () => {
      unsubReport();
      unsubGroup();
    };
  }, [profile, groupMember]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const uploadToGoogleDrive = async (file: File, prefix: string) => {
    const scriptUrl = (import.meta as any).env?.VITE_APPS_SCRIPT_URL;
    if (!scriptUrl) {
      throw new Error('URL Google Apps Script belum dikonfigurasi di Environment Variables.');
    }

    const base64 = await fileToBase64(file);
    const filename = `${groupMember.group_id}_${prefix}_${Date.now()}_${file.name}`;

    const response = await fetch(scriptUrl, {
      method: 'POST',
      body: JSON.stringify({
        filename: filename,
        mimeType: file.type,
        base64: base64
      }),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      }
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Gagal mengunggah ke Google Drive');
    }
    return data.url;
  };

  const handleUploadDraf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drafFile || !groupMember || groupMember.group_id === 'pending') return;

    try {
      setLoading(true);
      const drafUrl = await uploadToGoogleDrive(drafFile, 'draf_bimbingan');
      const reportId = `report_${groupMember.group_id}`;
      
      const historyItem = {
        date: new Date().toISOString(),
        type: 'submit',
        actor: profile?.name || 'Mahasiswa',
        notes: reportTitle,
        file_url: drafUrl
      };

      await setDoc(doc(db, 'pbl_reports', reportId), {
        group_id: groupMember.group_id,
        report_title: reportTitle,
        report_url: drafUrl,
        status: 'Draft',
        history: [...(report?.history || []), historyItem],
        createdAt: report?.createdAt || new Date().toISOString()
      }, { merge: true });

      toast.success('Draf Laporan berhasil diunggah untuk bimbingan.');
      setDrafFile(null);
    } catch (error: any) {
      if (error.message && (error.message.includes('Google Apps Script') || error.message.includes('DriveApp'))) {
        toast.error(`Error Google Drive: ${error.message}.`);
      } else {
        console.error(error);
        handleFirestoreError(error, OperationType.CREATE, 'pbl_reports');
        toast.error('Gagal mengunggah draf.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!groupMember || groupMember.group_id === 'pending') {
    return <div className="text-center py-8 text-slate-500">Anda belum tergabung dalam kelompok PBL.</div>;
  }

  const isLeader = groupInfo?.leader_id === profile?.uid;

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg border">
      <div>
        <h3 className="font-semibold text-lg">Proses Bimbingan Laporan</h3>
        <p className="text-sm text-slate-500">
          Unggah draf berjalan Anda di sini untuk ditinjau oleh Dosen Pembimbing. Perbaiki laporan berdasarkan revisi yang diberikan hingga disetujui.
        </p>
        {!isLeader && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-md text-sm">
            Mode Lihat Saja. Hanya <strong>Ketua Kelompok</strong> yang dapat mengunggah draf dan revisi laporan.
          </div>
        )}
      </div>

      {report ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 border-b pb-4">
            <span className="text-sm font-medium">Status Pengajuan Tanda Tangan:</span>
            <Badge variant={report.status === 'Approved' || report.status === 'Pending' ? 'default' : report.status === 'Revisi' ? 'destructive' : 'secondary'}>
              {report.status === 'Draft' ? 'Menunggu Dosen Pembimbing' : report.status}
            </Badge>
          </div>

          <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
            <h4 className="font-semibold text-sm border-b pb-2">Riwayat Bimbingan</h4>
            {report.history && report.history.length > 0 ? (
              <div className="space-y-4">
                {report.history.map((item: any, idx: number) => (
                  <div key={idx} className={`p-3 rounded-lg text-sm border ${item.type === 'feedback' ? 'bg-amber-50 border-amber-200' : item.type === 'approve' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold">{item.actor} <span className="text-slate-500 font-normal">({item.type === 'submit' ? 'Mengunggah Draf' : item.type === 'feedback' ? 'Memberikan Revisi' : 'Menyetujui Laporan'})</span></span>
                      <span className="text-xs text-slate-500">{new Date(item.date).toLocaleString('id-ID')}</span>
                    </div>
                    {item.notes && <p className="text-slate-700 whitespace-pre-wrap mt-1">{item.notes}</p>}
                    {item.file_url && (
                      <a href={item.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline mt-2 inline-block font-medium">
                        ⬇️ Lihat Lampiran File
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Belum ada riwayat bimbingan dicatat.</p>
            )}
          </div>

          {(report.status === 'Revisi' && !report.approval_url) || report.status === 'Draft' ? (
            <form onSubmit={handleUploadDraf} className="space-y-4 pt-6 border-t mt-6">
              <h4 className="font-medium">Unggah Revisi / Pembaruan Draf</h4>
              <div className="space-y-2">
                <Label>Judul Laporan</Label>
                <Input type="text" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} required disabled={!isLeader} />
              </div>
              <div className="space-y-2">
                <Label>File Draf Baru (PDF)</Label>
                <Input type="file" accept=".pdf" onChange={(e) => setDrafFile(e.target.files?.[0] || null)} required disabled={!isLeader} />
              </div>
              <Button type="submit" disabled={loading || !drafFile || !reportTitle.trim() || !isLeader}>
                {loading ? 'Mengunggah...' : 'Kirim Draf Revisi'}
              </Button>
            </form>
          ) : null}

          {(report.status === 'Approved' || report.status === 'Pending' || (report.status === 'Revisi' && report.approval_url)) && (
            <div className="pt-4 border-t mt-4 text-emerald-700 bg-emerald-50 p-4 rounded border-emerald-200">
              <p className="font-semibold">Bimbingan Selesai / Laporan Disetujui!</p>
              <p className="text-sm mt-1">Proses Pendaftaran Ujian sedang berlangsung atau sudah selesai.</p>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleUploadDraf} className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg mb-4 text-sm border">
            Belum ada draf yang diunggah. Mulai proses bimbingan dengan mengunggah draf pertama kelompok Anda.
          </div>
          <div className="space-y-2">
            <Label>Judul Laporan PBL</Label>
            <Input type="text" placeholder="Masukkan judul laporan..." value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} required disabled={!isLeader} />
          </div>
          <div className="space-y-2">
            <Label>Draf Pertama (PDF)</Label>
            <Input type="file" accept=".pdf" onChange={(e) => setDrafFile(e.target.files?.[0] || null)} required disabled={!isLeader} />
          </div>
          <Button type="submit" disabled={loading || !drafFile || !reportTitle.trim() || !isLeader}>
            {loading ? 'Mengunggah...' : 'Mulai Bimbingan'}
          </Button>
        </form>
      )}
    </div>
  );
};
