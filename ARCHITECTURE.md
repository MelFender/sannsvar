# Stremio UltraThink AI - Architecture

## Overview

A Stremio addon that provides AI-powered movie/series recommendations using psychographic analysis of the user's watch history from Trakt.tv.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         STREMIO CLIENT                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTP (manifest, catalog, meta)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STREMIO ADDON SERVER                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Express + addon-sdk                     │  │
│  │  • Parses Base64 config from URL                          │  │
│  │  • Routes: /manifest.json, /catalog, /meta                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                │                                 │
│          ┌─────────────────────┼─────────────────────┐          │
│          ▼                     ▼                     ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Handlers   │    │   Trakt.tv   │    │  AI Provider │      │
│  │  • catalog   │    │   Service    │    │   (Gemini)   │      │
│  │  • meta      │    │              │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│          │                   │                   │               │
│          └───────────────────┼───────────────────┘               │
│                              ▼                                   │
│                    ┌──────────────┐                              │
│                    │    SQLite    │                              │
│                    │    Cache     │                              │
│                    └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  Trakt.tv    │       │   Google AI  │       │     TMDB     │
│     API      │       │    Studio    │       │     API      │
│ (OAuth/REST) │       │   (Gemini)   │       │  (Metadata)  │
└──────────────┘       └──────────────┘       └──────────────┘
```

## Configuration Flow

Stremio addons are stateless. User configuration is encoded in the URL:

```
https://addon.domain.com/{base64_config}/manifest.json
                         └──────────────────────────┘
                                    │
                                    ▼
                         ┌──────────────────┐
                         │   UserConfig     │
                         │ • geminiApiKey   │
                         │ • temperature    │
                         │ • traktAccessToken│
                         │ • traktRefreshToken│
                         └──────────────────┘
```

### Config Encoding

```javascript
// config.html encodes user settings
const config = {
  geminiApiKey: "AIza...",
  temperature: 0.7,
  traktAccessToken: "oauth_token",
  traktRefreshToken: "refresh_token"
};
const encoded = btoa(JSON.stringify(config));
// URL: https://addon.example.com/{encoded}/manifest.json
```

### Config Decoding (Server)

```typescript
// Server extracts config from URL path
const configBase64 = req.params.config;
const config: UserConfig = JSON.parse(
  Buffer.from(configBase64, 'base64').toString('utf-8')
);
```

## Dynamic Manifest

The manifest.json changes based on user configuration:

```json
{
  "id": "com.ultrathink.ai",
  "name": "UltraThink AI",
  "version": "1.0.0",
  "catalogs": [
    {
      "type": "movie",
      "id": "ai-recommendations",
      "name": "AI Recommendations"
    }
  ],
  "resources": ["catalog", "meta"],
  "types": ["movie", "series"],
  "idPrefixes": ["tt"]
}
```

## Data Flow: Recommendation Request

```
1. User opens "AI Recommendations" catalog in Stremio
   │
2. Stremio requests: GET /{config}/catalog/movie/ai-recommendations.json
   │
3. Server decodes config, extracts Trakt token
   │
4. TraktService fetches user's watch history (last 50 items)
   │
5. PromptBuilder formats history for Gemini prompt
   │
6. GeminiAdapter sends psychographic analysis request
   │
7. Gemini returns JSON with IMDB IDs + reasons
   │
8. Handler maps IMDB IDs to Stremio meta objects
   │
9. Returns catalog response to Stremio
```

## AI Provider Interface

```typescript
interface IAIProvider {
  getRecommendations(
    watchHistory: WatchHistoryItem[],
    config: AIConfig
  ): Promise<Recommendation[]>;
}

interface Recommendation {
  imdbId: string;
  title: string;
  reason: string;
}
```

## Trakt.tv Integration

### Device Code OAuth Flow

1. Config page requests device code from Trakt
2. User sees PIN code and URL (trakt.tv/activate)
3. User enters PIN on Trakt website (any device)
4. Config page polls for authorization
5. On success, receives access_token + refresh_token

### API Endpoints Used

- `GET /users/me/watched/movies` - Watch history
- `GET /users/me/ratings/movies` - User ratings
- `POST /oauth/device/code` - Device code flow
- `POST /oauth/device/token` - Token exchange

## SQLite Cache Schema

```sql
-- Cache watch history to reduce API calls
CREATE TABLE history_cache (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,          -- JSON stringified history
  updated_at INTEGER NOT NULL  -- Unix timestamp
);

-- Optional: Store recent recommendations
CREATE TABLE recommendation_cache (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Security Considerations

1. **API Keys in URL**: Base64 is obfuscation, not encryption. Users accept responsibility for their own keys.

2. **HTTPS Required**: Production deployment must use HTTPS to protect keys in transit.

3. **No Server-Side Storage**: Keys exist only in URL and memory during request processing.

4. **Token Refresh**: Trakt tokens can be refreshed without re-authentication using refresh_token.

## Directory Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # Express + addon-sdk setup
├── manifest.ts           # Dynamic manifest generator
├── providers/
│   ├── IAIProvider.ts    # Interface definition
│   ├── GeminiAdapter.ts  # Gemini implementation
│   └── providerFactory.ts
├── trakt/
│   ├── TraktService.ts   # Watch history fetching
│   ├── TraktAuth.ts      # Device code OAuth
│   └── types.ts          # Trakt API types
├── db/
│   ├── schema.ts         # SQLite schema
│   ├── database.ts       # Connection singleton
│   └── CacheRepository.ts
├── handlers/
│   ├── catalog.ts        # AI recommendations
│   └── meta.ts           # Movie/series details
└── utils/
    ├── configParser.ts   # Base64 encode/decode
    └── promptBuilder.ts  # UltraThink prompt
```
