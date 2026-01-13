/**
 * Sannsvar - Entry Point
 *
 * AI-powered psychographic recommendation engine for Stremio
 * Uses Gemini 3 for analysis and Trakt.tv for watch history
 */

// Load environment variables FIRST
import 'dotenv/config';

import { createServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '7000', 10);
const HOST = process.env.HOST ?? 'localhost';

async function main(): Promise<void> {
  console.log('Starting Sannsvar...');

  const app = await createServer();

  app.listen(PORT, HOST, () => {
    console.log(`\n🎬 Sannsvar Addon running at:`);
    console.log(`   http://${HOST}:${PORT}`);
    console.log(`\n📺 Install in Stremio:`);
    console.log(`   http://${HOST}:${PORT}/manifest.json`);
    console.log(`\n⚙️  Configure at:`);
    console.log(`   http://${HOST}:${PORT}/configure`);
  });
}

main().catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
