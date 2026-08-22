// Display-only emoji for quiz options. Keyed by the canonical strings in
// gift-options.ts — purely cosmetic, never touches the values used for
// matching/filtering against the database.

export const RELATIONSHIP_EMOJI: Record<string, string> = {
  Partner: "💘",
  // Two glyphs: there is no single fist-bump emoji. Right-facing then
  // left-facing so the pair points inward at each other.
  Friend: "🤜🤛",
  // Neutral base rather than 🦸‍♀️/🦸‍♂️ — a parent is either. Replaces 👪, which
  // Apple now draws as an abstract grey silhouette that reads as a placeholder
  // box beside the full-colour emoji around it.
  Parent: "🦸",
  Sibling: "🧑‍🤝‍🧑",
  Child: "🧒",
  Coworker: "💼",
  Other: "✨",
};

export const OCCASION_EMOJI: Record<string, string> = {
  "Just Because": "🎈",
  Birthday: "🎂",
  Christmas: "🎄",
  Graduation: "🎓",
  Housewarming: "🏡",
  Wedding: "💍",
  Anniversary: "💐",
  "New Year": "🎉",
  "Family Gathering": "🍽️",
  "Get Well Soon": "🩹",
  "Mother's Day": "🌷",
  "Father's Day": "🧢",
  "Valentine's Day": "❤️",
  "Thank You": "🙏",
  Diwali: "🪔",
  // The pichkari — Holi is a water fight. Note this is U+1F52B, the same
  // codepoint as the pistol emoji, which every current platform renders as a
  // toy water gun; very old systems may still draw a firearm.
  Holi: "🔫",
  "Raksha Bandhan": "🧵",
  "Eid al-Fitr": "🌙",
  "Eid al-Adha": "🐑",
  Hanukkah: "🕎",
  Passover: "🍷",
  "Lunar New Year": "🧧",
  "Mid-Autumn Festival": "🥮",
  Nowruz: "🌱",
  Vaisakhi: "🌾",
  Onam: "🛶",
  Quinceañera: "👑",
  "Day of the Dead": "💀",
  Kwanzaa: "🕯️",
  "St. Patrick's Day": "☘️",
  Oktoberfest: "🍺",
  Carnival: "🎭",
  Vesak: "☸️",
  "Bar/Bat Mitzvah": "✡️",
  "Baby Shower": "🍼",
  Retirement: "🌴",
};

export const INTEREST_EMOJI: Record<string, string> = {
  // Blossom rather than a bottle: there is no perfume emoji, and the florals
  // already spoken for are 🌹 Romance, 🌷 Mother's Day and 💐 Anniversary.
  Fragrance: "🌸",
  Music: "🎵",
  Tech: "📱",
  Travel: "✈️",
  Photography: "📸",
  Art: "🎨",
  Coffee: "☕",
  Cooking: "🍳",
  Gaming: "🎮",
  Writing: "✍️",
  Fitness: "🏋️",
  Health: "🧘",
  Games: "🎲",
  Family: "👨‍👩‍👧",
  Gardening: "🌱",
  "Home Decor": "🛋️",
  Outdoors: "🏕️",
  Beauty: "💄",
  "Self-care": "🧖",
  Painting: "🖌️",
  Astronomy: "🔭",
  // Moved off 💘 when Partner took it — two options sharing a glyph is
  // indistinguishable in the quiz.
  Romance: "🌹",
  Sports: "⚽",
  STEM: "🔬",
  Creativity: "💡",
  Fashion: "👗",
  Food: "🍕",
  Jewelry: "💎",
  Personalized: "🏷️",
  Reading: "📚",
  Cars: "🏎️",
  Sneakers: "👟",
  Pets: "🐾",
  Bags: "👜",
};
