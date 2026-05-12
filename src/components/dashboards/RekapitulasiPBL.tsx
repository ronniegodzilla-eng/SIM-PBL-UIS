import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export const RekapitulasiPBL = () => {
  const [grades, setGrades] = useState<any[]>([]);
  const [logbooks, setLogbooks] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const unsubGrades = onSnapshot(query(collection(db, 'grades')), (snapshot) => {
      setGrades(snapshot.docs.map(doc => doc.data()));
    }, error => handleFirestoreError(error, OperationType.LIST, 'grades'));

    const unsubLogbooks = onSnapshot(query(collection(db, 'logbooks')), (snapshot) => {
      setLogbooks(snapshot.docs.map(doc => doc.data()));
    }, error => handleFirestoreError(error, OperationType.LIST, 'logbooks'));

    const unsubAttendances = onSnapshot(query(collection(db, 'attendances')), (snapshot) => {
      setAttendances(snapshot.docs.map(doc => doc.data()));
    }, error => handleFirestoreError(error, OperationType.LIST, 'attendances'));

    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data()));
    }, error => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubGrades();
      unsubLogbooks();
      unsubAttendances();
      unsubUsers();
    };
  }, []);

  // Data for Infographics
  const mahasiswaCount = users.filter(u => u.role === 'Mahasiswa').length;
  const activeMahasiswaCount = users.filter(u => u.role === 'Mahasiswa' && u.account_status === 'Active').length;

  const logbookStatusData = [
    { name: 'Pending', value: logbooks.filter(l => l.status === 'Pending').length },
    { name: 'Approved', value: logbooks.filter(l => l.status === 'Approved').length },
    { name: 'Rejected', value: logbooks.filter(l => l.status === 'Rejected').length },
  ];

  const COLORS = ['#f59e0b', '#10b981', '#ef4444'];

  // Average grades by type
  const gradeTypes = ['Laporan', 'Presentasi', 'Kinerja'];
  const averageGrades = gradeTypes.map(type => {
    const typeGrades = grades.filter(g => g.grade_type === type);
    const avg = typeGrades.length > 0 
      ? typeGrades.reduce((acc, curr) => acc + curr.score, 0) / typeGrades.length 
      : 0;
    return {
      name: type,
      RataRata: Math.round(avg * 10) / 10
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Total Mahasiswa</div>
            <div className="text-2xl font-bold">{mahasiswaCount}</div>
            <div className="text-[0.75rem] mt-1 text-slate-500">
              {activeMahasiswaCount} Aktif
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Total Logbook</div>
            <div className="text-2xl font-bold">{logbooks.length}</div>
            <div className="text-[0.75rem] mt-1 text-slate-500">
              Disubmit oleh mahasiswa
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-[0.8rem] text-muted-foreground mb-2">Total Absensi</div>
            <div className="text-2xl font-bold">{attendances.length}</div>
            <div className="text-[0.75rem] mt-1 text-slate-500">
              Tercatat di sistem
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Status Logbook</CardTitle>
            <CardDescription>Proporsi status persetujuan logbook mahasiswa</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={logbookStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {logbookStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rata-rata Nilai</CardTitle>
            <CardDescription>Rata-rata nilai berdasarkan jenis penilaian</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart
                data={averageGrades}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="RataRata" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
