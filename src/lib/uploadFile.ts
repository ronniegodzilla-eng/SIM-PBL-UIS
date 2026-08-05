import { auth } from '../firebase';

// Batas ukuran unggahan. Google Apps Script harus men-decode base64 penuh di
// memori (Utilities.base64Decode) dalam satu eksekusi — file besar (>10MB)
// sering membuat script kehabisan waktu/memori dan Google mengembalikan
// halaman error HTML alih-alih JSON, sehingga upload gagal dengan pesan yang
// membingungkan. Batas ini dijaga cukup rendah agar tetap aman di praktik,
// bukan sekadar batas teoretis Apps Script.
const MAX_FILE_MB = 10;

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
    throw new Error(`Ukuran file maksimal ${MAX_FILE_MB} MB. File "${file.name}" berukuran ${(file.size / 1024 / 1024).toFixed(1)} MB — kompres dulu (mis. pakai iLovePDF) sebelum diunggah.`);
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

  // Google Apps Script bisa mengembalikan halaman HTML (bukan JSON) saat
  // script gagal dieksekusi — paling sering karena file terlalu besar untuk
  // di-decode dalam satu eksekusi (timeout/kehabisan memori), atau izin
  // deployment script berubah. Deteksi ini secara eksplisit agar pesan yang
  // tampil jelas, bukan error mentah "Unexpected token '<'...".
  const rawText = await response.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error('Respons non-JSON dari Apps Script:', rawText.slice(0, 500));
    throw new Error(
      `Gagal mengunggah "${file.name}": server Google Drive tidak merespons dengan benar (kemungkinan file terlalu besar untuk diproses, atau eksekusi script kehabisan waktu). ` +
      `Coba kompres file agar lebih kecil (di bawah ${MAX_FILE_MB} MB), lalu unggah ulang. Jika masih gagal, hubungi admin untuk memeriksa Google Apps Script.`
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Gagal mengunggah ke Google Drive (HTTP ${response.status}).`);
  }
  return data.url;
}
