import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Search, ArrowUp, ArrowDown } from 'lucide-react';

export const PersetujuanLogbook = ({ groups }: { groups: any[] }) => {
  const [logbooks, setLogbooks] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [students, setStudents] = useState<any>({});
  const [studentGroups, setStudentGroups] = useState<any>({});
  
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'logbook';

  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'date', direction: 'desc' });

  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [selectedAtts, setSelectedAtts] = useState<string[]>([]);

  useEffect(() => {
    if (groups.length === 0) return;

    const qStudents = query(collection(db, 'users'), where('role', '==', 'Mahasiswa'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const studs: any = {};
      snapshot.forEach(doc => {
        studs[doc.id] = doc.data();
      });
      setStudents(studs);
    });

    const groupIds = groups.map(g => g.id);
    const groupsMap = groups.reduce((acc, g) => ({ ...acc, [g.id]: g.group_name }), {});

    const qMembers = query(collection(db, 'group_members'));
    const unsubMembers = onSnapshot(qMembers, (snapshot) => {
      const gMembers: any[] = [];
      const sIds: string[] = [];
      const sGroups: any = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (groupIds.includes(data.group_id)) {
          gMembers.push({ id: doc.id, ...data });
          sGroups[data.student_id] = groupsMap[data.group_id] || 'Unknown Group';
          if (!sIds.includes(data.student_id)) {
            sIds.push(data.student_id);
          }
        }
      });
      setStudentGroups(sGroups);
      
      if (sIds.length === 0) {
        setLogbooks([]);
        setAttendances([]);
        return;
      }
      
      const qLogbooks = query(collection(db, 'logbooks'), where('status', '==', 'Pending'));
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

      const qAttendances = query(collection(db, 'attendances'), where('status', '==', 'Pending'));
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

  const handleApproveLogbook = async (id: string | string[]) => {
    try {
      const idsToApprove = Array.isArray(id) ? id : [id];
      const promises = idsToApprove.map(logId => updateDoc(doc(db, 'logbooks', logId), { status: 'Approved' }));
      await Promise.all(promises);
      toast.success(`${idsToApprove.length} Logbook disetujui`);
      setSelectedLogs([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `logbooks`);
      toast.error('Gagal menyetujui logbook');
    }
  };

  const handleApproveAttendance = async (id: string | string[]) => {
    try {
      const idsToApprove = Array.isArray(id) ? id : [id];
      const promises = idsToApprove.map(attId => updateDoc(doc(db, 'attendances', attId), { status: 'Approved' }));
      await Promise.all(promises);
      toast.success(`${idsToApprove.length} Absensi disetujui`);
      setSelectedAtts([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `attendances`);
      toast.error('Gagal menyetujui absensi');
    }
  };

  const updateTabParam = (value: string) => {
    setSearchParams({ tab: value });
    setSearchQuery('');
    setSelectedLogs([]);
    setSelectedAtts([]);
  };

  const handleSort = (field: string) => {
    if (sortConfig.field === field) {
      setSortConfig({ field, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ field, direction: 'asc' });
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortConfig.field !== field) return <ArrowDown className="ml-2 h-4 w-4 text-slate-300 inline-block opacity-0 group-hover:opacity-100" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4 inline-block" /> : <ArrowDown className="ml-2 h-4 w-4 inline-block" />;
  };

  const getFilteredAndSorted = (data: any[], type: 'logbook' | 'attendance') => {
    return data
      .filter(item => {
        const studentName = (students[item.student_id]?.name || '').toLowerCase();
        const prodi = (students[item.student_id]?.prodi || '').toLowerCase();
        const groupName = (studentGroups[item.student_id] || '').toLowerCase();
        const desc = (type === 'logbook' ? item.description : item.type).toLowerCase();
        const q = searchQuery.toLowerCase();
        return studentName.includes(q) || prodi.includes(q) || groupName.includes(q) || desc.includes(q);
      })
      .sort((a, b) => {
        let valA, valB;
        if (sortConfig.field === 'name') {
          valA = students[a.student_id]?.name || '';
          valB = students[b.student_id]?.name || '';
        } else if (sortConfig.field === 'group') {
          valA = studentGroups[a.student_id] || '';
          valB = studentGroups[b.student_id] || '';
        } else if (sortConfig.field === 'prodi') {
          valA = students[a.student_id]?.prodi || '';
          valB = students[b.student_id]?.prodi || '';
        } else if (sortConfig.field === 'date') {
          valA = new Date(type === 'logbook' ? a.activity_date : a.date).getTime();
          valB = new Date(type === 'logbook' ? b.activity_date : b.date).getTime();
        } else {
          valA = '';
          valB = '';
        }
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
  };

  const displayedLogbooks = getFilteredAndSorted(logbooks, 'logbook');
  const displayedAttendances = getFilteredAndSorted(attendances, 'attendance');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Tabs defaultValue={initialTab} value={searchParams.get('tab') || 'logbook'} onValueChange={updateTabParam} className="w-full sm:w-auto">
          <TabsList className="h-14 w-full justify-start gap-2 bg-transparent p-0">
            <TabsTrigger 
              value="logbook" 
              className="h-12 px-8 text-base border-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary font-semibold rounded-lg data-[state=inactive]:bg-slate-100"
            >
              Logbook ({logbooks.length})
            </TabsTrigger>
            <TabsTrigger 
              value="absensi" 
              className="h-12 px-8 text-base border-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary font-semibold rounded-lg data-[state=inactive]:bg-slate-100"
            >
              Absensi ({attendances.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="relative w-full sm:w-80 lg:w-96 shadow-sm rounded-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input 
            className="pl-10 h-11 border-slate-300 bg-white focus-visible:ring-primary text-base placeholder:text-slate-400" 
            placeholder="Cari nama, prodi, kelompok..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      
      <Tabs value={searchParams.get('tab') || 'logbook'} onValueChange={updateTabParam}>
        <TabsContent value="logbook" className="pt-4">
          {selectedLogs.length > 0 && (
            <div className="mb-4 flex items-center justify-between bg-green-50 px-4 py-3 rounded-lg border border-green-200">
              <span className="text-green-800 font-medium">Terpilih {selectedLogs.length} Logbook</span>
              <Button onClick={() => handleApproveLogbook(selectedLogs)} className="bg-green-600 hover:bg-green-700">
                Setujui Terpilih ({selectedLogs.length})
              </Button>
            </div>
          )}

          {displayedLogbooks.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border rounded-lg bg-slate-50/50">
              <p className="text-lg">Tidak ada logbook yang perlu disetujui saat ini.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <Checkbox 
                        checked={selectedLogs.length === displayedLogbooks.length && displayedLogbooks.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedLogs(displayedLogbooks.map(l => l.id));
                          else setSelectedLogs([]);
                        }}
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 group cursor-pointer" onClick={() => handleSort('name')}>
                      Mahasiswa <SortIcon field="name" />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 group cursor-pointer" onClick={() => handleSort('group')}>
                      Info Kelompok <SortIcon field="group" />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 group cursor-pointer" onClick={() => handleSort('date')}>
                      Tanggal <SortIcon field="date" />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">Deskripsi</TableHead>
                    <TableHead className="text-right font-semibold text-slate-700">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedLogbooks.map((log) => (
                    <TableRow key={log.id} className="hover:bg-slate-50/50">
                      <TableCell className="text-center">
                        <Checkbox 
                          checked={selectedLogs.includes(log.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedLogs(prev => [...prev, log.id]);
                            else setSelectedLogs(prev => prev.filter(id => id !== log.id));
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-base">
                        <div className="font-medium">{students[log.student_id]?.name || log.student_id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-slate-900">{studentGroups[log.student_id]}</div>
                        <div className="text-xs text-slate-500">{students[log.student_id]?.prodi}</div>
                      </TableCell>
                      <TableCell>{new Date(log.activity_date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}</TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate text-slate-600" title={log.description}>{log.description}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="default" 
                          onClick={() => handleApproveLogbook(log.id)}
                          className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow-sm px-6"
                        >
                          Setujui
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="absensi" className="pt-4">
          {selectedAtts.length > 0 && (
            <div className="mb-4 flex items-center justify-between bg-blue-50 px-4 py-3 rounded-lg border border-blue-200">
              <span className="text-blue-800 font-medium">Terpilih {selectedAtts.length} Absensi</span>
              <Button onClick={() => handleApproveAttendance(selectedAtts)} className="bg-blue-600 hover:bg-blue-700">
                Setujui Terpilih ({selectedAtts.length})
              </Button>
            </div>
          )}

          {displayedAttendances.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border rounded-lg bg-slate-50/50">
              <p className="text-lg">Tidak ada absensi yang perlu disetujui saat ini.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                     <TableHead className="w-12 text-center">
                      <Checkbox 
                        checked={selectedAtts.length === displayedAttendances.length && displayedAttendances.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedAtts(displayedAttendances.map(a => a.id));
                          else setSelectedAtts([]);
                        }}
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 group cursor-pointer" onClick={() => handleSort('name')}>
                      Mahasiswa <SortIcon field="name" />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 group cursor-pointer" onClick={() => handleSort('group')}>
                      Info Kelompok <SortIcon field="group" />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 group cursor-pointer" onClick={() => handleSort('date')}>
                      Tanggal <SortIcon field="date" />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">Jenis Kegiatan</TableHead>
                    <TableHead className="font-semibold text-slate-700">Kehadiran</TableHead>
                    <TableHead className="text-right font-semibold text-slate-700">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedAttendances.map((att) => (
                    <TableRow key={att.id} className="hover:bg-slate-50/50">
                      <TableCell className="text-center">
                        <Checkbox 
                          checked={selectedAtts.includes(att.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedAtts(prev => [...prev, att.id]);
                            else setSelectedAtts(prev => prev.filter(id => id !== att.id));
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-base">
                        <div className="font-medium">{students[att.student_id]?.name || att.student_id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-slate-900">{studentGroups[att.student_id]}</div>
                        <div className="text-xs text-slate-500">{students[att.student_id]?.prodi}</div>
                      </TableCell>
                      <TableCell>{new Date(att.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}</TableCell>
                      <TableCell>
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-sm">{att.type}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={att.is_present ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : 'bg-red-100 text-red-700 hover:bg-red-100'} variant="outline">
                          {att.is_present ? '✨ Hadir' : '❌ Tidak Hadir'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="default" 
                          onClick={() => handleApproveAttendance(att.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm px-6"
                        >
                          Setujui
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
