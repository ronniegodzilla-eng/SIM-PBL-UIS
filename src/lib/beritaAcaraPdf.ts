import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface BeritaAcaraPdfInput {
  berita: any;              // dokumen berita_acara
  group: any;               // dokumen pbl_groups
  students: any[];          // anggota kelompok (dokumen users)
  dosenName: string;        // nama dosen penanda tangan
}

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const beritaAcaraTitle = (berita: any): string =>
  berita?.type === 'Insidental' ? (berita.title || 'Kegiatan Insidental') : berita?.type || 'Kegiatan';

/**
 * Gambar satu berita acara pada halaman aktif dokumen PDF.
 * Dipakai bersama oleh modul Berita Acara (dosen) dan Monitoring Kinerja
 * (admin, gabungan per dosen per kegiatan).
 */
export function drawBeritaAcara(doc: jsPDF, { berita, group, students, dosenName }: BeritaAcaraPdfInput): void {
  const displayType = beritaAcaraTitle(berita);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`BERITA ACARA DAN ${displayType.toUpperCase()} PBL`, 105, 20, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  const startY = 35;
  const dateObj = new Date(berita.date);
  const dayName = DAYS[dateObj.getDay()];
  const formattedDate = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const studyProgramRaw =
    group?.prodi && group.prodi !== 'Semua'
      ? group.prodi
      : 'Ilmu Kesehatan Masyarakat / Keselamatan dan Kesehatan Kerja';

  const splitHeader = doc.splitTextToSize(
    `Telah dilaksanakan kegiatan ${displayType} Pengalaman Belajar Lapangan (PBL) Program Studi ${studyProgramRaw}`,
    180
  );
  doc.text(splitHeader, 14, startY);

  const contentStartY = startY + splitHeader.length * 5 + 5;

  doc.text(`Hari/Tanggal : ${dayName} / ${formattedDate}`, 14, contentStartY);
  doc.text(`Waktu        : ${berita.time}`, 14, contentStartY + 6);
  doc.text(`Tempat       : ${berita.location}`, 14, contentStartY + 12);
  doc.text(`Kelompok     : ${group?.group_name || '-'}`, 14, contentStartY + 18);

  // Kehadiran dosen pembimbing pada kegiatan ini.
  const hadirLabel =
    berita.dosen_hadir === true ? 'Hadir' : berita.dosen_hadir === false ? 'Tidak Hadir' : 'Belum dikonfirmasi';
  doc.text(`Dosen Pembimbing : ${dosenName} (${hadirLabel})`, 14, contentStartY + 24);

  doc.text('Catatan /Ringkasan:', 14, contentStartY + 34);
  const splitNotes = doc.splitTextToSize(berita.notes || '-', 180);
  doc.text(splitNotes, 14, contentStartY + 40);

  let nextY = contentStartY + 40 + splitNotes.length * 5 + 10;

  const dokumentasiLinks = berita.dokumentasi_urls || (berita.dokumentasi_url ? [berita.dokumentasi_url] : []);
  if (dokumentasiLinks.length > 0) {
    doc.text('Link Dokumentasi:', 14, nextY);
    nextY += 6;
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 255);
    for (const link of dokumentasiLinks) {
      const splitLink = doc.splitTextToSize(link, 180);
      doc.text(splitLink, 14, nextY);
      nextY += splitLink.length * 4 + 2;
    }
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    nextY += 4;
  }

  doc.text('Daftar Hadir Mahasiswa:', 14, nextY);

  const tableData = students.map((s, index) => [
    index + 1,
    s.id_number || s.student_id || '-',
    s.name,
    berita.attendances?.[s.id] ? 'Hadir' : 'Tidak Hadir',
  ]);

  autoTable(doc, {
    startY: nextY + 5,
    head: [['No', 'NIM', 'Nama Mahasiswa', 'Keterangan']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [41, 128, 185] },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 20;
  doc.text('Mengetahui,', 140, finalY);
  doc.text('Dosen / Pembimbing', 140, finalY + 6);
  doc.text(`(${dosenName})`, 140, finalY + 25);
}

/**
 * Buat PDF dari satu atau beberapa berita acara (tiap berita acara pada
 * halaman terpisah) lalu unduh.
 */
export function generateBeritaAcaraPdf(inputs: BeritaAcaraPdfInput[], filename: string): void {
  const doc = new jsPDF();
  inputs.forEach((input, idx) => {
    if (idx > 0) doc.addPage();
    drawBeritaAcara(doc, input);
  });
  doc.save(filename);
}
