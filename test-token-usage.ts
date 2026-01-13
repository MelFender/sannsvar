/**
 * Token Usage Analysis
 *
 * Tests how token consumption scales with recommendation count
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { WatchHistoryItem } from './src/types.js';

const API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = 'gemini-3-flash-preview';

const sampleHistory: WatchHistoryItem[] = [
  { imdbId: 'tt0133093', title: 'The Matrix', year: 1999, type: 'movie', genres: ['Action', 'Sci-Fi'], rating: 9, watchedAt: new Date(), runtime: 136 },
  { imdbId: 'tt0816692', title: 'Interstellar', year: 2014, type: 'movie', genres: ['Adventure', 'Drama', 'Sci-Fi'], rating: 10, watchedAt: new Date(), runtime: 169 },
  { imdbId: 'tt1375666', title: 'Inception', year: 2010, type: 'movie', genres: ['Action', 'Adventure', 'Sci-Fi'], rating: 9, watchedAt: new Date(), runtime: 148 },
  { imdbId: 'tt0468569', title: 'The Dark Knight', year: 2008, type: 'movie', genres: ['Action', 'Crime', 'Drama'], rating: 10, watchedAt: new Date(), runtime: 152 },
  { imdbId: 'tt0137523', title: 'Fight Club', year: 1999, type: 'movie', genres: ['Drama'], rating: 9, watchedAt: new Date(), runtime: 139 },
];

function formatHistory(): string {
  return sampleHistory.map((h, i) =>
    `${i + 1}. "${h.title}" (${h.year}) - ${h.genres.join(', ')} - Rating: ${h.rating}/10`
  ).join('\n');
}

function createPrompt(count: number): string {
  return `Based on this watch history:
${formatHistory()}

Recommend exactly ${count} movies. Return JSON:
{"recommendations": [{"imdbId": "tt1234567", "title": "Movie", "reason": "Brief reason"}]}

Rules: Valid IMDB IDs, unique movies, ONLY JSON.`;
}

async function testTokenUsage(count: number): Promise<{
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  time: number;
  success: boolean;
}> {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  });

  const prompt = createPrompt(count);
  const start = Date.now();

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const usage = response.usageMetadata;

    return {
      count,
      inputTokens: usage?.promptTokenCount || 0,
      outputTokens: usage?.candidatesTokenCount || 0,
      totalTokens: usage?.totalTokenCount || 0,
      time: Date.now() - start,
      success: true,
    };
  } catch (error) {
    return {
      count,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      time: Date.now() - start,
      success: false,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('TOKEN USAGE ANALYSIS');
  console.log('='.repeat(70));

  const counts = [15, 25, 50, 100];
  const results: Awaited<ReturnType<typeof testTokenUsage>>[] = [];

  for (const count of counts) {
    console.log(`\nTesting ${count} recommendations...`);
    const result = await testTokenUsage(count);
    results.push(result);
    console.log(`   Input: ${result.inputTokens} tokens`);
    console.log(`   Output: ${result.outputTokens} tokens`);
    console.log(`   Total: ${result.totalTokens} tokens`);
    console.log(`   Time: ${(result.time / 1000).toFixed(2)}s`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY: Token Usage by Recommendation Count');
  console.log('='.repeat(70));
  console.log('\n Count | Input | Output | Total  | Time   | Output/Rec');
  console.log(' ' + '-'.repeat(60));

  for (const r of results) {
    const perRec = r.count > 0 ? (r.outputTokens / r.count).toFixed(1) : 'N/A';
    console.log(
      ` ${r.count.toString().padStart(5)} | ` +
      `${r.inputTokens.toString().padStart(5)} | ` +
      `${r.outputTokens.toString().padStart(6)} | ` +
      `${r.totalTokens.toString().padStart(6)} | ` +
      `${(r.time / 1000).toFixed(2).padStart(5)}s | ` +
      `${perRec.toString().padStart(6)}`
    );
  }

  // Cost analysis for free tier
  console.log('\n' + '='.repeat(70));
  console.log('STRATEGY ANALYSIS');
  console.log('='.repeat(70));

  const r15 = results.find(r => r.count === 15)!;
  const r100 = results.find(r => r.count === 100)!;

  console.log('\nScenario: User scrolls through 100 recommendations');
  console.log('\n Strategy A: Load 15 at a time (7 API calls)');
  console.log(`   Total tokens: ~${r15.totalTokens * 7} tokens`);
  console.log(`   Total time: ~${((r15.time * 7) / 1000).toFixed(0)}s (with network)`);
  console.log(`   API calls: 7`);

  console.log('\n Strategy B: Load 100 upfront (1 API call)');
  console.log(`   Total tokens: ~${r100.totalTokens} tokens`);
  console.log(`   Total time: ~${(r100.time / 1000).toFixed(0)}s`);
  console.log(`   API calls: 1`);

  console.log('\n Strategy C: Load 25 first, then 75 (2 API calls)');
  const r25 = results.find(r => r.count === 25)!;
  const r50 = results.find(r => r.count === 50)!;
  const est75 = Math.round(r50.totalTokens * 1.5);
  console.log(`   Total tokens: ~${r25.totalTokens + est75} tokens`);
  console.log(`   First load: ${(r25.time / 1000).toFixed(1)}s`);
  console.log(`   API calls: 2`);

  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDATION');
  console.log('='.repeat(70));
  console.log(`
  For Stremio's 15-item viewport:

  OPTIMAL STRATEGY:
  1. First request (skip=0):  Generate 100, return 15, cache 85
  2. Requests 2-6 (skip=15,30,45,60,75): Return from cache instantly
  3. Request 7 (skip=90): Return 10 from cache, trigger background fetch of 100 more

  Benefits:
  - First load: ~${(r100.time / 1000).toFixed(0)}s (acceptable for initial load)
  - Subsequent scrolls: INSTANT (from cache)
  - Minimal API calls: 1 per 100 recommendations
  - Token efficient: ${r100.totalTokens} tokens per 100 recs vs ${r15.totalTokens * 7} for 7x15
  `);
}

main().catch(console.error);
