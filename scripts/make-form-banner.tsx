/**
 * Renders the Google Forms header banner (1600x400) into `public/`.
 *
 * Google Forms only accepts a raster upload, so the wordmark cannot be sent as
 * the SVG it is everywhere else on the site. This draws it through the same
 * `next/og` path the share card uses, so the banner inherits the real palette
 * and the real Fraunces rather than a screenshot of them.
 *
 *   npx tsx scripts/make-form-banner.tsx
 *
 * Forms crops the header on narrow viewports, so everything that must survive
 * the crop stays inside the middle band; the corner parcels are decoration and
 * are expected to be eaten.
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

const WIDTH = 1600;
const HEIGHT = 400;

const PAPER = "#faf7f0";
const INK = "#1b1c24";
const INK_SOFT = "#575866";
const GOLD = "#8c6829";

// Same trick as lib/og-image.tsx: Satori needs real font bytes, and Google
// Fonts only serves the ttf it can read to a browser old enough to want one.
async function googleFont(family: string): Promise<ArrayBuffer | null> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}&display=swap`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
  }).then((res) => (res.ok ? res.text() : ""));

  const url = css.match(/src: url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
  if (!url) return null;

  const font = await fetch(url);
  return font.ok ? await font.arrayBuffer() : null;
}

/** The atmospheric parcel from components/GiftMark.tsx, at banner scale. */
function Parcel({ size, opacity, tilt }: { size: number; opacity: number; tilt: number }) {
  return (
    <svg
      width={size}
      height={size * (420 / 400)}
      viewBox="0 0 400 420"
      fill="none"
      style={{ opacity, transform: `rotate(${tilt}deg)` }}
    >
      <g stroke={GOLD} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round">
        <rect x="62" y="132" width="276" height="62" rx="10" />
        <rect x="86" y="194" width="228" height="182" rx="8" />
        <path d="M200 132v62" />
        <path d="M200 194v182" />
        <path d="M200 130c-30-18-46-44-27-55 19-10 27 30 27 55Z" />
        <path d="M200 130c30-18 46-44 27-55-19-10-27 30-27 55Z" />
      </g>
    </svg>
  );
}

async function main() {
  const [fraunces, inter] = await Promise.all([
    googleFont("Fraunces:opsz,wght@9..144,600"),
    googleFont("Inter:wght@400;500"),
  ]);

  if (!fraunces || !inter) {
    throw new Error("Could not fetch Fraunces/Inter from Google Fonts; retry when online.");
  }

  const WORDMARK = 112;
  // The lens is sized and nudged off the wordmark's own em, matching the
  // .wordmark-lens rule in globals.css.
  const LENS = WORDMARK * 0.48;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: PAPER,
          fontFamily: "Inter",
          position: "relative",
        }}
      >
        {/* Corner decoration only. Forms crops inward, so nothing here matters. */}
        <div style={{ display: "flex", position: "absolute", left: 96, top: 58 }}>
          <Parcel size={78} opacity={0.22} tilt={-12} />
        </div>
        <div style={{ display: "flex", position: "absolute", left: 208, top: 232 }}>
          <Parcel size={46} opacity={0.15} tilt={14} />
        </div>
        <div style={{ display: "flex", position: "absolute", right: 118, top: 74 }}>
          <Parcel size={54} opacity={0.17} tilt={16} />
        </div>
        <div style={{ display: "flex", position: "absolute", right: 214, top: 236 }}>
          <Parcel size={72} opacity={0.2} tilt={-8} />
        </div>

        {/* Wordmark. The "i" of Finder is a dotless ı (U+0131) carrying a
            magnifying glass as its tittle — a normal "i" would leave a real dot
            sitting inside the hollow glass. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontFamily: "Fraunces",
            fontSize: WORDMARK,
            lineHeight: 1.1,
            letterSpacing: -1,
            color: INK,
          }}
        >
          <span>Gift</span>
          <span style={{ display: "flex", color: GOLD, position: "relative" }}>
            <span>F</span>
            <span style={{ display: "flex", position: "relative" }}>
              <span>&#x131;</span>
              <svg
                width={LENS}
                height={LENS}
                viewBox="0 0 20 20"
                fill="none"
                style={{
                  position: "absolute",
                  left: -LENS * 0.05,
                  top: -LENS * 0.25,
                  color: INK,
                  transform: "rotate(-28deg)",
                }}
              >
                <circle cx="8" cy="8" r="5.4" stroke={INK} strokeWidth="2.6" />
                <path d="M12.3 12.3 17 17" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </span>
            <span>nder</span>
          </span>
        </div>

        <div style={{ display: "flex", marginTop: 34, height: 3, width: 132, backgroundColor: GOLD }} />

        <div
          style={{
            marginTop: 30,
            fontSize: 27,
            color: INK_SOFT,
          }}
        >
          Six questions, about thirty seconds, and a page of real things from real shops.
        </div>

        <div
          style={{
            marginTop: 22,
            fontSize: 17,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          thegiftfinder.net
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Fraunces", data: fraunces, weight: 600, style: "normal" },
        { name: "Inter", data: inter, weight: 400, style: "normal" },
      ],
    },
  );

  const out = path.join(process.cwd(), "public", "form-banner.png");
  await writeFile(out, Buffer.from(await image.arrayBuffer()));
  console.log(`Wrote ${out} (${WIDTH}x${HEIGHT})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
