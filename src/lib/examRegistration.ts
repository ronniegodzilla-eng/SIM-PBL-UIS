import { Timestamp } from 'firebase/firestore';

// Pengaturan deadline pendaftaran ujian, dokumen: settings/exam_registration.
// mode 'auto'  : ikuti jadwal open_at..close_at
// mode 'open'  : paksa buka (abaikan jadwal)
// mode 'closed': paksa tutup (abaikan jadwal)
// Dokumen belum ada / mode kosong dianggap TERBUKA agar kompatibel dengan
// perilaku lama sebelum fitur ini ada.
export interface ExamRegistrationSettings {
  mode?: 'auto' | 'open' | 'closed';
  open_at?: Timestamp | null;
  close_at?: Timestamp | null;
  note?: string;
}

export function isRegistrationOpen(
  s: ExamRegistrationSettings | null | undefined,
  now: Date = new Date()
): boolean {
  if (!s || !s.mode) return true;
  if (s.mode === 'open') return true;
  if (s.mode === 'closed') return false;
  const t = now.getTime();
  if (s.open_at && t < s.open_at.toDate().getTime()) return false;
  if (s.close_at && t >= s.close_at.toDate().getTime()) return false;
  return true;
}

export function formatDeadline(ts?: Timestamp | null): string {
  if (!ts) return '';
  return ts.toDate().toLocaleString('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

// Konversi Timestamp <-> nilai input datetime-local.
export function timestampToLocalInput(ts?: Timestamp | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function localInputToTimestamp(val: string): Timestamp | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}
