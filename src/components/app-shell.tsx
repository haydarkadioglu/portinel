"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { Logo, Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { SafeUser } from "@/lib/session";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: <IconGrid /> },
  { href: "/dashboard/scans/new", label: "New Scan", icon: <IconRadar /> },
  { href: "/dashboard/scans", label: "Scan History", icon: <IconClock /> },
  { href: "/dashboard/chat", label: "Portinel AI", icon: <IconChat /> },
  { href: "/dashboard/vpn", label: "VPN Tunnels", icon: <IconNetwork /> },
  { href: "/dashboard/connectors", label: "MCP Connectors", icon: <IconPlug /> },
  { href: "/dashboard/reports", label: "Reports", icon: <IconDoc /> },
  { href: "/dashboard/admin", label: "Admin Panel", icon: <IconShield />, adminOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: <IconCog /> },
];

export function AppShell({
  user,
  children,
}: {
  user: SafeUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = NAV.filter((n) => !n.adminOnly || user.role === "admin");

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface/80 backdrop-blur-xl transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center px-5">
          <Link href="/dashboard">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-muted hover:bg-white/[0.04] hover:text-ink",
                )}
              >
                <span className={cn(active ? "text-brand" : "text-muted group-hover:text-ink")}>
                  {item.icon}
                </span>
                {item.label}
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_#22d3ee]" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 rounded-xl border border-line bg-gradient-to-br from-brand/[0.08] to-accent/[0.05] p-4">
          <div className="text-xs font-semibold text-ink">Portinel {user.plan}</div>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-muted">
            {user.scanCount} scans run. Need higher limits?
          </p>
          <Link href="/dashboard/settings" className="mt-2 inline-block text-[0.7rem] font-semibold text-brand">
            Manage plan →
          </Link>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-base/70 px-4 backdrop-blur-xl lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted lg:hidden"
          >
            <IconMenu />
          </button>
          <QuickScan />
          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <Link
              href="/dashboard/scans/new"
              className="btn btn-primary hidden sm:inline-flex"
            >
              <IconPlus /> New Scan
            </Link>
            <UserMenu user={user} />
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function QuickScan() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (target.trim()) router.push(`/dashboard/scans/new?target=${encodeURIComponent(target.trim())}`);
      }}
      className="relative hidden max-w-md flex-1 md:block"
    >
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <IconSearch />
      </span>
      <input
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="Scan a target — IP, domain or CIDR…"
        className="input pl-9"
      />
    </form>
  );
}

function UserMenu({ user }: { user: SafeUser }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-white/[0.04]"
      >
        <Avatar name={user.name} color={user.avatarColor} size={32} />
        <div className="hidden text-left sm:block">
          <div className="text-xs font-semibold leading-tight">{user.name}</div>
          <div className="text-[0.65rem] text-muted">{user.role}</div>
        </div>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-line bg-surface-2 shadow-2xl">
            <div className="border-b border-line p-3">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-muted">{user.email}</div>
            </div>
            <MenuLink href="/dashboard/settings" onClick={() => setOpen(false)}>
              Profile & API keys
            </MenuLink>
            <MenuLink href="/dashboard/reports" onClick={() => setOpen(false)}>
              Reports
            </MenuLink>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-danger/10">
                <IconLogout /> Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({ href, children, onClick }: { href: string; children: ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center px-3 py-2.5 text-sm text-muted hover:bg-white/[0.04] hover:text-ink">
      {children}
    </Link>
  );
}

function NotificationsBell() {
  const [items, setItems] = useState<{ id: string; title: string; text: string; severity: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => {});
  }, []);
  const unread = items.length;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition hover:text-ink"
      >
        <IconBell />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-line bg-surface-2 shadow-2xl">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">
              Notifications
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted">
                  You&apos;re all caught up.
                </div>
              ) : (
                items.map((n) => (
                  <div key={n.id} className="border-b border-line px-4 py-3 last:border-0">
                    <div className="text-sm font-medium">{n.title}</div>
                    <div className="text-xs text-muted">{n.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- icons ---- */
function IconGrid() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>); }
function IconRadar() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19.07 4.93A10 10 0 1 0 22 12" /><path d="M16 12a4 4 0 0 0-4-4" /><path d="M12 12l4-4" /></svg>); }
function IconClock() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>); }
function IconNetwork() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M12 7.5v4M10 14l-3.5 3M14 14l3.5 3" /></svg>); }
function IconTerminal() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 17l6-6-6-6M12 19h8" /></svg>); }
function IconPlug() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22v-5M9 7V2M15 7V2M6 7h12v3a6 6 0 0 1-12 0V7z" /></svg>); }
function IconDoc() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>); }
function IconShield() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>); }
function IconCog() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>); }
function IconMenu() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>); }
function IconSearch() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>); }
function IconPlus() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>); }
function IconBell() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>); }
function IconLogout() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>); }
function IconChat() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>); }
