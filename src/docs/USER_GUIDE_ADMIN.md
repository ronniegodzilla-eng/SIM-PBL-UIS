# Panduan Pengguna (User Guide) - Sistem Informasi PBL
## Peran: Admin / Koordinator

Dokumen ini berisi panduan penggunaan Sistem Informasi Praktik Belajar Lapangan (PBL) khusus untuk peran **Admin** atau **Koordinator**.

---

### 1. Dashboard Admin

Setelah berhasil login, Anda akan diarahkan ke halaman [Dashboard](/dashboard). Di sini Anda dapat melihat ringkasan statistik aplikasi secara keseluruhan.

**Fitur pada Dashboard:**
*   **Statistik Total:** Melihat total mahasiswa, dosen, pembimbing lapangan, dan kelompok.
*   **Jalan Pintas (Shortcuts):** Card yang memudahkan Anda melompat langsung ke berbagai fitur manajemen.

---

### 2. Manajemen Pengguna & Staff

Sebagai admin, Anda bertanggung jawab mengelola data seluruh sivitas akademika yang terlibat dalam PBL.

*   **Manajemen User:** Melalui [Manajemen User](/manajemen-user), Anda dapat melihat daftar semua akun pengguna yang terdaftar di sistem. Anda juga dapat mengatur ulang password dengan mengklik tombol *Reset Password* pada pengguna tertentu.
*   **Manajemen Mahasiswa:** Tambah, edit, atau hapus data base mahasiswa di menu [Manajemen Mahasiswa](/manajemen-mahasiswa).
*   **Manajemen Staff:** Kelola data akun Dosen dan Pembimbing Lapangan melalui menu [Manajemen Staff](/manajemen-staff).

---

### 3. Manajemen Kelompok

Pengelompokan mahasiswa dan penugasan Dosen Pembimbing serta Pembimbing Lapangan dilakukan pada menu ini.
1. Pada menu navigasi utama, klik menu **[Manajemen Kelompok](/manajemen-kelompok)**.
2. Klik **Tambah Kelompok** untuk membuat kelompok baru dan plotting lokasinya.
3. Tambahkan mahasiswa ke dalam kelompok tersebut. (Pastikan mahasiswa sudah terdaftar di sistem).
4. Assign/Plotting Dosen Pembimbing dan Pembimbing Lapangan ke kelompok tersebut.

---

### 4. Manajemen Ujian

Mengatur jadwal, ploting ruangan, dan menugaskan dosen penguji untuk ujian akhir mahasiswa.
1. Masuk ke menu **[Manajemen Ujian](/manajemen-ujian)**.
2. Anda dapat membuat jadwal ujian baru dengan memilih kelompok yang akan ujian, mengisi tanggal/waktu, dan ruangan.
3. Tambahkan Dosen Penguji pada jadwal tersebut. Dosen yang bersangkutan akan menerima informasi jadwal ini di dashboard mereka.

---

### 5. Manajemen Rubrik Penilaian

Atur komponen-komponen penilaian yang akan digunakan oleh dosen, pembimbing lapangan, maupun untuk penilaian teman (peer).
1. Buka menu **[Manajemen Rubrik](/manajemen-rubrik)**.
2. Anda bisa memperbarui bobot, menambahkan kriteria, atau mengatur ulang struktur rubrik penilaian yang berlaku untuk periode PBL saat ini.

---

### 6. Rekapitulasi & Monitoring

Untuk mengawasi kegiatan secara terpusat, admin diberikan akses untuk melihat hasil dan kinerja:
*   **[Rekap Nilai](/rekap-nilai):** Melihat rekapitulasi nilai akhir dari seluruh komponen (Pembimbing, Penguji, Pembimbing Lapangan, dan Peer Assessment). Anda juga dapat mempublikasikan (publish) nilai agar dapat dilihat oleh mahasiswa.
*   **[Monitoring Kinerja](/monitoring-kinerja):** Memantau progres kehadiran dan logbook mahasiswa secara kolektif tanpa harus mengecek satu persatu di akun dosen.
*   **[Berita Acara](/berita-acara):** Generate atau kelola berita acara setelah ujian dilaksanakan.

---
---

## FAQ (Frequently Asked Questions) - Admin

**Q: Mahasiswa/Dosen lupa passwordnya, bagaimana cara mengatasinya?**
A: Anda dapat mereset kata sandi mereka melalui menu [Manajemen User](/manajemen-user). Cari nama atau email pengguna yang bersangkutan, kemudian pada kolom aksi (actions), klik tombol 'Reset Password'. Sistem akan menetapkan passowrd default (contoh: `pbl123456`) yang harus mereka ganti setelah berhasil login.

**Q: Bagaimana cara mendaftarkan secara massal mahasiswa (import data)?**
A: Saat ini, penambahan pengguna/mahasiswa harus dilakukan melalui sistem registrasi independen oleh mahasiswa atau diinput manual oleh Admin.

**Q: Kapan saya harus melakukan "Publish" nilai mahasiswa?**
A: Anda sebaiknya melakukan finalisasi/publish nilai setelah semua komponen (Nilai Bimbingan, Nilai Lapangan, Nilai Ujian, dan Penilaian Teman) bagi kelompok tersebut lengkap.

**Q: Bagaimana jika jadwal ujian bentrok (ruangan / dosen)?**
A: Sistem secara default tidak membatasi booking hard-conflict jika ada urgensi. Admin diharapkan memastikan manual alokasi ruang dan dosen penguji pada saat entry data.
