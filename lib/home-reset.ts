/**
 * Clicking the wordmark while already on "/" is a no-op as far as the router is
 * concerned — Next.js does not remount a route you are already on, so the quiz
 * keeps whatever state it had and the click looks broken.
 *
 * The header broadcasts this event instead, and QuizLauncher collapses back to
 * the landing state when it hears it. Unmounting the quiz is what clears the
 * answers and results, so there is nothing else to reset.
 */
export const HOME_RESET_EVENT = "giftfinder:home-reset";
