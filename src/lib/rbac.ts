// ============================================================================
// rbac.ts — Role-Based Access Control.
//
// Defines user roles and their permissions. Roles are stored in the users
// table and mirrored to Supabase app_metadata for RLS policies.
// ============================================================================

export type Role = "admin" | "pentester" | "analyst" | "viewer";

export const ROLES: { id: Role; label: string; description: string }[] = [
  { id: "admin", label: "Administrator", description: "Full access — manage users, providers, all scans & settings" },
  { id: "pentester", label: "Penetration Tester", description: "Run scans, sub-scans, MCP tools, VPN, CTF toolkit, exports" },
  { id: "analyst", label: "Security Analyst", description: "Run & view scans, generate reports" },
  { id: "viewer", label: "Viewer", description: "Read-only access to scans and reports" },
];

export type Permission =
  | "scan:run"
  | "scan:read"
  | "scan:delete"
  | "subscan:run"
  | "mcp:manage"
  | "vpn:manage"
  | "report:export"
  | "toolkit:use"
  | "user:manage"
  | "admin:access"
  | "settings:manage";

const ALL: Permission[] = [
  "scan:run", "scan:read", "scan:delete", "subscan:run",
  "mcp:manage", "vpn:manage", "report:export", "toolkit:use",
  "user:manage", "admin:access", "settings:manage",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,
  pentester: [
    "scan:run", "scan:read", "scan:delete", "subscan:run",
    "mcp:manage", "vpn:manage", "report:export", "toolkit:use",
  ],
  analyst: ["scan:run", "scan:read", "report:export"],
  viewer: ["scan:read", "report:export"],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  return perms.includes(permission);
}

export function getPermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

export function isValidRole(role: string): role is Role {
  return ["admin", "pentester", "analyst", "viewer"].includes(role);
}
