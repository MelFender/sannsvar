/**
 * AI Integration Test
 *
 * Tests the GeminiAdapter with real API key and sample watch history.
 */

import 'dotenv/config';
import { GeminiAdapter } from './src/providers/GeminiAdapter.js';
import type { WatchHistoryItem } from './src/types.js';

// Sample watch history for testing (mimics what would come from Trakt)
const sampleWatchHistory: WatchHistoryItem[] = [
  {
    imdbId: 'tt0133093',
    title: 'The Matrix',
    year: 1999,
    type: 'movie',
    genres: ['Action', 'Sci-Fi'],
    rating: 9,
    watchedAt: new Date('2024-12-15'),
    runtime: 136,
    certification: 'R',
  },
  {
    imdbId: 'tt1285016',
    title: 'The Social Network',
    year: 2010,
    type: 'movie',
    genres: ['Biography', 'Drama'],
    rating: 8,
    watchedAt: new Date('2024-12-10'),
    runtime: 120,
    certification: 'PG-13',
  },
  {
    imdbId: 'tt0816692',
    title: 'Interstellar',
    year: 2014,
    type: 'movie',
    genres: ['Adventure', 'Drama', 'Sci-Fi'],
    rating: 10,
    watchedAt: new Date('2024-12-05'),
    runtime: 169,
    certification: 'PG-13',
  },
  {
    imdbId: 'tt1375666',
    title: 'Inception',
    year: 2010,
    type: 'movie',
    genres: ['Action', 'Adventure', 'Sci-Fi'],
    rating: 9,
    watchedAt: new Date('2024-11-28'),
    runtime: 148,
    certification: 'PG-13',
  },
  {
    imdbId: 'tt0468569',
    title: 'The Dark Knight',
    year: 2008,
    type: 'movie',
    genres: ['Action', 'Crime', 'Drama'],
    rating: 10,
    watchedAt: new Date('2024-11-20'),
    runtime: 152,
    certification: 'PG-13',
  },
  {
    imdbId: 'tt0110912',
    title: 'Pulp Fiction',
    year: 1994,
    type: 'movie',
    genres: ['Crime', 'Drama'],
    rating: 8,
    watchedAt: new Date('2024-11-15'),
    runtime: 154,
    certification: 'R',
  },
  {
    imdbId: 'tt0167260',
    title: 'The Lord of the Rings: The Return of the King',
    year: 2003,
    type: 'movie',
    genres: ['Action', 'Adventure', 'Drama'],
    rating: 10,
    watchedAt: new Date('2024-11-10'),
    runtime: 201,
    certification: 'PG-13',
  },
  {
    imdbId: 'tt0137523',
    title: 'Fight Club',
    year: 1999,
    type: 'movie',
    genres: ['Drama'],
    rating: 9,
    watchedAt: new Date('2024-11-05'),
    runtime: 139,
    certification: 'R',
  },
];

async function testAI(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key') {
    console.error('❌ GEMINI_API_KEY not configured in .env');
    process.exit(1);
  }

  console.log('🧠 Testing UltraThink AI Integration...\n');
  console.log('📊 Sample Watch History:');
  sampleWatchHistory.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.title} (${item.year}) - Rating: ${item.rating}/10`);
  });
  console.log('');

  const adapter = new GeminiAdapter();

  console.log(`🤖 Using: ${adapter.name} (${adapter.model})\n`);
  console.log('⏳ Generating psychographic recommendations...\n');

  try {
    const startTime = Date.now();

    const response = await adapter.getRecommendations(sampleWatchHistory, {
      apiKey,
      temperature: 0.7,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Generated ${response.recommendations.length} recommendations in ${elapsed}s\n`);

    if (response.analysis) {
      console.log('📝 Psychographic Analysis:');
      console.log(`   "${response.analysis}"\n`);
    }

    console.log('🎬 Recommendations:');
    response.recommendations.forEach((rec, i) => {
      console.log(`\n   ${i + 1}. ${rec.title} (${rec.imdbId})`);
      console.log(`      Reason: ${rec.reason}`);
    });

    console.log('\n✨ AI Integration Test PASSED!');
  } catch (error) {
    console.error('❌ AI Integration Test FAILED:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testAI();
