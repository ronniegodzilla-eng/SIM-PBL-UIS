# Periode PBL (Multi-Tahun)

PBL berlangsung sekali setahun. Sistem menyimpan setiap tahun sebagai satu
**periode** sehingga data tahun sebelumnya tetap utuh sebagai arsip, dan
tahun berikutnya dimulai tanpa menghapus apa pun.

## Model Data

| Lokasi | Isi |
|---|---|
| `periods/{periodId}` | `name`, `tahun_ajaran`, `status` (`Active`/`Closed`), `createdAt`, `closedAt`, serta pengaturan per periode: `requirements` (syarat berkas ujian/revisi), `exam_registration` (deadline pendaftaran ujian), `is_edit_active` (saklar edit nilai) |
| `settings/active_period` | `{ period_id }` — penunjuk periode aktif (satu-satunya sumber kebenaran) |
| `pbl_groups`, `group_members`, `logbooks`, `attendances`, `pbl_reports`, `exam_schedules`, `berita_acara`, `grades` | setiap dokumen membawa `period_id` |
| `group_members` | ID baru: `member_{periodId}_{uid}`; menyimpan nilai akhir yang dipublikasikan (`is_grade_published`, `final_score`, `letter_grade`) dan `carried_from` untuk mahasiswa yang mengulang |
| `users` | `pbl_status: 'Lulus'` + `pbl_period_id` untuk mahasiswa yang sudah lulus PBL |

`periodId` diturunkan dari tahun ajaran: `2026/2027` → `pbl-2026-2027`.
ID dokumen nilai baru diberi prefiks periode (`{periodId}_{uid}_{kategori}`)
agar nilai mahasiswa yang mengulang tidak menimpa nilai tahun sebelumnya;
dokumen lama tanpa prefiks tetap dipakai ulang bila sudah ada di periode itu.

Yang **tidak** per periode: akun pengguna, pengumuman, dan rubrik penilaian.

## Siapa Melihat Apa

- **Mahasiswa, dosen, pembimbing lapangan:** hanya periode aktif.
- **Admin / Admin Prodi:** periode aktif secara default; dapat memilih periode
  lama lewat pemilih periode di header (banner "arsip" akan tampil).
- **Halaman depan (publik):** periode aktif.

`firestore.rules` mengunci periode yang sudah ditutup: selain admin, penulisan
hanya diterima untuk dokumen dengan `period_id` = periode aktif.

## Pergantian Periode

Dilakukan admin di menu **Manajemen Periode** (lihat panduan admin bagian 7).
Ringkasnya: buat periode baru → mahasiswa yang lulus diberi `pbl_status: 'Lulus'`
→ mahasiswa belum lulus/tidak berprogres dibuatkan keanggotaan `Pending` di
periode baru (`carried_from` = periode lama) → periode lama ditutup →
`settings/active_period` dipindah. Seluruh langkah idempoten; bila proses
terputus, ulangi dengan data yang sama.

## Langkah Deploy Pertama Kali (Wajib Berurutan)

Data yang sudah ada belum memiliki `period_id`. Sampai langkah 3 selesai,
mahasiswa dan dosen tidak dapat menyimpan data, jadi lakukan di luar jam
aktif (± 10–15 menit).

1. **Publish `firestore.rules`** terbaru di Firebase Console
   (Firestore Database → pilih database → Rules → Publish).
2. **Deploy aplikasi** (merge ke branch produksi Vercel).
3. Login sebagai Admin → **Manajemen Periode** → isi tahun ajaran data saat
   ini (mis. `2025/2026`) → **Inisialisasi & Aktifkan**. Proses ini:
   - membuat periode dan menyalin pengaturan lama (`settings/requirements`,
     `settings/exam_registration`, `settings/main.is_edit_active`) ke periode;
   - menandai semua dokumen lama dengan `period_id`;
   - menyalin nilai yang sudah dipublikasikan dari `users` ke `group_members`;
   - mengaktifkan periode.
4. **Perbarui Google Apps Script** agar unggahan masuk ke subfolder per
   periode (lihat [SECURITY_SETUP.md](SECURITY_SETUP.md) bagian 2). Sebelum
   diperbarui, unggahan tetap berjalan ke folder utama.
5. Bila ada pengguna yang masih membuka tab lama saat pembaruan, jalankan
   **Periksa Data Tanpa Periode** di Manajemen Periode.

Dokumen `settings/requirements`, `settings/exam_registration`, dan field
`is_grade_published`/`final_score`/`letter_grade` di `users` tidak lagi dibaca
setelah inisialisasi; boleh dibiarkan.

## Keterbatasan yang Diketahui

- Rubrik penilaian berlaku global. Rincian nilai per kriteria (`rubric_scores`)
  periode lama akan ditampilkan dengan rubrik terkini; ubah rubrik setelah
  rekap nilai tahun sebelumnya selesai.
- Saat melihat arsip, admin tetap dapat mengubah data periode tersebut
  (disengaja, untuk koreksi). Peran lain terkunci oleh rules.
