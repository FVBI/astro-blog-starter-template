// @ts-ignore — ?raw imports are typed by vite/client
import csvText from '../data/recipes.csv?raw';

export interface Recipe {
  id: string;
  name: string;
  page: string;
  season: string;
  book: string;
  kitchen: string;
  diet: string;
  cover: string;
  keywords: string[];
  score: number;
}

export const BOOK_COLORS: Record<string, [string, string]> = {
  'Ursula Schersch - Die Welt Im Einmach Glas':
    ['#d4883f', '#8c4d1a'],
  'Ali Güngörmüş - Meze Vegetarisch':
    ['#c94030', '#7a1a10'],
  'Niko Rittenau, Sebastian Copien - Vegan-Klischee ade! DAS KOCHBUCH':
    ['#3a9e6a', '#1a5a35'],
  'Tim Mälzer - Die Küche':
    ['#3a6090', '#1a2f50'],
  'DUMONTS KLEINES LEXIKON DER COCKTAILS':
    ['#9050b0', '#4a1a70'],
};

const DEFAULT_COLORS: [string, string] = ['#5a5a5a', '#2a2a2a'];

export function bookGradient(book: string): string {
  const [from, to] = BOOK_COLORS[book] ?? DEFAULT_COLORS;
  return `linear-gradient(160deg, ${from}, ${to})`;
}

const PALETTE: [string, string][] = [
  ['#d4883f', '#8c4d1a'],
  ['#c94030', '#7a1a10'],
  ['#3a9e6a', '#1a5a35'],
  ['#3a6090', '#1a2f50'],
  ['#9050b0', '#4a1a70'],
  ['#c0784a', '#7a3a1a'],
  ['#4a90a0', '#1a4a5a'],
  ['#b05070', '#6a1a30'],
  ['#6a8a30', '#3a5010'],
  ['#8a5030', '#4a2010'],
];

export function recipeGradient(id: string): string {
  const index = parseInt(id, 10) % PALETTE.length;
  const [from, to] = PALETTE[index];
  return `linear-gradient(160deg, ${from}, ${to})`;
}

// export function bookCover(book: string): string {
//   return `/bookcovers/${book}.jpg`;
// }

function parse(text: string): Recipe[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim());

  return lines.slice(1).map(line => {
    const cells = line.split(';').map(c => c.trim());
    const r: Record<string, string> = {};
    headers.forEach((h, i) => { r[h] = cells[i] ?? ''; });
    return {
      id:       (r['ID'] ?? '').padStart(5, '0'),
      name:     r['Recipe']   ?? '',
      page:     r['Page']     ?? '',
      season:   r['Season']   ?? '',
      book:     r['Book']     ?? '',
      kitchen:  r['Kitchen']  ?? '',
      diet:     r['Diet']     ?? '',
      cover:    r['Cover']    ?? '',
      keywords: r['Keywords']
        ? r['Keywords'].split(',').map(k => k.trim()).filter(Boolean)
        : [],
      score: parseInt(r['score'] ?? '0', 10) || 0,
    };
  }).filter(r => r.id && r.name);
}

export const recipes     = parse(csvText);
export const recipeMap   = new Map(recipes.map(r => [r.id, r]));
export const allBooks    = [...new Set(recipes.map(r => r.book).filter(Boolean))].sort();
export const allDiets    = [...new Set(recipes.map(r => r.diet).filter(Boolean))].sort();
export const allKitchens = [...new Set(recipes.map(r => r.kitchen).filter(Boolean))].sort();
