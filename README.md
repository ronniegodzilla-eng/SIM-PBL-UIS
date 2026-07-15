# SI PBL FIKES — Sistem Informasi Praktik Belajar Lapangan

Sistem Informasi PBL Fakultas Ilmu Kesehatan Universitas Ibnu Sina: mengelola
siklus PBL dari pembentukan kelompok, logbook & absensi harian, bimbingan
laporan, pendaftaran & penjadwalan ujian, hingga penilaian dan rekap nilai.

## Teknologi

- **Frontend:** React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui
- **Backend:** Firebase (Auth, Firestore) + Vercel Serverless (`api/`)
- **Penyimpanan berkas:** Google Drive via Google Apps Script
- **Chatbot:** Gemini API (via proxy server `api/chat.ts`)

## Menjalankan Secara Lokal

Prasyarat: Node.js 18+

```bash
npm install
npm run dev        # buka http://localhost:3000
```

Buat `.env.local` untuk fitur upload berkas:

```
VITE_APPS_SCRIPT_URL=<URL web app Google Apps Script>
```

> Catatan: chatbot Asisten AI memakai serverless function `/api/chat` yang
> tidak tersedia di `npm run dev`. Gunakan `vercel dev` bila perlu mengujinya
> secara lokal.

## Deploy

Aplikasi di-deploy ke **Vercel**. Environment variable yang dibutuhkan dan
langkah pengamanan endpoint upload dijelaskan di
[docs/SECURITY_SETUP.md](docs/SECURITY_SETUP.md).

Aturan akses data ada di `firestore.rules` — setiap perubahan file ini harus
di-publish manual ke Firebase Console (Firestore Database → pilih database
`ai-studio-ab4461e6-...` → Rules).

## Struktur Proyek

```
api/                  Serverless functions (proxy Gemini)
src/
  components/         Komponen UI & dashboard per fitur
  contexts/           AuthContext (login, profil, peran)
  pages/              Halaman per route
  lib/                Utilitas (upload berkas, dsb.)
  docs/               Panduan pengguna per peran
firestore.rules       Aturan akses Firestore
```

## Verifikasi

```bash
npm run lint    # type-check (tsc --noEmit)
npm run build   # build produksi
```
