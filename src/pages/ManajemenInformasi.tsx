import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2 } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'Pengumuman' | 'Berita';
  date: string;
  author_id: string;
  createdAt: string;
}

export const ManajemenInformasi = () => {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'Pengumuman',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data: Announcement[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Announcement));
      setAnnouncements(data);
    } catch (error) {
      console.error(error);
      toast.error('Gagal mengambil data informasi');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setFormData({
      title: '',
      content: '',
      type: 'Pengumuman',
      date: new Date().toISOString().split('T')[0],
    });
    setEditingId(null);
    setIsOpen(true);
  };

  const handleOpenEdit = (ann: Announcement) => {
    setFormData({
      title: ann.title,
      content: ann.content,
      type: ann.type,
      date: ann.date.split('T')[0],
    });
    setEditingId(ann.id);
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    try {
      const payload = {
        ...formData,
        date: new Date(formData.date).toISOString(),
        author_id: profile.uid,
        createdAt: new Date().toISOString(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'announcements', editingId), payload);
        toast.success('Informasi berhasil diubah');
      } else {
        await addDoc(collection(db, 'announcements'), payload);
        toast.success('Informasi berhasil ditambahkan');
      }

      setIsOpen(false);
      fetchAnnouncements();
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'announcements');
      toast.error('Gagal menyimpan informasi');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus informasi ini?')) return;
    try {
      await deleteDoc(doc(db, 'announcements', id));
      toast.success('Informasi berhasil dihapus');
      fetchAnnouncements();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `announcements/${id}`);
      toast.error('Gagal menghapus informasi');
    }
  };

  if (profile?.role !== 'Admin' && profile?.role !== 'AdminProdi') {
    return <div className="p-8 text-center text-red-500">Akses ditolak</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-lg border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Manajemen Informasi</h1>
          <p className="text-muted-foreground w-full sm:w-[600px] mt-1">
            Kelola pengumuman dan berita yang akan ditampilkan pada halaman depan (Landing Page).
          </p>
        </div>
        <Button onClick={handleOpenNew} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          Tambah Informasi
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-[120px]">Tanggal</TableHead>
                <TableHead className="w-[120px]">Jenis</TableHead>
                <TableHead>Judul</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-slate-500">Memuat data...</TableCell>
                </TableRow>
              ) : announcements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-slate-500">Belum ada informasi</TableCell>
                </TableRow>
              ) : (
                announcements.map(ann => (
                  <TableRow key={ann.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {new Date(ann.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        ann.type === 'Pengumuman' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {ann.type}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{ann.title}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpenEdit(ann)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(ann.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Informasi' : 'Tambah Informasi'}</DialogTitle>
            <DialogDescription>
              Isi form berikut untuk menampilkan informasi pada Halaman Depan.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Jenis Informasi</Label>
                <Select value={formData.type} onValueChange={(v: 'Pengumuman' | 'Berita') => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pengumuman">Pengumuman</SelectItem>
                    <SelectItem value="Berita">Berita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tanggal</Label>
                <Input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Judul Informasi</Label>
              <Input placeholder="Masukkan judul..." value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required maxLength={150} />
            </div>

            <div className="space-y-2">
              <Label>Konten / Detail</Label>
              <Textarea 
                placeholder="Tulis detail informasi di sini..." 
                className="min-h-[150px]"
                value={formData.content} 
                onChange={e => setFormData({ ...formData, content: e.target.value })} 
                required 
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
              <Button type="submit">Simpan Informasi</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
