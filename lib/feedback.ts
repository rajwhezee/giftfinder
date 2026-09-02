/**
 * The test-user feedback survey.
 *
 * One constant so the link lives in a single place while the survey is running
 * and can be switched off by emptying it. Every surface that renders it checks
 * `FEEDBACK_SURVEY_URL` first, so an empty string removes the button, the
 * footer link and the results card together rather than shipping a control
 * that goes nowhere.
 *
 * Deliberately not an environment variable: it is a public URL with nothing
 * secret in it, and a `NEXT_PUBLIC_` var would have to be set in Vercel as well
 * as locally or the button would quietly vanish in production.
 */
export const FEEDBACK_SURVEY_URL = "https://forms.gle/TmWTnfELs8b5Hu9Y6";

export const hasFeedbackSurvey = FEEDBACK_SURVEY_URL.length > 0;
