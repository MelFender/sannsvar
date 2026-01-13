#!/usr/bin/env npx ts-node
/**
 * Standalone Recommendation Generator
 *
 * Fetches your Trakt.tv watch history and generates AI-powered recommendations.
 * Usage: npx ts-node scripts/generate-recommendations.ts <trakt-username>
 */

import 'dotenv/config';

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

interface TraktHistoryItem {
  watched_at: string;
  action: string;
  type: 'movie' | 'episode';
  movie?: {
    title: string;
    year: number;
    ids: { trakt: number; slug: string; imdb: string; tmdb: number };
  };
  show?: {
    title: string;
    year: number;
    ids: { trakt: number; slug: string; imdb: string; tmdb: number };
  };
  episode?: {
    season: number;
    number: number;
    title: string;
  };
}

interface WatchedItem {
  title: string;
  year: number;
  type: 'movie' | 'show';
  imdbId: string;
  watchedAt: string;
  rating?: number;
}

interface TraktRating {
  rated_at: string;
  rating: number;
  type: 'movie' | 'show';
  movie?: { ids: { imdb: string } };
  show?: { ids: { imdb: string } };
}

async function fetchTraktHistory(username: string): Promise<WatchedItem[]> {
  console.log(`\nFetching watch history for @${username}...`);

  const response = await fetch(
    `https://api.trakt.tv/users/${username}/history?limit=100`,
    {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-key': TRAKT_CLIENT_ID,
        'trakt-api-version': '2',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.status} ${response.statusText}`);
  }

  const history = await response.json() as TraktHistoryItem[];

  // Fetch ratings
  const ratingsResponse = await fetch(
    `https://api.trakt.tv/users/${username}/ratings`,
    {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-key': TRAKT_CLIENT_ID,
        'trakt-api-version': '2',
      },
    }
  );

  const ratings = ratingsResponse.ok
    ? await ratingsResponse.json() as TraktRating[]
    : [];

  const ratingMap = new Map<string, number>();
  for (const r of ratings) {
    const imdbId = r.movie?.ids?.imdb || r.show?.ids?.imdb;
    if (imdbId) ratingMap.set(imdbId, r.rating);
  }

  // Deduplicate and convert
  const seen = new Set<string>();
  const items: WatchedItem[] = [];

  for (const item of history) {
    const isMovie = item.type === 'movie';
    const content = isMovie ? item.movie : item.show;

    if (!content?.ids?.imdb) continue;
    if (seen.has(content.ids.imdb)) continue;
    seen.add(content.ids.imdb);

    items.push({
      title: content.title,
      year: content.year,
      type: isMovie ? 'movie' : 'show',
      imdbId: content.ids.imdb,
      watchedAt: item.watched_at,
      rating: ratingMap.get(content.ids.imdb),
    });
  }

  return items;
}

async function generateRecommendations(history: WatchedItem[]): Promise<void> {
  console.log(`\nAnalyzing ${history.length} titles with AI...\n`);

  const historyText = history.map((item, i) => {
    const rating = item.rating ? ` - Your Rating: ${item.rating}/10` : '';
    return `${i + 1}. "${item.title}" (${item.year}) [${item.type}]${rating}`;
  }).join('\n');

  const prompt = `You are an expert film recommendation engine performing PSYCHOGRAPHIC ANALYSIS.

## User's Watch History (${history.length} titles)
${historyText}

## Your Task
Analyze this viewing history to understand the user's psychological preferences:
- What themes resonate with them?
- What emotional experiences do they seek?
- What pacing and style do they prefer?
- What patterns emerge from their ratings?

Then provide 25 personalized recommendations they'll love.

## Output Format
Return a JSON object with this structure:
{
  "psychographicProfile": "2-3 paragraph analysis of their viewing psychology",
  "recommendations": [
    {
      "title": "Movie/Show Title",
      "year": 2020,
      "type": "movie or series",
      "imdbId": "tt1234567",
      "reason": "Why this matches their psychological profile"
    }
  ]
}

Rules:
- 25 recommendations total
- Mix of movies and series
- Mix of well-known and hidden gems
- Valid IMDB IDs (tt followed by 7-8 digits)
- Each reason must connect to their specific patterns
- Return ONLY valid JSON`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from AI');

  const result = JSON.parse(text) as {
    psychographicProfile: string;
    recommendations: Array<{
      title: string;
      year: number;
      type: string;
      imdbId: string;
      reason: string;
    }>;
  };

  // Display results
  console.log('═'.repeat(70));
  console.log('                    PSYCHOGRAPHIC ANALYSIS');
  console.log('═'.repeat(70));
  console.log(result.psychographicProfile);
  console.log('\n' + '═'.repeat(70));
  console.log('                    PERSONALIZED RECOMMENDATIONS');
  console.log('═'.repeat(70) + '\n');

  for (const [i, rec] of result.recommendations.entries()) {
    console.log(`${String(i + 1).padStart(2)}. ${rec.title} (${rec.year}) [${rec.type}]`);
    console.log(`    IMDB: https://www.imdb.com/title/${rec.imdbId}/`);
    console.log(`    Why: ${rec.reason}\n`);
  }

  console.log('═'.repeat(70));
  console.log(`Generated ${result.recommendations.length} recommendations based on your viewing patterns.`);
  console.log('═'.repeat(70));
}

async function main() {
  const username = process.argv[2];

  if (!username) {
    console.log('Usage: npx ts-node scripts/generate-recommendations.ts <trakt-username>');
    console.log('\nExample: npx ts-node scripts/generate-recommendations.ts johndoe');
    process.exit(1);
  }

  if (!TRAKT_CLIENT_ID || !GEMINI_API_KEY) {
    console.error('Missing required environment variables. Check your .env file.');
    process.exit(1);
  }

  try {
    const history = await fetchTraktHistory(username);

    if (history.length === 0) {
      console.log('No watch history found. Make sure the Trakt profile is public.');
      process.exit(1);
    }

    console.log(`Found ${history.length} unique titles in your history.`);
    await generateRecommendations(history);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
