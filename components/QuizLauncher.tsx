"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { HOME_RESET_EVENT } from "@/lib/home-reset";
import { GiftQuiz } from "./GiftQuiz";

/**
 * Gates the quiz behind a single primary action.
 *
 * The quiz used to render inline on first paint, directly above the "browse by
 * occasion" chips. That gave the landing page two competing entry points with no
 * hierarchy between them, and pushed the pitch off the fold. Here the hero makes
 * its case, one button commits you to the quiz, and the occasion chips sit below
 * as the clearly secondary path.
 *
 * Revealing in place rather than routing to /quiz keeps the occasion links in the
 * server-rendered HTML — they are the only crawlable gift markup on this page.
 */
export function QuizLauncher() {
  const [launched, setLaunched] = useState(false);
  const quizRef = useRef<HTMLDivElement>(null);

  // The wordmark in the header asks for this when it is clicked on "/". Dropping
  // back to the un-launched state unmounts the quiz, which is what discards the
  // answers and any results along with it.
  useEffect(() => {
    const reset = () => setLaunched(false);
    window.addEventListener(HOME_RESET_EVENT, reset);
    return () => window.removeEventListener(HOME_RESET_EVENT, reset);
  }, []);

  useEffect(() => {
    if (!launched) return;

    // Runs after commit, so the quiz is mounted and measurable by now.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    quizRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
    // Send the keyboard along with the eye, or focus is left back on a button
    // that no longer exists.
    quizRef.current?.focus({ preventScroll: true });
  }, [launched]);

  if (!launched) {
    return (
      <div className="flex flex-col items-center gap-3">
        {/* Says the whole proposition in one sentence, in plain words, right
            where the decision to click is made. The headline above is doing
            tone; this is doing comprehension. */}
        <p className="mb-2 max-w-md text-center text-base leading-relaxed text-pretty text-ink-soft">
          Answer six quick questions about them and we&apos;ll find the one.
        </p>

        <motion.button
          type="button"
          onClick={() => setLaunched(true)}
          whileTap={{ scale: 0.98 }}
          className="btn-primary btn-launch inline-flex items-center gap-2.5 rounded-full px-10 py-4.5 text-base font-medium"
        >
          Launch Gift Finder
          <span aria-hidden className="btn-arrow">
            →
          </span>
        </motion.button>

        {/* Naming the cost is what actually converts — the button can only make
            itself seen, this makes it feel cheap to press. */}
        <p className="text-xs tracking-[0.14em] text-ink-faint uppercase">
          About 30 seconds · No sign-up
        </p>
      </div>
    );
  }

  return (
    <motion.div
      ref={quizRef}
      tabIndex={-1}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="outline-none"
    >
      <GiftQuiz />
    </motion.div>
  );
}
