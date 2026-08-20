"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
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
  const ctaRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  /**
   * The button grows slightly as it rises through the viewport.
   *
   * Tied to the element's own position rather than to raw scroll distance, so
   * it behaves the same whether the hero is tall on a desktop or crammed on a
   * phone. "start end" is the moment its top edge meets the bottom of the
   * screen; "center center" is when it reaches the middle. Past that it holds
   * at full size rather than continuing to grow, which would read as a glitch.
   */
  const { scrollYProgress } = useScroll({
    target: ctaRef,
    offset: ["start end", "center center"],
  });
  // Both ranges start at the button's resting state, never below it. If these
  // never run — a stalled rAF, a backgrounded tab, motion failing to load —
  // the button is left exactly as its CSS draws it. Animating *up* from
  // nothing would mean the primary call to action is invisible when the
  // animation is the thing that broke.
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.04]);
  const lift = useTransform(scrollYProgress, [0, 1], [8, 0]);

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
      <div ref={ctaRef} className="flex flex-col items-center gap-3">
        {/* Two wrappers, because three animations want the same two properties
            and each element can only own one writer per property: the outer one
            plays once on arrival, the inner one tracks scroll, and whileTap on
            the button itself handles the press.

            The arrival animation is what carries the emphasis on a desktop,
            where the hero is short enough that the button already sits past the
            middle of the screen on load and the scroll transform is finished
            before anyone touches the wheel. On a phone it is the other way
            round. */}
        <motion.div
          initial={reduceMotion ? false : { y: 16, scale: 0.97 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 210, damping: 20, delay: 0.12 }}
        >
          <motion.div style={reduceMotion ? undefined : { scale, y: lift }}>
            <motion.button
              type="button"
              onClick={() => setLaunched(true)}
              whileTap={{ scale: 0.98 }}
              className="btn-primary btn-launch inline-flex items-center gap-3 rounded-full px-12 py-5 text-lg font-medium"
            >
              Launch Gift Finder
              <span aria-hidden className="btn-arrow">
                →
              </span>
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Naming the cost is what actually converts — the button can only make
            itself seen, this makes it feel cheap to press. The third item is the
            independence claim: it lives here, in the same terse register as the
            other two, rather than in the headline copy where stating it at
            length read as protesting too much. Parallel "No X" phrasing keeps
            the three reading as one list. */}
        {/* text-center because the flex parent only centres this while it is a
            single line, and three items wrap on a phone. The nowrap spans keep
            any break between items rather than through one, and binding each
            separator to the item before it stops a line starting with a bare
            middot. */}
        <p className="mt-1 text-center text-[13px] tracking-[0.14em] text-balance text-ink-faint uppercase">
          <span className="whitespace-nowrap">About 30 seconds ·</span>{" "}
          <span className="whitespace-nowrap">No sign-up ·</span>{" "}
          <span className="whitespace-nowrap">No sponsors</span>
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
