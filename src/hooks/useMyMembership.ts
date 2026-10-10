import { useEffect, useState } from 'react';
import { onSnapshot, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { periodQuery, usePeriod } from '../contexts/PeriodContext';

// Keanggotaan kelompok mahasiswa yang sedang login pada periode aktif.
// Satu mahasiswa punya paling banyak satu dokumen group_members per periode
// (ID: member_{periodId}_{uid}); periode lain tidak ikut terbaca.
export function useMyMembership() {
  const { profile } = useAuth();
  const { periodId, loading: periodLoading } = usePeriod();
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || periodLoading) return;
    if (!periodId) {
      setMember(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = periodQuery('group_members', periodId, where('student_id', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setMember(null);
      } else {
        // Utamakan keanggotaan yang sudah disetujui bila (data lama) ada lebih dari satu.
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setMember(docs.find(d => d.status === 'Approved') || docs[0]);
      }
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'group_members');
    });
    return () => unsubscribe();
  }, [profile?.uid, periodId, periodLoading]);

  return { member, loading: loading || periodLoading };
}
