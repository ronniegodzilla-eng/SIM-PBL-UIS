// Vercel Serverless Function: reset password langsung oleh Admin.
//
// Firebase client SDK tidak mengizinkan mengubah password user lain, jadi
// endpoint ini memakai Firebase Admin SDK. Kredensialnya diambil dari env
// FIREBASE_SERVICE_ACCOUNT (JSON service account — lihat docs/SECURITY_SETUP.md).
//
// Keamanan: pemanggil harus menyertakan Firebase ID token (Authorization:
// Bearer <token>). Token diverifikasi, lalu role pemanggil dibaca dari
// Firestore — hanya Admin/AdminProdi yang diizinkan, dan AdminProdi tidak
// boleh mereset akun Admin/AdminProdi (mengikuti firestore.rules).

import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT belum dikonfigurasi di server.');
  }
  // Terima JSON mentah maupun base64 dari JSON tersebut.
  let creds: any;
  try {
    creds = JSON.parse(raw);
  } catch {
    creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  }
  return initializeApp({ credential: cert(creds), projectId: creds.project_id });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let app: App;
  try {
    app = getAdminApp();
  } catch (err: any) {
    res.status(503).json({ error: err.message || 'Server belum dikonfigurasi.' });
    return;
  }

  const adminAuth = getAuth(app);
  const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

  try {
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

    // 2. Pastikan pemanggil adalah Admin/AdminProdi aktif.
    const callerSnap = await db.doc(`users/${decoded.uid}`).get();
    const caller = callerSnap.exists ? (callerSnap.data() as any) : null;
    const callerRole = caller?.role;
    const isCallerAdmin = callerRole === 'Admin' && caller?.account_status === 'Active';
    const isCallerAdminProdi = callerRole === 'AdminProdi' && caller?.account_status === 'Active';
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
    const targetSnap = await db.doc(`users/${targetUid}`).get();
    const targetRole = targetSnap.exists ? (targetSnap.data() as any)?.role : null;
    if (isCallerAdminProdi && (targetRole === 'Admin' || targetRole === 'AdminProdi')) {
      res.status(403).json({ error: 'Forbidden: AdminProdi tidak dapat mereset akun Admin.' });
      return;
    }

    // 5. Setel password baru dan wajibkan ganti password saat login berikutnya.
    await adminAuth.updateUser(targetUid, { password: newPassword });
    await db.doc(`users/${targetUid}`).set({ mustChangePassword: true }, { merge: true });

    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('admin-reset-password error:', err);
    if (err?.code === 'auth/user-not-found') {
      res.status(404).json({ error: 'Akun login (Firebase Auth) untuk pengguna ini tidak ditemukan.' });
      return;
    }
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
}
