import { auth } from '../firebase';

// Batas ukuran unggahan (Apps Script sanggup jauh lebih besar, tapi kita batasi
// agar encode base64 di browser tidak membekukan tab).
const MAX_FILE_MB = 20;

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Unggah file ke Google Drive melalui endpoint Google Apps Script.
 *
 * Payload menyertakan Firebase ID token milik pengguna yang sedang login,
 * sehingga Apps Script (lihat docs/SECURITY_SETUP.md) dapat memverifikasi
 * token tersebut dan menolak unggahan dari pihak yang tidak terautentikasi.
 */
export async function uploadToGoogleDrive(file: File, prefix: string): Promise<string> {
  const scriptUrl = (import.meta as any).env?.VITE_APPS_SCRIPT_URL;
  if (!scriptUrl) {
    throw new Error('URL Google Apps Script belum dikonfigurasi di Environment Variables.');
  }

  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`Ukuran file maksimal ${MAX_FILE_MB} MB.`);
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('Anda harus login untuk mengunggah file.');
  }
  const idToken = await user.getIdToken();

  const base64 = await fileToBase64(file);
  const filename = `${prefix}_${Date.now()}_${file.name}`;

  const response = await fetch(scriptUrl, {
    method: 'POST',
    body: JSON.stringify({
      filename: filename,
      mimeType: file.type,
      base64: base64,
      idToken: idToken
    }),
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    }
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Gagal mengunggah ke Google Drive');
  }
  return data.url;
}
