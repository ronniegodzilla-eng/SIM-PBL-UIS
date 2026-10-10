import { collection, doc, getDoc, getDocs, writeBatch, WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';

// Koleksi operasional yang setiap dokumennya membawa field period_id.
export const PERIOD_COLLECTIONS = [
  'pbl_groups',
  'group_members',
  'logbooks',
  'attendances',
  'pbl_reports',
  'exam_schedules',
  'berita_acara',
  'grades',
] as const;

// Urutan nilai huruf dari tertinggi ke terendah (lihat getNilaiHuruf di
// RekapNilai.tsx). Dipakai untuk menentukan batas lulus.
export const LETTER_GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'];

type Op = (batch: WriteBatch) => void;

// Firestore membatasi 500 operasi per batch; pakai 400 agar ada ruang.
async function commitInChunks(ops: Op[], onProgress?: (done: number, total: number) => void) {
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach(op => op(batch));
    await batch.commit();
    onProgress?.(Math.min(i + CHUNK, ops.length), ops.length);
  }
}

/**
 * Tandai semua dokumen yang belum punya period_id sebagai milik periode
 * tertentu. Dipakai saat inisialisasi periode pertama (data lama sebelum
 * fitur periode ada) dan sebagai perbaikan bila ada data tanpa periode.
 * Aman dijalankan berulang: dokumen yang sudah berperiode tidak disentuh.
 */
export async function backfillPeriodId(periodId: string, log: (msg: string) => void) {
  let total = 0;
  for (const name of PERIOD_COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    const missing = snap.docs.filter(d => !d.data().period_id);
    if (missing.length === 0) {
      log(`${name}: semua dokumen sudah berperiode.`);
      continue;
    }
    await commitInChunks(
      missing.map(d => (b: WriteBatch) => b.update(d.ref, { period_id: periodId })),
      (done, all) => log(`${name}: ${done}/${all} dokumen ditandai.`)
    );
    total += missing.length;
  }
  return total;
}

/**
 * Nilai akhir yang dulu dipublikasikan di dokumen users disalin ke dokumen
 * keanggotaan periode, karena tampilan nilai kini membaca dari sana.
 */
export async function copyPublishedGradesToMembers(periodId: string, log: (msg: string) => void) {
  const [usersSnap, membersSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'group_members')),
  ]);
  const usersById = new Map(usersSnap.docs.map(d => [d.id, d.data()]));
  const ops: Op[] = [];
  membersSnap.docs.forEach(m => {
    const data = m.data();
    if (data.period_id !== periodId || data.is_grade_published) return;
    const u = usersById.get(data.student_id);
    if (!u?.is_grade_published) return;
    ops.push(b => b.update(m.ref, {
      is_grade_published: true,
      final_score: typeof u.final_score === 'number' ? u.final_score : 0,
      letter_grade: typeof u.letter_grade === 'string' ? u.letter_grade : '-',
    }));
  });
  if (ops.length === 0) {
    log('Tidak ada nilai terpublikasi yang perlu disalin.');
    return 0;
  }
  await commitInChunks(ops, (done, all) => log(`Nilai terpublikasi: ${done}/${all} disalin.`));
  return ops.length;
}

/**
 * Pengaturan yang dulu global (settings/requirements, settings/exam_registration,
 * settings/main.is_edit_active) dibaca agar bisa ditanam ke periode pertama.
 */
export async function readLegacySettings() {
  const [req, reg, main] = await Promise.all([
    getDoc(doc(db, 'settings', 'requirements')),
    getDoc(doc(db, 'settings', 'exam_registration')),
    getDoc(doc(db, 'settings', 'main')),
  ]);
  const out: Record<string, any> = {};
  if (req.exists()) out.requirements = req.data();
  if (reg.exists()) out.exam_registration = reg.data();
  if (main.exists()) out.is_edit_active = !!main.data().is_edit_active;
  return out;
}

export interface CarryOverDecision {
  student_id: string;
  lulus: boolean;
}

/**
 * Tutup periode lama dan aktifkan periode baru.
 * - Mahasiswa lulus: users.pbl_status = 'Lulus' (tidak muncul lagi sebagai
 *   calon anggota kelompok pada periode berikutnya).
 * - Mahasiswa belum lulus/tidak berprogres: dibuatkan keanggotaan 'Pending'
 *   di periode baru (carried_from = periode lama) sehingga otomatis ikut
 *   tersalin dan siap dimasukkan ke kelompok baru. Data lamanya (logbook,
 *   nilai, laporan) tetap tersimpan di arsip periode lama.
 * Penunjuk periode aktif dipindah paling akhir; seluruh langkah idempoten
 * sehingga aman diulang bila proses terputus.
 */
export async function startNewPeriod(params: {
  oldPeriodId: string;
  newPeriod: { id: string; name: string; tahun_ajaran: string; requirements?: Record<string, any> };
  decisions: CarryOverDecision[];
  log: (msg: string) => void;
}) {
  const { oldPeriodId, newPeriod, decisions, log } = params;
  const now = new Date().toISOString();

  // 1. Dokumen periode baru. Pendaftaran ujian ditutup sampai admin membukanya.
  const periodBatch = writeBatch(db);
  periodBatch.set(doc(db, 'periods', newPeriod.id), {
    name: newPeriod.name,
    tahun_ajaran: newPeriod.tahun_ajaran,
    status: 'Active',
    createdAt: now,
    previous_period_id: oldPeriodId,
    requirements: newPeriod.requirements || {},
    exam_registration: { mode: 'closed', open_at: null, close_at: null, note: '' },
    is_edit_active: false,
  }, { merge: true });
  await periodBatch.commit();
  log(`Periode ${newPeriod.name} dibuat.`);

  // 2. Mahasiswa belum lulus ikut tersalin ke periode baru.
  const carried = decisions.filter(d => !d.lulus);
  await commitInChunks(
    carried.map(d => (b: WriteBatch) => b.set(doc(db, 'group_members', `member_${newPeriod.id}_${d.student_id}`), {
      period_id: newPeriod.id,
      group_id: 'pending',
      student_id: d.student_id,
      status: 'Pending',
      carried_from: oldPeriodId,
      createdAt: now,
    }, { merge: true })),
    (done, all) => log(`Mahasiswa mengulang: ${done}/${all} disalin ke periode baru.`)
  );

  // 3. Tandai mahasiswa yang lulus.
  const passed = decisions.filter(d => d.lulus);
  await commitInChunks(
    passed.map(d => (b: WriteBatch) => b.update(doc(db, 'users', d.student_id), {
      pbl_status: 'Lulus',
      pbl_period_id: oldPeriodId,
    })),
    (done, all) => log(`Mahasiswa lulus: ${done}/${all} ditandai.`)
  );

  // 4. Tutup periode lama & pindahkan penunjuk periode aktif (atomik).
  const finalBatch = writeBatch(db);
  finalBatch.update(doc(db, 'periods', oldPeriodId), { status: 'Closed', closedAt: now });
  finalBatch.set(doc(db, 'settings', 'active_period'), { period_id: newPeriod.id, updatedAt: now });
  await finalBatch.commit();
  log(`Periode aktif dipindah ke ${newPeriod.name}.`);
}
