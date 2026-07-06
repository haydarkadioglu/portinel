import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getScan } from "@/lib/scan-service";
import { buildMarkdown, buildJSON, buildPortsCSV, buildFindingsCSV } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const scan = await getScan(id, user.id);
  if (!scan || !scan.results)
    return NextResponse.json({ error: "Report unavailable" }, { status: 404 });

  const format = new URL(req.url).searchParams.get("format") || "json";
  const safeTarget = scan.target.replace(/[^a-z0-9.-]/gi, "_");

  if (format === "md") {
    return new NextResponse(buildMarkdown(scan.results), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="portinel-${safeTarget}.md"`,
      },
    });
  }
  if (format === "ports") {
    return new NextResponse(buildPortsCSV(scan.results), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="portinel-${safeTarget}-ports.csv"`,
      },
    });
  }
  if (format === "findings") {
    return new NextResponse(buildFindingsCSV(scan.results), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="portinel-${safeTarget}-findings.csv"`,
      },
    });
  }
  return new NextResponse(buildJSON(scan.results), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="portinel-${safeTarget}.json"`,
    },
  });
}
