import type { CSSProperties } from "react";

/**
 * Atmospheric background: a scattered field of small parcels drifting across the
 * page. Outline only, antique gold at low opacity, so they read as embossed into
 * the ivory rather than drawn on it.
 *
 * There used to be one large ghosted parcel centred behind the hero. It fought
 * with the headline and the CTA sitting on top of it, so the field carries the
 * atmosphere alone now — more parcels, none of them large enough to compete.
 *
 * Entirely decorative — aria-hidden and pointer-events-none throughout.
 */

/** Shared parcel outline. Stroke is heavy because these render at 18-48px. */
function Parcel() {
  return (
    <svg viewBox="0 0 400 420" fill="none" className="h-full w-full">
      <g stroke="var(--terracotta)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round">
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

interface Floater {
  /** Percentage positions so the field reflows with the viewport. */
  left: string;
  top: string;
  size: number;
  opacity: number;
  tilt: number;
  dur: number;
  delay: number;
  /** Runs the drift loop backwards, so the field never moves in unison. */
  reverse?: boolean;
  /** Small screens only get the sparser subset — the full set is noisy at 390px. */
  smallScreen?: boolean;
}

// Spread across the whole field rather than banded at the edges, now that no
// large parcel occupies the centre. Middle-column entries are held to lower
// opacity and smaller sizes: the headline and CTA sit directly over them, and
// once the quiz launches the opaque card covers that column entirely.
const FLOATERS: Floater[] = [
  // Left edge
  { left: "2%", top: "12%", size: 44, opacity: 0.26, tilt: -12, dur: 11, delay: 0, smallScreen: true },
  { left: "7%", top: "31%", size: 26, opacity: 0.17, tilt: 15, dur: 12.5, delay: 1.1, reverse: true },
  { left: "4%", top: "52%", size: 33, opacity: 0.22, tilt: 8, dur: 13, delay: 1.4 },
  { left: "9%", top: "71%", size: 21, opacity: 0.15, tilt: -22, dur: 10, delay: 2.4, reverse: true },
  { left: "3%", top: "88%", size: 30, opacity: 0.2, tilt: 5, dur: 12.2, delay: 0.7, smallScreen: true },

  // Left-inner
  { left: "15%", top: "5%", size: 25, opacity: 0.17, tilt: 18, dur: 9.5, delay: 0.6 },
  { left: "18%", top: "24%", size: 19, opacity: 0.13, tilt: -7, dur: 13.8, delay: 2.9, reverse: true },
  { left: "13%", top: "44%", size: 36, opacity: 0.23, tilt: 11, dur: 11.6, delay: 1.9, smallScreen: true },
  { left: "17%", top: "63%", size: 23, opacity: 0.16, tilt: -17, dur: 10.4, delay: 0.4 },
  { left: "12%", top: "82%", size: 29, opacity: 0.19, tilt: -9, dur: 14, delay: 0.2, reverse: true },

  // Centre-left
  { left: "27%", top: "14%", size: 22, opacity: 0.14, tilt: 21, dur: 12.7, delay: 1.5, reverse: true },
  { left: "30%", top: "37%", size: 17, opacity: 0.1, tilt: -13, dur: 11.1, delay: 3.1 },
  { left: "25%", top: "58%", size: 27, opacity: 0.18, tilt: 6, dur: 13.4, delay: 0.9, smallScreen: true },
  { left: "31%", top: "79%", size: 38, opacity: 0.24, tilt: -6, dur: 12, delay: 2.1 },
  { left: "34%", top: "3%", size: 20, opacity: 0.13, tilt: 24, dur: 11.5, delay: 3, reverse: true },

  // Centre — deliberately faint, text and the CTA sit here
  { left: "43%", top: "9%", size: 16, opacity: 0.09, tilt: -18, dur: 12.8, delay: 2.2 },
  { left: "48%", top: "30%", size: 15, opacity: 0.08, tilt: 12, dur: 14.2, delay: 0.5, reverse: true },
  { left: "52%", top: "50%", size: 17, opacity: 0.085, tilt: -5, dur: 13.1, delay: 1.8 },
  { left: "45%", top: "68%", size: 24, opacity: 0.15, tilt: 9, dur: 10.8, delay: 1.7, smallScreen: true },
  { left: "50%", top: "90%", size: 31, opacity: 0.2, tilt: -14, dur: 12.4, delay: 2.6, reverse: true },

  // Centre-right
  { left: "60%", top: "6%", size: 28, opacity: 0.19, tilt: -14, dur: 13.5, delay: 0.8, reverse: true },
  { left: "64%", top: "26%", size: 18, opacity: 0.11, tilt: 17, dur: 11.9, delay: 2.4 },
  { left: "58%", top: "45%", size: 16, opacity: 0.09, tilt: -8, dur: 13.6, delay: 0.3, reverse: true },
  { left: "63%", top: "66%", size: 27, opacity: 0.19, tilt: 14, dur: 10.5, delay: 0.9, smallScreen: true },
  { left: "59%", top: "85%", size: 21, opacity: 0.14, tilt: 3, dur: 12.9, delay: 1.6 },

  // Right-inner
  { left: "71%", top: "11%", size: 42, opacity: 0.25, tilt: -16, dur: 12.5, delay: 1.8, smallScreen: true },
  { left: "75%", top: "33%", size: 20, opacity: 0.13, tilt: 10, dur: 10.2, delay: 2.7, reverse: true },
  { left: "69%", top: "54%", size: 25, opacity: 0.17, tilt: -19, dur: 13.7, delay: 0.1 },
  { left: "74%", top: "74%", size: 23, opacity: 0.15, tilt: 20, dur: 9.8, delay: 2.8, reverse: true },
  { left: "70%", top: "94%", size: 18, opacity: 0.11, tilt: -4, dur: 11.4, delay: 1.3 },

  // Right edge
  { left: "83%", top: "4%", size: 26, opacity: 0.17, tilt: 13, dur: 12.1, delay: 2.0, reverse: true },
  { left: "86%", top: "22%", size: 23, opacity: 0.15, tilt: -20, dur: 14, delay: 2.6, smallScreen: true },
  { left: "81%", top: "43%", size: 33, opacity: 0.21, tilt: 6, dur: 9, delay: 0.3 },
  { left: "88%", top: "62%", size: 19, opacity: 0.12, tilt: -11, dur: 13.2, delay: 1.2, reverse: true },
  { left: "84%", top: "81%", size: 29, opacity: 0.19, tilt: 16, dur: 11.7, delay: 0.6, smallScreen: true },
  { left: "94%", top: "14%", size: 21, opacity: 0.13, tilt: -15, dur: 12.6, delay: 1.0 },
  { left: "96%", top: "48%", size: 19, opacity: 0.12, tilt: 16, dur: 11.2, delay: 0.5, reverse: true },
  { left: "92%", top: "72%", size: 25, opacity: 0.16, tilt: -7, dur: 13.9, delay: 2.3 },
  { left: "95%", top: "91%", size: 17, opacity: 0.1, tilt: 22, dur: 10.6, delay: 1.9, reverse: true },
];

export function GiftMark() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {FLOATERS.map((f, i) => (
        <div
          key={i}
          className={`drift absolute ${f.reverse ? "drift-rev" : ""} ${
            f.smallScreen ? "" : "hidden sm:block"
          }`}
          style={
            {
              left: f.left,
              top: f.top,
              width: f.size,
              height: f.size * (420 / 400),
              opacity: f.opacity,
              "--tilt": `${f.tilt}deg`,
              "--dur": `${f.dur}s`,
              "--delay": `${f.delay}s`,
            } as CSSProperties
          }
        >
          <Parcel />
        </div>
      ))}
    </div>
  );
}
