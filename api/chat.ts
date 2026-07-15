// Vercel Serverless Function: proxy aman ke Gemini API.
// API key TIDAK pernah dikirim ke browser — set GEMINI_API_KEY di
// Environment Variables project Vercel (tanpa prefix VITE_).

const SYSTEM_INSTRUCTION = `
Anda adalah Asisten AI untuk Sistem Manajemen Praktik Belajar Lapangan (PBL).
Tugas Anda adalah membantu Mahasiswa, Dosen Pembimbing, Pembimbing Lapangan, Dosen Penguji, Admin, serta pengunjung yang belum login dalam menggunakan sistem ini.
Sistem ini memiliki fitur:
- Manajemen Kelompok PBL & Mahasiswa
- Jurnal/Logbook Harian (diisi Mahasiswa, disetujui Pembimbing Lapangan/Dosen)
- Absensi (diisi Mahasiswa, disetujui Pembimbing Lapangan/Dosen)
- Penilaian (dilakukan oleh Dosen Pembimbing, Pembimbing Lapangan, Penguji, dan Teman Sejawat/Peer Review)
- Rekapitulasi Nilai

Berikan jawaban yang ramah, ringkas, informatif, dan membantu dengan format markdown.
Gunakan bahasa Indonesia yang profesional.
`;

// Pagar pemakaian: batasi riwayat & panjang pesan agar endpoint publik ini
// tidak bisa dipakai untuk membakar kuota secara berlebihan.
const MAX_MESSAGES = 20;
const MAX_CHARS_PER_MESSAGE = 4000;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY belum dikonfigurasi di server. Hubungi administrator.' });
    return;
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const contents = messages
    .slice(-MAX_MESSAGES)
    .filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'model'))
    .map((m: any) => ({
      role: m.role,
      parts: [{ text: String(m.content).slice(0, MAX_CHARS_PER_MESSAGE) }],
    }));

  if (contents.length === 0) {
    res.status(400).json({ error: 'Pesan kosong.' });
    return;
  }

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          generationConfig: { temperature: 0.7 },
        }),
      }
    );

    const data: any = await upstream.json();
    if (!upstream.ok) {
      console.error('Gemini API error:', data);
      res.status(502).json({ error: 'Layanan AI sedang bermasalah. Coba lagi nanti.' });
      return;
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p.text || '')
      .join('');

    res.status(200).json({ text });
  } catch (err) {
    console.error('Chat proxy error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
}
