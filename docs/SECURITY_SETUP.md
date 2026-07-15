# Panduan Konfigurasi Keamanan

Dokumen ini menjelaskan langkah konfigurasi yang **wajib** dilakukan setelah
perubahan keamanan pada aplikasi (proxy Gemini & pengamanan endpoint upload).

## 1. API Key Gemini (chatbot Asisten AI)

Panggilan Gemini kini melalui serverless function `api/chat.ts` (Vercel).
API key **tidak lagi** disuntikkan ke bundle browser.

Langkah:

1. **Rotasi key lama.** Key yang lama sudah pernah terkirim ke browser semua
   pengunjung (tertanam di bundle build sebelumnya), jadi anggap bocor.
   Buat key baru di [Google AI Studio](https://aistudio.google.com/apikey),
   lalu hapus/nonaktifkan key lama.
2. Di dashboard **Vercel → Project → Settings → Environment Variables**,
   tambahkan `GEMINI_API_KEY` dengan key baru (environment: Production &
   Preview). **Jangan** memakai prefix `VITE_` — variabel dengan prefix itu
   ikut terkirim ke browser.
3. Redeploy.

Catatan pengembangan lokal: `npm run dev` (Vite) tidak menyajikan `/api`,
sehingga chatbot akan menampilkan pesan error saat dev lokal. Gunakan
`vercel dev` bila perlu menguji chatbot secara lokal.

## 2. Endpoint Upload Google Apps Script

Klien kini menyertakan **Firebase ID token** (`idToken`) pada setiap payload
upload. Perbarui kode Apps Script Anda agar memverifikasi token tersebut dan
menolak permintaan tanpa login — tanpa ini, siapa pun yang menemukan URL
script dapat mengunggah file sesukanya ke Drive Anda.

Contoh `doPost` yang sudah diamankan (sesuaikan bagian penyimpanan file
dengan script Anda yang sekarang):

```javascript
// Web API key project Firebase (boleh publik, bukan rahasia).
var FIREBASE_API_KEY = 'AIzaSyDnvT7sLQGnGsGPVVAG9MxOfrjzLKie1wA';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // === Verifikasi Firebase ID token ===
    if (!body.idToken) {
      return jsonOutput({ success: false, error: 'Unauthorized: token tidak ada.' });
    }
    var verifyResp = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ idToken: body.idToken }),
        muteHttpExceptions: true
      }
    );
    if (verifyResp.getResponseCode() !== 200) {
      return jsonOutput({ success: false, error: 'Unauthorized: token tidak valid.' });
    }
    // ====================================

    var folder = DriveApp.getFolderById('ID_FOLDER_DRIVE_ANDA');
    var blob = Utilities.newBlob(
      Utilities.base64Decode(body.base64), body.mimeType, body.filename
    );
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonOutput({ success: true, url: file.getUrl() });
  } catch (err) {
    return jsonOutput({ success: false, error: String(err) });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Setelah mengubah script: **Deploy → Manage deployments → Edit → New version**
agar versi baru aktif di URL yang sama.

Kompatibilitas: sebelum script diperbarui, field `idToken` ekstra hanya
diabaikan — upload tetap berjalan. Verifikasi baru berlaku begitu script
versi baru di-deploy.

## 3. Reset Password Langsung oleh Admin (`api/admin-reset-password.ts`)

Fitur "Setel Password Langsung" di Manajemen User memakai **Firebase Admin
SDK** di serverless function, sehingga membutuhkan kredensial service
account:

1. Buka **Firebase Console → Project settings (ikon gerigi) → Service
   accounts**.
2. Klik **Generate new private key** → file JSON akan terunduh.
3. Buka file JSON itu, salin **seluruh isinya**.
4. Di **Vercel → Project → Settings → Environment Variables**, buat variabel
   `FIREBASE_SERVICE_ACCOUNT` dan tempelkan seluruh JSON tadi sebagai
   nilainya (environment: Production & Preview).
5. Redeploy.

> ⚠️ File JSON service account adalah **kunci akses penuh** ke project
> Firebase Anda. Jangan pernah menaruhnya di repositori, di kode frontend,
> atau variabel berprefix `VITE_`. Setelah dipasang di Vercel, hapus file
> unduhannya dari komputer.

Keamanan endpoint: setiap permintaan wajib membawa Firebase ID token; server
memverifikasi token lalu mengecek role pemanggil di Firestore — hanya
Admin/AdminProdi aktif yang dilayani, dan AdminProdi tidak dapat mereset
akun Admin. Password yang disetel otomatis menandai `mustChangePassword`
sehingga pengguna wajib menggantinya saat login.

## 4. Variabel Environment — Ringkasan

| Variabel | Lokasi | Terekspos ke browser? |
|---|---|---|
| `GEMINI_API_KEY` | Vercel (server) | Tidak — jangan beri prefix `VITE_` |
| `FIREBASE_SERVICE_ACCOUNT` | Vercel (server) | Tidak — SANGAT rahasia |
| `VITE_APPS_SCRIPT_URL` | Vercel / `.env.local` | Ya (by design) — aman karena script memverifikasi ID token |
