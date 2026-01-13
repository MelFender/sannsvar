# Sannsvar - Project Reference

> AI-powered Stremio addon with movie/TV recommendations and personalized YouTube channels.

---

## Quick Links

| Resource | URL |
|----------|-----|
| **GitHub Repo** | https://github.com/MelFender/sannsvar |
| **Domain** | sannsvar.com (DNS not yet configured) |
| **Local Dev** | http://localhost:7001 |

---

## Project Structure

```
~/Desktop/sannsvar/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Express server + Stremio handlers
│   ├── manifest.ts           # Addon manifest (id: com.sannsvar)
│   ├── categories.ts         # Movie/TV recommendation categories
│   ├── types.ts              # TypeScript types
│   ├── db/
│   │   ├── database.ts       # SQLite connection
│   │   ├── schema.ts         # Table definitions
│   │   ├── CacheRepository.ts    # AI response cache
│   │   └── YouTubeRepository.ts  # YouTube channels/history
│   ├── handlers/
│   │   ├── catalog.ts        # Catalog endpoint handler
│   │   ├── meta.ts           # Meta endpoint handler
│   │   └── similar.ts        # Similar content handler
│   ├── providers/
│   │   ├── IAIProvider.ts    # AI provider interface
│   │   ├── GeminiAdapter.ts  # Google Gemini (primary)
│   │   ├── GeminiOAuthAdapter.ts  # Gemini via OAuth
│   │   └── ...               # Other providers
│   ├── oauth/
│   │   ├── GoogleOAuth.ts    # Google OAuth for Gemini
│   │   ├── OpenAIOAuth.ts    # OpenAI OAuth
│   │   └── ClaudeOAuth.ts    # Claude OAuth
│   ├── trakt/
│   │   ├── TraktAuth.ts      # Trakt device code flow
│   │   └── TraktService.ts   # Watch history fetching
│   └── youtube/
│       ├── YouTubeService.ts     # YouTube Data API
│       └── AIRecommender.ts      # AI-powered video recommendations
├── static/
│   ├── config.html           # Configuration wizard
│   ├── styles.css            # Config page styles
│   └── avatars/              # Channel avatar images
│       ├── angela.jpg        # Snow White
│       ├── wes.png           # Beast (Beauty & the Beast)
│       └── bingbong.webp     # Bing Bong (Inside Out)
├── deploy/
│   ├── DEPLOYMENT.md         # Full deployment guide
│   ├── sannsvar.service      # Systemd service file
│   ├── setup-oracle.sh       # Oracle Cloud setup script
│   ├── setup-domain.sh       # Domain + SSL setup (Caddy)
│   └── Caddyfile             # Reverse proxy config
├── .env                      # API keys (gitignored)
├── .env.example              # Template for .env
└── package.json              # name: "sannsvar", version: "2.0.0"
```

---

## Configuration

### Environment Variables (.env)

```bash
# Server
PORT=7001
HOST=0.0.0.0
BASE_URL=https://sannsvar.com

# Trakt.tv API (get from https://trakt.tv/oauth/applications)
TRAKT_CLIENT_ID=your_trakt_client_id
TRAKT_CLIENT_SECRET=your_trakt_client_secret

# Google OAuth (get from https://console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Google AI Studio API Key (get from https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key

# YouTube Data API (optional)
YOUTUBE_API_KEY=

# Database
DB_PATH=./cache.db
```

---

## Features

### 1. Movie/TV Recommendations
- Connects to user's Trakt.tv account
- Analyzes watch history with Gemini 3
- Returns personalized IMDB-based recommendations
- Categories: Cerebral Sci-Fi, Dark Comedy, Hidden Gems, etc.

### 2. YouTube Channels
Three personalized YouTube profiles, each with independent:
- Watch history tracking
- AI-powered recommendations
- Saved videos list

| Channel | Avatar | Description |
|---------|--------|-------------|
| **Angela** | Snow White | First YouTube profile |
| **Wes** | Beast | Second YouTube profile |
| **Bing Bong** | Inside Out character | Third YouTube profile |

### 3. Multi-Provider AI Support
- **Google Gemini** (primary) - via OAuth or API key
- **OpenAI ChatGPT** - via OAuth
- **Anthropic Claude** - via OAuth
- Users bring their own subscriptions (no pay-per-use costs)

---

## Technical Details

### Stremio Addon Architecture

```
Manifest ID: com.sannsvar
Version: 2.0.0
Types: movie, series, channel
ID Prefixes: tt (IMDB), yt: (YouTube)
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/manifest.json` | Stremio addon manifest |
| `/configure` | User configuration wizard |
| `/catalog/:type/:id.json` | Content catalogs |
| `/meta/:type/:id.json` | Content metadata |
| `/stream/:type/:id.json` | Stream sources (YouTube) |
| `/api/trakt-config` | Trakt client ID |
| `/api/trakt-token` | Trakt token exchange |
| `/api/google-auth-url` | Google OAuth URL |
| `/api/youtube/channels` | List YouTube channels |

### Database Schema (SQLite)

```sql
-- AI response cache
CREATE TABLE cache (...)

-- YouTube channels
CREATE TABLE youtube_channels (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  avatar TEXT,
  created_at TEXT
)

-- YouTube watch history
CREATE TABLE youtube_history (...)

-- YouTube saved videos
CREATE TABLE youtube_saved (...)

-- YouTube recommendations
CREATE TABLE youtube_recommendations (...)
```

---

## Development

### Commands

```bash
# Start development server (hot reload)
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run tests
npm test

# Lint code
npm run lint
```

### Local Testing

1. Start the server: `npm run dev`
2. Open config page: http://localhost:7001/configure
3. Install in Stremio: http://localhost:7001/manifest.json

---

## Deployment (Oracle Cloud Free)

### Server Requirements
- Oracle Cloud Always Free ARM instance
- Ubuntu 22.04
- Node.js 20 LTS
- Caddy (for SSL)

### Quick Deploy

```bash
# On Oracle Cloud VM
git clone https://github.com/MelFender/sannsvar.git
cd sannsvar
./deploy/setup-oracle.sh

# Configure environment
cp .env.example .env
nano .env  # Add your API keys

# Start service
sudo systemctl start sannsvar

# Setup domain with SSL
./deploy/setup-domain.sh sannsvar.com
```

### DNS Configuration (sannsvar.com)

| Type | Name | Value |
|------|------|-------|
| A | @ | YOUR_ORACLE_IP |
| A | www | YOUR_ORACLE_IP |

### Service Management

```bash
# Start/stop/restart
sudo systemctl start sannsvar
sudo systemctl stop sannsvar
sudo systemctl restart sannsvar

# View logs
journalctl -u sannsvar -f

# Check status
sudo systemctl status sannsvar
```

---

## Important Rules

### AI Provider Rule
**ONLY use Gemini 3 models. Never use Gemini 2.x or 1.5.**

```
✅ gemini-3-flash-preview
✅ gemini-3-pro-preview
❌ gemini-2.5-flash (FORBIDDEN)
❌ gemini-1.5-pro (FORBIDDEN)
```

### No Pay-Per-Use APIs
All AI access is via:
- User's existing subscriptions (OAuth)
- Free tier API keys (Google AI Studio)

---

## URLs Summary

| Environment | Configure | Manifest |
|-------------|-----------|----------|
| **Local** | http://localhost:7001/configure | http://localhost:7001/manifest.json |
| **Production** | https://sannsvar.com/configure | https://sannsvar.com/manifest.json |

---

## Changelog

### v2.0.0 (2026-01-13)
- Renamed from "UltraThink AI" to "Sannsvar"
- Added YouTube channels (Angela, Wes, Bing Bong)
- Merged movie/TV and YouTube into single addon
- Added Oracle Cloud deployment scripts
- Domain: sannsvar.com

### v1.0.0
- Initial release as "UltraThink AI"
- Movie/TV recommendations only
- Trakt.tv integration
- Multi-provider AI support
