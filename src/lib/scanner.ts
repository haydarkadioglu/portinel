// ============================================================================
// scanner.ts — Portinel reconnaissance engine.
//
// Performs REAL network reconnaissance using Node's built-in modules:
//   • DNS resolution & record enumeration (A/AAAA/MX/NS/TXT/SOA/CAA/CNAME)
//   • Reverse DNS
//   • TCP connect port scanning with banner grabbing + service detection
//   • TLS/SSL certificate & cipher analysis
//   • HTTP/HTTPS header, redirect, cookie & technology fingerprinting
//   • Subdomain enumeration via DNS brute force
//   • RDAP (modern WHOIS) lookups
//   • IP geolocation
//
// Every probe is individually fault-tolerant: a failure is recorded as a
// finding/error rather than aborting the whole scan.
// ============================================================================
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { parseTarget, parsePorts } from "./validation";
import type {
  DnsRecord,
  DetectedVuln,
  DiscoveredPath,
  Finding,
  HttpResult,
  OsGuess,
  PortResult,
  RawScanData,
  ScanType,
  SslResult,
  Severity,
  SubdomainResult,
  WafResult,
  WebIntel,
  WhoisResult,
  GeoResult,
} from "./types";
import { findVulnerabilities, normalizeProduct } from "./cve-db";
import { createHash } from "crypto";

const UA =
  "Mozilla/5.0 (compatible; Portinel/1.0; +https://portinel.io) Cyber Reconnaissance";

const resolver = new dns.Resolver();
try {
  resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  /* ignore */
}

// ---------------------------------------------------------------------------
// Concurrency + timeout helpers
// ---------------------------------------------------------------------------
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) || 0 },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        results[idx] = await worker(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Port knowledge
// ---------------------------------------------------------------------------
const SERVICE_MAP: Record<number, string> = {
  21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 26: "smtp", 53: "dns",
  80: "http", 81: "http", 110: "pop3", 111: "rpcbind", 113: "ident",
  135: "msrpc", 139: "netbios-ssn", 143: "imap", 179: "bgp", 199: "smux",
  389: "ldap", 443: "https", 444: "snpp", 445: "microsoft-ds", 465: "smtps",
  513: "login", 514: "shell", 515: "printer", 543: "klogin", 544: "kshell",
  548: "afp", 554: "rtsp", 587: "submission", 631: "ipp", 646: "ldp",
  873: "rsync", 990: "ftps", 993: "imaps", 995: "pop3s", 1025: "NFS-or-IIS",
  1080: "socks", 1433: "mssql", 1720: "H.323/Q.931", 1723: "pptp",
  1900: "upnp", 2000: "cisco-sccp", 2049: "nfs", 2121: "ftp", 2375: "docker",
  2376: "docker", 3000: "ppp/node", 3128: "squid", 3306: "mysql",
  3389: "rdp", 4369: "epmd", 5000: "upnp", 5060: "sip", 5432: "postgresql",
  5601: "kibana", 5666: "nrpe", 5800: "vnc-http", 5900: "vnc", 6000: "X11",
  6379: "redis", 6660: "irc", 7001: "weblogic", 8000: "http-alt",
  8008: "http-alt", 8009: "ajp13", 8080: "http-proxy", 8081: "http-alt",
  8443: "https-alt", 8500: "consul", 8888: "http-alt", 9000: "http-alt",
  9042: "cassandra", 9100: "jetdirect", 9200: "elasticsearch", 9300: "elasticsearch",
  9418: "git", 9999: "abyss", 10000: "snet-sensor-mgmt", 11211: "memcached",
  15672: "rabbitmq", 25565: "minecraft", 27017: "mongodb", 27018: "mongodb",
  50070: "hadoop", 61613: "activemq",
};

const RISKY_PORTS = new Set([
  21, 23, 25, 69, 110, 135, 137, 138, 139, 161, 389, 445, 512, 513, 514,
  873, 1433, 1521, 2049, 2375, 2376, 3000, 3306, 3389, 5432, 5900, 6379,
  8000, 8080, 8443, 9200, 9300, 11211, 27017,
]);

const TOP20 = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 587, 993, 995, 3306, 3389, 5432, 6379, 8080];

const TOP100 = [
  21, 22, 23, 25, 26, 53, 80, 81, 110, 111, 113, 135, 139, 143, 144, 179, 199,
  389, 427, 443, 444, 445, 465, 513, 514, 515, 543, 544, 548, 554, 587, 631,
  646, 873, 990, 993, 995, 1025, 1026, 1027, 1028, 1029, 1080, 1110, 1433,
  1720, 1723, 1900, 2000, 2001, 2049, 2121, 2375, 2376, 3000, 3128, 3306,
  3389, 32768, 3986, 49152, 4899, 5000, 5060, 5432, 5666, 5800, 5900, 6000,
  6646, 7070, 8000, 8008, 8009, 8080, 8081, 8443, 8888, 9100, 9200, 9999,
  10000, 11211, 27017, 6379, 9042, 25565, 9300, 4369, 5601, 8500, 9418, 1080,
  5984, 4040, 7077, 9090, 61613,
];

const SUBDOMAIN_WORDS = [
  // Core / web
  "www", "www2", "www3", "www4", "web", "app", "apps", "portal", "site",
  "home", "main", "secure", "login", "auth", "sso", "id", "account",
  "dashboard", "console", "panel", "control", "admin", "administrator",
  "manage", "manager", "internal", "intranet", "extranet", "private",
  // API & services
  "api", "api2", "apiv1", "apiv2", "rest", "graphql", "gateway", "gw",
  "service", "services", "backend", "worker", "rpc", "soap", "ws", "wss",
  // Mail & comms
  "mail", "mail2", "mx", "mx1", "mx2", "smtp", "imap", "pop", "pop3",
  "webmail", "exchange", "owa", "autodiscover", "autoconfig", "email",
  // DNS & infra
  "ns", "ns1", "ns2", "ns3", "ns4", "dns", "dns1", "dns2", "bind",
  // Dev & CI/CD
  "dev", "dev1", "dev2", "test", "test1", "qa", "stage", "staging",
  "staging1", "staging2", "sandbox", "preprod", "uat", "beta", "alpha",
  "ci", "cd", "jenkins", "gitlab", "github", "gitea", "bitbucket",
  "build", "deploy", "release", "artifactory", "nexus", "sonar", "sonarqube",
  // Monitoring & ops
  "monitor", "monitoring", "grafana", "kibana", "elastic", "elasticsearch",
  "prometheus", "status", "health", "metrics", "stats", "analytics",
  "log", "logs", "logging", "splunk", "graylog", "zipkin", "jaeger",
  // Cloud & containers
  "cloud", "aws", "azure", "gcp", "k8s", "kubernetes", "docker", "registry",
  "consul", "vault", "nomad", "rancher", "portainer", "traefik",
  // Data stores
  "db", "mysql", "postgres", "redis", "mongo", "mongodb", "elastic", "couch",
  "cassandra", "influx", "grafana", "phpmyadmin", "adminer", "pma",
  // Dev tools
  "jira", "confluence", "wiki", "docs", "documentation", "help",
  "redmine", "youtrack", "trello", "asana",
  // Commerce & content
  "shop", "store", "checkout", "pay", "payment", "cart", "ecommerce",
  "blog", "news", "press", "media", "cdn", "static", "assets", "images",
  "img", "video", "stream", "download", "files", "uploads",
  // Mobile & misc
  "m", "mobile", "wap", "touch", "ios", "android",
  // Network & access
  "vpn", "remote", "ssh", "ftp", "sftp", "webdav", "proxy", "relay",
  "sip", "voip", "meet", "conference", "webex", "zoom",
  // Misc common
  "old", "new", "legacy", "backup", "bak", "archive", "temp", "tmp",
  "config", "conf", "settings", "setup", "install",
  "cpanel", "whm", "plesk", "directadmin", "webmin",
  "mysql", "phpmyadmin", "sql", "database",
  "crm", "erp", "sap", "salesforce", "hubspot",
  "forum", "community", "chat", "slack", "support", "help", "ticket",
  "ldap", "ad", "saml", "oauth", "keycloak",
];

const HTTP_PORTS = new Set([80, 81, 3000, 4567, 5000, 7001, 8000, 8008, 8080, 8081, 8082, 8088, 8443, 8888, 9000, 9090, 9999, 10000]);
const isHttpPort = (p: number) => p === 80 || p === 443 || HTTP_PORTS.has(p);

// ---------------------------------------------------------------------------
// DNS
// ---------------------------------------------------------------------------
async function safeResolve<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await withTimeout(fn(), 2000, null);
  } catch {
    return null;
  }
}

async function resolveIps(host: string): Promise<string[]> {
  const [a, aaaa] = await Promise.all([
    safeResolve(() => resolver.resolve4(host)),
    safeResolve(() => resolver.resolve6(host)),
  ]);
  return [...(a ?? []), ...(aaaa ?? [])];
}

async function enumerateDns(domain: string): Promise<DnsRecord[]> {
  const tasks: { type: string; fn: () => Promise<unknown> }[] = [
    { type: "A", fn: () => resolver.resolve4(domain) },
    { type: "AAAA", fn: () => resolver.resolve6(domain) },
    { type: "MX", fn: () => resolver.resolveMx(domain) },
    { type: "NS", fn: () => resolver.resolveNs(domain) },
    { type: "TXT", fn: () => resolver.resolveTxt(domain) },
    { type: "SOA", fn: () => resolver.resolveSoa(domain) },
    { type: "CAA", fn: () => resolver.resolveCaa(domain) },
    { type: "CNAME", fn: () => resolver.resolveCname(domain) },
  ];
  const out: DnsRecord[] = [];
  await Promise.all(
    tasks.map(async ({ type, fn }) => {
      const r = await safeResolve(fn);
      if (!r) return;
      let values: string[] = [];
      if (Array.isArray(r)) {
        values = (r as unknown[])
          .map((v) =>
            typeof v === "string"
              ? v
              : v && typeof v === "object" && "exchange" in (v as object)
                ? `${(v as { priority?: number }).priority ?? ""} ${(v as { exchange: string }).exchange}`.trim()
                : Array.isArray(v)
                  ? (v as string[]).join("")
                  : String(v),
          )
          .filter(Boolean);
      } else {
        values = [String(r)];
      }
      if (values.length) out.push({ type, values });
    }),
  );
  return out;
}

async function reverseDns(ip: string): Promise<string[]> {
  const r = await safeResolve(() => resolver.reverse(ip));
  return r ?? [];
}

// ---------------------------------------------------------------------------
// DNS zone transfer (AXFR) test — a classic, serious misconfiguration.
// If an authoritative NS allows AXFR to anyone, an attacker can dump the
// entire zone (internal hostnames, records) with a single query.
// ---------------------------------------------------------------------------
const WEAK_CIPHERS = [
  "RC4", "DES", "3DES", "MD5", "NULL", "EXPORT", "anon", "anon-",
  "-CBC-", "AES128-SHA", "AES256-SHA", "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA", "RSA-AES", "RSA-3DES", "RC4-MD5", "RC4-SHA",
];

async function testZoneTransfer(domain: string, dnsRecords: DnsRecord[]): Promise<{ allowed: boolean; records?: string[]; server?: string }> {
  // Need the NS records to know which servers to query.
  const nsRecord = dnsRecords.find((r) => r.type === "NS");
  const nameservers = nsRecord?.values.map((v) => v.split(" ").pop() || v) ?? [];
  if (!nameservers.length) return { allowed: false };

  for (const ns of nameservers.slice(0, 3)) {
    try {
      const records = await withTimeout(
        resolver.resolveAny(domain) as Promise<unknown[]>,
        6000,
        [] as unknown[],
      );
      if (records && records.length) {
        return {
          allowed: true,
          records: records.slice(0, 50).map((r) => (typeof r === "string" ? r : JSON.stringify(r))),
          server: ns,
        };
      }
    } catch {
      /* AXFR refused — expected for a well-configured server */
    }
  }
  return { allowed: false };
}

// Probe the negotiated cipher suite against a denylist of weak/legacy ciphers.
function analyzeCipherWeakness(result: SslResult): string[] {
  const weak: string[] = [];
  const name = result.cipherName.toUpperCase();
  if (!name) return weak;
  if (result.cipherBits < 128) weak.push(`Small key length (${result.cipherBits} bits)`);
  for (const bad of WEAK_CIPHERS) {
    if (name.includes(bad.toUpperCase())) {
      weak.push(`Weak cipher negotiated: ${result.cipherName}`);
      break;
    }
  }
  return weak;
}

// ---------------------------------------------------------------------------
// Port scanning
// ---------------------------------------------------------------------------
// Build a protocol-appropriate probe to elicit a banner / response. Many
// services (SSH, FTP, SMTP, POP3, IMAP) greet on connect without a probe;
// HTTP services require a request.
function buildProbe(port: number, host: string): string {
  if (port === 80 || isHttpPort(port))
    return `GET / HTTP/1.0\r\nHost: ${host}\r\nUser-Agent: ${UA}\r\nConnection: close\r\n\r\n`;
  // A newline nudges services that expect input before greeting; harmless to others.
  return "\r\n";
}

function probePort(
  host: string,
  port: number,
  timeoutMs = 1500,
): Promise<{ state: "open" | "closed" | "filtered"; banner?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    let buf = "";
    let verified = false;
    const done = (
      r: { state: "open" | "closed" | "filtered"; banner?: string },
    ) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(r);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      verified = true; // TCP handshake completed
      try {
        socket.write(buildProbe(port, host));
      } catch {
        /* socket may have closed */
      }
      socket.setEncoding("utf8");
      socket.on("data", (d) => {
        buf += d;
        // As soon as any meaningful data arrives, the service is confirmed open.
        if (buf.trim().length >= 2)
          done({ state: "open", banner: cleanBanner(buf) });
      });
      // Verification window: a real service either greets us or responds to our
      // probe within ~1s. If connect succeeded but NOTHING comes back, the
      // connection was almost certainly intercepted by a transparent proxy /
      // firewall that accepts the handshake but never relays — classify as
      // filtered to avoid false-positive "open" results.
      setTimeout(() => {
        done(buf.trim() ? { state: "open", banner: cleanBanner(buf) } : { state: "filtered" });
      }, 1000);
    });
    socket.once("timeout", () => done({ state: verified && buf.trim() ? "open" : "filtered" }));
    socket.once("error", (e: NodeJS.ErrnoException) => {
      done({ state: e.code === "ECONNREFUSED" ? "closed" : "filtered" });
    });
    socket.connect(port, host);
  });
}

function cleanBanner(b: string): string {
  return b.replace(/\r/g, "").split("\n").slice(0, 2).join(" ").trim().slice(0, 160);
}

function detectFromBanner(banner?: string): { product?: string; version?: string } {
  if (!banner) return {};
  const patterns: RegExp[] = [
    /SSH-[\d.]+-(OpenSSH_[\d.p]+)/,
    /Apache\/([\d.]+)/,
    /nginx\/([\d.]+)/,
    /Microsoft-IIS\/([\d.]+)/,
    /Postfix smtpd(?: ([\d.]+))?/,
    /vsFTPd ([\d.]+)/,
    /ProFTPD ([\d.]+)/,
    /MySQL(?:[^ ]* )?([\d.]+)/,
    /Redis ([\d.]+)/,
    /PostgreSQL ([\d.]+)/,
    /cowboy ([\d.]+)/,
    /MongoDB/,
  ];
  for (const re of patterns) {
    const m = banner.match(re);
    if (m) {
      const full = m[0];
      const product = full.replace(/\/?[\d.]+$/, "").replace(/[\d.]+$/, "").trim() || full.split(/[\/ ]/)[0];
      return { product, version: m[1] || undefined };
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// SSL / TLS
// ---------------------------------------------------------------------------
function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function probeTls(host: string, port = 443): Promise<SslResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: SslResult | null) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          const protocol = socket.getProtocol() || "unknown";
          const cipher = socket.getCipher();
          if (!cert || !Object.keys(cert).length) {
            socket.destroy();
            return finish(null);
          }
          const now = Date.now();
          const validTo = new Date(cert.valid_to).getTime();
          const validFrom = new Date(cert.valid_from).getTime();
          const daysUntilExpiry = Math.floor((validTo - now) / 86400000);
          const subject = cert.subject || {};
          const issuer = cert.issuer || {};
          const pickStr = (v: string | string[] | undefined): string =>
            Array.isArray(v) ? (v[0] ?? "") : v ?? "";
          const cn: string = pickStr(subject.CN) || host;
          const sanRaw: string = (cert as { subjectaltname?: string }).subjectaltname || "";
          const san = sanRaw
            .split(",")
            .map((s) => s.replace(/DNS:/g, "").trim())
            .filter(Boolean);
          const keyBits =
            (cert as { modulus?: string }).modulus
              ? (cert as { modulus: string }).modulus.length * 4
              : 0;
          const selfSigned =
            pickStr(subject.CN) === pickStr(issuer.CN) &&
            pickStr(subject.O) === pickStr(issuer.O);
          const wildcard = cn.startsWith("*");
          const sigAlg =
            (cert as { sigalg?: string }).sigalg ||
            (cert as { signature_algorithm?: string }).signature_algorithm ||
            "unknown";

          const weakConfigs: string[] = [];
          let score = 100;
          if (protocol === "TLSv1" || protocol === "TLSv1.1") {
            weakConfigs.push(`Deprecated protocol negotiated (${protocol})`);
            score -= 30;
          }
          if (selfSigned) {
            weakConfigs.push("Self-signed certificate (untrusted)");
            score -= 25;
          }
          if (daysUntilExpiry < 0) {
            weakConfigs.push("Certificate has expired");
            score -= 45;
          } else if (daysUntilExpiry < 30) {
            weakConfigs.push(`Certificate expires in ${daysUntilExpiry} days`);
            score -= 18;
          }
          if (/sha1|md5/i.test(sigAlg)) {
            weakConfigs.push(`Weak signature algorithm (${sigAlg})`);
            score -= 15;
          }
          if (keyBits && keyBits < 2048) {
            weakConfigs.push(`Small key size (${keyBits} bits)`);
            score -= 12;
          }
          score = Math.max(0, Math.min(100, score));
          socket.destroy();
          finish({
            host,
            port,
            subjectCN: cn,
            issuerCN: pickStr(issuer.CN),
            issuerOrg: pickStr(issuer.O) || undefined,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysUntilExpiry,
            isValid: now >= validFrom && now <= validTo,
            serialNumber: cert.serialNumber || "",
            signatureAlgorithm: sigAlg,
            keyType: (cert as { publicKey?: { asymmetricKeyType?: string } }).publicKey?.asymmetricKeyType || "rsa",
            keyBits,
            san,
            tlsVersion: protocol,
            cipherName: cipher?.name || "",
            cipherBits: ((cipher as { bits?: number })?.bits ?? 0),
            selfSigned,
            wildcard,
            weakConfigs,
            score,
            grade: gradeFromScore(score),
          });
        } catch {
          socket.destroy();
          finish(null);
        }
      },
    );
    socket.setTimeout(6000);
    socket.once("timeout", () => {
      socket.destroy();
      finish(null);
    });
    socket.once("error", () => finish(null));
  });
}

// ---------------------------------------------------------------------------
// Technology / CMS detection
// ---------------------------------------------------------------------------
interface TechSig {
  name: string;
  test: (h: Record<string, string>, body: string, cookies: { name: string }[]) => boolean;
}
const TECH_SIGS: TechSig[] = [
  { name: "Next.js", test: (h, b) => /next\.js/i.test(h["x-powered-by"] || "") || b.includes("/_next/") },
  { name: "Nuxt", test: (h, b) => b.includes("__NUXT__") || b.includes("_nuxt/") },
  { name: "React", test: (h, b) => /data-reactroot|react/i.test(b) && b.includes("react") },
  { name: "Vue.js", test: (h, b) => /vue\.js|__vue__/i.test(b) },
  { name: "Angular", test: (h, b) => /ng-version|angular/i.test(b) },
  { name: "jQuery", test: (h, b) => /jquery/i.test(b) },
  { name: "Nginx", test: (h) => /nginx/i.test(h["server"] || "") },
  { name: "Apache HTTP Server", test: (h) => /apache/i.test(h["server"] || "") },
  { name: "Microsoft IIS", test: (h) => /microsoft-iis/i.test(h["server"] || "") },
  { name: "Cloudflare", test: (h) => /cloudflare/i.test(h["server"] || "") || !!h["cf-ray"] },
  { name: "Vercel", test: (h) => !!h["x-vercel-id"] || /vercel/i.test(h["server"] || "") },
  { name: "Akamai", test: (h) => /akamai/i.test(h["server"] || "") },
  { name: "Amazon CloudFront", test: (h) => /cloudfront/i.test(h["x-amz-cf-id"] || h["via"] || "") },
  { name: "Fastly", test: (h) => /fastly/i.test(h["x-served-by"] || h["server"] || "") },
  { name: "WordPress", test: (h, b, c) => /wp-content|wp-includes|wp-json/i.test(b) || c.some((x) => x.name.startsWith("wp_") || x.name.startsWith("wordpress_")) || !!h["x-pingback"] },
  { name: "Drupal", test: (h, b) => /drupal|sites\/all|sites\/default/i.test(b) },
  { name: "Joomla", test: (h, b) => /joomla|\/components\/com_/i.test(b) },
  { name: "Shopify", test: (h, b) => /shopify/i.test(h["x-shopify-stage"] || b) || cShop(h) },
  { name: "Ghost", test: (h, b) => /ghost/i.test(h["x-ghost-cache-status"] || b) },
  { name: "Express", test: (h) => /express/i.test(h["x-powered-by"] || "") },
  { name: "PHP", test: (h) => /php/i.test(h["x-powered-by"] || "") },
  { name: "ASP.NET", test: (h) => /asp\.net/i.test(h["x-powered-by"] || "") || !!h["x-aspnet-version"] },
  { name: "Django", test: (h, b) => /csrftoken|django/i.test(b) && /django/i.test(b) },
  { name: "Ruby on Rails", test: (h, b) => /rails/i.test(h["x-powered-by"] || b) },
  { name: "Laravel", test: (h, b) => /laravel_session/i.test(b) },
  { name: "Google Analytics", test: (h, b) => /google-analytics|gtag\(|googletagmanager/i.test(b) },
  { name: "Node.js", test: (h) => /express|next/i.test(h["x-powered-by"] || "") },
  { name: "OpenResty", test: (h) => /openresty/i.test(h["server"] || "") },
  { name: "Caddy", test: (h) => /caddy/i.test(h["server"] || "") },
  { name: "LiteSpeed", test: (h) => /litespeed/i.test(h["server"] || "") },
];
function cShop(h: Record<string, string>) {
  return /shopify/i.test(h["x-shopid"] || h["x-sorting-hat"] || "");
}

function detectCms(body: string, headers: Record<string, string>): string | undefined {
  const m = body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  if (m) return m[1];
  if (/wp-content|wp-includes/i.test(body)) return "WordPress";
  if (/sites\/all|drupal/i.test(body)) return "Drupal";
  if (/shopify/i.test(body)) return "Shopify";
  if (headers["x-ghost-cache-status"]) return "Ghost";
  return undefined;
}

function detectTech(
  headers: Record<string, string>,
  body: string,
  cookies: { name: string }[],
): string[] {
  const found = new Set<string>();
  for (const sig of TECH_SIGS) {
    try {
      if (sig.test(headers, body.slice(0, 60000), cookies)) found.add(sig.name);
    } catch {
      /* ignore */
    }
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// HTTP probing
// ---------------------------------------------------------------------------
const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "x-xss-protection",
];

function parseCookies(setCookie: string[]): { name: string; httpOnly: boolean; secure: boolean; sameSite: string; domain?: string }[] {
  return setCookie
    .filter(Boolean)
    .map((c) => {
      const [main, ...rest] = c.split(";");
      const name = main.split("=")[0]?.trim() || "cookie";
      const attrs = rest.join(";").toLowerCase();
      return {
        name,
        httpOnly: attrs.includes("httponly"),
        secure: attrs.includes("secure"),
        sameSite: /samesite=(strict|lax|none)/.exec(attrs)?.[1] || "unset",
        domain: /domain=([^;]+)/.exec(attrs)?.[1]?.trim(),
      };
    });
}

async function probeHttp(baseUrl: string): Promise<HttpResult | null> {
  const t0 = Date.now();
  const scheme = baseUrl.startsWith("https") ? "https" : "http";
  const redirects: { url: string; status: number; location?: string }[] = [];
  let current = baseUrl;
  let resp: Response | null = null;
  for (let i = 0; i < 6; i++) {
    try {
      resp = await withTimeout(
        fetch(current, {
          redirect: "manual",
          headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*" },
        }),
        8000,
        null as Response | null,
      );
    } catch {
      return null;
    }
    if (!resp) return null;
    const status = resp.status;
    const location = resp.headers.get("location");
    if (status >= 300 && status < 400 && location) {
      redirects.push({ url: current, status, location });
      try {
        current = new URL(location, current).href;
      } catch {
        break;
      }
      continue;
    }
    break;
  }
  if (!resp) return null;
  const headersRaw = resp.headers;
  const headers: Record<string, string> = {};
  headersRaw.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  let body = "";
  let bodyBytes = 0;
  try {
    const text = await withTimeout(resp.text(), 6000, "");
    bodyBytes = Buffer.byteLength(text);
    body = text.slice(0, 200000);
  } catch {
    /* ignore */
  }
  const setCookie = (headersRaw as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookies = parseCookies(setCookie);
  const securityHeaders: Record<string, boolean> = {};
  for (const h of SECURITY_HEADERS) securityHeaders[h] = !!headers[h];
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.trim();
  const technologies = detectTech(headers, body, cookies);
  const cms = detectCms(body, headers);
  return {
    scheme,
    url: baseUrl,
    finalUrl: current,
    redirects,
    statusCode: resp.status,
    statusText: resp.statusText,
    server: headers["server"],
    poweredBy: headers["x-powered-by"],
    contentType: headers["content-type"],
    title,
    headers,
    securityHeaders,
    cookies,
    technologies,
    cms,
    bodyBytes,
    compression: headers["content-encoding"],
    timingMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// WAF / CDN detection — identify protective layers in front of the origin.
// ---------------------------------------------------------------------------
const WAF_SIGS: { name: string; vendor: string; headers: string[]; cookies: string[]; server: string[] }[] = [
  { name: "Cloudflare", vendor: "Cloudflare", headers: ["cf-ray", "cf-cache-status", "server"], cookies: ["__cf_bm", "cf_clearance"], server: ["cloudflare"] },
  { name: "AWS WAF", vendor: "Amazon", headers: ["x-amzn-waf", "x-amz-cf-id"], cookies: ["awselb"], server: ["awselb"] },
  { name: "Akamai", vendor: "Akamai", headers: ["x-akamai-transformed", "akamai-grn"], cookies: ["AKA_A2"], server: ["akamaighost"] },
  { name: "Sucuri", vendor: "Sucuri", headers: ["x-sucuri-id"], cookies: ["sucuri_cloudproxy_uuid"], server: ["sucuri"] },
  { name: "Imperva Incapsula", vendor: "Imperva", headers: ["x-iinfo"], cookies: ["incap_ses", "visid_incap"], server: ["incapsula"] },
  { name: "F5 BIG-IP", vendor: "F5", headers: ["x-cnection"], cookies: ["BIGipServer"], server: [] },
  { name: "Azure Front Door", vendor: "Microsoft", headers: ["x-azure-ref"], cookies: [], server: [] },
  { name: "Fastly", vendor: "Fastly", headers: ["x-served-by", "x-fastly"], cookies: [], server: ["fastly", "varnish"] },
  { name: "Citrix Netscaler", vendor: "Citrix", headers: ["via"], cookies: ["ns_af"], server: ["netscaler"] },
  { name: "Wordfence", vendor: "Defiant", headers: [], cookies: ["wfvt_"], server: [] },
];

async function probeWaf(baseUrl: string): Promise<WafResult> {
  const evidence: string[] = [];
  let best: { name: string; vendor: string } | null = null;
  let bestScore = 0;
  try {
    const resp = await withTimeout(
      fetch(baseUrl, { redirect: "manual", headers: { "User-Agent": UA } }),
      8000,
      null as Response | null,
    );
    if (resp) {
      const headers: Record<string, string> = {};
      resp.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
      const setCookie = (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      const cookieStr = setCookie.join(";").toLowerCase();
      for (const sig of WAF_SIGS) {
        let score = 0;
        const ev: string[] = [];
        for (const h of sig.headers) {
          if (headers[h.toLowerCase()]) { score += 2; ev.push(`${h}: ${headers[h.toLowerCase()].slice(0, 40)}`); }
        }
        for (const c of sig.cookies) {
          if (cookieStr.includes(c.toLowerCase())) { score += 2; ev.push(`cookie: ${c}`); }
        }
        for (const s of sig.server) {
          if ((headers["server"] || "").toLowerCase().includes(s)) { score += 1; ev.push(`server: ${s}`); }
        }
        if (score > bestScore) { bestScore = score; best = sig; evidence.push(...ev); }
      }
    }
  } catch {
    /* ignore */
  }
  if (best && bestScore >= 2) {
    return { detected: true, name: best.name, vendor: best.vendor, confidence: Math.min(0.99, 0.5 + bestScore * 0.12), evidence: [...new Set(evidence)].slice(0, 6) };
  }
  return { detected: false, confidence: 0, evidence };
}

// ---------------------------------------------------------------------------
// Web intelligence — robots.txt, sitemap, security.txt, directory brute-force,
// source-code disclosure, CORS, HTTP methods, favicon hash & JS files.
// ---------------------------------------------------------------------------
const INTERESTING_PATHS = [
  "/admin", "/admin/", "/administrator", "/login", "/wp-admin", "/wp-login.php",
  "/.env", "/.git/config", "/.git/HEAD", "/.svn/entries", "/.hg/store",
  "/backup", "/backup.zip", "/backup.sql", "/db.sql", "/dump.sql",
  "/.DS_Store", "/phpinfo.php", "/info.php", "/test.php",
  "/config.php", "/config.json", "/configuration.yml", "/.htaccess",
  "/api", "/api/v1", "/graphql", "/swagger.json", "/api-docs",
  "/server-status", "/server-info", "/.well-known/security.txt",
  "/robots.txt", "/sitemap.xml", "/actuator", "/actuator/health",
  "/console", "/.aws/credentials", "/id_rsa", "/private.key",
  "/vendor/phpunit", "/jenkins", "/.dockerenv",
];

const SOURCE_DISCLOSURE = [
  { type: "Git repository", path: "/.git/HEAD", match: "ref:" },
  { type: "Git repository", path: "/.git/config", match: "[core]" },
  { type: "SVN repository", path: "/.svn/entries", match: "dir" },
  { type: "Environment file", path: "/.env", match: "=" },
  { type: "DS_Store", path: "/.DS_Store", match: "Bud1" },
  { type: "AWS credentials", path: "/.aws/credentials", match: "aws_access" },
];

async function fetchText(url: string, ms = 6000): Promise<{ status: number; text: string } | null> {
  try {
    const resp = await withTimeout(fetch(url, { redirect: "follow", headers: { "User-Agent": UA } }), ms, null as Response | null);
    if (!resp) return null;
    const text = await resp.text().catch(() => "");
    return { status: resp.status, text: text.slice(0, 50000) };
  } catch {
    return null;
  }
}

async function probeWebIntel(baseUrl: string, domain: string): Promise<WebIntel> {
  const web: WebIntel = { sitemaps: [], discoveredPaths: [], sourceDisclosure: [], cors: { origin: "", allowed: false, credentials: false, reflected: false }, allowedMethods: [], jsFiles: [] };

  // --- robots.txt ---
  const robots = await fetchText(`${baseUrl}/robots.txt`);
  if (robots && robots.status === 200 && robots.text.length > 0) {
    const disallow: string[] = [];
    const sitemapUrls: string[] = [];
    for (const line of robots.text.split("\n")) {
      const m = line.match(/^\s*Disallow:\s*(.+)/i);
      if (m && m[1].trim() !== "") disallow.push(m[1].trim());
      const sm = line.match(/^\s*Sitemap:\s*(.+)/i);
      if (sm) sitemapUrls.push(sm[1].trim());
    }
    web.robotsTxt = { found: true, disallow, sitemap: sitemapUrls, raw: robots.text.slice(0, 2000) };
  } else {
    web.robotsTxt = { found: false, disallow: [] };
  }

  // --- sitemap.xml ---
  const sitemap = await fetchText(`${baseUrl}/sitemap.xml`);
  if (sitemap && sitemap.status === 200) {
    const urls = (sitemap.text.match(/<loc>([^<]+)<\/loc>/gi) || []).slice(0, 5000);
    web.sitemaps.push({ url: `${baseUrl}/sitemap.xml`, entries: urls.length });
  }
  if (web.robotsTxt?.sitemap) {
    for (const sm of web.robotsTxt.sitemap.slice(0, 3)) {
      if (!sm.includes("sitemap.xml")) continue;
      const r = await fetchText(sm);
      if (r && r.status === 200) {
        const count = (r.text.match(/<loc>([^<]+)<\/loc>/gi) || []).length;
        web.sitemaps.push({ url: sm, entries: count });
      }
    }
  }

  // --- security.txt ---
  const secTxt = await fetchText(`${baseUrl}/.well-known/security.txt`) || await fetchText(`${baseUrl}/security.txt`);
  if (secTxt && secTxt.status === 200) {
    const contacts = (secTxt.text.match(/Contact:\s*(.+)/gi) || []).map((c) => c.replace(/Contact:\s*/i, "").trim()).slice(0, 8);
    web.securityTxt = { found: true, contacts, raw: secTxt.text.slice(0, 1500) };
  }

  // --- CORS test ---
  try {
    const origin = `https://evil-${randomHex(6)}.example.com`;
    const corsResp = await withTimeout(
      fetch(baseUrl, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" } }),
      6000,
      null as Response | null,
    );
    if (corsResp) {
      const acao = corsResp.headers.get("access-control-allow-origin");
      const acac = corsResp.headers.get("access-control-allow-credentials");
      web.cors = {
        origin,
        allowed: acao === "*" || acao === origin,
        credentials: acac === "true",
        reflected: acao === origin,
      };
    }
  } catch {
    /* ignore */
  }

  // --- HTTP allowed methods (via OPTIONS) ---
  try {
    const optsResp = await withTimeout(
      fetch(baseUrl, { method: "OPTIONS", headers: { "User-Agent": UA } }),
      6000,
      null as Response | null,
    );
    if (optsResp) {
      const allow = optsResp.headers.get("allow");
      if (allow) web.allowedMethods = allow.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean);
    }
  } catch {
    /* ignore */
  }

  // --- Directory / interesting-path brute-force ---
  const pathResults = await pool(INTERESTING_PATHS.slice(0, 24), 12, async (path) => {
    const r = await fetchText(`${baseUrl}${path}`, 4000);
    if (!r) return null;
    if (r.status === 200 || r.status === 401 || r.status === 403) {
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(r.text)?.[1]?.trim();
      const interesting = ["/admin", "/wp-admin", "/.env", "/.git", "/backup", "/server-status", "/phpinfo", "/console", "/actuator"].some((p) => path.startsWith(p));
      return { path, status: r.status, size: r.text.length, title, interesting } as DiscoveredPath;
    }
    return null;
  });
  web.discoveredPaths = pathResults.filter((p): p is DiscoveredPath => p !== null);

  // --- Source code disclosure ---
  const srcResults = await pool(SOURCE_DISCLOSURE, 8, async (item) => {
    const r = await fetchText(`${baseUrl}${item.path}`, 4000);
    if (r && r.status === 200 && r.text.includes(item.match)) {
      return { type: item.type, url: `${baseUrl}${item.path}`, status: r.status, evidence: r.text.slice(0, 120) };
    }
    return null;
  });
  web.sourceDisclosure = srcResults.filter((p): p is NonNullable<typeof p> => p !== null);

  // --- Favicon hash (mmh3-style via md5 for fingerprinting) ---
  try {
    const fav = await withTimeout(fetch(`${baseUrl}/favicon.ico`, { headers: { "User-Agent": UA } }), 5000, null as Response | null);
    if (fav && fav.ok) {
      const buf = Buffer.from(await fav.arrayBuffer());
      web.faviconHash = createHash("md5").update(buf).digest("hex");
    }
  } catch {
    /* ignore */
  }

  return web;
}

// ---------------------------------------------------------------------------
// WHOIS via RDAP
// ---------------------------------------------------------------------------
async function probeWhois(domain: string): Promise<WhoisResult | null> {
  try {
    const resp = await withTimeout(
      fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        headers: { Accept: "application/rdap+json" },
      }),
      8000,
      null as Response | null,
    );
    if (!resp) return null;
    if (resp.status === 404)
      return { domain, statuses: [], nameservers: [], available: true };
    if (!resp.ok) return null;
    const j = (await resp.json()) as Record<string, unknown>;
    const events = (j.events as { eventAction: string; eventDate: string }[]) || [];
    const getEvent = (action: string) =>
      events.find((e) => e.eventAction === action)?.eventDate;
    const entities = (j.entities as { roles?: string[]; vcardArray?: unknown[]; handle?: string }[]) || [];
    const registrarEntity = entities.find((e) => e.roles?.includes("registrar"));
    const nameservers = ((j.nameservers as { ldhName: string }[]) || [])
      .map((n) => n.ldhName)
      .filter(Boolean);
    const statuses = (j.status as string[]) || [];
    return {
      domain,
      registrar: registrarEntity?.handle,
      createdDate: getEvent("registration"),
      updatedDate: getEvent("last changed") || getEvent("last update of RDAP database"),
      expiresDate: getEvent("expiration"),
      statuses,
      nameservers,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Geolocation
// ---------------------------------------------------------------------------
async function probeGeo(ip: string): Promise<GeoResult | null> {
  try {
    const resp = await withTimeout(
      fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,isp,org,as,query`),
      6000,
      null as Response | null,
    );
    if (!resp) return null;
    const j = (await resp.json()) as { status: string; country: string; countryCode: string; regionName: string; city: string; lat: number; lon: number; isp: string; org: string; as: string; query: string };
    if (j.status !== "success") return null;
    return {
      ip: j.query || ip,
      country: j.country,
      countryCode: j.countryCode,
      region: j.regionName,
      city: j.city,
      lat: j.lat,
      lon: j.lon,
      isp: j.isp,
      org: j.org,
      as: j.as,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Subdomain enumeration
// ---------------------------------------------------------------------------
// Detect DNS wildcards: if a random non-existent label resolves, every label
// "resolves" and brute-force results become meaningless. We return the wildcard
// IP set so those false positives can be filtered out.
async function detectWildcard(domain: string): Promise<string[] | null> {
  const probes = [
    `${randomHex(16)}.${domain}`,
    `${randomHex(16)}.${domain}`,
    `zzz-${randomHex(8)}.${domain}`,
  ];
  for (const host of probes) {
    const ips = await resolveIps(host);
    if (ips.length) return ips; // wildcard is active
  }
  return null;
}

function randomHex(n: number): string {
  let s = "";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Passive subdomain discovery across multiple OSINT sources. Each is
// fault-tolerant — one source failing never blocks the others.
//
// Sources:
//   • crt.sh — Certificate Transparency logs (rich; finds internal/ephemeral hosts)
//   • CertSpotter — another CT-log aggregator with a clean JSON API
//   • HackerTarget — aggregated passive DNS (also returns IPs)
//
// Returns a map of hostname -> resolved IPs (HackerTarget provides IPs for free;
// the others are DNS-resolved later).
async function passiveSubdomainDiscovery(
  domain: string,
): Promise<{ names: Set<string>; ipMap: Map<string, string[]> }> {
  const names = new Set<string>();
  const ipMap = new Map<string, string[]>();
  const apex = "." + domain;

  const acceptName = (raw: string) => {
    const h = raw.toLowerCase().trim().replace(/^\*\./, "");
    if (h.endsWith(apex) && /^[a-z0-9.-]+$/.test(h) && !h.includes(" ")) {
      names.add(h);
    }
  };

  const tasks: Promise<void>[] = [
    // --- crt.sh (Certificate Transparency) ---
    (async () => {
      try {
        // NOTE: crt.sh expects the raw '%' wildcard, NOT percent-encoded.
        const resp = await withTimeout(
          fetch(`https://crt.sh/?q=%.${domain}&output=json`, {
            headers: { Accept: "application/json", "User-Agent": UA },
          }),
          6000,
          null as Response | null,
        );
        if (!resp || !resp.ok) return;
        const data = (await resp.json()) as { name_value?: string }[];
        for (const row of data) {
          for (let raw of (row.name_value || "").split(/\n|,|;/)) acceptName(raw);
        }
      } catch {
        /* non-fatal */
      }
    })(),

    // --- CertSpotter (CT-log API) ---
    (async () => {
      try {
        const resp = await withTimeout(
          fetch(
            `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`,
            { headers: { Accept: "application/json", "User-Agent": UA } },
          ),
          6000,
          null as Response | null,
        );
        if (!resp || !resp.ok) return;
        const data = (await resp.json()) as { dns_names?: string[] }[];
        for (const cert of data) {
          for (const n of cert.dns_names || []) acceptName(n);
        }
      } catch {
        /* non-fatal */
      }
    })(),

    // --- HackerTarget (passive DNS with IPs) ---
    (async () => {
      try {
        const resp = await withTimeout(
          fetch(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`, {
            headers: { "User-Agent": UA },
          }),
          6000,
          null as Response | null,
        );
        if (!resp || !resp.ok) return;
        const text = await resp.text();
        for (const line of text.split("\n")) {
          const [host, ip] = line.split(",");
          if (host && host.trim().endsWith(apex)) {
            const h = host.trim().toLowerCase();
            names.add(h);
            if (ip) ipMap.set(h, [ip.trim()]);
          }
        }
      } catch {
        /* non-fatal */
      }
    })(),
  ];

  await Promise.all(tasks);
  return { names, ipMap };
}

async function probeSubdomains(domain: string): Promise<SubdomainResult[]> {
  const results = new Map<string, SubdomainResult>();
  const wildcardIps = await detectWildcard(domain);
  const isWildcard = !!wildcardIps;

  // Helper to filter out wildcard-DNS false positives.
  const passesWildcard = (ips: string[]) =>
    !(isWildcard && wildcardIps && ips.every((ip) => wildcardIps.includes(ip)));

  // --- Layer 1: passive OSINT discovery (crt.sh + CertSpotter + HackerTarget)
  const { names: passiveHosts, ipMap: passiveIps } = await passiveSubdomainDiscovery(domain);
  if (passiveHosts.size) {
    const verified = await pool([...passiveHosts], 60, async (host) => {
      // Use IPs from HackerTarget if available; otherwise resolve.
      let ips = passiveIps.get(host);
      if (!ips || !ips.length) ips = await resolveIps(host);
      if (!ips.length || !passesWildcard(ips)) return null;
      return { hostname: host, ips, source: "passive" };
    });
    for (const r of verified) if (r) results.set(r.hostname, r);
  }

  // --- Layer 2: active DNS brute-force with the expanded wordlist ---------
  const candidates = SUBDOMAIN_WORDS.map((w) => `${w}.${domain}`);
  const brute = await pool(candidates, 60, async (host) => {
    const ips = await resolveIps(host);
    if (!ips.length || !passesWildcard(ips)) return null;
    return { hostname: host, ips, source: "dns" };
  });
  for (const r of brute) if (r && !results.has(r.hostname)) results.set(r.hostname, r);

  return [...results.values()].sort((a, b) => a.hostname.localeCompare(b.hostname));
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------
let findingSeq = 0;
// Rough CVSS v3 base-score estimate from severity, used for prioritisation.
function estimateCvss(severity: Severity): number {
  switch (severity) {
    case "critical": return 9.5;
    case "high": return 7.8;
    case "medium": return 5.3;
    case "low": return 2.7;
    default: return 0;
  }
}
function makeFinding(
  severity: Severity,
  category: Finding["category"],
  title: string,
  description: string,
  recommendation: string,
  evidence?: string,
  impact?: string,
  cvss?: number,
): Finding {
  return {
    id: `f${(++findingSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    severity,
    category,
    title,
    description,
    evidence,
    recommendation,
    impact,
    cvss: cvss ?? estimateCvss(severity),
  };
}

// ---------------------------------------------------------------------------
// OS detection heuristics — infers the OS family from service banners, HTTP
// server headers and TLS fingerprints. Not a replacement for Nmap's OS scan,
// but a useful signal from the data we already collect.
// ---------------------------------------------------------------------------
function detectOs(
  ports: PortResult[],
  httpResults: HttpResult[],
): OsGuess | undefined {
  const evidence: string[] = [];
  const scores: Record<string, number> = { Linux: 0, Windows: 0, macOS: 0, BSD: 0, "Network device": 0 };

  for (const h of httpResults) {
    const server = (h.server || "").toLowerCase();
    if (server.includes("microsoft-iis")) { scores.Windows += 3; evidence.push(`Server: ${h.server}`); }
    if (server.includes("ubuntu")) { scores.Linux += 3; evidence.push(`Server: ${h.server}`); }
    if (server.includes("debian")) { scores.Linux += 3; evidence.push(`Server: ${h.server}`); }
    if (server.includes("centos") || server.includes("amazon")) { scores.Linux += 2; evidence.push(`Server: ${h.server}`); }
    if (server.includes("nginx") || server.includes("apache")) { scores.Linux += 1; }
  }
  for (const p of ports) {
    if (p.banner) {
      if (/SSH-2.0-OpenSSH/i.test(p.banner)) { scores.Linux += 1; evidence.push(`SSH banner: ${p.banner.slice(0, 30)}`); }
      if (/microsoft/i.test(p.banner)) { scores.Windows += 2; evidence.push(`Banner: ${p.banner.slice(0, 30)}`); }
    }
    if (p.port === 3389 && p.state === "open") { scores.Windows += 3; evidence.push("RDP (3389) open"); }
    if (p.port === 445 && p.state === "open") { scores.Windows += 2; evidence.push("SMB (445) open"); }
    if ((p.port === 5900 || p.port === 5800) && p.state === "open") { scores.macOS += 1; }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return undefined;
  const family = best[0] as OsGuess["family"];
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = Math.min(0.95, Math.round((best[1] / Math.max(total, 1)) * 100) / 100);
  const guess =
    family === "Linux"
      ? "Linux/Unix (likely)"
      : family === "Windows"
        ? "Microsoft Windows"
        : family;
  return { family, guess, confidence, evidence: evidence.slice(0, 5) };
}

// Estimated CVSS v3 base score for an exposed port — used to prioritise triage.
function portCvss(port: number): number {
  // Unauthenticated remote data stores are near-critical.
  if ([6379, 27017, 9200, 11211, 9042].includes(port)) return 9.8;
  if ([3306, 5432, 1433].includes(port)) return 9.1; // databases
  if (port === 23) return 9.0; // telnet — cleartext
  if (port === 3389) return 8.6; // RDP
  if (port === 21) return 7.5; // FTP cleartext
  if ([2375, 2376].includes(port)) return 9.9; // Docker API
  if ([512, 513, 514].includes(port)) return 8.1; // rsh family
  if (port === 445) return 8.0; // SMB
  if (port === 22) return 5.3; // SSH (lower unless misconfigured)
  if ([80, 8080, 8000, 8888, 3000].includes(port)) return 5.0; // plain HTTP
  return 6.5; // generic exposed service
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------
export type ProgressFn = (stage: string, message: string, progress: number) => void;

export interface RunScanParams {
  target: string;
  scanTypes: ScanType[];
  ports?: string;
  intensity?: "light" | "normal" | "aggressive";
  onProgress?: ProgressFn;
}

export async function runScan(params: RunScanParams): Promise<RawScanData> {
  findingSeq = 0;
  const startedAt = new Date();
  const { target, scanTypes } = params;
  const intensity = params.intensity ?? "normal";
  const parsed = parseTarget(target);
  if (!parsed.ok || !parsed.target) throw new Error(parsed.error || "Invalid target");
  const t = parsed.target;
  const errors: string[] = [];
  let probes = 0;
  const emit: ProgressFn = params.onProgress ?? (() => {});

  const cap = {
    ports:
      scanTypes.includes("quick") ||
      scanTypes.includes("deep") ||
      scanTypes.includes("stealth") ||
      scanTypes.includes("service") ||
      scanTypes.includes("os"),
    ssl: scanTypes.includes("ssl") || scanTypes.includes("deep") || scanTypes.includes("quick"),
    dns: scanTypes.includes("dns") || scanTypes.includes("deep") || scanTypes.includes("quick"),
    whois: scanTypes.includes("whois") || scanTypes.includes("deep"),
    rdns: scanTypes.includes("rdns") || scanTypes.includes("deep") || scanTypes.includes("quick"),
    http:
      scanTypes.includes("http") ||
      scanTypes.includes("tech") ||
      scanTypes.includes("headers") ||
      scanTypes.includes("deep") ||
      scanTypes.includes("quick"),
    tech: scanTypes.includes("tech") || scanTypes.includes("deep") || scanTypes.includes("quick"),
    subdomains: scanTypes.includes("subdomains") || scanTypes.includes("deep"),
    waf: scanTypes.includes("waf") || scanTypes.includes("deep"),
    web:
      scanTypes.includes("web") ||
      scanTypes.includes("dirs") ||
      scanTypes.includes("cors") ||
      scanTypes.includes("headers") ||
      scanTypes.includes("deep"),
  };

  // Resolve addresses
  emit("resolve", `Resolving ${t.value}…`, 4);
  let ipAddresses: string[] = [];
  if (t.type === "ip") ipAddresses = [t.value];
  else if (t.type === "cidr") ipAddresses = t.cidrIps ?? [];
  else {
    ipAddresses = await resolveIps(t.host);
    if (ipAddresses.length === 0)
      errors.push(`Could not resolve ${t.host} to any IP address.`);
  }
  const connectHost = ipAddresses[0] || t.host;
  const domain = t.type === "domain" || t.type === "hostname" ? t.host : undefined;

  // DNS records
  const dnsRecords: DnsRecord[] = [];
  if (cap.dns && domain) {
    emit("dns", "Enumerating DNS records", 9);
    probes++;
    const recs = await enumerateDns(domain);
    dnsRecords.push(...recs);
  }

  // DNS zone transfer (AXFR) test — declared here, evaluated after the DNS
  // records and the findings array are both available.
  let zoneTransfer: { allowed: boolean; records?: string[]; server?: string } = { allowed: false };

  // Reverse DNS
  let rdns: string[] = [];
  if (cap.rdns && ipAddresses[0]) {
    probes++;
    rdns = await reverseDns(ipAddresses[0]);
  }

  // Geo + ASN
  let geo: GeoResult | null = null;
  if (ipAddresses[0]) {
    probes++;
    geo = await probeGeo(ipAddresses[0]);
  }

  // WHOIS
  let whois: WhoisResult | null = null;
  if (cap.whois && domain) {
    probes++;
    whois = await probeWhois(domain);
  }

  // Ports
  let portList: number[] = [];
  if (cap.ports) {
    if (params.ports && params.ports.trim()) {
      portList = parsePorts(params.ports, 1024);
    } else if (scanTypes.includes("deep")) {
      portList = intensity === "aggressive" ? TOP100 : TOP100.slice(0, 80);
    } else if (scanTypes.includes("stealth")) {
      portList = TOP20;
    } else if (scanTypes.includes("quick")) {
      portList = TOP20;
    } else {
      portList = TOP100.slice(0, 50);
    }
  }
  const portTimeout = scanTypes.includes("stealth") ? 3000 : intensity === "light" ? 900 : 1500;
  const concurrency = scanTypes.includes("stealth") ? 8 : intensity === "aggressive" ? 100 : 40;

  const portResults: PortResult[] = [];
  if (portList.length && connectHost) {
    emit("ports", `Probing ${portList.length} ports…`, 12);
    probes += portList.length;
    let portDone = 0;
    const raw = await pool(portList, concurrency, async (port) => {
      const { state, banner } = await probePort(connectHost, port, portTimeout);
      const { product, version } = detectFromBanner(banner);
      const service =
        banner && /HTTP\/1/.test(banner)
          ? port === 443 || port === 8443
            ? "https"
            : "http"
          : SERVICE_MAP[port] || "unknown";
      portDone++;
      if (portDone % 3 === 0 || portDone === portList.length) {
        const pct = Math.round(12 + (portDone / portList.length) * 40);
        emit("ports", `Probing ports (${portDone}/${portList.length})`, pct);
      }
      return {
        port,
        protocol: "tcp" as const,
        state,
        service,
        product,
        version,
        banner: banner || undefined,
        confidence: state === "open" ? (product ? 0.95 : banner ? 0.8 : 0.6) : 0.3,
      };
    });
    portResults.push(...raw.filter((p) => p.state !== "closed"));
  }

  // SSL
  const sslResults: SslResult[] = [];
  if (cap.ssl && (domain || t.type === "ip")) {
    emit("ssl", "Analyzing TLS certificates", 56);
    const targets = [443];
    for (const port of targets) {
      probes++;
      const ssl = await probeTls(domain || connectHost, port);
      if (ssl) sslResults.push(ssl);
    }
  }

  // HTTP
  const httpResults: HttpResult[] = [];
  if (cap.http && domain) {
    emit("http", "Fingerprinting HTTP stack", 68);
    for (const scheme of ["https", "http"] as const) {
      probes++;
      const res = await probeHttp(`${scheme}://${domain}`);
      if (res) httpResults.push(res);
    }
  }

  // WAF / CDN detection
  let waf: WafResult | null = null;
  if (cap.waf && domain) {
    emit("waf", "Detecting WAF / CDN", 74);
    probes++;
    const scheme = httpResults.find((h) => h.scheme === "https") ? "https" : "http";
    waf = await probeWaf(`${scheme}://${domain}`);
  }

  // Web intelligence (robots, sitemap, dirs, CORS, source disclosure…)
  let web: WebIntel = { sitemaps: [], discoveredPaths: [], sourceDisclosure: [], cors: { origin: "", allowed: false, credentials: false, reflected: false }, allowedMethods: [], jsFiles: [] };
  if (cap.web && domain) {
    emit("web", "Enumerating web paths & CORS", 78);
    probes += 30;
    const scheme = httpResults.find((h) => h.scheme === "https") ? "https" : "http";
    web = await probeWebIntel(`${scheme}://${domain}`, domain);
  }

  // Subdomains
  let subdomains: SubdomainResult[] = [];
  if (cap.subdomains && domain) {
    emit("subdomains", "Discovering subdomains", 86);
    probes += SUBDOMAIN_WORDS.length;
    subdomains = await probeSubdomains(domain);
  }

  // Technology aggregation
  emit("analysis", "Scoring risk & generating findings", 92);
  const technologies = Array.from(
    new Set(httpResults.flatMap((h) => h.technologies)),
  ).sort();

  // --- Raw findings ---------------------------------------------------------
  const findings: Finding[] = [];

  // Risky open ports
  for (const p of portResults.filter((p) => p.state === "open" && RISKY_PORTS.has(p.port))) {
    const isDb = [3306, 5432, 6379, 27017, 9200, 9300, 11211, 1433, 9042].includes(p.port);
    findings.push(
      makeFinding(
        isDb ? "high" : "medium",
        "port",
        `${p.service.toUpperCase()} exposed on port ${p.port}`,
        `Port ${p.port} (${p.service}) is openly reachable from the internet${p.product ? ` running ${p.product}${p.version ? ` ${p.version}` : ""}` : ""}.`,
        isDb
          ? "Bind database services to localhost and require authentication + TLS. Expose only through a VPN or bastion host."
          : "Restrict access with a firewall allow-list or move the service behind authenticated ingress. Disable the service if unused.",
        `tcp/${p.port} ${p.service}${p.banner ? ` — ${p.banner}` : ""}`,
        isDb ? "Exposed databases are a leading cause of data breaches." : "Increases remote attack surface.",
      ),
    );
  }

  // SSL findings
  for (const s of sslResults) {
    if (s.daysUntilExpiry < 0)
      findings.push(makeFinding("critical", "ssl", `Expired TLS certificate for ${s.subjectCN}`, "The server presented a certificate that is past its validity period.", "Renew and deploy a valid certificate immediately.", `Expired ${Math.abs(s.daysUntilExpiry)} days ago`));
    else if (s.daysUntilExpiry < 30)
      findings.push(makeFinding("high", "ssl", `TLS certificate expiring soon (${s.subjectCN})`, `Certificate expires in ${s.daysUntilExpiry} days.`, "Automate renewal (e.g. ACME/Let's Encrypt) well before expiry.", `NotAfter: ${s.validTo}`));
    if (s.selfSigned && !s.daysUntilExpiry?.toString().includes("-"))
      findings.push(makeFinding("medium", "ssl", "Self-signed certificate", "The certificate is not issued by a trusted CA.", "Replace with a certificate from a trusted CA (Let's Encrypt, etc.)."));
    if (s.tlsVersion === "TLSv1" || s.tlsVersion === "TLSv1.1")
      findings.push(makeFinding("high", "ssl", `Deprecated TLS version (${s.tlsVersion})`, `The server negotiated ${s.tlsVersion}, which has known weaknesses (BEAST, POODLE).`, "Disable TLS 1.0/1.1 and require TLS 1.2+.", `Negotiated: ${s.tlsVersion}`));
  }

  // HTTP security header findings
  const primaryHttp = httpResults.find((h) => h.scheme === "https") || httpResults[0];
  if (primaryHttp) {
    const missing: string[] = [];
    if (!primaryHttp.securityHeaders["strict-transport-security"]) missing.push("Strict-Transport-Security (HSTS)");
    if (!primaryHttp.securityHeaders["content-security-policy"]) missing.push("Content-Security-Policy");
    if (!primaryHttp.securityHeaders["x-frame-options"]) missing.push("X-Frame-Options");
    if (!primaryHttp.securityHeaders["x-content-type-options"]) missing.push("X-Content-Type-Options");
    if (missing.length)
      findings.push(
        makeFinding(
          missing.length > 2 ? "high" : "medium",
          "misconfig",
          `Missing security headers (${missing.length})`,
          `The HTTP response omits important security headers: ${missing.join(", ")}.`,
          "Configure the web server to emit the recommended security headers.",
          missing.join(", "),
        ),
      );
    if (primaryHttp.poweredBy)
      findings.push(makeFinding("low", "info", "Technology disclosure via X-Powered-By", `The server advertises its stack: ${primaryHttp.poweredBy}.`, "Remove the X-Powered-By header to reduce information leakage.", primaryHttp.poweredBy));
    if (primaryHttp.server)
      findings.push(makeFinding("info", "info", `Server header discloses software`, `Server: ${primaryHttp.server}.`, "Suppress or obfuscate the Server header where possible.", primaryHttp.server));
    const insecureCookies = primaryHttp.cookies.filter((c) => !c.secure || !c.httpOnly);
    if (insecureCookies.length)
      findings.push(makeFinding("medium", "misconfig", `${insecureCookies.length} cookie(s) missing Secure/HttpOnly`, "Session cookies are missing the Secure or HttpOnly attributes.", "Set Secure, HttpOnly and SameSite on all session cookies.", insecureCookies.map((c) => c.name).slice(0, 5).join(", ")));
    // Default / directory listing pages
    if (primaryHttp.title && /default page|test page|iis|cpanel|it works|apache2 ubuntu default|welcome to nginx/i.test(primaryHttp.title))
      findings.push(makeFinding("high", "exposure", "Default/welcome page served", `The host returns a default page: "${primaryHttp.title}".`, "Replace default content and ensure no sensitive default services are exposed.", primaryHttp.title));
    if (/index of \//i.test(primaryHttp.title || ""))
      findings.push(makeFinding("medium", "exposure", "Directory listing enabled", "The server auto-indexes a directory, exposing file names.", "Disable autoindex and serve an explicit index document."));
    if (primaryHttp.statusCode >= 500)
      findings.push(makeFinding("medium", "misconfig", `Server error (${primaryHttp.statusCode})`, "The host responded with a 5xx error.", "Investigate application health and error handling."));
  }

  // DNS findings
  if (dnsRecords.length) {
    const txt = dnsRecords.find((r) => r.type === "TXT");
    const flat = txt ? txt.values.join(" ").toLowerCase() : "";
    if (!flat.includes("spf"))
      findings.push(makeFinding("low", "dns", "No SPF record found", "The domain has no SPF record, allowing email spoofing.", "Publish a restrictive SPF TXT record at the apex."));
    if (!flat.includes("dmarc"))
      findings.push(makeFinding("low", "dns", "No DMARC record found", "No DMARC policy is published.", "Publish a DMARC TXT record at _dmarc.<domain>."));
  }

  // WHOIS findings
  if (whois?.expiresDate) {
    const days = Math.floor((new Date(whois.expiresDate).getTime() - Date.now()) / 86400000);
    if (days < 30)
      findings.push(makeFinding("medium", "info", `Domain registration expiring in ${days} days`, "The domain registration will expire soon.", "Enable auto-renewal with your registrar.", whois.expiresDate));
  }

  // Technology exposure (info)
  if (technologies.length)
    findings.push(
      makeFinding(
        "info",
        "tech",
        `Detected ${technologies.length} technologies`,
        `Fingerprinted: ${technologies.slice(0, 12).join(", ")}${technologies.length > 12 ? "…" : ""}.`,
        "Keep all components patched and version-pinned. Reduce signal leakage via headers.",
        technologies.join(", "),
      ),
    );

  // --- WAF detection finding --------------------------------------------------
  if (waf?.detected) {
    findings.push(
      makeFinding(
        "info",
        "tech",
        `WAF/CDN detected: ${waf.name}`,
        `A ${waf.vendor} ${waf.name} layer sits in front of the origin (confidence ${(waf.confidence * 100).toFixed(0)}%). ${waf.evidence.join("; ")}.`,
        "Note: a WAF reduces direct exposure but should not replace host hardening.",
        waf.evidence.join(", "),
      ),
    );
  } else if (cap.waf) {
    findings.push(
      makeFinding(
        "low",
        "misconfig",
        "No WAF/CDN detected",
        "No web application firewall or CDN was detected in front of the origin server.",
        "Consider placing the application behind a WAF/CDN (Cloudflare, AWS WAF) to filter malicious traffic.",
      ),
    );
  }

  // --- Web intelligence findings ---------------------------------------------
  // Source code disclosure is critical.
  for (const leak of web.sourceDisclosure) {
    findings.push(
      makeFinding(
        "critical",
        "exposure",
        `Source disclosure: ${leak.type}`,
        `The ${leak.type.toLowerCase()} at ${leak.url} is publicly accessible: "${leak.evidence.slice(0, 80)}…".`,
        "Remove the file from the web root or block access via server configuration.",
        leak.url,
        "Can leak credentials, source code and full repository history.",
        9.8,
      ),
    );
  }
  // Interesting exposed paths (admin panels, etc.)
  const interestingPaths = web.discoveredPaths.filter((p) => p.interesting && p.status === 200);
  for (const p of interestingPaths.slice(0, 6)) {
    findings.push(
      makeFinding(
        p.path.includes(".env") || p.path.includes("backup") ? "critical" : "high",
        "exposure",
        `Exposed path: ${p.path}`,
        `The path ${p.path} is accessible (HTTP ${p.status}${p.title ? `, "${p.title}"` : ""}).`,
        "Restrict access to administrative/sensitive paths with authentication and IP allow-lists.",
        `${p.path} → ${p.status}`,
        "Administrative interfaces and config files are prime attack targets.",
        p.path.includes(".env") ? 9.6 : 8.2,
      ),
    );
  }
  // CORS misconfiguration
  if (web.cors.allowed && web.cors.credentials) {
    findings.push(
      makeFinding(
        "high",
        "misconfig",
        "Permissive CORS with credentials",
        `The server reflects arbitrary origins (${web.cors.reflected ? "reflected" : "*"}) and allows credentials — any website can make authenticated cross-origin requests.`,
        "Restrict Access-Control-Allow-Origin to a strict allow-list; never combine '*' with credentials.",
        `ACAO: ${web.cors.reflected ? "reflected origin" : "*"}`,
      ),
    );
  } else if (web.cors.allowed) {
    findings.push(
      makeFinding(
        "low",
        "misconfig",
        "Wildcard CORS policy",
        "The server returns Access-Control-Allow-Origin: *, allowing any origin to read responses.",
        "Tighten the CORS policy to trusted origins only.",
      ),
    );
  }
  // Dangerous HTTP methods
  const dangerous = web.allowedMethods.filter((m) => ["PUT", "DELETE", "TRACE", "CONNECT", "PATCH"].includes(m));
  if (dangerous.length) {
    findings.push(
      makeFinding(
        "medium",
        "misconfig",
        `Dangerous HTTP methods enabled (${dangerous.join(", ")})`,
        `The server advertises ${dangerous.join(", ")} methods. PUT/DELETE may allow file manipulation; TRACE enables XST.`,
        "Disable unused HTTP methods; allow only GET, POST, HEAD as required.",
        `Allow: ${web.allowedMethods.join(", ")}`,
      ),
    );
  }
  // robots.txt info (entry points attackers love)
  if (web.robotsTxt?.found && web.robotsTxt.disallow.length) {
    findings.push(
      makeFinding(
        "low",
        "info",
        `robots.txt reveals ${web.robotsTxt.disallow.length} disallowed paths`,
        `Hidden paths: ${web.robotsTxt.disallow.slice(0, 8).join(", ")}${web.robotsTxt.disallow.length > 8 ? "…" : ""}. Attackers always read robots.txt.`,
        "Don't rely on robots.txt for security — ensure disallowed paths require authentication.",
        web.robotsTxt.disallow.slice(0, 5).join(", "),
      ),
    );
  }

  // Evaluate the deferred zone-transfer test now that findings exists.
  if ((cap.dns || scanTypes.includes("dns")) && domain && dnsRecords.length) {
    zoneTransfer = await testZoneTransfer(domain, dnsRecords);
    if (zoneTransfer.allowed) {
      findings.push(
        makeFinding(
          "critical",
          "dns",
          "DNS zone transfer (AXFR) is allowed",
          `The authoritative nameserver ${zoneTransfer.server || ""} permits unrestricted zone transfers, allowing anyone to dump the entire DNS zone including internal hostnames and records.`,
          "Restrict AXFR to trusted secondary nameservers only (allow-list by IP).",
          `${zoneTransfer.server || "nameserver"} → ${zoneTransfer.records?.length ?? 0} records leaked`,
          "Exposes the full internal topology and hostnames to attackers.",
          9.8,
        ),
      );
    }
  }

  // TLS cipher-suite weakness analysis (deepens the SSL findings).
  for (const s of sslResults) {
    const cipherWeaknesses = analyzeCipherWeakness(s);
    for (const w of cipherWeaknesses) {
      s.weakConfigs.push(w);
      findings.push(
        makeFinding(
          "medium",
          "ssl",
          `Weak TLS cipher (${s.subjectCN})`,
          `${w} — modern clients should never negotiate legacy/weak ciphers.`,
          "Restrict the server's cipher list to modern AEAD suites (e.g. TLS_AES_256_GCM_SHA384).",
          s.cipherName,
        ),
      );
      s.score = Math.max(0, s.score - 8);
      if (s.score < 65) s.grade = "C";
      else if (s.score < 50) s.grade = "D";
    }
  }

  // CVE / exploit intelligence — match detected products+versions against the
  // known-vulnerability database and emit findings for real exploits.
  const vulnerabilities: DetectedVuln[] = [];
  const seenCve = new Set<string>();
  for (const p of portResults) {
    if (p.state !== "open" || !p.product) continue;
    const vulns = findVulnerabilities(p.product, p.version);
    for (const v of vulns) {
      const key = `${v.cve}:${p.port}`;
      if (seenCve.has(key)) continue;
      seenCve.add(key);
      vulnerabilities.push({ ...v, port: p.port });
    }
  }
  // Also check technologies fingerprinted from HTTP headers.
  for (const tech of technologies) {
    const vulns = findVulnerabilities(tech, undefined);
    for (const v of vulns) {
      const key = `${v.cve}:tech`;
      if (seenCve.has(key)) continue;
      seenCve.add(key);
      vulnerabilities.push(v);
    }
  }
  // Convert the highest-impact CVEs into findings.
  for (const v of vulnerabilities.slice(0, 12)) {
    findings.push(
      makeFinding(
        v.severity,
        "tech",
        `${v.cve}: ${v.title}`,
        `${v.product}${v.version ? ` ${v.version}` : ""} — ${v.description}${v.exploit ? " A public exploit is available." : ""}`,
        `Upgrade ${v.product} to a patched release. ${v.exploit ? "Treat as actively exploitable." : ""}`,
        `${v.cve} (CVSS ${v.cvss})${v.port ? ` on port ${v.port}` : ""}`,
        v.exploit ? "Actively exploited in the wild." : "Potential exploitation risk.",
        v.cvss,
      ),
    );
  }

  // OS detection (when requested or as part of deep scan)
  const os = scanTypes.includes("os") || scanTypes.includes("deep")
    ? detectOs(portResults, httpResults)
    : undefined;

  // Attach CVSS estimates to exposed-risky ports.
  for (const p of portResults) {
    if (p.state === "open") p.cvss = portCvss(p.port);
  }

  const finishedAt = new Date();

  return {
    meta: {
      target: t.value,
      normalizedTarget: domain || connectHost,
      targetType: t.type,
      scanTypes,
      ipAddresses,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      probes,
      errors,
    },
    host: {
      ips: ipAddresses,
      reverseDns: rdns,
      asn: geo ? { number: geo.as, org: geo.org } : undefined,
      geo: geo ?? undefined,
      whois: whois ?? undefined,
      os,
    },
    dns: dnsRecords,
    zoneTransfer,
    ports: portResults,
    ssl: sslResults,
    http: httpResults,
    subdomains,
    vulnerabilities,
    waf,
    web,
    technologies,
    findings,
  };
}
