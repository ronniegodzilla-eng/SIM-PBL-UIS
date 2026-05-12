import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export const LogbookAbsensi = ({ groupMember }: { groupMember: any }) => {
  const { profile } = useAuth();
  const [logbooks, setLogbooks] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [isSubmittingLogbook, setIsSubmittingLogbook] = useState(false);
  const [newLogbook, setNewLogbook] = useState({ activity_date: '', description: '' });
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
  const [newAttendance, setNewAttendance] = useState({ date: '', type: 'Lapangan', is_present: true });

  useEffect(() => {
    if (!profile || !groupMember) return;

    // Listen for logbooks
    const qLogbooks = query(collection(db, 'logbooks'), where('student_id', '==', profile.uid));
    const unsubLogbooks = onSnapshot(qLogbooks, (snapshot) => {
      const logs: any[] = [];
      snapshot.forEach((doc) => logs.push({ id: doc.id, ...doc.data() }));
      setLogbooks(logs.sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'logbooks'));

    // Listen for attendances
    const qAttendances = query(collection(db, 'attendances'), where('student_id', '==', profile.uid));
    const unsubAttendances = onSnapshot(qAttendances, (snapshot) => {
      const atts: any[] = [];
      snapshot.forEach((doc) => atts.push({ id: doc.id, ...doc.data() }));
      setAttendances(atts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendances'));

    return () => {
      unsubLogbooks();
      unsubAttendances();
    };
  }, [profile, groupMember]);

  const handleAddLogbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !groupMember) return;

    try {
      setIsSubmittingLogbook(true);
      const logbookId = `log_${profile.uid}_${Date.now()}`;
      
      await setDoc(doc(db, 'logbooks', logbookId), {
        group_member_id: groupMember.id,
        student_id: profile.uid,
        activity_date: newLogbook.activity_date,
        description: newLogbook.description,
        status: 'Pending',
        createdAt: new Date().toISOString()
      });
      
      toast.success('Logbook berhasil ditambahkan.');
      setNewLogbook({ activity_date: '', description: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'logbooks');
      toast.error('Gagal menambahkan logbook.');
    } finally {
      setIsSubmittingLogbook(false);
    }
  };

  const handleAddAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !groupMember) return;

    try {
      setIsSubmittingAttendance(true);
      const attendanceId = `att_${profile.uid}_${Date.now()}`;
      
      await setDoc(doc(db, 'attendances', attendanceId), {
        group_member_id: groupMember.id,
        student_id: profile.uid,
        date: newAttendance.date,
        type: newAttendance.type,
        is_present: newAttendance.is_present,
        status: 'Pending',
        createdAt: new Date().toISOString()
      });
      
      toast.success('Absensi berhasil dicatat.');
      setNewAttendance({ date: '', type: 'Lapangan', is_present: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'attendances');
      toast.error('Gagal mencatat absensi.');
    } finally {
      setIsSubmittingAttendance(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Logbook Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Logbook Harian</h3>
          <Dialog>
            <DialogTrigger render={<Button size="sm">Tambah Logbook</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Logbook</DialogTitle>
                <DialogDescription>Catat kegiatan PBL Anda hari ini.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddLogbook} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="activity_date">Tanggal Kegiatan</Label>
                  <Input id="activity_date" type="date" value={newLogbook.activity_date} onChange={e => setNewLogbook({...newLogbook, activity_date: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Deskripsi Kegiatan</Label>
                  <Input id="description" value={newLogbook.description} onChange={e => setNewLogbook({...newLogbook, description: e.target.value})} required />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmittingLogbook}>
                    {isSubmittingLogbook ? 'Menyimpan...' : 'Simpan'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        
        {logbooks.length === 0 ? (
          <div className="text-center py-8 text-slate-500 border rounded-lg">Belum ada catatan logbook.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logbooks.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.activity_date).toLocaleDateString('id-ID')}</TableCell>
                  <TableCell className="max-w-md truncate">{log.description}</TableCell>
                  <TableCell>
                    <Badge variant={log.status === 'Approved' ? 'default' : 'secondary'}>{log.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Attendance Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Absensi</h3>
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="outline">Catat Absensi</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Catat Absensi</DialogTitle>
                <DialogDescription>Pilih tanggal dan jenis kegiatan.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddAttendance} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Tanggal</Label>
                  <Input id="date" type="date" value={newAttendance.date} onChange={e => setNewAttendance({...newAttendance, date: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Jenis Kegiatan</Label>
                  <Select value={newAttendance.type} onValueChange={val => setNewAttendance({...newAttendance, type: val})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Jenis" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sosialisasi">Sosialisasi</SelectItem>
                      <SelectItem value="Lapangan">Lapangan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmittingAttendance}>
                    {isSubmittingAttendance ? 'Menyimpan...' : 'Simpan'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        
        {attendances.length === 0 ? (
          <div className="text-center py-8 text-slate-500 border rounded-lg">Belum ada catatan absensi.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Jenis Kegiatan</TableHead>
                <TableHead>Kehadiran</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendances.map((att) => (
                <TableRow key={att.id}>
                  <TableCell>{new Date(att.date).toLocaleDateString('id-ID')}</TableCell>
                  <TableCell>{att.type}</TableCell>
                  <TableCell>
                    <Badge variant={att.is_present ? 'default' : 'destructive'}>
                      {att.is_present ? 'Hadir' : 'Tidak Hadir'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={att.status === 'Approved' ? 'default' : 'secondary'}>{att.status || 'Pending'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};
