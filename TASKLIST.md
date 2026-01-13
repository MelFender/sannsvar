# STREMIO ULTRATHINK AI - TASK LIST

## Phase 1: Foundation [5/5] COMPLETE
- [x] Initialize Node.js/TypeScript project at ~/Desktop/stremio-ultrathink-ai
- [x] Configure ESLint, Prettier, tsconfig.json (strict mode)
- [x] Install dependencies: stremio-addon-sdk, better-sqlite3, @google/generative-ai
- [x] Create ARCHITECTURE.md documentation
- [x] Set up src/ directory structure

## Phase 2: AI Provider Layer [3/3] COMPLETE
- [x] Define IAIProvider TypeScript interface (future extensibility)
- [x] Implement GeminiAdapter.ts using gemini-3-flash-preview
- [x] Create provider factory for adapter instantiation

## Phase 3: Trakt.tv Integration [5/5] COMPLETE
- [x] Create Trakt.tv type definitions
- [x] Implement Trakt OAuth device code flow (user-friendly PIN auth)
- [x] Create TraktService.ts for watch history fetching
- [x] Parse Trakt history response (movies, shows, ratings, genres)
- [x] Implement token refresh mechanism

## Phase 4: Data Layer (SQLite Cache) [3/3] COMPLETE
- [x] Design SQLite schema: users table, trakt_tokens table, history_cache
- [x] Implement cache layer to reduce Trakt API calls
- [x] Create User ID extraction from Base64 config URL

## Phase 5: Stremio Addon Core [4/4] COMPLETE
- [x] Build dynamic manifest.json generator
- [x] Implement /catalog/movie/ai-recommendations handler
- [x] Implement /meta handler for movie/series details
- [x] Set up Express server with addon-sdk builder pattern

## Phase 6: Configuration Portal [4/4] COMPLETE
- [x] Create static/config.html with multi-step wizard
- [x] Step 1: Trakt.tv device code authentication flow
- [x] Step 2: Google AI Studio API key input + temperature
- [x] Implement Base64 config encoding with all credentials

## Phase 7: UltraThink Prompt Engineering [3/3] COMPLETE
- [x] Design psychographic analysis system prompt
- [x] Build Trakt history formatter (last 50 items with ratings/genres)
- [x] Implement strict IMDB ID JSON parser from AI response

## Phase 8: Testing & Verification [0/4] TODO
- [ ] Unit tests for GeminiAdapter with mock responses
- [ ] Unit tests for TraktService with mock API
- [ ] Integration tests for Stremio catalog/meta endpoints
- [ ] Manual test: Install addon in Stremio app, verify recommendations

---

## Quick Start

1. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open configuration:**
   http://localhost:7000/configure

4. **Install in Stremio:**
   - Complete the configuration wizard
   - Click "Install in Stremio"
