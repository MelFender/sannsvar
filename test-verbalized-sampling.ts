/**
 * Verbalized Sampling Comparison Test
 *
 * Tests three approaches:
 * 1. Standard prompting (current implementation)
 * 2. Verbalized Sampling technique
 * 3. Limit testing - max recommendations per prompt
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { WatchHistoryItem } from './src/types.js';

const API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = 'gemini-3-flash-preview';

// Sample watch history
const sampleHistory: WatchHistoryItem[] = [
  { imdbId: 'tt0133093', title: 'The Matrix', year: 1999, type: 'movie', genres: ['Action', 'Sci-Fi'], rating: 9, watchedAt: new Date('2024-12-15'), runtime: 136 },
  { imdbId: 'tt0816692', title: 'Interstellar', year: 2014, type: 'movie', genres: ['Adventure', 'Drama', 'Sci-Fi'], rating: 10, watchedAt: new Date('2024-12-05'), runtime: 169 },
  { imdbId: 'tt1375666', title: 'Inception', year: 2010, type: 'movie', genres: ['Action', 'Adventure', 'Sci-Fi'], rating: 9, watchedAt: new Date('2024-11-28'), runtime: 148 },
  { imdbId: 'tt0468569', title: 'The Dark Knight', year: 2008, type: 'movie', genres: ['Action', 'Crime', 'Drama'], rating: 10, watchedAt: new Date('2024-11-20'), runtime: 152 },
  { imdbId: 'tt0110912', title: 'Pulp Fiction', year: 1994, type: 'movie', genres: ['Crime', 'Drama'], rating: 8, watchedAt: new Date('2024-11-15'), runtime: 154 },
  { imdbId: 'tt0167260', title: 'LOTR: Return of the King', year: 2003, type: 'movie', genres: ['Action', 'Adventure', 'Drama'], rating: 10, watchedAt: new Date('2024-11-10'), runtime: 201 },
  { imdbId: 'tt0137523', title: 'Fight Club', year: 1999, type: 'movie', genres: ['Drama'], rating: 9, watchedAt: new Date('2024-11-05'), runtime: 139 },
  { imdbId: 'tt1285016', title: 'The Social Network', year: 2010, type: 'movie', genres: ['Biography', 'Drama'], rating: 8, watchedAt: new Date('2024-12-10'), runtime: 120 },
];

function formatHistory(history: WatchHistoryItem[]): string {
  return history.map((h, i) =>
    `${i + 1}. "${h.title}" (${h.year}) - ${h.genres.join(', ')} - Rating: ${h.rating}/10`
  ).join('\n');
}

// ============ STANDARD PROMPT (Current Implementation) ============
const STANDARD_PROMPT = `You are a film recommendation engine. Based on this watch history:

${formatHistory(sampleHistory)}

Recommend 10 movies that match this user's taste. Return JSON:
{
  "recommendations": [
    {"imdbId": "tt1234567", "title": "Movie", "reason": "Why this fits"}
  ]
}

Rules:
- Valid IMDB IDs (tt + 7-8 digits)
- Don't recommend movies already watched
- Return ONLY JSON`;

// ============ VERBALIZED SAMPLING PROMPT ============
const VERBALIZED_SAMPLING_PROMPT = `You are a film recommendation engine with expertise in finding hidden gems and unexpected matches.

Based on this watch history:
${formatHistory(sampleHistory)}

Generate 10 movie recommendations using VERBALIZED SAMPLING:

For each recommendation, sample from the TAILS of the probability distribution - meaning recommend films that are:
- Less obvious choices (probability < 0.15 of being a "typical" recommendation)
- Hidden gems or cult classics that match the psychological profile
- Unexpected genre crossovers that share thematic DNA
- International films or lesser-known directors with similar sensibilities

Each recommendation should include your estimated probability that a "standard" recommender would suggest it.

Return JSON:
{
  "recommendations": [
    {
      "imdbId": "tt1234567",
      "title": "Movie Title",
      "reason": "Why this unexpected choice fits their profile",
      "typicalProbability": 0.05
    }
  ],
  "samplingNote": "Brief note on the distribution you sampled from"
}

Rules:
- Valid IMDB IDs (tt + 7-8 digits)
- AVOID obvious recommendations (no Blade Runner for Matrix fans, etc.)
- Prioritize films with < 100k IMDB votes when possible
- Return ONLY JSON`;

// ============ LIMIT TEST PROMPTS ============
function createLimitTestPrompt(count: number): string {
  return `You are a film recommendation engine. Based on this watch history:

${formatHistory(sampleHistory)}

Recommend exactly ${count} movies. Return JSON:
{
  "recommendations": [
    {"imdbId": "tt1234567", "title": "Movie", "reason": "Brief reason"}
  ],
  "count": ${count}
}

Rules:
- Valid IMDB IDs (tt + 7-8 digits)
- Each movie MUST be unique (no duplicates)
- Return ONLY JSON with exactly ${count} recommendations`;
}

async function runTest(name: string, prompt: string): Promise<{
  success: boolean;
  count: number;
  titles: string[];
  time: number;
  raw?: string;
}> {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  });

  const start = Date.now();

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const elapsed = Date.now() - start;

    const parsed = JSON.parse(text);
    const recs = parsed.recommendations || [];

    return {
      success: true,
      count: recs.length,
      titles: recs.map((r: any) => r.title),
      time: elapsed,
      raw: text.slice(0, 500),
    };
  } catch (error) {
    return {
      success: false,
      count: 0,
      titles: [],
      time: Date.now() - start,
      raw: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function main() {
  console.log('=' .repeat(70));
  console.log('VERBALIZED SAMPLING COMPARISON TEST');
  console.log('='.repeat(70));

  if (!API_KEY) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }

  // Test 1: Standard Prompt
  console.log('\n📊 TEST 1: Standard Prompting (Current Implementation)');
  console.log('-'.repeat(50));
  const standard = await runTest('Standard', STANDARD_PROMPT);
  console.log(`   Status: ${standard.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`   Count: ${standard.count} recommendations`);
  console.log(`   Time: ${(standard.time / 1000).toFixed(2)}s`);
  console.log(`   Titles:`);
  standard.titles.slice(0, 5).forEach((t, i) => console.log(`      ${i + 1}. ${t}`));
  if (standard.titles.length > 5) console.log(`      ... and ${standard.titles.length - 5} more`);

  // Test 2: Verbalized Sampling
  console.log('\n📊 TEST 2: Verbalized Sampling (Tail Distribution)');
  console.log('-'.repeat(50));
  const verbalized = await runTest('Verbalized', VERBALIZED_SAMPLING_PROMPT);
  console.log(`   Status: ${verbalized.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`   Count: ${verbalized.count} recommendations`);
  console.log(`   Time: ${(verbalized.time / 1000).toFixed(2)}s`);
  console.log(`   Titles:`);
  verbalized.titles.slice(0, 5).forEach((t, i) => console.log(`      ${i + 1}. ${t}`));
  if (verbalized.titles.length > 5) console.log(`      ... and ${verbalized.titles.length - 5} more`);

  // Test 3: Limit Testing
  console.log('\n📊 TEST 3: Limit Testing (Max Recommendations per Prompt)');
  console.log('-'.repeat(50));

  const limits = [25, 50, 75, 100, 150];
  const limitResults: { count: number; actual: number; time: number; success: boolean }[] = [];

  for (const limit of limits) {
    console.log(`   Testing ${limit} recommendations...`);
    const result = await runTest(`Limit-${limit}`, createLimitTestPrompt(limit));
    limitResults.push({
      count: limit,
      actual: result.count,
      time: result.time,
      success: result.success,
    });
    console.log(`      → Got ${result.count}/${limit} (${(result.time / 1000).toFixed(2)}s) ${result.success ? '✅' : '❌'}`);

    // Stop if we hit a failure or significant drop
    if (!result.success || result.count < limit * 0.8) {
      console.log(`      → Stopping limit test (degraded results)`);
      break;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  // Diversity comparison
  const standardSet = new Set(standard.titles.map(t => t.toLowerCase()));
  const verbalizedSet = new Set(verbalized.titles.map(t => t.toLowerCase()));
  const overlap = [...standardSet].filter(t => verbalizedSet.has(t)).length;

  console.log('\n📈 Diversity Analysis:');
  console.log(`   Standard titles: ${standard.titles.length}`);
  console.log(`   Verbalized titles: ${verbalized.titles.length}`);
  console.log(`   Overlap: ${overlap} titles (${((overlap / Math.min(standard.titles.length, verbalized.titles.length)) * 100).toFixed(0)}%)`);
  console.log(`   Unique to Verbalized: ${verbalized.titles.length - overlap}`);

  console.log('\n📈 Limit Test Results:');
  console.log('   Requested | Received | Success Rate | Time');
  console.log('   ' + '-'.repeat(50));
  for (const r of limitResults) {
    const rate = ((r.actual / r.count) * 100).toFixed(0);
    console.log(`   ${r.count.toString().padStart(9)} | ${r.actual.toString().padStart(8)} | ${rate.padStart(11)}% | ${(r.time / 1000).toFixed(2)}s`);
  }

  // Find practical limit
  const practicalLimit = limitResults.find(r => r.actual < r.count * 0.9);
  if (practicalLimit) {
    console.log(`\n   ⚠️  Practical limit: ~${limitResults[limitResults.indexOf(practicalLimit) - 1]?.count || 25} recommendations per prompt`);
  } else {
    const lastSuccess = limitResults[limitResults.length - 1];
    console.log(`\n   ✅ All tests passed up to ${lastSuccess?.count || 'N/A'} recommendations`);
  }

  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
