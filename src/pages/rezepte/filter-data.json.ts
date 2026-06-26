import type { APIRoute } from 'astro';
import { recipes } from '../../lib/recipes';

export const prerender = true;

export const GET: APIRoute = () => {
  const books: Record<string, string[]> = {};
  const diets: Record<string, string[]> = {};
  const kitchens: Record<string, string[]> = {};

  recipes.forEach(r => {
    if (r.book)    (books[r.book]       ??= []).push(r.id);
    if (r.diet)    (diets[r.diet]       ??= []).push(r.id);
    if (r.kitchen) (kitchens[r.kitchen] ??= []).push(r.id);
  });

  return new Response(JSON.stringify({ books, diets, kitchens }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
