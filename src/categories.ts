/**
 * AI Recommendation Categories
 *
 * Each category defines a specific focus for the AI recommendations.
 * Categories appear as separate catalogs in Stremio.
 */

export interface Category {
  id: string;
  name: string;
  description: string;
  /** Prompt modifier for the AI */
  promptFocus: string;
  /** Content types this category applies to */
  types: ('movie' | 'series')[];
  /** Optional: specific genres to focus on */
  genres?: string[];
  /** Optional: year constraints */
  yearRange?: { min?: number; max?: number };
}

/**
 * All available recommendation categories
 */
export const CATEGORIES: Category[] = [
  // ===== Core Recommendation =====
  {
    id: 'for-you',
    name: 'For You',
    description: 'Personalized picks based on your watch history',
    promptFocus: `Analyze the user's complete viewing patterns and recommend titles that match their psychological profile. Consider themes, pacing, emotional arcs, and rating patterns. Mix well-known titles with hidden gems.`,
    types: ['movie', 'series'],
  },

  // ===== By Release =====
  {
    id: 'new-releases',
    name: 'New Releases',
    description: 'Recent releases matching your taste',
    promptFocus: `Focus ONLY on films/series released in the last 2 years (2024-2026). Match the user's taste profile but prioritize recent content they likely haven't seen yet.`,
    types: ['movie', 'series'],
    yearRange: { min: 2024 },
  },
  {
    id: 'hidden-gems',
    name: 'Hidden Gems',
    description: 'Underrated films you probably missed',
    promptFocus: `Find critically acclaimed but underseen titles (preferably < 100k IMDB votes). Include international films, indie productions, and festival favorites that match the user's taste.`,
    types: ['movie', 'series'],
  },
  {
    id: 'classics',
    name: 'Classics',
    description: 'Timeless films from cinema history',
    promptFocus: `Recommend classic films from before 2000 that match the user's taste. Include influential cinema, cult classics, and foundational films in genres they enjoy.`,
    types: ['movie'],
    yearRange: { max: 2000 },
  },

  // ===== By Genre =====
  {
    id: 'action-thrillers',
    name: 'Action & Thrillers',
    description: 'High-octane action and edge-of-seat thrillers',
    promptFocus: `Focus on action movies, thrillers, and suspenseful content. Match the intensity level the user prefers based on their history.`,
    types: ['movie', 'series'],
    genres: ['Action', 'Thriller'],
  },
  {
    id: 'sci-fi-fantasy',
    name: 'Sci-Fi & Fantasy',
    description: 'Science fiction and fantastical worlds',
    promptFocus: `Focus on science fiction and fantasy content. Consider whether the user prefers hard sci-fi, space opera, dystopian, or fantasy subgenres based on their history.`,
    types: ['movie', 'series'],
    genres: ['Science Fiction', 'Sci-Fi', 'Fantasy'],
  },
  {
    id: 'drama',
    name: 'Drama',
    description: 'Character-driven stories and emotional journeys',
    promptFocus: `Focus on dramatic content with strong character development. Match the emotional depth and themes the user responds to.`,
    types: ['movie', 'series'],
    genres: ['Drama'],
  },
  {
    id: 'comedy',
    name: 'Comedy',
    description: 'Laughs and feel-good entertainment',
    promptFocus: `Focus on comedies and humorous content. Determine if the user prefers dark comedy, satire, rom-coms, or slapstick based on their history.`,
    types: ['movie', 'series'],
    genres: ['Comedy'],
  },
  {
    id: 'rom-com',
    name: 'Romantic Comedy',
    description: 'Love stories with humor and heart',
    promptFocus: `Focus specifically on romantic comedies. Include both classic rom-coms and modern takes on the genre.`,
    types: ['movie', 'series'],
    genres: ['Romance', 'Comedy'],
  },
  {
    id: 'horror-mystery',
    name: 'Horror & Mystery',
    description: 'Scary films and puzzling mysteries',
    promptFocus: `Focus on horror, mystery, and suspense. Gauge the user's tolerance for intensity based on their history.`,
    types: ['movie', 'series'],
    genres: ['Horror', 'Mystery', 'Thriller'],
  },
  {
    id: 'documentary',
    name: 'Documentary',
    description: 'Real stories and fascinating subjects',
    promptFocus: `Focus on documentaries and docuseries. Match topics to the user's interests inferred from their fiction preferences (tech fans might like tech docs, etc).`,
    types: ['movie', 'series'],
    genres: ['Documentary'],
  },

  // ===== Sports & Action Sports =====
  {
    id: 'sports',
    name: 'Sports',
    description: 'Sports movies and athletic stories',
    promptFocus: `Focus on sports movies and series - including team sports, individual athletes, underdog stories, and sports dramas. Include both fictional sports movies and sports documentaries.`,
    types: ['movie', 'series'],
    genres: ['Sport'],
  },
  {
    id: 'action-sports',
    name: 'Action Sports',
    description: 'Extreme sports: surf, ski, MTB, moto',
    promptFocus: `Focus on action/extreme sports content: surfing, skiing/snowboarding, mountain biking, motocross, skateboarding, climbing, etc. Include documentaries, competition films, and athlete profiles. Films like "The Art of Flight", "Riding Giants", "Where the Trail Ends", etc.`,
    types: ['movie', 'series'],
  },

  // ===== Special Categories =====
  {
    id: 'feel-good',
    name: 'Feel Good',
    description: 'Uplifting and heartwarming content',
    promptFocus: `Focus on feel-good, uplifting content with positive endings. Recommend films that will leave the user feeling good - inspiring stories, heartwarming tales, and optimistic narratives.`,
    types: ['movie', 'series'],
  },
  {
    id: 'mind-benders',
    name: 'Mind Benders',
    description: 'Films that challenge your brain',
    promptFocus: `Focus on intellectually challenging content: complex narratives, twist endings, philosophical themes, non-linear storytelling, and films that reward rewatching. Think Nolan, Villeneuve, Lynch, etc.`,
    types: ['movie', 'series'],
  },
  {
    id: 'international',
    name: 'International',
    description: 'Best of world cinema',
    promptFocus: `Focus on non-English language films and series. Include critically acclaimed international cinema from Korea, France, Japan, Spain, India, Scandinavia, etc. that matches the user's taste.`,
    types: ['movie', 'series'],
  },
  {
    id: 'random',
    name: 'Surprise Me',
    description: 'Random picks outside your comfort zone',
    promptFocus: `Recommend unexpected titles OUTSIDE the user's usual preferences. Challenge them with different genres, eras, or styles they haven't explored. Be creative and surprising.`,
    types: ['movie', 'series'],
  },
];

/**
 * Special category for "Similar to X" recommendations
 * This is used by the meta handler, not as a standalone catalog
 */
export const SIMILAR_CATEGORY: Category = {
  id: 'similar',
  name: 'Similar',
  description: 'Similar movies and shows',
  promptFocus: `Find titles that are SIMILAR to the specified movie/show. Consider:
- Same genres and subgenres
- Similar themes and tone
- Comparable pacing and style
- Same era or setting if relevant
- Directors/creators with similar sensibilities
Focus on titles that fans of the source material would genuinely enjoy.`,
  types: ['movie', 'series'],
};

/**
 * Get a category by ID
 */
export function getCategoryById(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/**
 * Get categories for a specific content type
 */
export function getCategoriesForType(type: 'movie' | 'series'): Category[] {
  return CATEGORIES.filter((c) => c.types.includes(type));
}
