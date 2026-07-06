import Link from "next/link";
import { Logo } from "@/components/ui";
import { SCAN_TYPE_OPTIONS } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-line bg-base/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
            <a href="#features" className="transition hover:text-ink">Features</a>
            <a href="#modules" className="transition hover:text-ink">Scan modules</a>
            <a href="#how" className="transition hover:text-ink">How it works</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="btn btn-primary">🚀 Enter dashboard</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-40" />
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand/10 blur-[120px]" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-4 py-1.5 text-xs text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            Real-time reconnaissance engine — now with AI scoring
          </div>
          <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Cyber reconnaissance,
            <br />
            <span className="text-gradient">elevated to intelligence.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
            Scan IPs, domains and CIDR ranges across 13 modules. Discover open
            ports, TLS weaknesses, exposed services and misconfigurations — then
            let AI prioritize the risks that matter.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard" className="btn btn-primary px-6 py-3 text-base">
              🚀 Enter dashboard
            </Link>
          </div>

          {/* Floating stat cards */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["100+", "TCP ports probed", "#22d3ee"],
              ["TLS 1.3", "Cipher analysis", "#34d399"],
              ["0–100", "Risk score", "#fbbf24"],
              ["JSON/CSV/MD", "Export formats", "#a855f7"],
            ].map(([v, l, c]) => (
              <div key={l} className="panel panel-hover p-5 text-left" style={{ animation: "fade-up 0.6s ease both" }}>
                <div className="text-2xl font-bold" style={{ color: c }}>{v}</div>
                <div className="mt-1 text-xs text-muted">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Capabilities"
          title="Everything a recon operator needs"
          subtitle="From Shodan-style exposure to Nmap-grade service detection, unified in one polished console."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel panel-hover p-6">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-line bg-brand/[0.06] text-2xl">
                {f.icon}
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="border-y border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading
            eyebrow="13 scan modules"
            title="Comprehensive, composable reconnaissance"
            subtitle="Run one module or chain them into a deep scan. Each adds a layer of intelligence."
          />
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {SCAN_TYPE_OPTIONS.map((m) => (
              <div key={m.id} className="panel p-4 transition hover:border-brand/40">
                <div className="text-xl">{m.icon}</div>
                <div className="mt-2 text-sm font-semibold">{m.label}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted">{m.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Workflow"
          title="From target to triage in seconds"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["01", "Define the target", "Enter an IP, domain, hostname or CIDR range and pick your modules."],
            ["02", "Portinel probes", "DNS, TCP, TLS and HTTP engines gather real signal in parallel."],
            ["03", "AI prioritizes", "Get a graded risk score, deductions explained, and an executive summary — exportable anywhere."],
          ].map(([n, t, d]) => (
            <div key={n} className="panel p-6">
              <div className="text-3xl font-bold text-white/10">{n}</div>
              <h3 className="mt-2 font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="panel relative overflow-hidden p-12 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-accent/10" />
          <div className="relative">
            <h2 className="text-3xl font-bold">Ready to map your attack surface?</h2>
            <p className="mx-auto mt-3 max-w-md text-muted">
              Join security teams using Portinel to find exposures before attackers do.
            </p>
            <Link href="/register" className="btn btn-primary mt-6 px-6 py-3 text-base">
              Create a free account
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted sm:flex-row">
          <Logo size={26} />
          <p>© {new Date().getFullYear()} Portinel. Built for security professionals.</p>
          <div className="flex gap-5">
            <a href="#features" className="hover:text-ink">Features</a>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-semibold uppercase tracking-widest text-brand">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-muted">{subtitle}</p>}
    </div>
  );
}

const FEATURES = [
  { icon: "🛰️", title: "Port & service discovery", desc: "TCP connect scanning with banner grabbing, version detection and protocol classification across open, closed and filtered states." },
  { icon: "🔐", title: "Deep SSL/TLS analysis", desc: "Certificate chain, expiry, cipher suites, negotiated TLS versions and weak-configuration detection with a letter grade." },
  { icon: "📡", title: "HTTP fingerprinting", desc: "Headers, redirects, cookies, compression, server & framework detection, CMS identification and security-header auditing." },
  { icon: "🧠", title: "AI risk prioritization", desc: "An explainable 0–100 score, itemized deductions, executive summary and beginner-friendly explanations of every finding." },
  { icon: "🗺️", title: "Attack-surface mapping", desc: "Animated network topology, port heatmap, geolocation and findings donut to visualize exposure at a glance." },
  { icon: "📄", title: "Reporting & sharing", desc: "One-click Markdown, JSON and CSV exports, shareable links and a printable report — plus full scan history with diffs." },
];
