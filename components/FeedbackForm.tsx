"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  FEEDBACK_KINDS,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUPPORT_EMAIL,
  SUPPORT_PATH,
} from "@/lib/feedback";
import Link from "next/link";

type State = { status: "idle" | "sending" | "sent" } | { status: "error"; message: string };

/**
 * The suggestion box, replacing the Google Form.
 *
 * One textarea and one optional email. The old form asked several questions
 * and the honest reading of that is that it was designed for whoever collates
 * the answers rather than for the person filling it in — every extra field on
 * an unpaid, unprompted piece of feedback is a reason to close the tab. Kind
 * is a small select because it costs one click and makes triage possible; the
 * page path is captured silently for the same reason and asks nothing.
 */
export function FeedbackForm() {
  const pathname = usePathname();
  const [kind, setKind] = useState<string>(FEEDBACK_KINDS[0].value);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  /** Honeypot. Hidden from people, offered to anything filling every input. */
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const remaining = MESSAGE_MAX - message.length;
  const tooShort = message.trim().length > 0 && message.trim().length < MESSAGE_MIN;
  const canSend = message.trim().length >= MESSAGE_MIN && state.status !== "sending";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    setState({ status: "sending" });

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, email, website, path: pathname }),
      });

      if (response.ok) {
        setState({ status: "sent" });
        setMessage("");
        setEmail("");
        return;
      }

      // 429 carries no useful body text for a person, so it is worded here.
      if (response.status === 429) {
        setState({
          status: "error",
          message: "That is a few messages in a short time. Please try again in a little while.",
        });
        return;
      }

      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setState({ status: "error", message: body?.error ?? "Something went wrong. Please try again." });
    } catch {
      setState({
        status: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    }
  }

  if (state.status === "sent") {
    return (
      <div className="rounded-2xl border border-terracotta/25 bg-surface p-6">
        <p className="text-[11px] tracking-[0.18em] text-terracotta uppercase">Thank you</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          That is in. Every suggestion gets read, and they are the only thing deciding what gets
          built next. If you left an address you may hear back; if you would rather have a
          conversation,{" "}
          <Link href={SUPPORT_PATH} className="text-terracotta underline underline-offset-4">
            get in touch
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => setState({ status: "idle" })}
          className="mt-5 text-sm text-terracotta underline underline-offset-4"
        >
          Leave another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className="text-[11px] tracking-[0.18em] text-ink-faint uppercase">
          What is this about?
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {FEEDBACK_KINDS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${
                kind === option.value
                  ? "border-terracotta bg-terracotta text-on-accent"
                  : "border-rule text-ink-soft hover:border-terracotta hover:text-terracotta"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="feedback-message"
          className="block text-[11px] tracking-[0.18em] text-ink-faint uppercase"
        >
          Your message
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
          rows={6}
          required
          minLength={MESSAGE_MIN}
          maxLength={MESSAGE_MAX}
          placeholder="What would have made this more useful?"
          className="mt-3 w-full rounded-xl border border-rule bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors focus:border-terracotta"
        />
        <p className="mt-2 text-xs text-ink-faint">
          {tooShort
            ? `A little more detail, please — at least ${MESSAGE_MIN} characters.`
            : `${remaining} characters left.`}
        </p>
      </div>

      <div>
        <label
          htmlFor="feedback-email"
          className="block text-[11px] tracking-[0.18em] text-ink-faint uppercase"
        >
          Email <span className="normal-case">(optional)</span>
        </label>
        <input
          id="feedback-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="Only if you would like a reply"
          className="mt-3 w-full rounded-xl border border-rule bg-surface px-4 py-3 text-[15px] text-ink outline-none transition-colors focus:border-terracotta"
        />
        <p className="mt-2 text-xs text-ink-faint">
          Used to reply to you and nothing else. Leave it blank and the message is anonymous.
        </p>
      </div>

      {/* Honeypot: off-screen rather than display:none, which some bots skip,
          and aria-hidden with tabIndex -1 so nobody using a keyboard or a
          screen reader ever meets it. */}
      <div aria-hidden="true" className="absolute left-[-9999px] w-px overflow-hidden">
        <label htmlFor="feedback-website">Website</label>
        <input
          id="feedback-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-terracotta-deep">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canSend}
          className="btn-primary rounded-full px-7 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
        >
          {state.status === "sending" ? "Sending…" : "Send it"}
        </button>
        <p className="text-xs text-ink-faint">
          Or email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-terracotta underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </form>
  );
}
