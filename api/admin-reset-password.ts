// Vercel Serverless Function: reset password langsung oleh Admin.
//
// Implementasi TANPA dependensi berat (tidak memakai firebase-admin): hanya
// modul bawaan Node ('crypto') + fetch global. Ini menghindari kegagalan
// bundling firebase-admin di serverless Vercel yang membuat fungsi crash saat
// module-load (gejala: HTTP 500 dengan respons non-JSON).
//
// Alur: verifikasi Firebase ID token pemanggil (RS256 terhadap sertifikat
// publik Google) -> cek role pemanggil di Firestore (REST) -> set password
// via Identity Toolkit Admin REST -> tandai mustChangePassword (Firestore REST).
// Hanya Admin/AdminProdi aktif yang diizinkan; AdminProdi tidak boleh mereset
// akun Admin/AdminProdi.

import * as crypto from 'crypto';

const FIRESTORE_DATABASE_ID = 'ai-studio-ab4461e6-4024-404d-803b-03eb10d1fa0d';

function getCreds(): any {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT belum dikonfigurasi di server.');
  let creds: any;
  try {
    creds = JSON.parse(raw);
  } catch {
    creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  }
  if (creds && typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  if (!creds.client_email || !creds.private_key || !creds.project_id) {
    throw new Error('Service account tidak lengkap (butuh client_email, private_key, project_id).');
  }
  return creds;
}

const b64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlDecode = (str: string): Buffer => {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
};

// OAuth2 access token dari service account (JWT bearer, ditandatangani lokal).
async function getAccessToken(creds: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const input = `${header}.${claim}`;
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(input), creds.private_key));
  const assertion = `${input}.${signature}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(`OAuth token ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  }
  return j.access_token;
}

// Sertifikat publik Google untuk memverifikasi Firebase ID token.
let certCache: { keys: Record<string, string>; exp: number } | null = null;
async function getGoogleCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.exp > Date.now()) return certCache.keys;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const keys: any = await r.json();
  const cc = r.headers.get('cache-control') || '';
  const m = cc.match(/max-age=(\d+)/);
  certCache = { keys, exp: Date.now() + (m ? parseInt(m[1], 10) * 1000 : 3600 * 1000) };
  return keys;
}

async function verifyIdToken(idToken: string, projectId: string): Promise<{ uid: string } | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let header: any, payload: any;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || !header.kid) return null;
  if (!payload.exp || payload.exp <= now) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub) return null;

  const certs = await getGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) return null;
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  if (!verifier.verify(cert, b64urlDecode(parts[2]))) return null;
  return { uid: payload.sub };
}

const docBase = (projectId: string): string =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${FIRESTORE_DATABASE_ID}/documents`;

async function fetchUserFields(projectId: string, token: string, uid: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${docBase(projectId)}/users/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
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
  if (!r.ok) throw new Error(`Firestore PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// Set password via Identity Toolkit Admin REST (OAuth service account).
async function updateUserPassword(projectId: string, token: string, uid: string, password: string): Promise<void> {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, password }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = JSON.stringify(j);
    if (msg.includes('USER_NOT_FOUND')) throw { code: 'auth/user-not-found' };
    throw new Error(`Auth update ${r.status}: ${msg.slice(0, 200)}`);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const creds = getCreds();
    const projectId: string = creds.project_id;

    // 1. Verifikasi identitas pemanggil.
    const authHeader = String(req.headers.authorization || '');
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      res.status(401).json({ error: 'Unauthorized: token tidak ada.' });
      return;
    }
    const decoded = await verifyIdToken(idToken, projectId);
    if (!decoded) {
      res.status(401).json({ error: 'Unauthorized: token tidak valid atau kadaluarsa.' });
      return;
    }

    // Body bisa berupa objek (sudah di-parse Vercel) atau string.
    let body: any = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    const token = await getAccessToken(creds);

    // 2. Pastikan pemanggil Admin/AdminProdi aktif.
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
    const targetUid = typeof body.targetUid === 'string' ? body.targetUid.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
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

    // 5. Setel password baru & wajibkan ganti password saat login berikutnya.
    await updateUserPassword(projectId, token, targetUid, newPassword);
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
