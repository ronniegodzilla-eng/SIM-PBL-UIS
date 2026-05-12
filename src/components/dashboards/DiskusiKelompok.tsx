import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../ui/card';
import { toast } from 'sonner';

export const DiskusiKelompok = ({ groupId }: { groupId: string }) => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    if (!groupId) return;

    // Fetch messages
    const q = query(collection(db, 'group_discussions'), where('group_id', '==', groupId));
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: any[] = [];
      snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(msgs);
    }, error => handleFirestoreError(error, OperationType.LIST, 'group_discussions'));

    // Fetch group details
    import('firebase/firestore').then(({ doc, getDoc }) => {
      getDoc(doc(db, 'pbl_groups', groupId)).then(docSnap => {
        if (docSnap.exists()) {
          setGroupName(docSnap.data().group_name || `Kelompok ${groupId}`);
        } else {
          setGroupName(`Kelompok ${groupId}`);
        }
      }).catch(err => console.error("Failed to fetch group", err));
    });

    return () => unsub();
  }, [groupId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    try {
      setLoading(true);
      const docId = `msg_${groupId}_${Date.now()}`;
      await setDoc(doc(db, 'group_discussions', docId), {
        group_id: groupId || 'unknown',
        author_id: profile.uid,
        author_name: profile.name || 'User',
        author_role: profile.role || 'Member',
        message: newMessage.trim(),
        createdAt: new Date().toISOString()
      });
      setNewMessage('');
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.CREATE, 'group_discussions');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  if (!groupId) return null;

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader>
        <CardTitle>Ruang Diskusi: {groupName || 'Memuat...'}</CardTitle>
        <CardDescription>Diskusi dan komentar kelompok bersama dosen pembimbing.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-4 pt-0">
        <div className="h-full overflow-y-auto pr-4 flex flex-col space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-slate-500 py-4">Belum ada diskusi. Mulai percakapan pertama!</div>
            ) : (
              messages.map(msg => {
                const isMe = msg.author_id === profile?.uid;
                return (
                  <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-3 max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className="flex-shrink-0 mt-1 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {getInitials(msg.author_name)}
                      </div>
                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-700">{msg.author_name}</span>
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {msg.author_role}
                          </span>
                        </div>
                        <div className={`px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                          isMe ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'
                        }`}>
                          {msg.message}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1">
                          {new Date(msg.createdAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
        </div>
      </CardContent>
      <CardFooter className="pt-4 border-t">
        <form onSubmit={handleSendMessage} className="flex w-full gap-2 pl-2 pr-2">
          <Input 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Ketik pesan..."
            className="flex-1"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !newMessage.trim()}>
            Kirim
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};
