import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, secondaryAuth } from '../../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { UserRole } from '../../contexts/AuthContext';
import { Upload } from 'lucide-react';
import { generateTempPassword } from '../../lib/utils';

export const BulkImportUsers = () => {
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        let successCount = 0;
        let errorCount = 0;
        // Kredensial per akun (password sementara acak, bukan seragam) untuk
        // diunduh admin dan didistribusikan secara aman.
        const createdCredentials: { name: string; email: string; password: string }[] = [];

        for (const row of data as any[]) {
          try {
            if (!row.email || !row.name || !row.role) {
              errorCount++;
              continue;
            }

            // Simple validation
            const role = row.role as UserRole;
            const validRoles = ['Mahasiswa', 'Admin', 'AdminProdi', 'Dosen', 'PembimbingLapangan'];
            if (!validRoles.includes(role)) {
              errorCount++;
              continue;
            }

            // Create user in secondary auth app
            const tempPassword = generateTempPassword();
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, row.email, tempPassword);
            const newUserId = userCredential.user.uid;
            
            const userData: any = {
              uid: newUserId,
              name: row.name,
              email: row.email,
              role: role,
              account_status: 'Active',
              mustChangePassword: true,
              createdAt: new Date().toISOString()
            };

            if (role === 'Mahasiswa') {
               // Only apply if prodi exists and valid
               if (row.prodi && ['S1 Kesehatan dan Keselamatan Kerja', 'S1 Kesehatan Lingkungan'].includes(row.prodi)) {
                 userData.prodi = row.prodi;
               }
               // Only apply if jalur exists and valid
               if (row.jalur && ['Reg A', 'Reg B', 'Reg C', 'RPL'].includes(row.jalur)) {
                 userData.jalur = row.jalur;
               }
            }

            await setDoc(doc(db, 'users', newUserId), userData);
            createdCredentials.push({ name: row.name, email: row.email, password: tempPassword });
            successCount++;
          } catch (err) {
            console.error("Error importing row", row, err);
            errorCount++;
          }
        }

        // Sign out from secondary auth
        await signOut(secondaryAuth);

        // Unduh daftar kredensial — satu-satunya kesempatan melihat password
        // sementara ini; tidak disimpan di mana pun.
        if (createdCredentials.length > 0) {
          const credWs = XLSX.utils.json_to_sheet(createdCredentials.map(c => ({
            'Nama': c.name,
            'Email': c.email,
            'Password Sementara': c.password
          })));
          const credWb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(credWb, credWs, 'Kredensial');
          XLSX.writeFile(credWb, `Kredensial_Import_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }

        toast.success(`Import selesai: ${successCount} berhasil, ${errorCount} gagal. File kredensial (password sementara per akun) otomatis terunduh — simpan dan bagikan secara aman, lalu hapus.`, { duration: 60000 });
      } catch (error) {
        console.error("Error parsing Excel", error);
        toast.error('Gagal membaca file Excel. Pastikan formatnya benar.');
      } finally {
        setIsImporting(false);
        // Reset input
        e.target.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { name: 'John Doe', email: 'john@example.com', role: 'Mahasiswa' },
      { name: 'Jane Smith', email: 'jane@example.com', role: 'Dosen' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Import_Akun.xlsx");
  };

  return (
    <div className="flex items-center gap-4">
      <Button variant="outline" onClick={downloadTemplate}>
        Download Template
      </Button>
      <div className="relative">
        <Input 
          type="file" 
          accept=".xlsx, .xls" 
          onChange={handleFileUpload} 
          disabled={isImporting}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <Button disabled={isImporting}>
          <Upload className="w-4 h-4 mr-2" />
          {isImporting ? 'Mengimpor...' : 'Import Excel'}
        </Button>
      </div>
    </div>
  );
};
