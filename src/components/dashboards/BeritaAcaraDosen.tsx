import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, getDocs, where, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download } from 'lucide-react';

export const BeritaAcaraDosen = ({ groups }: { groups: any[] }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<string>('Pembukaan');
  const [students, setStudents] = useState<any[]>([]);
  const [beritaData, setBeritaData] = useState<any[]>([])

  // Fetch all students in all groups beforehand to aid in PDF export
  const [allStudents, setAllStudents] = useState<any[]>([]);

  useEffect(() => {
    const fetchStudents = async () => {
      const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'Mahasiswa')));
      setAllStudents(usersSnap.docs.map(d => ({id: d.id, ...d.data()})));
    };
    fetchStudents();
  }, []);
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [dokumentasiUrls, setDokumentasiUrls] = useState<string[]>([]);
  const [dokumentasiFiles, setDokumentasiFiles] = useState<File[]>([]);
  const [attendances, setAttendances] = useState<Record<string, boolean>>({});
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const qBerita = query(collection(db, 'berita_acara'), where('dosen_id', '==', profile.uid));
    const unsub = onSnapshot(qBerita, snap => {
      const b: any[] = [];
      snap.forEach(doc => b.push({ id: doc.id, ...doc.data() }));
      setBeritaData(b);
    }, error => handleFirestoreError(error, OperationType.LIST, 'berita_acara'));
    
    return () => unsub();
  }, [profile]);

  const handleOpenDialog = async (group: any, type: string) => {
    try {
      setLoading(true);
      setSelectedGroup(group);
      setSelectedType(type);
      
      const existing = beritaData.find(b => b.group_id === group.id && b.type === type);
      if (existing) {
        setDate(existing.date);
        setTime(existing.time);
        setLocation(existing.location);
        setNotes(existing.notes);
        setDokumentasiUrls(existing.dokumentasi_urls || (existing.dokumentasi_url ? [existing.dokumentasi_url] : []));
        setDokumentasiFiles([]);
        setAttendances(existing.attendances || {});
      } else {
        setDate(new Date().toISOString().split('T')[0]);
        setTime('09:00');
        setLocation('');
        setNotes('');
        setDokumentasiUrls([]);
        setDokumentasiFiles([]);
        setAttendances({});
      }

      // Fetch students for attendance
      const groupMembersSnap = await getDocs(query(collection(db, 'group_members'), where('group_id', '==', group.id), where('status', '==', 'Approved')));
      const studentIds = groupMembersSnap.docs.map(d => d.data().student_id);
      
      if (studentIds.length > 0) {
         const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'Mahasiswa')));
         const foundStudents = usersSnap.docs.filter(d => studentIds.includes(d.id)).map(d => ({id: d.id, ...d.data()}));
         setStudents(foundStudents);
         
         if (!existing) {
           const initialAtt: Record<string, boolean> = {};
           foundStudents.forEach(s => initialAtt[s.id] = true); // Default Hadir
           setAttendances(initialAtt);
         }
      } else {
         setStudents([]);
         setAttendances({});
      }
      
      setIsDialogOpen(true);
    } catch (e) {
      toast.error('Gagal memuat data grup');
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let encoded = reader.result?.toString() || '';
        // remove the data:MIME_TYPE;base64, prefix
        const b64 = encoded.split(',')[1];
        resolve(b64);
      };
      reader.onerror = error => reject(error);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedGroup) return;
    try {
      setLoading(true);
      const docId = `${selectedGroup.id}_${selectedType}_${profile.uid}`;
      
      let uploadedUrls: string[] = [...dokumentasiUrls];
      if (dokumentasiFiles.length > 0) {
        for (const file of dokumentasiFiles) {
          const url = await uploadToGoogleDrive(file, `berita_acara_${selectedGroup.id}_${selectedType.replace(/\s+/g, '_')}`);
          uploadedUrls.push(url);
        }
      }

      const payload: any = {
        group_id: selectedGroup.id,
        dosen_id: profile.uid,
        type: selectedType,
        date,
        time,
        location,
        notes,
        attendances,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      if (uploadedUrls.length > 0) {
        payload.dokumentasi_urls = uploadedUrls;
      }

      await setDoc(doc(db, 'berita_acara', docId), payload, { merge: true });
      toast.success('Berita Acara berhasil disimpan');
      setIsDialogOpen(false);
    } catch (e: any) {
      if (e.message && (e.message.includes('Google Apps Script') || e.message.includes('Drive') || e.message.includes('Google Drive'))) {
        toast.error(`Error Google Drive: ${e.message}. Pastikan URL konfigurasi benar.`);
      } else {
        handleFirestoreError(e, OperationType.UPDATE, 'berita_acara');
        toast.error('Gagal menyimpan berita acara');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async (group: any, type: string) => {
    const existing = beritaData.find(b => b.group_id === group.id && b.type === type);
    if (!existing) return;

    try {
      const doc = new jsPDF();
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`BERITA ACARA DAN SUPERVISI ${type.toUpperCase()} PBL`, 105, 20, { align: "center" });
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      
      const startY = 35;
      
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const dateObj = new Date(existing.date);
      const dayName = days[dateObj.getDay()];
      const formattedDate = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

      const studyProgramRaw = group.prodi && group.prodi !== 'Semua' ? group.prodi : 'Ilmu Kesehatan Masyarakat / Keselamatan dan Kesehatan Kerja';
      
      const splitHeader = doc.splitTextToSize(`Telah dilaksanakan kegiatan ${type} Pengalaman Belajar Lapangan (PBL) Program Studi ${studyProgramRaw}`, 180);
      doc.text(splitHeader, 14, startY);
      
      const contentStartY = startY + (splitHeader.length * 5) + 5;
      
      doc.text(`Hari/Tanggal : ${dayName} / ${formattedDate}`, 14, contentStartY);
      doc.text(`Waktu        : ${existing.time}`, 14, contentStartY + 6);
      doc.text(`Tempat       : ${existing.location}`, 14, contentStartY + 12);
      doc.text(`Kelompok     : ${group.group_name}`, 14, contentStartY + 18);
      
      doc.text(`Catatan /Ringkasan:`, 14, contentStartY + 28);
      const splitNotes = doc.splitTextToSize(existing.notes, 180);
      doc.text(splitNotes, 14, contentStartY + 34);
      
      let nextY = contentStartY + 34 + (splitNotes.length * 5) + 10;
      
      const dokumentasiLinks = existing.dokumentasi_urls || (existing.dokumentasi_url ? [existing.dokumentasi_url] : []);
      if (dokumentasiLinks.length > 0) {
        doc.text(`Link Dokumentasi:`, 14, nextY);
        nextY += 6;
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 255);
        for (const link of dokumentasiLinks) {
           const splitLink = doc.splitTextToSize(link, 180);
           doc.text(splitLink, 14, nextY);
           nextY += splitLink.length * 4 + 2;
        }
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        nextY += 4;
      }

      doc.text(`Daftar Hadir Mahasiswa:`, 14, nextY);
      
      const groupMembersSnap = await getDocs(query(collection(db, 'group_members'), where('group_id', '==', group.id), where('status', '==', 'Approved')));
      const studentIds = groupMembersSnap.docs.map(d => d.data().student_id);
      const groupStudents = allStudents.filter(s => studentIds.includes(s.id));
      
      const tableData = groupStudents.map((s, index) => [
        index + 1,
        s.student_id || '-',
        s.name,
        existing.attendances?.[s.id] ? 'Hadir' : 'Tidak Hadir'
      ]);
      
      autoTable(doc, {
        startY: nextY + 5,
        head: [['No', 'NIM', 'Nama Mahasiswa', 'Keterangan']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [41, 128, 185] }
      });
      
      const finalY = (doc as any).lastAutoTable.finalY + 20;
      doc.text(`Mengetahui,`, 140, finalY);
      doc.text(`Dosen / Pembimbing`, 140, finalY + 6);
      doc.text(`(${profile?.name})`, 140, finalY + 25);
      
      doc.save(`Berita_Acara_${type}_${group.group_name}.pdf`);
      toast.success('Berita Acara berhasil diunduh');
    } catch (e) {
      toast.error('Gagal mengunduh PDF');
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
         <div className="text-center text-slate-500 text-sm">Tidak ada kelompok</div>
      ) : (
         <Table>
            <TableHeader>
               <TableRow>
                  <TableHead>Nama Kelompok</TableHead>
                  <TableHead>Pembukaan</TableHead>
                  <TableHead>Penutupan</TableHead>
                  <TableHead>Ujian</TableHead>
                  <TableHead>Pengabdian Masyarakat</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
               {groups.map(g => {
                 const hasPembukaan = beritaData.some(b => b.group_id === g.id && b.type === 'Pembukaan');
                 const hasPenutupan = beritaData.some(b => b.group_id === g.id && b.type === 'Penutupan');
                 const hasUjian = beritaData.some(b => b.group_id === g.id && b.type === 'Ujian');
                 const hasPengabdian = beritaData.some(b => b.group_id === g.id && b.type === 'Pengabdian pada Masyarakat');
                 return (
                    <TableRow key={g.id}>
                       <TableCell className="font-semibold">{g.group_name}</TableCell>
                       <TableCell>
                          <div className="flex gap-2">
                             <Button variant={hasPembukaan ? "default" : "outline"} size="sm" onClick={() => handleOpenDialog(g, 'Pembukaan')}>
                                {hasPembukaan ? 'Ubah Berita Acara' : 'Isi Berita Acara'}
                             </Button>
                             {hasPembukaan && (
                                <Button variant="outline" size="icon" onClick={() => handleExportPdf(g, 'Pembukaan')} title="Download PDF">
                                   <Download className="h-4 w-4" />
                                </Button>
                             )}
                          </div>
                       </TableCell>
                       <TableCell>
                          <div className="flex gap-2">
                             <Button variant={hasPenutupan ? "default" : "outline"} size="sm" onClick={() => handleOpenDialog(g, 'Penutupan')}>
                                {hasPenutupan ? 'Ubah Berita Acara' : 'Isi Berita Acara'}
                             </Button>
                             {hasPenutupan && (
                                <Button variant="outline" size="icon" onClick={() => handleExportPdf(g, 'Penutupan')} title="Download PDF">
                                   <Download className="h-4 w-4" />
                                </Button>
                             )}
                          </div>
                       </TableCell>
                       <TableCell>
                          <div className="flex gap-2">
                             <Button variant={hasUjian ? "default" : "outline"} size="sm" onClick={() => handleOpenDialog(g, 'Ujian')}>
                                {hasUjian ? 'Ubah Berita Acara' : 'Isi Berita Acara'}
                             </Button>
                             {hasUjian && (
                                <Button variant="outline" size="icon" onClick={() => handleExportPdf(g, 'Ujian')} title="Download PDF">
                                   <Download className="h-4 w-4" />
                                </Button>
                             )}
                          </div>
                       </TableCell>
                       <TableCell>
                          <div className="flex gap-2">
                             <Button variant={hasPengabdian ? "default" : "outline"} size="sm" onClick={() => handleOpenDialog(g, 'Pengabdian pada Masyarakat')}>
                                {hasPengabdian ? 'Ubah Berita Acara' : 'Isi Berita Acara'}
                             </Button>
                             {hasPengabdian && (
                                <Button variant="outline" size="icon" onClick={() => handleExportPdf(g, 'Pengabdian pada Masyarakat')} title="Download PDF">
                                   <Download className="h-4 w-4" />
                                </Button>
                             )}
                          </div>
                       </TableCell>
                    </TableRow>
                 )
              })}
            </TableBody>
         </Table>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Berita Acara {selectedType}</DialogTitle>
            <DialogDescription>Kelompok: {selectedGroup?.group_name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tanggal Kegiatan</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Waktu Kegiatan</Label>
                <Input type="time" value={time} onChange={e => setTime(e.target.value)} required />
              </div>
            </div>
            
            <div className="space-y-2">
               <Label>Lokasi / Tempat</Label>
               <Input value={location} onChange={e => setLocation(e.target.value)} required placeholder="Contoh: Ruang Rapat RS / Online Zoom" />
            </div>

            <div className="space-y-2">
               <Label>Catatan / Ringkasan Evaluasi Singkat</Label>
               <Textarea value={notes} onChange={e => setNotes(e.target.value)} required rows={4} placeholder="Tuliskan catatan penting selama kegiatan..." />
            </div>

            {(selectedType === 'Pembukaan' || selectedType === 'Penutupan' || selectedType === 'Pengabdian pada Masyarakat') && (
              <div className="space-y-2">
                <Label>Dokumentasi Kegiatan (Foto) <span className="text-red-500">*wajib</span></Label>
                <div className="text-xs text-muted-foreground mb-1">Unggah foto dokumentasi kegiatan (Bisa pilih lebih dari satu file).</div>
                <Input 
                  type="file" 
                  accept="image/*"
                  multiple
                  onChange={e => {
                    if (e.target.files) {
                      setDokumentasiFiles(Array.from(e.target.files));
                    }
                  }} 
                  required={dokumentasiUrls.length === 0 && dokumentasiFiles.length === 0} 
                />
                
                {dokumentasiUrls.length > 0 && (
                  <div className="mt-2 text-sm text-slate-600">
                    <p className="font-medium mb-1">Foto tersimpan:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {dokumentasiUrls.map((url, i) => (
                        <li key={i}><a href={url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Lihat Foto {i + 1}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
                {dokumentasiFiles.length > 0 && (
                  <div className="mt-2 text-sm text-slate-600">
                    <p className="font-medium mb-1">File akan diunggah:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {dokumentasiFiles.map((f, i) => (
                        <li key={i}>{f.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
               <Label>Absensi Kehadiran Mahasiswa</Label>
               {students.length === 0 ? (
                 <div className="text-sm text-slate-500 border p-4 rounded-md">Belum ada mahasiswa di kelompok ini</div>
               ) : (
                 <div className="border rounded-md divide-y">
                   {students.map(s => (
                     <div key={s.id} className="flex items-center justify-between p-3">
                       <span className="font-medium text-sm">{s.name} ({s.student_id || '-'})</span>
                       <Select 
                          value={attendances[s.id] ? "Hadir" : "Tidak Hadir"} 
                          onValueChange={(val) => setAttendances(prev => ({...prev, [s.id]: val === 'Hadir'}))}
                       >
                         <SelectTrigger className="w-[140px]">
                           <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="Hadir">Hadir</SelectItem>
                           <SelectItem value="Tidak Hadir">Tidak Hadir</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                   ))}
                 </div>
               )}
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Menyimpan...' : 'Simpan Berita Acara'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
