import { contentType, shareCard, size } from "@/lib/og-image";

export const alt = "Gift Finder: thoughtful gifts for any occasion";
export { contentType, size };

export default function Image() {
  return shareCard();
}
