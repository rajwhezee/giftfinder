import { OCCASIONS } from "./gift-options";

/**
 * Alternate names people actually search for, mapped to the canonical
 * OCCASIONS value. Search-only — never stored on a Gift, never sent to the API.
 */
const ALIASES: Record<string, string> = {
  "chinese new year": "Lunar New Year",
  tet: "Lunar New Year",
  "korean new year": "Lunar New Year",
  "vietnamese new year": "Lunar New Year",
  rakhi: "Raksha Bandhan",
  quinceanera: "Quinceañera",
  "dia de los muertos": "Day of the Dead",
  muertos: "Day of the Dead",
  "st patricks day": "St. Patrick's Day",
  "saint patricks day": "St. Patrick's Day",
  "bar mitzvah": "Bar/Bat Mitzvah",
  "bat mitzvah": "Bar/Bat Mitzvah",
  mitzvah: "Bar/Bat Mitzvah",
  "persian new year": "Nowruz",
  "iranian new year": "Nowruz",
  baisakhi: "Vaisakhi",
  "mooncake festival": "Mid-Autumn Festival",
  "moon festival": "Mid-Autumn Festival",
  ramadan: "Eid al-Fitr",
};

/** Default suggestions shown before the user has typed anything. */
const POPULAR_COUNT = 8;

export function searchOccasions(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return OCCASIONS.slice(0, POPULAR_COUNT);

  const results = new Set<string>();

  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (alias.includes(q) || q.includes(alias)) results.add(canonical);
  }

  for (const occasion of OCCASIONS) {
    if (occasion.toLowerCase().includes(q)) results.add(occasion);
  }

  return [...results];
}
