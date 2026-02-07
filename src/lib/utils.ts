import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generiert einen einfachen Hash für Duplikaterkennung bei Fragen.
 * 
 * Normalisiert den Text (lowercase, Whitespace-Trimming) und erzeugt
 * einen 32-Bit Hash. Geeignet für schnelle Duplikat-Checks, nicht für
 * kryptographische Zwecke.
 * 
 * @param text - Der Fragetext der gehasht werden soll
 * @returns Hash-String im Format "hash_<hex>"
 */
export function generateQuestionHash(text: string): string {
  let hash = 0;
  const str = text.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}
