import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Buat password sementara yang acak untuk akun baru — mengganti password
 * default seragam ("ubahsaya") yang mudah ditebak siapa pun.
 * Karakter ambigu (0/O, 1/l/I) sengaja dihindari agar mudah disalin.
 */
export function generateTempPassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[values[i] % chars.length];
  }
  return out;
}
