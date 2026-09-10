import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  EMAIL_MAX,
  FEEDBACK_KIND_VALUES,
  MESSAGE_MAX,
  MESSAGE_MIN,
  RATE_LIMIT_PER_HOUR,
} from "@/lib/feedback";
import { prisma } from "@/lib/prisma";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * Accepts a suggestion from /feedback and writes it to Postgres.
 *
 * The only unauthenticated write endpoint on the site, which is the whole
 * reason for the shape of this file. Everything else here reads: a bad actor
 * against /api/recommend costs query time, a bad actor against this one leaves
 * rows behind forever.
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * In-memory burst guard, ahead of the durable one. See below.
 *
 * Counts requests, not accepted suggestions, so it has to leave room for a
 * person getting it wrong: at three a minute somebody who mistyped their email
 * twice and then submitted was locked out for a minute by their own typos.
 * Eight stops a script and never stops a human.
 */
const BURST_LIMIT = 8;
const BURST_WINDOW_MS = 60_000;

/**
 * Salt for the throttle hash. A constant fallback is deliberate: the hash
 * exists so a spam counter does not keep plaintext addresses, not to make the
 * addresses unrecoverable, and a missing environment variable must not turn
 * rate limiting off. Set FEEDBACK_SALT in Vercel to do better than this.
 */
const SALT = process.env.FEEDBACK_SALT ?? "giftfinder-feedback-throttle";

function hashIp(ip: string): string {
  return createHash("sha256").update(`${SALT}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Deliberately loose. This decides whether a reply address is worth storing,
 * not whether it can receive mail — only sending to it proves that, and a
 * stricter pattern's failure mode is rejecting somebody's real and unusual
 * address, which loses the feedback as well as the address.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

interface Parsed {
  kind: string;
  message: string;
  email: string | null;
  path: string | null;
}

/** Returns the row to write, or the reason it will not be written. */
function parse(body: unknown): { ok: true; value: Parsed } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Invalid request body" };
  const { kind, message, email, path, website } = body as Record<string, unknown>;

  // Honeypot. A field no human sees, so anything in it came from something
  // filling every input on the page. Handled by the caller, not here: the
  // right answer is to accept and discard, because telling a bot it failed is
  // telling it what to change.
  if (typeof website === "string" && website.trim().length > 0) {
    return { ok: false, error: "honeypot" };
  }

  if (typeof message !== "string") return { ok: false, error: "A message is required" };
  const trimmed = message.trim();
  if (trimmed.length < MESSAGE_MIN) {
    return { ok: false, error: `Please write at least ${MESSAGE_MIN} characters` };
  }
  if (trimmed.length > MESSAGE_MAX) {
    return { ok: false, error: `Please keep it under ${MESSAGE_MAX} characters` };
  }

  const chosenKind = typeof kind === "string" && FEEDBACK_KIND_VALUES.includes(kind) ? kind : "suggestion";

  let storedEmail: string | null = null;
  if (typeof email === "string" && email.trim().length > 0) {
    const candidate = email.trim();
    if (candidate.length > EMAIL_MAX || !looksLikeEmail(candidate)) {
      return { ok: false, error: "That email address does not look right" };
    }
    storedEmail = candidate;
  }

  // Site-relative only. The client sends this, so without the check a caller
  // could store any string they liked and the column would become a place to
  // park links for whoever reads the table.
  let storedPath: string | null = null;
  if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && path.length <= 200) {
    storedPath = path;
  }

  return { ok: true, value: { kind: chosenKind, message: trimmed, email: storedEmail, path: storedPath } };
}

export async function POST(request: Request) {
  const ip = clientKey(request);

  // Two layers, because they fail differently. This one is free and catches a
  // script hammering one warm instance, but it is per-instance memory and a
  // cold start forgets everything, so on its own it would let persisted spam
  // through. See lib/rate-limit.ts.
  const burst = rateLimit(`feedback:${ip}`, BURST_LIMIT, BURST_WINDOW_MS);
  if (!burst.ok) return tooManyRequests(burst.retryAfter);

  const json = await request.json().catch(() => null);
  const parsed = parse(json);

  if (!parsed.ok) {
    // The honeypot gets the success it would get for a real post. Nothing is
    // written and nothing is revealed.
    if (parsed.error === "honeypot") {
      return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const ipHash = hashIp(ip);

  // The durable layer: counted in Postgres, so it holds across instances and
  // across cold starts. This is the one that decides whether a row is written.
  const recent = await prisma.submissionThrottle.count({
    where: { ipHash, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
  });
  if (recent >= RATE_LIMIT_PER_HOUR) return tooManyRequests(60 * 15);

  // Throttle row and suggestion in one transaction. Written together or not at
  // all, so a failure cannot leave a stored message that the counter has no
  // record of.
  await prisma.$transaction([
    prisma.suggestion.create({ data: parsed.value }),
    prisma.submissionThrottle.create({ data: { ipHash } }),
  ]);

  return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
