/**
 * Where feedback goes now that it is ours.
 *
 * The site used a Google Form during testing, reached from three surfaces
 * through one constant. That was the right shape for a survey with an end date
 * and the wrong one for a permanent channel: the responses lived in someone
 * else's spreadsheet, the form could not be styled, and sending a visitor to
 * forms.gle after a page that promises nothing sponsored is a jarring hand-off
 * to a third party. Suggestions are stored in Postgres and read with
 * scripts/read-feedback.ts.
 */

/** The form. Same three surfaces that used to point at the Google Form. */
export const FEEDBACK_PATH = "/feedback";

/** Contact page, for anything that wants a reply rather than a suggestion box. */
export const SUPPORT_PATH = "/support";

/**
 * Published on /support and in the privacy policy.
 *
 * The domain routes mail through Cloudflare Email Routing, so this address only
 * works while a rule for it exists there. An unrouted address on a public page
 * is worse than no address, because the sender is told nothing.
 */
export const SUPPORT_EMAIL = "support@thegiftfinder.net";

/**
 * What a suggestion can be about.
 *
 * Kept short on purpose: a long list makes the person choosing responsible for
 * triage they cannot do, and every extra option is a reason to close the tab.
 * `value` is what the database stores, so adding one is safe and renaming one
 * orphans the rows already written under the old name.
 */
export const FEEDBACK_KINDS = [
  { value: "suggestion", label: "A suggestion" },
  { value: "missing", label: "Something is missing" },
  { value: "bug", label: "Something is broken" },
  { value: "other", label: "Something else" },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["value"];

export const FEEDBACK_KIND_VALUES: readonly string[] = FEEDBACK_KINDS.map((k) => k.value);

/** Long enough to say something, short enough that the column is not a dumping ground. */
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
export const EMAIL_MAX = 254;

/** Accepted submissions per IP per hour, before /api/feedback answers 429. */
export const RATE_LIMIT_PER_HOUR = 5;
