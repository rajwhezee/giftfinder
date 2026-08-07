"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_PRESETS,
  BUDGET_STEP,
  INTERESTS,
  RELATIONSHIPS,
} from "@/lib/gift-options";
import { INTEREST_EMOJI, OCCASION_EMOJI, RELATIONSHIP_EMOJI } from "@/lib/gift-option-icons";
import { searchOccasions } from "@/lib/occasion-search";
import type { GiftRecommendation, RecipientGender, RecommendResponse } from "@/lib/types";
import { GiftResults } from "./GiftResults";

const TOTAL_STEPS = 4;
const STEP_EMOJI = ["🎯", "🎉", "✨", "💸"];

const GENDER_OPTIONS: { value: RecipientGender; label: string; emoji: string }[] = [
  { value: "female", label: "Female", emoji: "👩" },
  { value: "male", label: "Male", emoji: "👨" },
  { value: "any", label: "No preference", emoji: "🌈" },
];

function OptionButton({
  label,
  emoji,
  selected,
  onClick,
  pill = false,
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  onClick: () => void;
  pill?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`flex items-center justify-center gap-1.5 border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        pill ? "rounded-full" : "rounded-xl"
      } ${
        selected
          ? "gradient-bg border-transparent text-white shadow-lg shadow-brand-pink/30"
          : "border-black/10 bg-white hover:border-brand-pink/50 dark:border-white/10 dark:bg-white/5"
      }`}
    >
      {emoji && <span>{emoji}</span>}
      {label}
    </motion.button>
  );
}

function OccasionPicker({ value, onChange }: { value: string; onChange: (occasion: string) => void }) {
  const [query, setQuery] = useState("");
  const matches = searchOccasions(query);

  return (
    <div>
      <div className="relative mb-3">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-400">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any occasion — Diwali, Eid, Quinceañera, Birthday…"
          className="w-full rounded-xl border-2 border-black/10 py-3 pr-4 pl-10 text-base outline-none focus:border-brand-pink dark:border-white/10 dark:bg-white/5"
        />
      </div>

      {value && (
        <p className="mb-3 text-sm text-neutral-500">
          Selected:{" "}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            {OCCASION_EMOJI[value]} {value}
          </span>
        </p>
      )}

      {matches.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No match for &quot;{query}&quot; yet — try a different spelling, or pick the closest one.
        </p>
      ) : (
        <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {matches.map((option) => (
            <OptionButton
              key={option}
              label={option}
              emoji={OCCASION_EMOJI[option]}
              selected={value === option}
              onClick={() => {
                onChange(option);
                setQuery("");
              }}
              pill
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
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<RecipientGender | "">("");
  const [occasion, setOccasion] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [budget, setBudget] = useState<number>(BUDGET_PRESETS[1]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [results, setResults] = useState<GiftRecommendation[] | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);

  const ageNumber = Number(age);
  const canProceed =
    step === 1
      ? relationship !== "" && gender !== "" && age !== "" && ageNumber > 0 && ageNumber <= 120
      : step === 2
        ? occasion !== ""
        : step === 3
          ? interests.length > 0
          : true;

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  }

  function handleRestart() {
    setStep(1);
    setRelationship("");
    setAge("");
    setGender("");
    setOccasion("");
    setInterests([]);
    setBudget(BUDGET_PRESETS[1]);
    setResults(null);
    setStatus("idle");
  }

  async function handleSubmit() {
    setStatus("loading");
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationship, age: ageNumber, gender, occasion, interests, budget }),
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

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-black/5 bg-white/80 p-6 shadow-xl shadow-purple-500/5 backdrop-blur sm:p-8 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm font-semibold text-neutral-500">
          Step {step} of {TOTAL_STEPS}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <motion.div
            className="gradient-bg h-full rounded-full"
            initial={false}
            animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
        >
          {step === 1 && (
            <fieldset>
              <legend className="font-display mb-4 text-xl font-semibold">
                {STEP_EMOJI[0]} Who is the gift for?
              </legend>
              <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {RELATIONSHIPS.map((option) => (
                  <OptionButton
                    key={option}
                    label={option}
                    emoji={RELATIONSHIP_EMOJI[option]}
                    selected={relationship === option}
                    onClick={() => setRelationship(option)}
                  />
                ))}
              </div>
              <p className="mb-2 text-sm font-semibold">Gender</p>
              <div className="mb-6 grid grid-cols-3 gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <OptionButton
                    key={option.value}
                    label={option.label}
                    emoji={option.emoji}
                    selected={gender === option.value}
                    onClick={() => setGender(option.value)}
                  />
                ))}
              </div>
              <label className="block text-sm font-semibold">
                Their age
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 28"
                  className="mt-1.5 w-full rounded-xl border-2 border-black/10 px-4 py-3 text-base outline-none focus:border-brand-pink dark:border-white/10 dark:bg-white/5"
                />
              </label>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset>
              <legend className="font-display mb-4 text-xl font-semibold">
                {STEP_EMOJI[1]} What&apos;s the occasion?
              </legend>
              <OccasionPicker value={occasion} onChange={setOccasion} />
            </fieldset>
          )}

          {step === 3 && (
            <fieldset>
              <legend className="font-display mb-4 text-xl font-semibold">
                {STEP_EMOJI[2]} What are their interests?
              </legend>
              <p className="mb-3 text-sm text-neutral-500">Select all that apply.</p>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((option) => (
                  <OptionButton
                    key={option}
                    label={option}
                    emoji={INTEREST_EMOJI[option]}
                    selected={interests.includes(option)}
                    onClick={() => toggleInterest(option)}
                    pill
                  />
                ))}
              </div>
            </fieldset>
          )}

          {step === 4 && (
            <fieldset>
              <legend className="font-display mb-4 text-xl font-semibold">
                {STEP_EMOJI[3]} What&apos;s the budget?
              </legend>
              <div className="mb-5 flex flex-wrap gap-2">
                {BUDGET_PRESETS.map((preset) => (
                  <OptionButton
                    key={preset}
                    label={preset === BUDGET_MAX ? `$${preset}+` : `Under $${preset}`}
                    selected={budget === preset}
                    onClick={() => setBudget(preset)}
                  />
                ))}
              </div>
              <input
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full accent-[#ec4899]"
              />
              <p className="font-display gradient-text mt-3 text-center text-3xl font-bold">
                ${budget}
                {budget >= BUDGET_MAX ? "+" : ""}
              </p>
              {budget >= BUDGET_MAX && (
                <p className="mt-1 text-center text-sm text-neutral-500">
                  Premium picks — ${BUDGET_MAX / 2} and up, no price cap
                </p>
              )}
            </fieldset>
          )}
        </motion.div>
      </AnimatePresence>

      {status === "error" && (
        <p className="mt-4 text-sm text-red-600">Something went wrong. Please try again.</p>
      )}

      <div className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-neutral-500 disabled:opacity-0"
        >
          Back
        </button>

        {step < TOTAL_STEPS ? (
          <motion.button
            type="button"
            onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
            disabled={!canProceed}
            whileTap={canProceed ? { scale: 0.96 } : undefined}
            className="btn-gradient rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-pink/25 disabled:opacity-40"
          >
            Next
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={status === "loading"}
            whileTap={status !== "loading" ? { scale: 0.96 } : undefined}
            className="btn-gradient rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-pink/25 disabled:opacity-60"
          >
            {status === "loading" ? "Finding gifts…" : "🎁 Find gifts"}
          </motion.button>
        )}
      </div>
    </div>
  );
}
