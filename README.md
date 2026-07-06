# 🛡️ Portinel

**Production-grade cyber reconnaissance platform** — port scanning, SSL/TLS analysis, HTTP fingerprinting, subdomain enumeration, CVE intelligence, and AI-powered analysis.

> **This is the hosted/website edition (`production` branch).** Deployed on Vercel with Supabase Auth. Invite-only — admins create accounts.

---

## 🚀 Deploy to Vercel

### 1. Import the project
- Go to [vercel.com/new](https://vercel.com/new)
- Import `https://github.com/haydarkadioglu/portinel`
- Set **Production Branch:** `production`

### 2. Environment Variables
Add these in Vercel → Project → Settings → Environment Variables:

```env
# Supabase (Auth — required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx          # for admin user management

# Database (use Supabase Pooler or Neon Postgres)
DATABASE_URL=postgresql://...

# Auth encryption secret
AUTH_SECRET=generate-a-random-string
```

### 3. Database setup
After first deploy, run the schema migration:

```bash
# Locally with your DATABASE_URL
npx drizzle-kit push --force
```

Or use Supabase SQL Editor with the schema dump.

### 4. Create your admin user
1. **Supabase Dashboard → Authentication → Users → Add user**
2. Set email + password, mark as confirmed
3. **Edit user → User Metadata:** `{"role": "admin", "name": "Your Name"}`
4. Visit your Vercel URL → `/login` → sign in

The `vercel.json` is already configured with 60s function timeouts for long-running scans.

---

## ✨ Features

### Reconnaissance Engine (17+ modules)
- **Port Scanning** — TCP connect, banner grabbing, version detection
- **SSL/TLS Analysis** — certificates, ciphers, TLS versions, grading
- **HTTP Fingerprinting** — headers, redirects, cookies, CMS detection
- **DNS Analysis** — full enumeration + zone-transfer testing
- **Subdomain Discovery** — CT logs (crt.sh + CertSpotter + HackerTarget) + brute-force
- **WAF Detection** — Cloudflare, AWS WAF, Akamai, Sucuri & more
- **Web Recon** — directory brute-force, source disclosure, CORS audit
- **CVE Intelligence** — local vulnerability database with CVSS scores
- **OS Detection**, **WHOIS/RDAP**, **Geolocation**

### AI Layer
- **Multi-provider LLM** — OpenRouter + DeepSeek + rule-engine fallback
- **Conversational assistant** — explains findings, suggests exploits, remediation
- **Autonomous agent** — AI can launch sub-scans and invoke MCP tools
- **CTF Toolkit** — decoders, ciphers, hash tools, JWT, XOR

### Platform
- **Supabase Auth** — invite-only, RBAC roles (admin/pentester/analyst/viewer)
- **Scan trees** — nested sub-scans for subdomains/paths
- **Live SSE progress** — real-time scan streaming
- **MCP connectors** — external tool servers via SSE
- **VPN tunnels** — OpenVPN configs for in-LAN scanning
- **Scheduled scans** + **webhooks** (Slack/Discord)
- **Reporting** — Markdown, JSON, CSV, shareable links, PDF

---

## 👥 Roles

| Role | Access |
|------|--------|
| **admin** | Everything — users, providers, all scans |
| **pentester** | Scans, sub-scans, MCP, VPN, exports |
| **analyst** | Run & view scans, reports |
| **viewer** | Read-only |

Self-registration is disabled. Admins create accounts via the Admin Panel or Supabase Dashboard.

---

## 🔑 AI Provider Setup

Dashboard → **Admin Panel → 🤖 AI Providers**:
- **OpenRouter** — get key at [openrouter.ai/keys](https://openrouter.ai/keys)
- **DeepSeek** — get key at [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- Test, set active, save. Falls back to built-in engine if unavailable.

---

## 📁 Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # REST API + SSE + chat + MCP
│   ├── dashboard/            # Main UI
│   └── r/[token]/            # Public shareable reports
├── components/               # React components
├── lib/                      # Core logic (scanner, llm, mcp, cve-db, ctf)
└── db/                       # Drizzle ORM schema
```

---

## 🛡️ Security
- Supabase Auth (cookie-based SSR sessions)
- RBAC permission checks on every endpoint
- SSRF protection, rate limiting, input validation
- Encrypted secrets at rest (AES-256-GCM)
- Audit logs

---

## 📄 License
Proprietary — All rights reserved.
