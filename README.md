# 🛡️ Portinel

**Production-grade cyber reconnaissance platform** — port scanning, SSL/TLS analysis, HTTP fingerprinting, subdomain enumeration, CVE intelligence, and AI-powered analysis. All in one polished dark-mode dashboard.

> **This is the local/Docker edition.** No external services required — runs entirely on your machine with PostgreSQL. No login needed.

---

## ✨ Features

### Reconnaissance Engine (17+ modules)
- **Port Scanning** — TCP connect with banner grabbing, version detection, open/closed/filtered states
- **SSL/TLS Analysis** — certificates, ciphers, TLS versions, weak-config detection, letter grade
- **HTTP Fingerprinting** — headers, redirects, cookies, server/framework/CMS detection
- **DNS Analysis** — full record enumeration + zone-transfer (AXFR) testing
- **Subdomain Discovery** — Certificate Transparency (crt.sh + CertSpotter + HackerTarget) + DNS brute-force with wildcard detection
- **WAF Detection** — Cloudflare, AWS WAF, Akamai, Sucuri, Imperva & more
- **Web Recon** — robots.txt, sitemap, directory brute-force, source-code disclosure, CORS audit
- **CVE Intelligence** — detected products matched against local vulnerability database (CVSS + exploit info)
- **OS Detection** — heuristic host fingerprinting
- **WHOIS / RDNS / Geolocation**

### AI Layer
- **Multi-provider LLM** — OpenRouter + DeepSeek + built-in rule-engine fallback
- **Conversational assistant** — explains findings, suggests exploit paths, gives remediation plans
- **Autonomous agent** — AI can launch sub-scans and invoke MCP tools automatically
- **CTF Toolkit** — decoders, ciphers, hash tools, JWT analysis, XOR

### Platform
- **Scan trees** — drill into subdomains/paths as nested child scans
- **Live progress** — real-time SSE streaming
- **Background workers** — async scan execution
- **MCP connectors** — connect external tool servers (SSE transport)
- **VPN tunnels** — OpenVPN config upload for in-LAN scanning
- **Scheduled scans** — recurring reconnaissance with diff notifications
- **Webhooks** — Slack/Discord notifications
- **Reporting** — Markdown, JSON, CSV, shareable links, print/PDF
- **Desktop SDK** — zero-dependency TypeScript API client

---

## 🚀 Quick Start (Local)

### Prerequisites
- Node.js 20+
- PostgreSQL 14+

### Option A: Run directly

```bash
# 1. Clone
git clone https://github.com/haydarkadioglu/portinel.git
cd portinel

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env — set DATABASE_URL and AUTH_SECRET

# 4. Database setup
npx drizzle-kit push --force

# 5. Run
npm run dev    # → http://localhost:3000
```

That's it. Open `http://localhost:3000/dashboard` — **no login required**.

### Option B: Docker (recommended)

```bash
git clone https://github.com/haydarkadioglu/portinel.git
cd portinel

# Create .env (minimum required)
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db
AUTH_SECRET=change-this-to-random-string
EOF

# Build and run (app + postgres)
docker compose up -d

# Apply database schema
docker compose exec app npx drizzle-kit push --force
```

App runs on `http://localhost:3000`. PostgreSQL on port 5432.

---

## 🔑 AI API Key Setup

The AI assistant works out-of-the-box with the **built-in rule engine** (no API key needed). To use a real LLM:

### Via Dashboard
1. Open the dashboard → **Admin Panel** (top nav)
2. Go to **🤖 AI Providers** tab
3. Choose a provider:

#### OpenRouter (recommended — access many models)
1. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Paste it in the **OpenRouter** card
3. Pick a model (e.g. `deepseek/deepseek-chat`, `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`)
4. Click **Test** to verify the connection
5. Set OpenRouter as **Active provider**
6. **Save configuration**

#### DeepSeek (direct API)
1. Get a key at [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
2. Paste it in the **DeepSeek** card
3. Model: `deepseek-chat` or `deepseek-reasoner`
4. **Test** → set as Active → **Save**

### Fallback chain
The assistant tries the **active** provider first, then the **fallback**, then the built-in engine. You'll never get an empty answer.

---

## ⚙️ Configuration (.env)

```env
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db
AUTH_SECRET=any-random-string-here

# Optional: AI providers can be configured via Admin Panel instead
```

No Supabase, no external auth, no cloud services required.

---

## 📡 API

All endpoints work with the built-in session (no auth header needed in local mode).

```bash
# Start a scan
curl -X POST http://localhost:3000/api/v1/scans \
  -H "Content-Type: application/json" \
  -d '{"target":"example.com","scanTypes":["deep"]}'

# Check status
curl http://localhost:3000/api/v1/scans/<SCAN_ID>

# Export report
curl http://localhost:3000/api/v1/scans/<SCAN_ID>/export?format=md

# Ask the AI
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"scanId":"<SCAN_ID>","question":"What is critical?"}'
```

For programmatic access, use the included SDK (`src/lib/portinel-sdk.ts`).

---

## 📁 Project Structure

```
src/
├── app/                      # Next.js App Router (pages + API routes)
│   ├── api/                  # REST API + SSE + chat + MCP
│   ├── dashboard/            # Main UI
│   └── r/[token]/            # Public shareable reports
├── components/               # React components
├── lib/                      # Core logic
│   ├── scanner.ts            # Reconnaissance engine
│   ├── llm.ts                # Multi-provider LLM + agent
│   ├── mcp.ts                # MCP SSE client
│   ├── cve-db.ts             # Vulnerability database
│   ├── ctf.ts                # CTF/crypto toolkit
│   └── portinel-sdk.ts       # Standalone API client
└── db/                       # Drizzle ORM schema
```

---

## 🛡️ Security Features
- SSRF protection (blocks metadata/loopback/link-local)
- Input validation (Zod on all routes)
- Rate limiting (token-bucket)
- Encrypted secrets at rest (AES-256-GCM)
- CVE/exploit intelligence

---

## 📄 License

Proprietary — All rights reserved.
