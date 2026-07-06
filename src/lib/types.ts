// ============================================================================
// Portinel — Shared domain types
// These types describe the shape of a scan result, persisted as JSONB and
// consumed by the analysis engine, the API layer and the UI.
// ============================================================================

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type TargetType = "ip" | "domain" | "hostname" | "cidr";

export type PortState = "open" | "closed" | "filtered";

export type ScanType =
  | "quick"
  | "deep"
  | "stealth"
  | "service"
  | "os"
  | "ssl"
  | "dns"
  | "whois"
  | "rdns"
  | "http"
  | "tech"
  | "subdomains"
  | "headers"
  | "waf"
  | "dirs"
  | "web"
  | "cors";

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category:
    | "ssl"
    | "http"
    | "port"
    | "dns"
    | "exposure"
    | "misconfig"
    | "info"
    | "tech";
  description: string;
  evidence?: string;
  recommendation: string;
  impact?: string;
  cvss?: number; // estimated CVSS v3 base score (0-10)
}

export interface PortResult {
  port: number;
  protocol: "tcp" | "udp";
  state: PortState;
  service: string;
  product?: string;
  version?: string;
  banner?: string;
  confidence: number;
  cvss?: number;
}

export interface OsGuess {
  family: "Linux" | "Windows" | "macOS" | "BSD" | "Network device" | "Unknown";
  guess: string;
  confidence: number;
  evidence: string[];
}

export interface DetectedVuln {
  cve: string;
  product: string;
  port?: number;
  version?: string;
  title: string;
  severity: Severity;
  cvss: number;
  exploit: boolean;
  description: string;
}

export interface DnsRecord {
  type: string;
  values: string[];
  ttl?: number;
}

export interface SslResult {
  host: string;
  port: number;
  subjectCN: string;
  issuerCN: string;
  issuerOrg?: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  isValid: boolean;
  serialNumber: string;
  signatureAlgorithm: string;
  keyType: string;
  keyBits: number;
  san: string[];
  tlsVersion: string;
  cipherName: string;
  cipherBits: number;
  selfSigned: boolean;
  wildcard: boolean;
  weakConfigs: string[];
  score: number;
  grade: string;
}

export interface CookieInfo {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  domain?: string;
}

export interface RedirectHop {
  url: string;
  status: number;
  location?: string;
}

export interface HttpResult {
  scheme: "http" | "https";
  url: string;
  finalUrl: string;
  redirects: RedirectHop[];
  statusCode: number;
  statusText: string;
  server?: string;
  poweredBy?: string;
  contentType?: string;
  title?: string;
  headers: Record<string, string>;
  securityHeaders: Record<string, boolean>;
  cookies: CookieInfo[];
  technologies: string[];
  cms?: string;
  bodyBytes: number;
  compression?: string;
  timingMs: number;
}

export interface SubdomainResult {
  hostname: string;
  ips: string[];
  source: string;
}

export interface GeoResult {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
  isp: string;
  org: string;
  as: string;
}

export interface WafResult {
  detected: boolean;
  name?: string;
  vendor?: string;
  confidence: number;
  evidence: string[];
}

export interface DiscoveredPath {
  path: string;
  status: number;
  size: number;
  title?: string;
  interesting: boolean;
}

export interface WebIntel {
  robotsTxt?: { found: boolean; disallow: string[]; sitemap?: string[]; raw?: string };
  sitemaps: { url: string; entries: number }[];
  securityTxt?: { found: boolean; contacts: string[]; raw?: string };
  discoveredPaths: DiscoveredPath[];
  sourceDisclosure: { type: string; url: string; status: number; evidence: string }[];
  cors: { origin: string; allowed: boolean; credentials: boolean; reflected: boolean };
  allowedMethods: string[];
  faviconHash?: string;
  jsFiles: string[];
}

export interface WhoisResult {
  domain: string;
  registrar?: string;
  createdDate?: string;
  updatedDate?: string;
  expiresDate?: string;
  statuses: string[];
  nameservers: string[];
  registrantOrg?: string;
  abuseEmail?: string;
  available?: boolean;
}

export interface ScanMeta {
  target: string;
  normalizedTarget: string;
  targetType: TargetType;
  scanTypes: ScanType[];
  ipAddresses: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  probes: number;
  errors: string[];
}

export interface RawScanData {
  meta: ScanMeta;
  host: {
    ips: string[];
    reverseDns: string[];
    asn?: { number?: string; org?: string };
    geo?: GeoResult;
    whois?: WhoisResult;
    os?: OsGuess;
  };
  dns: DnsRecord[];
  zoneTransfer: { allowed: boolean; records?: string[]; server?: string };
  ports: PortResult[];
  ssl: SslResult[];
  http: HttpResult[];
  subdomains: SubdomainResult[];
  technologies: string[];
  vulnerabilities: DetectedVuln[];
  waf: WafResult | null;
  web: WebIntel;
  findings: Finding[];
}

export interface RiskDeduction {
  reason: string;
  points: number;
  severity: Severity;
}

export interface RiskAnalysis {
  score: number;
  grade: string;
  label: string;
  deductions: RiskDeduction[];
  positives: string[];
}

export interface Improvement {
  title: string;
  detail: string;
  severity: Severity;
}

export interface AttackSurface {
  score: number;
  level: string;
  factors: string[];
}

export interface AiAnalysis {
  executiveSummary: string;
  scanSummary: string;
  beginnerExplanation: string;
  attackSurface: AttackSurface;
  prioritizedRisks: Finding[];
  improvements: Improvement[];
  keyMetrics: { label: string; value: string }[];
}

export interface ScanResult extends RawScanData {
  ai: AiAnalysis;
  risk: RiskAnalysis;
}

export interface ScanRecord {
  id: string;
  userId: string;
  target: string;
  targetType: TargetType;
  scanTypes: ScanType[];
  status: "queued" | "running" | "completed" | "failed";
  riskScore: number | null;
  grade: string | null;
  openPortCount: number;
  results: ScanResult | null;
  error: string | null;
  shareToken: string | null;
  durationMs: number | null;
  parentId: string | null;
  rootId: string | null;
  label: string | null;
  createdAt: string;
  completedAt: string | null;
}
