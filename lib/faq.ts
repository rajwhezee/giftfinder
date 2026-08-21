/**
 * The homepage FAQ, as data.
 *
 * One array feeds both the visible section and the FAQPage JSON-LD. Google
 * requires the two to match word for word, and the only reliable way to keep
 * that true through later copy edits is to have a single place to edit. Answers
 * are plain strings rather than JSX for the same reason: the moment one carries
 * a link or an emphasis, the rendered text and the structured text drift apart.
 *
 * Every answer here restates something the site already commits to on the
 * disclosure or privacy page. If the no-affiliate position ever changes, two
 * and three change with it.
 */
export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQS: FaqEntry[] = [
  {
    question: "How long does the quiz take?",
    answer:
      "Six questions, about thirty seconds. There is no account to create and nothing to sign up for, and you can change any answer before you see results.",
  },
  {
    question: "Does Gift Finder earn anything when I buy?",
    answer:
      "No. Every link goes straight to the retailer's own product page. Gift Finder is not part of any affiliate programme, takes no commission, and earns nothing from your purchase.",
  },
  {
    question: "Can a brand pay to appear in my results?",
    answer:
      "No. Results are ranked only on how well each gift fits the answers you gave: the occasion, the recipient's age and interests, and your budget. Nothing is sponsored and nothing is paid to rank.",
  },
  {
    question: "Where do the gifts come from?",
    answer:
      "Public listings on Etsy, eBay and Best Buy, plus around seventy independent brands' own online shops. Prices and availability change often, so check the retailer's page before you buy.",
  },
  {
    question: "Do you store my answers?",
    answer:
      "No. Your answers are sent to the server only to look up matching gifts, and are not saved or linked to you. There are no user accounts and no advertising trackers anywhere on the site.",
  },
];
