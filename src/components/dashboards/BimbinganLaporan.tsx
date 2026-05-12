import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, storage } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export const BimbinganLaporan = ({ groups, role }: { groups: any[], role: string }) => {
  const { profile } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (groups.length === 0) return;

    const groupIds = groups.map(g => g.id);
    
    // Listen for reports
    const qReports = query(collection(db, 'pbl_reports'));
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      const reps: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (groupIds.includes(data.group_id)) {
          reps.push({ id: doc.id, ...data });
        }
      });
      setReports(reps);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pbl_reports'));

    return () => unsubReports();
  }, [groups]);

  const handleApproveReport = async (report: any) => {
    try {
      const historyItem = {
        date: new Date().toISOString(),
        type: 'approve',
        actor: profile?.name || 'Dosen Pembimbing',
        notes: 'Laporan telah disetujui.'
      };

      await updateDoc(doc(db, 'pbl_reports', report.id), { 
        status: 'Approved',
        history: [...(report?.history || []), historyItem]
      });
      toast.success('Laporan disetujui');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pbl_reports/${report.id}`);
      toast.error('Gagal menyetujui laporan');
    }
  };

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
    const filename = `${prefix}_${Date.now()}_${file.name}`;

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

  const handleUploadFeedback = async (e: React.FormEvent, report: any) => {
    e.preventDefault();
    if ((!file && !feedbackText.trim()) || !profile) {
      toast.error('Silakan isi catatan narasi ATAU unggah file revisi.');
      return;
    }

    try {
      setLoading(true);
      let downloadURL: string | null = null;
      
      if (file) {
        downloadURL = await uploadToGoogleDrive(file, `feedback_${profile.uid}`);
      }

      const historyItem = {
        date: new Date().toISOString(),
        type: 'feedback',
        actor: profile?.name || 'Dosen Pembimbing',
        notes: feedbackText.trim() || null,
        file_url: downloadURL || null
      };

      await updateDoc(doc(db, 'pbl_reports', report.id), {
        ...(downloadURL && { feedback_url: downloadURL }),
        ...(feedbackText.trim() && { feedback_text: feedbackText.trim() }),
        status: 'Revisi',
        history: [...(report?.history || []), historyItem]
      });

      toast.success('Feedback berhasil dikirim.');
      setFile(null);
      setFeedbackText('');
    } catch (error: any) {
      if (error.message && (error.message.includes('Google Apps Script') || error.message.includes('DriveApp'))) {
        toast.error(`Error Google Drive: ${error.message}.`);
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `pbl_reports/${report.id}`);
        toast.error('Gagal mengirim feedback.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {reports.length === 0 ? (
        <div className="text-center py-8 text-slate-500 border rounded-lg">Belum ada draf laporan yang diunggah oleh kelompok.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kelompok</TableHead>
              <TableHead>Draf Laporan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Feedback</TableHead>
              {role === 'Dosen' && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => {
              const group = groups.find(g => g.id === report.group_id);
              return (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{group?.group_name || report.group_id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start max-w-xs">
                      {report.report_title && (
                        <p className="text-xs font-semibold text-slate-800 break-words mb-1">
                          {report.report_title}
                        </p>
                      )}
                      <a href={report.report_url} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium text-blue-600">
                        📄 Draf Laporan
                      </a>
                      {report.approval_url && (
                        <a href={report.approval_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">
                          Lembar Persetujuan
                        </a>
                      )}
                      {report.custom_exam_urls && Object.entries(report.custom_exam_urls).map(([key, url]) => (
                        <a key={key} href={url as string} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">
                          {key}
                        </a>
                      ))}
                      {report.custom_revisi_urls && Object.entries(report.custom_revisi_urls).map(([key, url]) => (
                        <a key={key} href={url as string} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold">
                          (Revisi) {key}
                        </a>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={report.status === 'Approved' ? 'default' : report.status === 'Revisi' ? 'destructive' : 'secondary'}>
                      {report.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {report.feedback_text ? (
                      <div className="text-sm border border-amber-200 bg-amber-50 rounded p-2 mb-1">
                        <p className="line-clamp-2 text-amber-900" title={report.feedback_text}>{report.feedback_text}</p>
                      </div>
                    ) : null}
                    {report.feedback_url ? (
                      <a href={report.feedback_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm font-medium">
                        File Revisi
                      </a>
                    ) : (
                      !report.feedback_text && <span className="text-slate-400 italic text-sm">Belum ada</span>
                    )}
                  </TableCell>
                  {role === 'Dosen' && (
                    <TableCell className="text-right space-x-2">
                      <Dialog>
                        <DialogTrigger render={<Button size="sm" variant="outline">Bimbingan / Revisi</Button>} />
                        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Riwayat Bimbingan & Beri Revisi</DialogTitle>
                            <DialogDescription>Lihat riwayat revisi dan diskusikan laporan bersama kelompok.</DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 border rounded-lg p-4 bg-slate-50 mt-4 mb-4">
                            <h4 className="font-semibold text-sm border-b pb-2">Riwayat Bimbingan</h4>
                            {report.history && report.history.length > 0 ? (
                              <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                                {report.history.map((item: any, idx: number) => (
                                  <div key={idx} className={`p-3 rounded-lg text-sm border ${item.type === 'submit' ? 'bg-white border-slate-200' : item.type === 'approve' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
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

                          <form onSubmit={(e) => handleUploadFeedback(e, report)} className="space-y-4">
                            <div className="space-y-2">
                              <Label>Catatan (Narasi)</Label>
                              <Textarea 
                                placeholder="Ketikan catatan perbaikan di sini..."
                                rows={4}
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>File Feedback (Opsional)</Label>
                              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                            </div>
                            <DialogFooter>
                              <Button type="submit" disabled={loading || (!file && !feedbackText.trim())}>
                                {loading ? 'Mengirim...' : 'Kirim Revisi'}
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                      <Button size="sm" onClick={() => handleApproveReport(report)} disabled={report.status === 'Approved'}>
                        Setujui
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
