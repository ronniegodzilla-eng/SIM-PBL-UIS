import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, getDocs, where, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { uploadToGoogleDrive } from '../../lib/uploadFile';
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
  const [activeTab, setActiveTab] = useState<'utama' | 'insidental'>('utama');
  const [customTitle, setCustomTitle] = useState('');
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);

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

  const handleOpenDialog = async (group: any, type: string, existingDocId?: string) => {
    try {
      setLoading(true);
      setSelectedGroup(group);
      setSelectedType(type);
      setCurrentDocId(existingDocId || null);
      
      let existing = null;
      if (existingDocId) {
        existing = beritaData.find(b => b.id === existingDocId);
      } else if (type !== 'Insidental') {
        existing = beritaData.find(b => b.group_id === group.id && b.type === type);
      }
      
      if (existing) {
        setDate(existing.date);
        setTime(existing.time);
        setLocation(existing.location);
        setNotes(existing.notes);
        setCustomTitle(existing.title || '');
        setDokumentasiUrls(existing.dokumentasi_urls || (existing.dokumentasi_url ? [existing.dokumentasi_url] : []));
        setDokumentasiFiles([]);
        setAttendances(existing.attendances || {});
      } else {
        setDate(new Date().toISOString().split('T')[0]);
        setTime('09:00');
        setLocation('');
        setNotes('');
        setCustomTitle('');
        setDokumentasiUrls([]);
        setDokumentasiFiles([]);
        setAttendances({});
      }

      // Fetch students for attendance
      if (group && group.id) {
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

  const handleOpenNewInsidental = () => {
    if (groups.length === 0) {
      toast.error('Anda tidak memiliki kelompok bimbingan PBL untuk membuat kegiatan insidental.');
      return;
    }
    setSelectedGroup(null);
    setSelectedType('Insidental');
    setCurrentDocId(null);
    setDate(new Date().toISOString().split('T')[0]);
    setTime('09:00');
    setLocation('');
    setNotes('');
    setCustomTitle('');
    setDokumentasiUrls([]);
    setDokumentasiFiles([]);
    setStudents([]);
    setAttendances({});
    setIsDialogOpen(true);
  };

  const fetchStudentsForAttendance = async (group: any) => {
    try {
      const groupMembersSnap = await getDocs(query(collection(db, 'group_members'), where('group_id', '==', group.id), where('status', '==', 'Approved')));
      const studentIds = groupMembersSnap.docs.map(d => d.data().student_id);
      
      if (studentIds.length > 0) {
         const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'Mahasiswa')));
         const foundStudents = usersSnap.docs.filter(d => studentIds.includes(d.id)).map(d => ({id: d.id, ...d.data()}));
         setStudents(foundStudents);
         
         const initialAtt: Record<string, boolean> = {};
         foundStudents.forEach(s => initialAtt[s.id] = true); // Default Hadir
         setAttendances(initialAtt);
      } else {
         setStudents([]);
         setAttendances({});
      }
    } catch (e) {
      toast.error('Gagal mengambil daftar mahasiswa');
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus berita acara kegiatan insidental ini?')) return;
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'berita_acara', docId));
      toast.success('Berita Acara kegiatan insidental berhasil dihapus');
    } catch (e) {
      toast.error('Gagal menghapus berita acara');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };


  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedGroup) {
      toast.error('Silakan lengkapi pilihan kelompok terlebih dahulu.');
      return;
    }
    try {
      setLoading(true);
      let docId = currentDocId;
      if (!docId) {
        if (selectedType === 'Insidental') {
          docId = `${selectedGroup.id}_Insidental_${Date.now()}_${profile.uid}`;
        } else {
          docId = `${selectedGroup.id}_${selectedType}_${profile.uid}`;
        }
      }
      
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
      
      if (selectedType === 'Insidental') {
        payload.title = customTitle;
      }
      
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

  const handleExportPdf = async (group: any, type: string, existingDocId?: string) => {
    let existing = null;
    if (existingDocId) {
      existing = beritaData.find(b => b.id === existingDocId);
    } else {
      existing = beritaData.find(b => b.group_id === group.id && b.type === type);
    }
    if (!existing) return;

    try {
      const doc = new jsPDF();
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      const titleText = type === 'Insidental' ? (existing.title || 'Kegiatan Insidental') : `SUPERVISI ${type}`;
      doc.text(`BERITA ACARA DAN ${titleText.toUpperCase()} PBL`, 105, 20, { align: "center" });
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      
      const startY = 35;
      
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const dateObj = new Date(existing.date);
      const dayName = days[dateObj.getDay()];
      const formattedDate = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

      const studyProgramRaw = group.prodi && group.prodi !== 'Semua' ? group.prodi : 'Ilmu Kesehatan Masyarakat / Keselamatan dan Kesehatan Kerja';
      
      const displayType = type === 'Insidental' ? (existing.title || 'Kegiatan Insidental') : type;
      const splitHeader = doc.splitTextToSize(`Telah dilaksanakan kegiatan ${displayType} Pengalaman Belajar Lapangan (PBL) Program Studi ${studyProgramRaw}`, 180);
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
      
      doc.save(`Berita_Acara_${displayType.replace(/\s+/g, '_')}_${group.group_name}.pdf`);
      toast.success('Berita Acara berhasil diunduh');
    } catch (e) {
      toast.error('Gagal mengunduh PDF');
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 mb-2">
        <button
          onClick={() => setActiveTab('utama')}
          className={`pb-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'utama'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Berita Acara Utama
        </button>
        <button
          onClick={() => setActiveTab('insidental')}
          className={`pb-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'insidental'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Kegiatan Insidental & Custom
        </button>
      </div>

      {activeTab === 'utama' && (
        <div className="space-y-4">
          {groups.length === 0 ? (
             <div className="text-center text-slate-500 text-sm py-8">Tidak ada kelompok bimbingan.</div>
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
        </div>
      )}

      {activeTab === 'insidental' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border">
            <div>
              <h3 className="font-semibold text-slate-900">Kegiatan Insidental / Custom Lapangan</h3>
              <p className="text-xs text-slate-500">Buat berita acara dan daftar hadir untuk kegiatan insidental bersama mahasiswa di lapangan.</p>
            </div>
            <Button onClick={handleOpenNewInsidental} size="sm" className="flex items-center gap-1.5 font-medium">
              <span className="text-base font-bold">+</span> Tambah Kegiatan Insidental
            </Button>
          </div>

          {beritaData.filter(b => b.type === 'Insidental').length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 text-sm">
              Belum ada berita acara kegiatan insidental. Silakan klik "Tambah Kegiatan Insidental".
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Kelompok</TableHead>
                  <TableHead>Nama Kegiatan</TableHead>
                  <TableHead>Tanggal & Waktu</TableHead>
                  <TableHead>Tempat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {beritaData.filter(b => b.type === 'Insidental').map(b => {
                  const grp = groups.find(g => g.id === b.group_id);
                  const grpName = grp ? grp.group_name : 'Kelompok Terhapus';
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-semibold">{grpName}</TableCell>
                      <TableCell className="font-medium">{b.title || 'Kegiatan Insidental'}</TableCell>
                      <TableCell>
                        {new Date(b.date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })} - {b.time}
                      </TableCell>
                      <TableCell>{b.location}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleOpenDialog(grp || {id: b.group_id, group_name: grpName}, 'Insidental', b.id)}>
                            Ubah
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => handleExportPdf(grp || {id: b.group_id, group_name: grpName}, 'Insidental', b.id)} title="Download PDF">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(b.id)}>
                            Hapus
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Berita Acara {selectedType === 'Insidental' ? (customTitle || 'Kegiatan Insidental') : selectedType}</DialogTitle>
            <DialogDescription>
              {selectedGroup ? `Kelompok: ${selectedGroup.group_name}` : 'Selesaikan form berita acara di bawah ini.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-6">
            
            {selectedType === 'Insidental' && !currentDocId && (
              <div className="space-y-2">
                <Label>Pilih Kelompok PBL <span className="text-red-500">*</span></Label>
                <Select 
                  value={selectedGroup?.id || ''} 
                  onValueChange={(groupId) => {
                    const g = groups.find(group => group.id === groupId);
                    if (g) {
                      setSelectedGroup(g);
                      fetchStudentsForAttendance(g);
                    }
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kelompok" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.group_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedType === 'Insidental' && currentDocId && (
              <div className="space-y-2">
                <Label>Kelompok PBL</Label>
                <Input value={selectedGroup?.group_name || ''} disabled />
              </div>
            )}

            {selectedType === 'Insidental' && (
              <div className="space-y-2">
                <Label>Nama / Judul Kegiatan Insidental <span className="text-red-500">*</span></Label>
                <Input 
                  value={customTitle} 
                  onChange={e => setCustomTitle(e.target.value)} 
                  required 
                  placeholder="Contoh: Supervisi Lapangan Tambahan / Diskusi Evaluasi" 
                />
              </div>
            )}

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

            {(selectedType === 'Pembukaan' || selectedType === 'Penutupan' || selectedType === 'Pengabdian pada Masyarakat' || selectedType === 'Insidental') && (
              <div className="space-y-2">
                <Label>Dokumentasi Kegiatan (Foto) {selectedType !== 'Insidental' && <span className="text-red-500">*wajib</span>}</Label>
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
                  required={selectedType !== 'Insidental' && dokumentasiUrls.length === 0 && dokumentasiFiles.length === 0} 
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
               {!selectedGroup ? (
                 <div className="text-sm text-slate-500 border p-4 rounded-md">Silakan pilih kelompok terlebih dahulu untuk melihat daftar mahasiswa</div>
               ) : students.length === 0 ? (
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
