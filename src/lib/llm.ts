// ============================================================================
// llm.ts — Multi-provider LLM abstraction for the AI assistant.
//
// Supports:
//   • OpenRouter  (https://openrouter.ai/api/v1) — OpenAI-compatible, many models
//   • DeepSeek    (https://api.deepseek.com)      — OpenAI-compatible
//   • Rule engine (deterministic, offline fallback)
//
// The runtime resolves the configured active provider, attempts the call, and
// transparently falls through to the fallback provider → rule engine if a
// provider is unavailable, misconfigured, or errors out.
// ============================================================================
import { getAiSettings, type ProviderId } from "./settings";
import { answerQuestion } from "./ai-chat";
import { callTool, type McpTool } from "./mcp";
import type { ScanResult } from "./types";

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

export interface ChatResult {
  answer: string;
  provider: ProviderId;
  usedFallback: boolean;
  toolsUsed?: { connector: string; tool: string }[];
}

// ---------------------------------------------------------------------------
// Provider endpoints (both OpenAI-compatible)
// ---------------------------------------------------------------------------
const ENDPOINTS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
};

const TITLES: Record<string, string> = {
  openrouter: "Portinel",
  deepseek: "Portinel",
};

// ---------------------------------------------------------------------------
// System prompt + scan context
// ---------------------------------------------------------------------------
function buildScanContext(scan: ScanResult): string {
  const lines: string[] = [];
  lines.push(`TARGET: ${scan.meta.target} (${scan.meta.targetType})`);
  lines.push(`IP(s): ${scan.meta.ipAddresses.join(", ") || "unknown"}`);
  if (scan.host.geo)
    lines.push(`GEO: ${scan.host.geo.city}, ${scan.host.geo.country} · ${scan.host.geo.isp}`);
  if (scan.host.os) lines.push(`OS GUESS: ${scan.host.os.guess} (${(scan.host.os.confidence * 100).toFixed(0)}%)`);

  lines.push(`RISK SCORE: ${scan.risk.score}/100 (grade ${scan.risk.grade} — ${scan.risk.label})`);
  if (scan.risk.deductions.length) {
    lines.push("DEDUCTIONS:");
    scan.risk.deductions.slice(0, 12).forEach((d) => lines.push(`  - [${d.severity}] ${d.reason} (-${d.points})`));
  }

  const open = scan.ports.filter((p) => p.state === "open");
  if (open.length) {
    lines.push(`OPEN PORTS (${open.length}):`);
    open.slice(0, 25).forEach((p) =>
      lines.push(`  - ${p.port}/tcp ${p.service}${p.product ? ` ${p.product}${p.version ? ` ${p.version}` : ""}` : ""}${p.cvss ? ` (CVSS~${p.cvss})` : ""}`),
    );
  }

  if (scan.vulnerabilities.length) {
    lines.push(`VULNERABILITIES (${scan.vulnerabilities.length}):`);
    scan.vulnerabilities.slice(0, 12).forEach((v) =>
      lines.push(`  - ${v.cve} (CVSS ${v.cvss}, ${v.severity}${v.exploit ? ", EXPLOIT" : ""}) ${v.title} [${v.product}${v.version ? ` ${v.version}` : ""}]`),
    );
  }

  if (scan.ssl.length) {
    const s = scan.ssl[0];
    lines.push(`TLS: ${s.subjectCN} grade ${s.grade}, ${s.tlsVersion}/${s.cipherName}, expires ${s.daysUntilExpiry}d${s.weakConfigs.length ? `, weak: ${s.weakConfigs.join("; ")}` : ""}`);
  }

  if (scan.waf?.detected) lines.push(`WAF: ${scan.waf.name} (${s_name(scan.waf.vendor)})`);
  if (scan.subdomains.length) lines.push(`SUBDOMAINS: ${scan.subdomains.length} discovered`);
  if (scan.technologies.length) lines.push(`TECH: ${scan.technologies.join(", ")}`);

  if (scan.web.discoveredPaths.length) {
    lines.push(`EXPOSED PATHS: ${scan.web.discoveredPaths.slice(0, 12).map((p) => `${p.path}(${p.status})`).join(", ")}`);
  }
  if (scan.web.sourceDisclosure.length) lines.push(`SOURCE LEAKS: ${scan.web.sourceDisclosure.map((s) => s.type).join(", ")}`);
  if (scan.web.cors.allowed) lines.push(`CORS: permissive${scan.web.cors.credentials ? " + credentials" : ""}`);

  return lines.join("\n");
}
function s_name(v?: string) {
  return v || "";
}

const SYSTEM_PROMPT = `You are Portinel AI, an expert cybersecurity analyst embedded in a reconnaissance platform.
You are analysing a completed network/security scan. Use ONLY the provided scan context to answer.
Be concise, technical and actionable. Use markdown (**bold**, bullet lists).

Crucially, when discussing vulnerabilities or misconfigurations:
1. Provide secure, non-destructive Proof of Concept (PoC) commands or payloads (e.g., specific curl requests, nmap commands, or configuration checks) to help the user verify the findings.
2. Outline the exact exploitation mechanics (how an attacker would proceed) and immediately follow it with specific remediation/remediation code, config changes, or patches.

If the user's question isn't answerable from the scan data, say so briefly.`;

// ---------------------------------------------------------------------------
// Single OpenAI-compatible completion call
// ---------------------------------------------------------------------------
async function callOpenAiCompatible(
  provider: "openrouter" | "deepseek",
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  tools?: AiTool[],
): Promise<{ content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["x-title"] = TITLES.openrouter;
    if (process.env.NEXT_PUBLIC_APP_URL) headers["http-referer"] = process.env.NEXT_PUBLIC_APP_URL;
  }

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 1200,
    stream: false,
  };
  if (tools && tools.length) {
    payload.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.id,
        description: t.description,
        parameters: t.parameters || { type: "object", properties: {} },
      },
    }));
    payload.tool_choice = "auto";
  }

  const res = await fetch(ENDPOINTS[provider], {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${provider} API error ${res.status}: ${txt.slice(0, 160)}`);
  }
  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
    }[];
  };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error(`${provider} returned an empty response.`);
  return msg;
}

// Convert MCP tools into OpenAI function-calling tool definitions with stable ids.
interface AiTool {
  id: string; // connectorId::toolName
  description: string;
  parameters: Record<string, unknown>;
}

function buildAiTools(connectors: { id: string; tools: McpTool[] }[]): AiTool[] {
  const out: AiTool[] = [];
  for (const c of connectors) {
    for (const t of c.tools) {
      out.push({
        id: `${c.id}::${t.name}`,
        description: `[${t.name}] ${t.description || t.name}`,
        parameters: (t.inputSchema as Record<string, unknown>) || { type: "object", properties: {} },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolve + call with fallback chain
// ---------------------------------------------------------------------------
export async function chatAboutScan(
  scan: ScanResult,
  history: LlmMessage[],
  question: string,
  mcpConnectors?: { id: string; tools: McpTool[] }[],
  userId?: string,
  scanId?: string,
): Promise<ChatResult> {
  const cfg = await getAiSettings();
  const aiTools = mcpConnectors?.length ? buildAiTools(mcpConnectors) : undefined;

  // Build the full message array with scan context as the system message.
  let mcpHint = "";
  if (aiTools?.length) {
    mcpHint = `\n\nYou have access to ${aiTools.length} external tool(s) via MCP connectors. When a question would benefit from running an external tool (e.g. deeper analysis, code scanning, repository assessment), call the appropriate tool function. Summarise the tool's output for the user.`;
  }
  const systemContent = `${SYSTEM_PROMPT}${mcpHint}\n\n=== SCAN CONTEXT ===\n${buildScanContext(scan)}`;
  let messages: LlmMessage[] = [
    { role: "system", content: systemContent },
    ...history.slice(-8), // keep recent context
    { role: "user", content: question },
  ];

  // Define the ordered chain: active → fallback → rule.
  const chain: ProviderId[] = [];
  const add = (id: ProviderId | "none") => {
    if (id !== "none" && !chain.includes(id)) chain.push(id);
  };
  add(cfg.active);
  add(cfg.fallback);
  add("rule"); // always last resort

  let usedFallback = false;
  const toolsUsed: { connector: string; tool: string }[] = [];

  for (let i = 0; i < chain.length; i++) {
    const id = chain[i];
    if (i > 0) usedFallback = true;

    if (id === "rule") {
      return { answer: answerQuestion(scan, question), provider: "rule", usedFallback };
    }

    const pcfg = id === "openrouter" ? cfg.openrouter : cfg.deepseek;
    if (!pcfg.enabled || !pcfg.apiKey) continue;

    try {
      // Tool-calling loop: allow up to 4 tool invocations.
      for (let step = 0; step < 4; step++) {
        const msg = await callOpenAiCompatible(id, pcfg.apiKey, pcfg.model, messages, aiTools);

        // If the model wants to call tools, execute them via MCP.
        if (msg.tool_calls?.length && userId) {
          messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
          for (const tc of msg.tool_calls) {
            // tool id format: connectorId::toolName
            const sepIdx = tc.function.name.indexOf("::");
            const connectorId = sepIdx > 0 ? tc.function.name.slice(0, sepIdx) : "";
            const toolName = sepIdx > 0 ? tc.function.name.slice(sepIdx + 2) : tc.function.name;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch {
              /* malformed args */
            }
            toolsUsed.push({ connector: connectorId, tool: toolName });

            // Built-in agent tools (autonomous Portinel actions) vs MCP tools.
            let toolText: string;
            let toolError = false;
            if (connectorId === "__agent__") {
              const r = await executeAgentTool(toolName, scan, args, userId, scanId);
              toolText = r;
            } else {
              const res = await callTool(connectorId, toolName, args, userId);
              toolText = res.ok ? String(res.result).slice(0, 8000) : `Error: ${res.error}`;
              toolError = !res.ok;
            }
            messages.push({
              role: "tool",
              content: toolText,
              tool_call_id: tc.id,
              name: tc.function.name,
            });
          }
          continue; // let the model synthesise a final answer from tool results
        }

        // No tool calls — this is the final answer.
        const answer = msg.content?.trim();
        if (!answer) throw new Error(`${id} returned an empty response.`);
        return { answer, provider: id, usedFallback, toolsUsed };
      }
      throw new Error(`${id} exceeded tool-call loop depth.`);
    } catch (err) {
      const lastError = err instanceof Error ? err.message : "unknown error";
      console.error(`[llm] provider ${id} failed:`, lastError);
      continue; // try next in chain
    }
  }

  // Should be unreachable because rule is always last, but just in case:
  return { answer: answerQuestion(scan, question), provider: "rule", usedFallback: true };
}

// ---------------------------------------------------------------------------
// Built-in agent tools — autonomous actions the AI can trigger (not MCP).
// When the LLM calls a tool whose connector id is "__agent__", it's routed here.
// ---------------------------------------------------------------------------
async function executeAgentTool(
  toolName: string,
  scan: ScanResult,
  args: Record<string, unknown>,
  userId: string,
  scanId?: string,
): Promise<string> {
  const action = toolName.split("::")[0];

  if (action === "launch_subscan") {
    const target = String(args.target || "").trim();
    if (!target) return "Error: no target provided.";
    const modules = String(args.modules || "quick,ssl,http,web")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    try {
      const { createScan } = await import("./scan-service");
      const { coerceScanTypes } = await import("./validation");
      const record = await createScan(userId, {
        target,
        scanTypes: coerceScanTypes(modules.length ? modules : ["quick", "ssl", "http"]),
        parentId: scanId,
        label: "ai-subscan",
      });
      return `Sub-scan launched for ${target} (id: ${record.id}, status: ${record.status}). It is running in the background as a child of this scan. Results will appear in the scan tree. Modules: ${modules.join(", ") || "quick,ssl,http"}.`;
    } catch (e) {
      return `Error launching sub-scan: ${e instanceof Error ? e.message : "failed"}`;
    }
  }

  if (action === "list_subdomains") {
    const subs = scan.subdomains;
    if (!subs.length) return "No subdomains were discovered in this scan.";
    return subs
      .slice(0, 60)
      .map((s) => `${s.hostname} → ${s.ips[0] || "unresolved"}`)
      .join("\n");
  }

  if (action === "list_open_ports") {
    const open = scan.ports.filter((p) => p.state === "open");
    if (!open.length) return "No open ports detected.";
    return open
      .map((p) => `${p.port}/tcp ${p.service}${p.product ? ` ${p.product}${p.version ? ` ${p.version}` : ""}` : ""}`)
      .join("\n");
  }

  if (action === "list_findings") {
    const order = ["critical", "high", "medium", "low", "info"];
    const sorted = [...scan.findings].sort(
      (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
    );
    if (!sorted.length) return "No findings.";
    return sorted
      .slice(0, 40)
      .map((f) => `[${f.severity.toUpperCase()}] ${f.title}`)
      .join("\n");
  }

  return `Unknown agent tool: ${toolName}`;
}

// ---------------------------------------------------------------------------
// General AI Chat Assistant (General Chat interface)
// ---------------------------------------------------------------------------
const GENERAL_SYSTEM_PROMPT = `You are Portinel AI, an advanced AI security assistant and autonomous reconnaissance agent.
Your goal is to help users scan, analyze, and secure their digital assets.
You can:
1. Launch new security scans on targets using your launch_scan tool.
2. View recent scans using your list_recent_scans tool.
3. Fetch detailed scan findings using your get_scan_results tool.
4. Interact with external networks, utilities, and security tools using the Model Context Protocol (MCP) connectors connected to your session.

When asked to run a scan, do so directly using your tools. Do not hesitate or ask for permission if the user has requested it.
Always explain what you are doing. Present scan findings clearly, highlighting risk levels and mitigation strategies. Keep your responses concise, technical, and actionable.`;

function buildGeneralAgentTools(): { id: string; tools: McpTool[] }[] {
  return [
    {
      id: "__agent__",
      tools: [
        {
          name: "launch_scan",
          description: "Launch a new security reconnaissance scan on a target domain, host, or IP address. Modules can be customized.",
          inputSchema: {
            type: "object",
            properties: {
              target: {
                type: "string",
                description: "The domain, IP address, or hostname to scan (e.g. example.com or 192.168.1.100)",
              },
              modules: {
                type: "string",
                description: "Comma-separated scan types: deep,quick,ssl,http,subdomains,web,waf (default: quick,ssl,http)",
              },
            },
            required: ["target"],
          },
        },
        {
          name: "list_recent_scans",
          description: "List the 10 most recent scans run by the user, showing their ID, target, status, grade and risk score.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_scan_results",
          description: "Retrieve findings, open ports, and risk information for a specific scan ID.",
          inputSchema: {
            type: "object",
            properties: {
              scanId: {
                type: "string",
                description: "The unique UUID of the scan to fetch results for.",
              },
            },
            required: ["scanId"],
          },
        },
      ],
    },
  ];
}

async function executeGeneralAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  if (toolName === "launch_scan") {
    const target = String(args.target || "").trim();
    if (!target) return "Error: target is required.";
    const modules = String(args.modules || "quick,ssl,http,web")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    try {
      const { createScan } = await import("./scan-service");
      const { coerceScanTypes } = await import("./validation");
      const record = await createScan(userId, {
        target,
        scanTypes: coerceScanTypes(modules.length ? modules : ["quick", "ssl", "http"]),
        label: "ai-initiated",
      });
      return `Scan successfully launched for ${target} (id: ${record.id}, status: ${record.status}). Tell the user that the scan has been started in the background. They can view it in their history or they can ask you about it later.`;
    } catch (e) {
      return `Error launching scan: ${e instanceof Error ? e.message : "failed"}`;
    }
  }

  if (toolName === "list_recent_scans") {
    try {
      const { listScans } = await import("./scan-service");
      const recent = await listScans(userId, { limit: 10 });
      if (!recent.length) return "No recent scans found.";
      return recent
        .map((s) => `- Scan ID: ${s.id}, Target: ${s.target}, Status: ${s.status}, Grade: ${s.grade ?? "N/A"}, Score: ${s.riskScore ?? "N/A"}`)
        .join("\n");
    } catch (e) {
      return `Error listing scans: ${e instanceof Error ? e.message : "failed"}`;
    }
  }

  if (toolName === "get_scan_results") {
    const scanId = String(args.scanId || "").trim();
    if (!scanId) return "Error: scanId is required.";
    try {
      const { getScan } = await import("./scan-service");
      const scan = await getScan(scanId, userId);
      if (!scan) return "Error: scan not found.";
      if (scan.status === "failed") return `Scan failed: ${scan.error}`;
      if (scan.status !== "completed" || !scan.results) return `Scan is currently ${scan.status}.`;
      
      const findings = scan.results.findings;
      const ports = scan.results.ports.filter((p) => p.state === "open");
      return `Scan target: ${scan.target}
Status: ${scan.status}
Risk Score: ${scan.riskScore}/100 (Grade ${scan.grade})
Open ports: ${ports.map((p) => p.port).join(", ") || "None"}
Findings count: ${findings.length}
Findings summaries:
${findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`).join("\n")}`;
    } catch (e) {
      return `Error getting scan results: ${e instanceof Error ? e.message : "failed"}`;
    }
  }

  return `Error: Unknown agent tool ${toolName}`;
}

export async function generalAiChat(
  history: LlmMessage[],
  question: string,
  mcpConnectors?: { id: string; tools: McpTool[] }[],
  userId?: string,
): Promise<ChatResult> {
  const cfg = await getAiSettings();
  const agentTools = buildGeneralAgentTools();
  const connected = mcpConnectors ?? [];
  const allTools = [...connected, ...agentTools];
  const aiTools = buildAiTools(allTools);

  let mcpHint = "";
  if (connected.length) {
    mcpHint = `\n\nYou have access to external tools via MCP connectors. When a question would benefit from running an external tool (e.g. deeper analysis, code scanning, repository assessment), call the appropriate tool function. Summarise the tool's output for the user.`;
  }

  const systemContent = `${GENERAL_SYSTEM_PROMPT}${mcpHint}`;
  let messages: LlmMessage[] = [
    { role: "system", content: systemContent },
    ...history.slice(-10),
    { role: "user", content: question },
  ];

  const chain: ProviderId[] = [];
  const add = (id: ProviderId | "none") => {
    if (id !== "none" && !chain.includes(id)) chain.push(id);
  };
  add(cfg.active);
  add(cfg.fallback);
  add("rule");

  let usedFallback = false;
  const toolsUsed: { connector: string; tool: string }[] = [];

  for (let i = 0; i < chain.length; i++) {
    const id = chain[i];
    if (i > 0) usedFallback = true;

    if (id === "rule") {
      return { answer: "I am Portinel AI. I can run scans and check findings, but no AI providers are currently configured. Please configure your OpenRouter or DeepSeek keys in Settings.", provider: "rule", usedFallback };
    }

    const pcfg = id === "openrouter" ? cfg.openrouter : cfg.deepseek;
    if (!pcfg.enabled || !pcfg.apiKey) continue;

    try {
      for (let step = 0; step < 4; step++) {
        const msg = await callOpenAiCompatible(id, pcfg.apiKey, pcfg.model, messages, aiTools);

        if (msg.tool_calls?.length && userId) {
          messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
          for (const tc of msg.tool_calls) {
            const sepIdx = tc.function.name.indexOf("::");
            const connectorId = sepIdx > 0 ? tc.function.name.slice(0, sepIdx) : "";
            const toolName = sepIdx > 0 ? tc.function.name.slice(sepIdx + 2) : tc.function.name;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch { /* ignore */ }
            toolsUsed.push({ connector: connectorId, tool: toolName });

            let toolText: string;
            if (connectorId === "__agent__") {
              toolText = await executeGeneralAgentTool(toolName, args, userId);
            } else {
              const res = await callTool(connectorId, toolName, args, userId);
              toolText = res.ok ? String(res.result).slice(0, 8000) : `Error: ${res.error}`;
            }

            messages.push({
              role: "tool",
              content: toolText,
              tool_call_id: tc.id,
              name: tc.function.name,
            });
          }
          continue;
        }

        const answer = msg.content?.trim();
        if (!answer) throw new Error(`${id} returned an empty response.`);
        return { answer, provider: id, usedFallback, toolsUsed };
      }
      throw new Error(`${id} exceeded tool-call loop depth.`);
    } catch (err) {
      console.error(`[llm] general chat provider ${id} failed:`, err);
      continue;
    }
  }

  return { answer: "Failed to generate AI response.", provider: "rule", usedFallback: true };
}

// ---------------------------------------------------------------------------
// Connection test (used by the admin panel "Test" button)
// ---------------------------------------------------------------------------
export async function testProvider(
  provider: "openrouter" | "deepseek",
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const msg = await callOpenAiCompatible(provider, apiKey, model, [
      { role: "system", content: "Reply with exactly: PORTINEL_OK" },
      { role: "user", content: "ping" },
    ]);
    const answer = msg.content || "";
    return { ok: true, message: `Connected. Model replied: "${answer.slice(0, 40)}"` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed." };
  }
}
