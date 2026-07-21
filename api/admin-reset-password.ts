// Vercel Serverless Function: reset password langsung oleh Admin.
//
// Memakai Firebase Admin SDK HANYA untuk Auth (verifikasi ID token & set
// password) — modul firebase-admin/firestore sengaja TIDAK diimpor karena
// menarik dependensi gRPC/protobuf yang kerap gagal di-bundle di serverless
// Vercel dan membuat fungsi crash saat module-load (gejala: HTTP 500 dengan
// respons non-JSON). Akses Firestore dilakukan lewat REST API.
//
// Keamanan: pemanggil wajib menyertakan Firebase ID token (Authorization:
// Bearer <token>). Token diverifikasi, lalu role pemanggil dibaca dari
// Firestore — hanya Admin/AdminProdi aktif yang diizinkan, dan AdminProdi
// tidak boleh mereset akun Admin/AdminProdi (mengikuti firestore.rules).

import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const FIRESTORE_DATABASE_ID = 'ai-studio-ab4461e6-4024-404d-803b-03eb10d1fa0d';

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT belum dikonfigurasi di server.');
  }
  let creds: any;
  try {
    creds = JSON.parse(raw);
  } catch {
    creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  }
  // Normalisasi private_key: "\n" literal (akibat paste ke env var) -> baris
  // baru sungguhan. Idempoten.
  if (creds && typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return initializeApp({ credential: cert(creds), projectId: creds.project_id });
}

function getProjectId(app: App): string {
  return (app.options as any).projectId || (app.options as any).credential?.projectId || '';
}

async function getAccessToken(app: App): Promise<string> {
  const cred: any = (app.options as any).credential;
  const t = await cred.getAccessToken();
  return t.access_token;
}

function docBase(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${FIRESTORE_DATABASE_ID}/documents`;
}

// Ambil field string dari sebuah dokumen users lewat Firestore REST.
async function fetchUserFields(projectId: string, token: string, uid: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${docBase(projectId)}/users/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    throw new Error(`Firestore GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const j: any = await r.json();
  return j.fields || {};
}

const strField = (fields: Record<string, any> | null, key: string): string | undefined =>
  fields?.[key]?.stringValue;

async function setMustChangePassword(projectId: string, token: string, uid: string): Promise<void> {
  const url = `${docBase(projectId)}/users/${uid}?updateMask.fieldPaths=mustChangePassword`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { mustChangePassword: { booleanValue: true } } }),
  });
  if (!r.ok) {
    throw new Error(`Firestore PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const projectId = getProjectId(app);

    // 1. Verifikasi identitas pemanggil.
    const authHeader = String(req.headers.authorization || '');
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      res.status(401).json({ error: 'Unauthorized: token tidak ada.' });
      return;
    }
    const decoded = await adminAuth.verifyIdToken(idToken).catch(() => null);
    if (!decoded) {
      res.status(401).json({ error: 'Unauthorized: token tidak valid atau kadaluarsa.' });
      return;
    }

    // 2. Pastikan pemanggil adalah Admin/AdminProdi aktif (via Firestore REST).
    const token = await getAccessToken(app);
    const callerFields = await fetchUserFields(projectId, token, decoded.uid);
    const callerRole = strField(callerFields, 'role');
    const callerStatus = strField(callerFields, 'account_status');
    const isCallerAdmin = callerRole === 'Admin' && callerStatus === 'Active';
    const isCallerAdminProdi = callerRole === 'AdminProdi' && callerStatus === 'Active';
    if (!isCallerAdmin && !isCallerAdminProdi) {
      res.status(403).json({ error: 'Forbidden: hanya Admin yang dapat mereset password.' });
      return;
    }

    // 3. Validasi input.
    const targetUid = typeof req.body?.targetUid === 'string' ? req.body.targetUid.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!targetUid) {
      res.status(400).json({ error: 'targetUid wajib diisi.' });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 100) {
      res.status(400).json({ error: 'Password baru harus 6-100 karakter.' });
      return;
    }

    // 4. AdminProdi tidak boleh mereset akun Admin/AdminProdi.
    if (isCallerAdminProdi) {
      const targetFields = await fetchUserFields(projectId, token, targetUid);
      const targetRole = strField(targetFields, 'role');
      if (targetRole === 'Admin' || targetRole === 'AdminProdi') {
        res.status(403).json({ error: 'Forbidden: AdminProdi tidak dapat mereset akun Admin.' });
        return;
      }
    }

    // 5. Setel password baru dan wajibkan ganti password saat login berikutnya.
    await adminAuth.updateUser(targetUid, { password: newPassword });
    await setMustChangePassword(projectId, token, targetUid);

    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('admin-reset-password error:', err);
    if (err?.code === 'auth/user-not-found') {
      res.status(404).json({ error: 'Akun login (Firebase Auth) untuk pengguna ini tidak ditemukan.' });
      return;
    }
    if (err?.message && err.message.includes('FIREBASE_SERVICE_ACCOUNT')) {
      res.status(503).json({ error: err.message });
      return;
    }
    const detail = String(err?.code || err?.message || 'unknown').slice(0, 300);
    res.status(500).json({ error: `Terjadi kesalahan pada server: ${detail}` });
  }
}
