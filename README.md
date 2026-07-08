# 🛡️ Portinel — Local Edition

**Production-grade cyber reconnaissance platform** — runs entirely on your machine. No login, no cloud services, no Supabase. Just clone, run, and scan.

> [!WARNING]
> **LEGAL & ETHICAL DISCLAIMER (YASAL UYARI):** This tool is designed strictly for authorized penetration testing, security auditing, and educational research. The developers and owners of Portinel assume no liability for any misuse, damage, or unauthorized scanning conducted using this software. By using or deploying this platform, you assume full legal responsibility.

---

## 🚀 Quick Start

### Option A: Docker (recommended — zero setup)

```bash
git clone -b master https://github.com/haydarkadioglu/portinel.git
cd portinel

# Set your config
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db
AUTH_SECRET=any-random-string
EOF

# Launch (app + postgres)
docker compose up -d

# Apply database schema
docker compose exec app npx drizzle-kit push --force
```

Open **http://localhost:3000/dashboard** — no login needed.

### Option B: Run locally

```bash
git clone -b master https://github.com/haydarkadioglu/portinel.git
cd portinel

# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Set DATABASE_URL and AUTH_SECRET

# 3. Database
npx drizzle-kit push --force

# 4. Run
npm run dev    # → http://localhost:3000
```

Open **http://localhost:3000/dashboard** — you're in immediately.

---

## 🔑 AI API Key Setup

The AI assistant works out-of-the-box with the **built-in rule engine** (no key needed). To use a real LLM:

1. Open **Admin Panel → 🤖 AI Providers**
2. Add a key:

| Provider | Where to get a key | Default model |
|----------|-------------------|---------------|
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | `deepseek/deepseek-chat` |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/api_keys) | `deepseek-chat` |

3. Click **Test** to verify the connection
4. Set as **Active provider** → **Save**

**Fallback chain:** active provider → fallback → built-in engine. You'll always get an answer.

---

## ✨ Features

### Reconnaissance Engine (17+ modules)
- **Port Scanning** — TCP connect, banner grabbing, version detection, open/closed/filtered
- **SSL/TLS Analysis** — certificates, ciphers, TLS versions, weak-config detection, letter grade
- **HTTP Fingerprinting** — headers, redirects, cookies, server/framework/CMS detection
- **DNS Analysis** — full enumeration + zone-transfer (AXFR) testing
- **Subdomain Discovery** — CT logs (crt.sh + CertSpotter + HackerTarget) + DNS brute-force (200+ wordlist)
- **WAF Detection** — Cloudflare, AWS WAF, Akamai, Sucuri, Imperva & more
- **Web Recon** — robots.txt, sitemap, directory brute-force, source disclosure, CORS audit
- **CVE Intelligence** — local vulnerability database (CVSS + exploit info)
- **OS Detection**, **WHOIS/RDAP**, **Geolocation**

### AI Layer
- **Multi-provider LLM** — OpenRouter + DeepSeek + rule-engine fallback
- **Conversational assistant** — explains findings, suggests exploits, remediation
- **Autonomous agent** — AI launches sub-scans and invokes MCP tools
- **CTF Toolkit** — decoders, ciphers, hash tools, JWT, XOR

### Platform
- **No login required** — works immediately
- **Scan trees** — drill into subdomains/paths as nested child scans
- **Live SSE progress** — real-time scan streaming
- **Background workers** — async scan execution
- **MCP connectors** — connect external tool servers (SSE transport)
- **VPN tunnels** — OpenVPN configs for in-LAN scanning
- **Scheduled scans** + **webhooks**
- **Reporting** — Markdown, JSON, CSV, shareable links, PDF
- **Desktop SDK** — zero-dependency TypeScript API client

---

## ⚙️ Configuration

### `.env`

```env
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db
AUTH_SECRET=any-random-string
```

That's it. No Supabase, no external auth, no cloud required.

### Docker

```bash
docker compose up -d      # start
docker compose down       # stop
docker compose logs -f    # view logs
```

Data persists in the `portinel-db` Docker volume.

---

## 📡 API (no auth header needed)

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

For programmatic access, use the included SDK: `src/lib/portinel-sdk.ts`.

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
