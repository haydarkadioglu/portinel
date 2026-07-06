import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("user"), // user | admin
    plan: text("plan").notNull().default("free"), // free | pro | enterprise
    status: text("status").notNull().default("active"), // active | suspended
    title: text("title"),
    company: text("company"),
    avatarColor: text("avatar_color").default("#22d3ee"),
    scanCount: integer("scan_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------
export const scans = pgTable(
  "scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    targetType: text("target_type").notNull(),
    scanTypes: text("scan_types").array().notNull(),
    status: text("status").notNull().default("queued"),
    riskScore: integer("risk_score"),
    grade: text("grade"),
    openPortCount: integer("open_port_count").default(0).notNull(),
    results: jsonb("results"),
    error: text("error"),
    shareToken: text("share_token").unique(),
    durationMs: integer("duration_ms"),
    parentId: uuid("parent_id"), // for sub-scan trees (self-reference, cascade)
    rootId: uuid("root_id"), // the top-level scan in a tree (fast descendant fetch)
    label: text("label"), // e.g. "subdomain", "login-page", "deep"
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("scans_user_idx").on(t.userId),
    index("scans_created_idx").on(t.createdAt),
    index("scans_status_idx").on(t.status),
    index("scans_target_idx").on(t.target),
    index("scans_parent_idx").on(t.parentId),
    index("scans_root_idx").on(t.rootId),
  ],
);

// ---------------------------------------------------------------------------
// Chat messages — persistent AI conversation memory per scan
// ---------------------------------------------------------------------------
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    provider: text("provider"), // rule | openrouter | deepseek
    toolsUsed: jsonb("tools_used"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("chat_scan_idx").on(t.scanId)],
);

// ---------------------------------------------------------------------------
// API keys (hashed at rest)
// ---------------------------------------------------------------------------
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scopes: text("scopes").array().default(["scans:read", "scans:run"]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    requests: integer("requests").default(0).notNull(),
    ratePerHour: integer("rate_per_hour").default(100).notNull(),
    revoked: boolean("revoked").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resource: text("resource"),
    resourceId: text("resource_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    status: text("status").default("success").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("audit_user_idx").on(t.userId),
    index("audit_created_idx").on(t.createdAt),
    index("audit_action_idx").on(t.action),
  ],
);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id").references(() => scans.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("text").notNull(),
    severity: text("severity").default("info").notNull(),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("notif_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Scheduled / recurring scans
// ---------------------------------------------------------------------------
export const scheduledScans = pgTable(
  "scheduled_scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    scanTypes: text("scan_types").array().notNull(),
    frequency: text("frequency").notNull().default("weekly"), // daily|weekly|monthly
    enabled: boolean("enabled").default(true).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("sched_next_idx").on(t.nextRunAt), index("sched_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// VPN configurations — encrypted OpenVPN profiles for in-LAN scanning.
// ---------------------------------------------------------------------------
export const vpnConfigs = pgTable(
  "vpn_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Remote gateway parsed from the .ovpn (remote <host> <port> <proto>)
    remoteHost: text("remote_host"),
    remotePort: integer("remote_port"),
    remoteProto: text("remote_proto"), // udp | tcp
    // The full .ovpn content, encrypted at rest with AES-256-GCM.
    encryptedConfig: text("encrypted_config").notNull(),
    connectionStatus: text("connection_status").notNull().default("disconnected"), // connected|connecting|disconnected|error
    tunnelIp: text("tunnel_ip"),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("vpn_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Webhooks — notify external systems (Slack/Discord/custom) on scan completion
// ---------------------------------------------------------------------------
export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    events: text("events").array().default(["scan.completed"]).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    lastStatus: integer("last_status"),
    deliveryCount: integer("delivery_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("webhooks_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Platform settings — key/value store for AI provider config, etc.
// ---------------------------------------------------------------------------
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// MCP connectors — external tool servers (SSE transport), e.g. kalide.
// ---------------------------------------------------------------------------
export const mcpConnectors = pgTable(
  "mcp_connectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    serverName: text("server_name"),
    serverVersion: text("server_version"),
    tools: jsonb("tools").default([]).notNull(),
    status: text("status").notNull().default("disconnected"),
    lastError: text("last_error"),
    autoConnect: boolean("auto_connect").default(false).notNull(),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("mcp_conn_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// MCP executions — log of every tool invocation + result.
// ---------------------------------------------------------------------------
export const mcpExecutions = pgTable(
  "mcp_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => mcpConnectors.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    args: jsonb("args").default({}).notNull(),
    result: text("result"),
    durationMs: integer("duration_ms").default(0).notNull(),
    success: boolean("success").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("mcp_exec_conn_idx").on(t.connectorId),
    index("mcp_exec_created_idx").on(t.createdAt),
  ],
);
