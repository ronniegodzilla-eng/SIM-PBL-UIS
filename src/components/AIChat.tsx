import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Sparkles, X, Send, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';

// Try to initialize Gemini API. Error will be caught in generation if missing.
let ai: GoogleGenAI | null = null;
try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
  }
} catch (error) {
  console.error("Failed to initialize GoogleGenAI", error);
}

interface Message {
  role: 'user' | 'model';
  content: string;
}

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

const CHAT_STORAGE_KEY = 'pbl_ai_chat_history';

export const AIChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history");
      }
    }
    return [
      { role: 'model', content: 'Halo! Saya Asisten AI PBL. Ada yang bisa saya bantu terkait penggunaan sistem atau alur Praktik Belajar Lapangan ini?' }
    ];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim()) return;

    if (!ai) {
      setMessages(prev => [...prev, 
        { role: 'user', content: inputMessage },
        { role: 'model', content: 'Maaf, API Key Gemini tidak ditemukan atau belum dikonfigurasi pada environment `process.env.GEMINI_API_KEY`. Silakan hubungi administrator.' }
      ]);
      setInputMessage('');
      return;
    }

    const newMessage: Message = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Create chat history format for gemini
      const chatHistory = messages.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      // Set up the chat session
      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });
      
      // Since ai.chats.create does not take history directly in this version based on docs, 
      // we'll use a simpler approach: passing history to contents or generating a single prompt with history.
      // Better yet, according to the latest SDK, ai.chats doesn't immediately let us pass history on create in the basic example,
      // but we can pass history in generateContent, OR just pass history to chats.
      
      const contents = [
        ...messages.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        })),
        { role: 'user', parts: [{ text: newMessage.content }] }
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        }
      });

      const text = response.text;
      if (text) {
        setMessages(prev => [...prev, { role: 'model', content: text }]);
      }
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'model', content: 'Maaf, terjadi kesalahan saat memproses pesan Anda. Coba lagi nanti.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      { role: 'model', content: 'Halo! Saya Asisten AI PBL. Ada yang bisa saya bantu terkait penggunaan sistem atau alur Praktik Belajar Lapangan ini?' }
    ]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
  };

  return (
    <>
      {/* Floating Action Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed right-0 top-1/2 -translate-y-1/2 shadow-2xl transition-all duration-300 z-50 flex items-center justify-center rounded-l-2xl rounded-r-none p-0",
          isOpen ? "bg-slate-700 hover:bg-slate-800 w-12 h-12" : "bg-primary hover:bg-primary/90 hover:-translate-x-1 w-12 h-auto py-6 border border-r-0 border-white/20"
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Sparkles className="h-5 w-5 text-white shrink-0" />
            <span className="text-white font-medium tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Asisten AI</span>
          </div>
        )}
      </Button>

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed right-14 top-1/2 -translate-y-1/2 w-80 sm:w-96 h-[600px] max-h-[85vh] shadow-2xl flex flex-col z-50 animate-in slide-in-from-right-5 fade-in zoom-in-95 duration-200 border-2 border-primary/20">
          <CardHeader className="p-4 border-b bg-primary text-primary-foreground rounded-t-xl flex flex-row items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">Asisten AI PBL</CardTitle>
              <p className="text-xs text-primary-foreground/80 font-normal">Tanya seputar panduan sistem</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleClearChat} className="h-8 w-8 p-0 text-primary-foreground hover:bg-white/20 hover:text-white" title="Hapus Riwayat Chat">
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-8 w-8 p-0 text-primary-foreground hover:bg-white/20 hover:text-white" title="Tutup">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "flex w-full",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div 
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === 'user' 
                      ? "bg-primary text-primary-foreground rounded-br-sm" 
                      : "bg-white border text-slate-800 rounded-bl-sm shadow-sm"
                  )}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="prose prose-sm prose-p:my-1 prose-ul:my-1 prose-slate">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start w-full">
                <div className="bg-white border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 shadow-sm text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Asisten sedang mengetik...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          <CardFooter className="p-3 border-t bg-white rounded-b-xl">
            <form onSubmit={handleSendMessage} className="flex w-full gap-2 items-center">
              <Input
                placeholder="Tanyakan sesuatu..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 focus-visible:ring-primary shadow-sm"
                disabled={isLoading}
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!inputMessage.trim() || isLoading}
                className="shrink-0 rounded-full"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </>
  );
};
