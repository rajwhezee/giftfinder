import { FEEDBACK_SURVEY_URL, hasFeedbackSurvey } from "@/lib/feedback";

/**
 * The invitation to the test-user survey, shown with a set of results.
 *
 * Sits directly under the results header, above the filters and the grid,
 * because it has to be reachable by someone who never scrolls. It started at
 * the foot of the page as a full card and that was the wrong place twice over:
 * a page can run to 150 gifts, and the people most worth hearing from are the
 * ones who looked at the first row and were not convinced.
 *
 * Slim and horizontal for the same reason it is early: it is not the point of
 * the page. One line of text and one small button, no headline competing with
 * the one above it.
 *
 * Renders nothing while `FEEDBACK_SURVEY_URL` is empty, so the survey can be
 * taken down by clearing one constant.
 */
export function FeedbackPrompt() {
  if (!hasFeedbackSurvey) return null;

  return (
    <aside className="mb-8 flex flex-col items-center gap-4 rounded-xl border border-terracotta/25 bg-surface px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
      <div>
        <p className="text-[11px] tracking-[0.18em] text-terracotta uppercase">Still in testing</p>
        <p className="mt-1.5 text-sm text-ink-soft">
          Did anything here look worth giving? Two minutes of answers, and they are the only thing
          shaping what gets built next.
        </p>
      </div>
      <a
        href={FEEDBACK_SURVEY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary shrink-0 rounded-full px-6 py-2.5 text-sm font-medium"
      >
        Give feedback
      </a>
    </aside>
  );
}
