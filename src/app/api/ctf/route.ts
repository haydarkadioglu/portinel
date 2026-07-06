import { NextRequest, NextResponse } from "next/server";
import {
  autoDecode,
  toBase64,
  toHex,
  toUrl,
  toBinary,
  rot13,
  caesar,
  atbash,
  vigenere,
  xor,
  xorHex,
  hashAll,
  identifyHash,
  convertBase,
  decodeJwt,
  analyseString,
} from "@/lib/ctf";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = rateLimit(`ctf:${user.id}`, 60, 2);
  if (!limited.ok)
    return NextResponse.json({ error: "Rate limit reached." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const { tool, input, key, shift, from } = body || {};
  if (!input)
    return NextResponse.json({ error: "Input is required." }, { status: 400 });
  const data = String(input).slice(0, 50000);

  try {
    switch (tool) {
      case "auto":
        return NextResponse.json(autoDecode(data));
      case "encode-base64":
        return NextResponse.json({ tool, ok: true, output: toBase64(data) });
      case "encode-hex":
        return NextResponse.json({ tool, ok: true, output: toHex(data) });
      case "encode-url":
        return NextResponse.json({ tool, ok: true, output: toUrl(data) });
      case "encode-binary":
        return NextResponse.json({ tool, ok: true, output: toBinary(data) });
      case "rot13":
        return NextResponse.json({ tool, ok: true, output: rot13(data) });
      case "caesar":
        return NextResponse.json({ tool, ok: true, output: caesar(data, Number(shift) || 0) });
      case "atbash":
        return NextResponse.json({ tool, ok: true, output: atbash(data) });
      case "vigenere":
        return NextResponse.json({ tool, ok: true, output: vigenere(data, String(key || ""), false) });
      case "vigenere-decrypt":
        return NextResponse.json({ tool, ok: true, output: vigenere(data, String(key || ""), true) });
      case "xor":
        return NextResponse.json({ tool, ok: true, output: xor(data, String(key || "")) });
      case "xor-hex":
        return NextResponse.json({ tool, ok: true, output: xorHex(data, String(key || "")) });
      case "hash":
        return NextResponse.json(hashAll(data));
      case "identify-hash":
        return NextResponse.json(identifyHash(data));
      case "base":
        return NextResponse.json(convertBase(data, Number(from) || 10));
      case "jwt":
        return NextResponse.json(decodeJwt(data));
      case "analyse":
        return NextResponse.json(analyseString(data));
      default:
        return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Tool failed." }, { status: 500 });
  }
}
