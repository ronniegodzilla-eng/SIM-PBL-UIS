import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';

export const RekapLogbookDosen = ({ groups }: { groups: any[] }) => {
  const [logbooks, setLogbooks] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [students, setStudents] = useState<any>({});
  const [uniqueStudentIds, setUniqueStudentIds] = useState<string[]>([]);

  useEffect(() => {
    if (groups.length === 0) return;

    // Fetch all students to map names
    const qStudents = query(collection(db, 'users'), where('role', '==', 'Mahasiswa'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const studs: any = {};
      snapshot.forEach(doc => {
        studs[doc.id] = doc.data();
      });
      setStudents(studs);
    });

    const groupIds = groups.map(g => g.id);

    // Fetch members for these groups locally
    const qMembers = query(collection(db, 'group_members'));
    const unsubMembers = onSnapshot(qMembers, (snapshot) => {
      const sIds: string[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (groupIds.includes(data.group_id)) {
          if (!sIds.includes(data.student_id)) {
            sIds.push(data.student_id);
          }
        }
      });
      setUniqueStudentIds(sIds);

      // Fetch ONLY Approved logbooks filtered by student_id
      const qLogbooks = query(collection(db, 'logbooks'), where('status', '==', 'Approved'));
      const unsubLogs = onSnapshot(qLogbooks, (snapLogs) => {
        const logs: any[] = [];
        snapLogs.forEach((lDoc) => {
          const lData = lDoc.data();
          if (sIds.includes(lData.student_id)) {
            logs.push({ id: lDoc.id, ...lData });
          }
        });
        setLogbooks(logs);
      });

      // Fetch ONLY Approved attendances filtered by student_id
      const qAttendances = query(collection(db, 'attendances'), where('status', '==', 'Approved'));
      const unsubAtts = onSnapshot(qAttendances, (snapAtts) => {
        const atts: any[] = [];
        snapAtts.forEach((aDoc) => {
          const aData = aDoc.data();
          if (sIds.includes(aData.student_id)) {
            atts.push({ id: aDoc.id, ...aData });
          }
        });
        setAttendances(atts);
      });
      
      return () => {
        unsubLogs();
        unsubAtts();
      };
    });

    return () => {
      unsubStudents();
      unsubMembers();
    };
  }, [groups]);

  const handleExportPDF = (studentId: string) => {
    const student = students[studentId];
    if (!student) return;

    const doc = new jsPDF();
    const studentLogs = logbooks.filter(l => l.student_id === studentId).sort((a,b) => new Date(a.activity_date).getTime() - new Date(b.activity_date).getTime());
    const studentAtts = attendances.filter(a => a.student_id === studentId).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    doc.setFontSize(16);
    doc.text('Sistem Informasi PBL', 14, 20);
    doc.setFontSize(11);
    doc.text('Fakultas Ilmu Kesehatan (Fikes), Universitas Ibnu Sina', 14, 26);
    
    doc.setLineWidth(0.5);
    doc.line(14, 30, 196, 30);

    doc.setFontSize(14);
    doc.text('Rekapitulasi Logbook dan Absensi PBL', 14, 40);
    
    doc.setFontSize(12);
    doc.text(`Nama Mahasiswa: ${student.name}`, 14, 50);
    doc.text(`NIM/Email: ${student.email}`, 14, 56);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 62);

    // Absensi Table
    doc.setFontSize(14);
    doc.text(`Data Absensi`, 14, 75);
    
    autoTable(doc, {
      startY: 80,
      head: [['Tanggal', 'Jenis Kegiatan', 'Status Kehadiran']],
      body: studentAtts.map(att => [
        new Date(att.date).toLocaleDateString('id-ID'),
        att.type,
        att.is_present ? 'Hadir' : 'Tidak Hadir'
      ]),
    });

    // Logbook Table
    const finalY = (doc as any).lastAutoTable.finalY || 80;
    
    doc.setFontSize(14);
    doc.text(`Data Logbook`, 14, finalY + 15);

    autoTable(doc, {
      startY: finalY + 20,
      head: [['Tanggal', 'Deskripsi Kegiatan']],
      body: studentLogs.map(log => [
        new Date(log.activity_date).toLocaleDateString('id-ID'),
        log.description
      ]),
    });

    doc.save(`Rekap_PBL_${student.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <Tabs defaultValue="logbook" className="space-y-4">
      <TabsList>
        <TabsTrigger value="logbook">Logbook Disetujui ({logbooks.length})</TabsTrigger>
        <TabsTrigger value="absensi">Absensi Disetujui ({attendances.length})</TabsTrigger>
        <TabsTrigger value="ekspor">Ekspor PDF ({uniqueStudentIds.length} Mahasiswa)</TabsTrigger>
      </TabsList>
      
      <TabsContent value="ekspor">
        <Card>
          <CardHeader>
            <CardTitle>Ekspor Data Mahasiswa</CardTitle>
            <CardDescription>Unduh rekapitulasi absensi dan logbook per mahasiswa dalam bentuk PDF.</CardDescription>
          </CardHeader>
          <CardContent>
            {uniqueStudentIds.length === 0 ? (
              <div className="text-center py-6 text-slate-500">Belum ada data mahasiswa yang dapat diekspor.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Mahasiswa</TableHead>
                    <TableHead>Jumlah Logbook</TableHead>
                    <TableHead>Jumlah Absensi</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uniqueStudentIds.map(sId => {
                    const student = students[sId];
                    if (!student) return null;
                    const logCount = logbooks.filter(l => l.student_id === sId).length;
                    const attCount = attendances.filter(a => a.student_id === sId).length;
                    return (
                      <TableRow key={sId}>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell>{logCount} Entri</TableCell>
                        <TableCell>{attCount} Entri</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => handleExportPDF(sId)} disabled={logCount === 0 && attCount === 0}>
                            <Download className="mr-2 h-4 w-4" /> Ekspor PDF
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="logbook">
        {logbooks.length === 0 ? (
          <div className="text-center py-8 text-slate-500 border rounded-lg">Belum ada logbook yang disetujui Pembimbing Lapangan.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mahasiswa</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Deskripsi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logbooks.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{students[log.student_id]?.name || log.student_id}</TableCell>
                  <TableCell>{new Date(log.activity_date).toLocaleDateString('id-ID')}</TableCell>
                  <TableCell className="max-w-md truncate">{log.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>

      <TabsContent value="absensi">
        {attendances.length === 0 ? (
          <div className="text-center py-8 text-slate-500 border rounded-lg">Belum ada absensi yang disetujui Pembimbing Lapangan.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mahasiswa</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Jenis Kegiatan</TableHead>
                <TableHead>Kehadiran</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendances.map((att) => (
                <TableRow key={att.id}>
                  <TableCell className="font-medium">{students[att.student_id]?.name || att.student_id}</TableCell>
                  <TableCell>{new Date(att.date).toLocaleDateString('id-ID')}</TableCell>
                  <TableCell>{att.type}</TableCell>
                  <TableCell>{att.is_present ? 'Hadir' : 'Tidak Hadir'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>
    </Tabs>
  );
};
