# 🛡️ Portinel

**Production-grade cyber reconnaissance platform** — a modern fusion of Shodan, Censys, VirusTotal and Nmap with an AI-powered analysis layer.

Portinel maps your attack surface across 17+ reconnaissance modules, matches findings against a local CVE database, and lets an AI assistant explain, prioritize, and even autonomously drill into subdomains — all from a polished dark-mode dashboard.

---

## ✨ Features

### Reconnaissance Engine
| Module | What it does |
|--------|-------------|
| **Port Scanning** | TCP connect scanning with banner grabbing, version detection, open/closed/filtered classification |
| **SSL/TLS Analysis** | Certificate chain, expiry, cipher suites, TLS version negotiation, weak-config detection, letter grade |
| **HTTP Fingerprinting** | Headers, redirects, cookies, compression, server & framework detection, CMS identification |
| **DNS Analysis** | Full record enumeration (A/AAAA/MX/NS/TXT/SOA/CAA/CNAME), zone-transfer (AXFR) testing |
| **Subdomain Discovery** | Certificate Transparency (crt.sh) + CertSpotter + HackerTarget passive OSINT + DNS brute-force (200+ wordlist) with wildcard detection |
| **WAF Detection** | Cloudflare, AWS WAF, Akamai, Sucuri, Imperva, F5, Azure, Fastly & more |
| **Web Recon** | robots.txt, sitemap.xml, security.txt, directory brute-force, source-code disclosure, CORS audit, HTTP methods, favicon hash |
| **WHOIS / RDNS** | Domain registration via RDAP, reverse DNS lookups |
| **OS Detection** | Heuristic host fingerprinting from service banners & headers |
| **CVE Intelligence** | Detected products+versions matched against a curated vulnerability database (CVSS scores, exploit availability) |
| **Geolocation** | IP geo-enrichment with city/country/ASN/ISP |

### AI Layer
- **Multi-provider LLM** — OpenRouter + DeepSeek + deterministic rule-engine fallback chain
- **Conversational assistant** — explains findings, suggests exploitation paths, gives remediation plans
- **Autonomous agent** — the AI can launch sub-scans, list findings/ports/subdomains, and invoke connected MCP tools
- **Persistent chat memory** — conversations survive page reloads (stored in DB)
- **Executive summaries** — auto-generated briefings for technical & non-technical audiences

### Platform
- **Scan trees** — drill into subdomains, login pages, paths as nested child scans
- **Live progress** — real-time SSE streaming of scan stages
- **Background workers** — async scan execution with queue semantics
- **RBAC** — admin, pentester, analyst, viewer roles with granular permissions
- **Supabase Auth** — invite-only, cookie-based SSR sessions
- **API keys** — hashed at rest, rate-limited, for programmatic access
- **MCP connectors** — connect external tool servers (SSE transport), auto-discover tools, invoke from chat
- **CTF Toolkit** — CyberChef-style multi-tool (decoders, ciphers, hash, JWT, XOR, base converter)
- **VPN tunnels** — OpenVPN config upload (encrypted at rest) for in-LAN scanning
- **Scheduled scans** — recurring reconnaissance with diff-based notifications
- **Webhooks** — Slack/Discord/custom notifications on scan completion
- **Reporting** — Markdown, JSON, CSV exports, shareable links, print/PDF
- **Admin panel** — user management, AI provider config, audit logs, platform stats

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Next.js 16 (App Router)            │
│                                                       │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ React UI │  │ REST API │  │  SSE Stream / Chat   │ │
│  │ (Tailwind│  │ /api/*   │  │  /api/scans/:id/stream│ │
│  │  v4)     │  │ /api/v1/*│  │  /api/chat           │ │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘ │
│       │              │                    │             │
│  ┌────▼──────────────▼────────────────────▼──────────┐ │
│  │              Service Layer (src/lib/)              │ │
│  │                                                    │ │
│  │  scanner.ts    →  TCP/DNS/TLS/HTTP engine         │ │
│  │  ai.ts         →  Risk scoring + analysis         │ │
│  │  llm.ts        →  Multi-provider LLM + tool-calling│ │
│  │  mcp.ts        →  MCP SSE client + tool registry  │ │
│  │  scan-service  →  Orchestration + persistence     │ │
│  │  rbac.ts       →  Role-based access control       │ │
│  │  cve-db.ts     →  Vulnerability database          │ │
│  │  ctf.ts        →  CTF/crypto toolkit              │ │
│  └────────────────────┬──────────────────────────────┘ │
│                       │                                │
│  ┌────────────────────▼──────────────────────────────┐ │
│  │           Data Layer (Drizzle ORM)                │ │
│  │  PostgreSQL (local)  +  Supabase (auth + mirror)  │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Tech Stack
- **Framework:** Next.js 16 (App Router, Server Components, Route Handlers)
- **Database:** PostgreSQL + Drizzle ORM (local), Supabase (auth + data mirror)
- **Auth:** Supabase Auth (`@supabase/ssr`), invite-only, RBAC roles
- **Styling:** Tailwind CSS v4 with custom design tokens
- **AI:** OpenRouter / DeepSeek (OpenAI-compatible), deterministic fallback
- **Real-time:** Server-Sent Events (SSE)
- **Language:** TypeScript (strict mode)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- A Supabase project (for auth)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env`:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/portinel

# Supabase (Authentication)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx

# Optional: for admin user management (create/delete users)
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Optional: AI providers (without these, the built-in rule engine is used)
# Configure via Admin Panel → AI Providers instead
```

### 3. Set up the database
```bash
npx drizzle-kit push --force
```

### 4. Run
```bash
npm run dev    # development (http://localhost:3000)
npm run build  # production build
npm run start  # production server
```

### 5. Create your first admin user
1. Go to your **Supabase Dashboard → Authentication → Users → Add user**
2. Set email + password, confirm the user
3. Add **User Metadata**: `{"role": "admin", "name": "Your Name"}`
4. Navigate to your app's `/login` and sign in

---

## 🐳 Docker Deployment

```bash
# Build and run everything (app + postgres)
docker compose up -d

# Or build just the app
docker build -t portinel .
docker run -p 3000:3000 --env-file .env portinel
```

See [`docker-compose.yml`](./docker-compose.yml) for the full stack config.

---

## 📡 API Documentation

Portinel exposes a RESTful API. Authenticate via session cookie (browser) or `X-API-Key` header (`pt_live_...`).

### Scans
```http
POST   /api/v1/scans                 # Launch a scan (async, returns 202)
GET    /api/v1/scans                 # List scans (?limit=&target=)
GET    /api/v1/scans/:id             # Get scan details
GET    /api/v1/scans/:id/stream      # SSE live progress
GET    /api/v1/scans/:id/export      # Export (?format=md|json|ports|findings)
GET    /api/v1/scans/:id/tree        # Get scan tree (sub-scans)
GET    /api/v1/scans/compare?a=&b=   # Compare two scans
```

### AI Chat
```http
POST   /api/chat                     # Ask the AI (?scanId=&question=)
GET    /api/chat                     # Get suggested prompts
```

### MCP Connectors
```http
GET    /api/mcp                      # List connectors
POST   /api/mcp                      # Add SSE MCP server
POST   /api/mcp/:id                  # Connect/disconnect
POST   /api/mcp/:id/call             # Invoke a tool
GET    /api/mcp/:id/call             # Execution history
```

### Example
```bash
curl -X POST https://portinel.io/api/v1/scans \
  -H "X-API-Key: pt_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"target":"example.com","scanTypes":["deep"]}'
```

### Desktop / SDK
A zero-dependency TypeScript SDK is included at [`src/lib/portinel-sdk.ts`](./src/lib/portinel-sdk.ts). Copy it into any Electron/Tauri/CLI project:
```typescript
import { PortinelClient } from "./portinel-sdk";
const client = new PortinelClient("https://portinel.io", "pt_live_xxx");
const scan = await client.scans.create({ target: "example.com", scanTypes: ["deep"] });
const result = await client.scans.waitFor(scan.id);
const answer = await client.chat.ask(scan.id, "What's critical?");
```

---

## 👥 Roles & Permissions

| Role | Description |
|------|-------------|
| **admin** | Full access — manage users, providers, all scans & settings |
| **pentester** | Run scans, sub-scans, MCP tools, VPN, exports |
| **analyst** | Run & view scans, generate reports |
| **viewer** | Read-only access to scans and reports |

Self-registration is disabled (invite-only). Admins create accounts via the Admin Panel or Supabase Dashboard.

---

## 🔧 Configuration

### AI Providers
Navigate to **Admin Panel → AI Providers** to configure:
- **OpenRouter** — supports GPT-4o, Claude, Gemini, Llama, DeepSeek and more
- **DeepSeek** — direct API access
- **Routing** — active provider → fallback → built-in engine

### MCP Servers
Navigate to **MCP Connectors** to connect external tool servers (SSE transport). Connected tools become available to the AI assistant automatically.

### VPN Tunnels
Navigate to **VPN Tunnels** to upload OpenVPN `.ovpn` profiles (encrypted at rest with AES-256-GCM) for scanning inside target LANs.

---

## 📁 Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # REST API routes
│   │   ├── v1/               # Public versioned API
│   │   ├── admin/            # Admin-only endpoints
│   │   ├── chat/             # AI assistant
│   │   ├── mcp/              # MCP connectors
│   │   └── scans/            # Scan CRUD + SSE + tree + export
│   ├── dashboard/            # Authenticated UI
│   │   ├── scans/            # Scan management + results
│   │   ├── admin/            # Admin panel
│   │   ├── connectors/       # MCP management
│   │   ├── vpn/              # VPN tunnel management
│   │   └── settings/         # Profile + API keys + webhooks
│   └── r/[token]/            # Public shareable reports
├── components/               # React components
├── lib/                      # Business logic
│   ├── scanner.ts            # Reconnaissance engine
│   ├── ai.ts                 # Risk scoring & analysis
│   ├── llm.ts                # Multi-provider LLM + tool-calling
│   ├── mcp.ts                # MCP SSE client
│   ├── cve-db.ts             # Vulnerability database
│   ├── ctf.ts                # CTF/crypto toolkit
│   ├── rbac.ts               # Role-based access control
│   ├── portinel-sdk.ts       # Standalone API client SDK
│   └── ...
└── db/                       # Drizzle schema + connection
```

---

## 🛡️ Security

- **SSRF protection** — cloud metadata, loopback, link-local addresses blocked
- **Input validation** — Zod schemas on all API routes
- **Rate limiting** — token-bucket per user/IP
- **Encrypted secrets** — API keys & VPN configs encrypted at rest (AES-256-GCM)
- **Audit logs** — all sensitive actions logged
- **RBAC** — granular permission checks on every endpoint
- **Invite-only** — no self-registration

---

## 📄 License

Proprietary — All rights reserved.
