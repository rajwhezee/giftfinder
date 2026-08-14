"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_RANGE_PRESETS,
  BUDGET_STEP,
  BUDGET_UNCAPPED_AT,
  INTERESTS,
  RELATIONSHIPS,
} from "@/lib/gift-options";
import { INTEREST_EMOJI, OCCASION_EMOJI, RELATIONSHIP_EMOJI } from "@/lib/gift-option-icons";
import { searchOccasions } from "@/lib/occasion-search";
import type { GiftRecommendation, RecipientGender, RecommendResponse } from "@/lib/types";
import { GiftResults } from "./GiftResults";
import { StepTransition } from "./StepTransition";

const TOTAL_STEPS = 6;
/** Pause after a tap so the selected state is visible before the card swipes away. */
const AUTO_ADVANCE_MS = 260;

const AGE_MIN = 1;
const AGE_MAX = 99;
const AGE_DEFAULT = 25;

const GENDER_OPTIONS: { value: RecipientGender; label: string; emoji: string }[] = [
  { value: "female", label: "Female", emoji: "👩" },
  { value: "male", label: "Male", emoji: "👨" },
  { value: "any", label: "No preference", emoji: "🫡" },
];

function Chip({
  label,
  emoji,
  selected,
  onClick,
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      data-selected={selected}
      whileTap={{ scale: 0.96 }}
      className="chip flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm"
    >
      {emoji && (
        <span aria-hidden className="text-base leading-none">
          {emoji}
        </span>
      )}
      <span>{label}</span>
    </motion.button>
  );
}

function StepHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-2xl leading-snug font-semibold text-balance">{children}</h2>
      {hint && <p className="mt-1.5 text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

function OccasionPicker({ value, onChange }: { value: string; onChange: (occasion: string) => void }) {
  const [query, setQuery] = useState("");
  const matches = searchOccasions(query);

  return (
    <div>
      <div className="relative mb-4">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint">
          ✦
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any occasion — Diwali, Eid, Quinceañera…"
          className="w-full rounded-full border border-rule bg-surface py-3 pr-4 pl-10 text-base text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-terracotta"
        />
      </div>

      {matches.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Nothing matches &ldquo;{query}&rdquo; yet — try another spelling, or pick the closest one.
        </p>
      ) : (
        <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
          {matches.map((option) => (
            <Chip
              key={option}
              label={option}
              emoji={OCCASION_EMOJI[option]}
              selected={value === option}
              onClick={() => onChange(option)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GiftQuiz() {
  const [step, setStep] = useState(1);
  const [relationship, setRelationship] = useState("");
  const [gender, setGender] = useState<RecipientGender | "">("");
  const [age, setAge] = useState(AGE_DEFAULT);
  const [occasion, setOccasion] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [minBudget, setMinBudget] = useState<number>(BUDGET_RANGE_PRESETS[1].min);
  const [maxBudget, setMaxBudget] = useState<number>(BUDGET_RANGE_PRESETS[1].max);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [results, setResults] = useState<GiftRecommendation[] | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);

  // Auto-advance timers must not fire after the user has navigated away
  // (e.g. tapped Back during the pause), so keep a handle and clear it.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelAdvance = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  useEffect(() => cancelAdvance, [cancelAdvance]);

  const goTo = useCallback(
    (next: number) => {
      cancelAdvance();
      setStep(Math.min(TOTAL_STEPS, Math.max(1, next)));
    },
    [cancelAdvance],
  );

  /** Single-select steps advance on their own — no Next tap needed. */
  const selectThenAdvance = useCallback(
    (apply: () => void, fromStep: number) => {
      apply();
      cancelAdvance();
      advanceTimer.current = setTimeout(() => {
        setStep((current) => (current === fromStep ? Math.min(TOTAL_STEPS, current + 1) : current));
      }, AUTO_ADVANCE_MS);
    },
    [cancelAdvance],
  );

  const canProceed = step === 5 ? interests.length > 0 : step === 4 ? occasion !== "" : true;

  // Budget range. The ceiling sitting at the top of the slider means "and up"
  // rather than a literal cap, and the two thumbs are kept one step apart so
  // they can never cross into an inverted range the API would reject.
  const uncapped = maxBudget >= BUDGET_UNCAPPED_AT;
  const budgetSpan = BUDGET_MAX - BUDGET_MIN;
  const fillStart = ((minBudget - BUDGET_MIN) / budgetSpan) * 100;
  const fillEnd = ((maxBudget - BUDGET_MIN) / budgetSpan) * 100;

  function handleMinBudget(value: number) {
    setMinBudget(Math.min(value, maxBudget - BUDGET_STEP));
  }

  function handleMaxBudget(value: number) {
    setMaxBudget(Math.max(value, minBudget + BUDGET_STEP));
  }

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  }

  function handleRestart() {
    cancelAdvance();
    setStep(1);
    setRelationship("");
    setGender("");
    setAge(AGE_DEFAULT);
    setOccasion("");
    setInterests([]);
    setMinBudget(BUDGET_RANGE_PRESETS[1].min);
    setMaxBudget(BUDGET_RANGE_PRESETS[1].max);
    setResults(null);
    setStatus("idle");
  }

  async function handleSubmit() {
    setStatus("loading");
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationship,
          age,
          gender,
          occasion,
          interests,
          minBudget,
          maxBudget,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = (await res.json()) as RecommendResponse;
      setResults(data.results);
      setCandidateCount(data.candidateCount);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  if (results !== null) {
    return (
      <GiftResults
        results={results}
        relationship={relationship}
        occasion={occasion}
        candidateCount={candidateCount}
        onRestart={handleRestart}
      />
    );
  }

  // Steps 1, 2 and 4 advance themselves on selection; only these need a button.
  const showContinue = step === 3 || step === 5;

  return (
    <div className="card-surface mx-auto max-w-xl rounded-2xl p-6 sm:p-8">
      <div className="mb-7 flex items-center gap-4">
        <span className="font-display text-sm tracking-wide text-ink-faint tabular-nums">
          {String(step).padStart(2, "0")} <span className="text-ink-faint/60">/</span>{" "}
          {String(TOTAL_STEPS).padStart(2, "0")}
        </span>
        <div className="h-px flex-1 bg-rule">
          <motion.div
            className="h-px bg-terracotta"
            initial={false}
            animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
          />
        </div>
      </div>

      <StepTransition transitionKey={step}>
        {step === 1 && (
          <fieldset>
            <StepHeading>Who is this gift for?</StepHeading>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIPS.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  emoji={RELATIONSHIP_EMOJI[option]}
                  selected={relationship === option}
                  onClick={() => selectThenAdvance(() => setRelationship(option), 1)}
                />
              ))}
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <StepHeading>Who are we shopping for?</StepHeading>
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  emoji={option.emoji}
                  selected={gender === option.value}
                  onClick={() => selectThenAdvance(() => setGender(option.value), 2)}
                />
              ))}
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset>
            <StepHeading hint="Drag to adjust — close enough is fine.">How old are they?</StepHeading>
            <p className="font-display mb-6 text-center text-6xl leading-none font-semibold text-terracotta tabular-nums">
              {age}
              {age === AGE_MAX ? "+" : ""}
            </p>
            <input
              type="range"
              min={AGE_MIN}
              max={AGE_MAX}
              step={1}
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              aria-label="Recipient age"
            />
            <div className="mt-3 flex justify-between text-xs text-ink-faint">
              <span>{AGE_MIN}</span>
              <span>{AGE_MAX}+</span>
            </div>
          </fieldset>
        )}

        {step === 4 && (
          <fieldset>
            <StepHeading>What are we celebrating?</StepHeading>
            <OccasionPicker
              value={occasion}
              onChange={(value) => selectThenAdvance(() => setOccasion(value), 4)}
            />
          </fieldset>
        )}

        {step === 5 && (
          <fieldset>
            <StepHeading hint="Pick as many as you like — more detail, better matches.">
              What are they into?
            </StepHeading>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  emoji={INTEREST_EMOJI[option]}
                  selected={interests.includes(option)}
                  onClick={() => toggleInterest(option)}
                />
              ))}
            </div>
          </fieldset>
        )}

        {step === 6 && (
          <fieldset>
            <StepHeading hint="Drag either end, or pick a band below.">
              Define your budget
            </StepHeading>

            <p className="font-display mb-7 text-center text-4xl leading-none font-semibold text-terracotta tabular-nums sm:text-5xl">
              ${minBudget}
              <span className="mx-2 text-ink-faint">–</span>${maxBudget}
              {uncapped ? "+" : ""}
            </p>

            {/* Two sliders sharing one track; see .range-dual in globals.css. */}
            <div className="range-dual">
              <span className="range-track" />
              <span
                className="range-fill"
                style={{ left: `${fillStart}%`, right: `${100 - fillEnd}%` }}
              />
              <input
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                value={minBudget}
                onChange={(e) => handleMinBudget(Number(e.target.value))}
                aria-label="Minimum budget"
              />
              <input
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                value={maxBudget}
                onChange={(e) => handleMaxBudget(Number(e.target.value))}
                aria-label="Maximum budget"
              />
            </div>

            <div className="mt-3 flex justify-between text-xs text-ink-faint">
              <span>${BUDGET_MIN}</span>
              <span>${BUDGET_MAX}+</span>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {BUDGET_RANGE_PRESETS.map((preset) => (
                <Chip
                  key={preset.label}
                  label={preset.label}
                  selected={minBudget === preset.min && maxBudget === preset.max}
                  onClick={() => {
                    setMinBudget(preset.min);
                    setMaxBudget(preset.max);
                  }}
                />
              ))}
            </div>

            {uncapped && (
              <p className="mt-5 text-center text-sm text-ink-soft">
                No ceiling — anything from ${minBudget} up.
              </p>
            )}
          </fieldset>
        )}
      </StepTransition>

      {status === "error" && (
        <p className="mt-5 text-sm text-terracotta">Something went wrong. Please try again.</p>
      )}

      <div className="rule-hairline mt-8 flex items-center justify-between border-t pt-5">
        <button
          type="button"
          onClick={() => goTo(step - 1)}
          disabled={step === 1}
          className="text-sm text-ink-soft transition-colors hover:text-terracotta disabled:pointer-events-none disabled:opacity-0"
        >
          ← Back
        </button>

        {step === TOTAL_STEPS ? (
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={status === "loading"}
            whileTap={status !== "loading" ? { scale: 0.97 } : undefined}
            className="btn-primary rounded-full px-7 py-3 text-sm font-medium disabled:opacity-60"
          >
            {status === "loading" ? "Finding gifts…" : "Show me the gifts"}
          </motion.button>
        ) : showContinue ? (
          <motion.button
            type="button"
            onClick={() => goTo(step + 1)}
            disabled={!canProceed}
            whileTap={canProceed ? { scale: 0.97 } : undefined}
            className="btn-primary rounded-full px-7 py-3 text-sm font-medium disabled:opacity-40"
          >
            Continue
          </motion.button>
        ) : (
          <span className="text-xs text-ink-faint">Choose one to continue</span>
        )}
      </div>
    </div>
  );
}
