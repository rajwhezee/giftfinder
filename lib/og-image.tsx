import { ImageResponse } from "next/og";

/**
 * The shared share-card, used by both `opengraph-image` and `twitter-image`.
 *
 * Before this the site sent og:title and og:description with no image at all,
 * so every link shared as a bare text blob and Twitter fell back to the small
 * `summary` card. The card is drawn rather than stored so the palette stays
 * tied to the design system in one place.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#faf7f0";
const INK = "#1b1c24";
const INK_SOFT = "#575866";
const GOLD = "#8c6829";

/**
 * Satori rasterises text itself, so it needs the actual font bytes; there is no
 * system font to fall back on inside the renderer. next/font keeps its copy
 * somewhere private to the build, so this fetches its own.
 *
 * Both faces, because Satori uses whatever font is registered for every string
 * it draws: with Fraunces alone the body lines and the eyebrow came out in the
 * display serif, which is not what the design system says. Fraunces is for the
 * headline, Inter for everything else.
 *
 * The archaic user agent is load-bearing: Google Fonts serves woff2 to anything
 * modern, and Satori reads ttf, otf and woff only. Pretending to be an old
 * browser is what gets a ttf back.
 *
 * A failure returns null rather than throwing. The build prerenders 36 routes
 * and a transient font CDN blip must not be what fails it. Without a face the
 * card falls back to Satori's default, which is a worse card and a shipped one.
 */
async function googleFont(family: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}&display=swap`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
    }).then((res) => (res.ok ? res.text() : ""));

    const url = css.match(/src: url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
    if (!url) return null;

    const font = await fetch(url);
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function shareCard(): Promise<ImageResponse> {
  const [fraunces, inter] = await Promise.all([
    googleFont("Fraunces:opsz,wght@9..144,600"),
    googleFont("Inter:wght@400;500"),
  ]);

  const fonts = [
    ...(fraunces ? [{ name: "Fraunces", data: fraunces, weight: 600 as const, style: "normal" as const }] : []),
    ...(inter ? [{ name: "Inter", data: inter, weight: 400 as const, style: "normal" as const }] : []),
  ];

  const display = fraunces ? "Fraunces" : "serif";
  const body = inter ? "Inter" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: PAPER,
          fontFamily: body,
          padding: "0 96px",
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          Gift Finder
        </div>

        <div
          style={{
            marginTop: 34,
            fontFamily: display,
            fontSize: 88,
            lineHeight: 1.05,
            color: INK,
            maxWidth: 900,
          }}
        >
          Thoughtful gifts for any occasion.
        </div>

        <div style={{ display: "flex", marginTop: 44, height: 3, width: 132, backgroundColor: GOLD }} />

        <div style={{ marginTop: 44, fontSize: 32, color: INK_SOFT, maxWidth: 860 }}>
          Six questions, about thirty seconds, and a page of real things from real shops.
        </div>

        <div style={{ marginTop: 22, fontSize: 26, color: INK_SOFT }}>
          Nothing sponsored. Nothing paid to rank.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );
}
