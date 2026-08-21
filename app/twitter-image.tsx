import { contentType, shareCard, size } from "@/lib/og-image";

/**
 * Same card as the Open Graph one. Next only emits `twitter:image` from a
 * `twitter-image` file, so pointing at the shared renderer is what stops the
 * card falling back to the small text-only `summary` layout.
 */
export const alt = "Gift Finder: thoughtful gifts for any occasion";
export { contentType, size };

export default function Image() {
  return shareCard();
}
