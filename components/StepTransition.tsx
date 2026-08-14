"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Card-swipe step transition in the style of Hinge/Tinder: the outgoing step
 * slides out to the left while shrinking slightly, the incoming one springs in
 * from the right and settles.
 *
 * Spring physics rather than a fixed-duration ease — the slight overshoot and
 * natural settle is what makes those apps feel responsive instead of scripted.
 *
 * Kept as a single DOM tree on purpose: an earlier attempt duplicated children
 * so two halves could separate, which gave every input a second copy with its
 * own React state (the occasion search filtered one list while the other showed
 * stale chips).
 */

const OFFSET = 56;

const SPRING = {
  type: "spring",
  stiffness: 320,
  damping: 34,
  mass: 0.9,
} as const;

export function StepTransition({
  transitionKey,
  children,
}: {
  transitionKey: string | number;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey}
        initial={{ x: OFFSET, opacity: 0, scale: 0.97 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ x: -OFFSET, opacity: 0, scale: 0.97 }}
        transition={{
          ...SPRING,
          // Fade faster than the slide so cards never look muddy mid-swap.
          opacity: { duration: 0.18, ease: "easeOut" },
        }}
        style={{ willChange: "transform, opacity" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
