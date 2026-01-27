"use client";

import { useEffect, useMemo, useState } from "react";
import { Question, DEFAULT_QUESTIONS } from "./questions";

export type QuestionOverride = {
  id: string;
  hidden?: boolean;
  label?: string;
  options?: { label: string; value: string }[];
  required?: boolean;
  showIf?: { questionId: string; equals: string | string[] };
};

type FormEngineProps = {
  schoolId: string;
  campusId: string;
  programId: string;
  consentText: string;
  consentVersion: string;
  questionOverrides?: QuestionOverride[];
  apiBaseUrl?: string;
  ctaText?: string;
};

type ContactInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const defaultContact: ContactInfo = {
  firstName: "",
  lastName: "",
  email: "",
  phone: ""
};

function applyOverrides(questions: Question[], overrides?: QuestionOverride[]) {
  if (!overrides || overrides.length === 0) return questions;
  const overrideMap = new Map(overrides.map((item) => [item.id, item]));

  return questions
    .map((question) => {
      const override = overrideMap.get(question.id);
      if (!override) return question;
      if (override.hidden) return null;
      return {
        ...question,
        label: override.label ?? question.label,
        options: override.options ?? question.options,
        required: override.required ?? question.required,
        showIf: override.showIf ?? question.showIf
      };
    })
    .filter(Boolean) as Question[];
}

function isQuestionVisible(question: Question, answers: Record<string, unknown>) {
  if (!question.showIf) return true;
  const current = answers[question.showIf.questionId];
  const expected = question.showIf.equals;

  if (Array.isArray(current)) {
    return Array.isArray(expected)
      ? expected.some((value) => current.includes(value))
      : current.includes(expected);
  }

  if (Array.isArray(expected)) {
    return expected.includes(current as string);
  }

  return current === expected;
}

export function FormEngine({
  schoolId,
  campusId,
  programId,
  consentText,
  consentVersion,
  questionOverrides,
  apiBaseUrl,
  ctaText
}: FormEngineProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [contact, setContact] = useState<ContactInfo>(defaultContact);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");

  const questions = useMemo(() => applyOverrides(DEFAULT_QUESTIONS, questionOverrides), [questionOverrides]);
  const visibleQuestions = useMemo(
    () => questions.filter((question) => isQuestionVisible(question, answers)),
    [questions, answers]
  );

  const steps = useMemo(() => {
    return ["consent", ...visibleQuestions.map(() => "question"), "contact"] as const;
  }, [visibleQuestions]);

  const totalSteps = steps.length;

  useEffect(() => {
    if (currentStep >= totalSteps) {
      setCurrentStep(Math.max(totalSteps - 1, 0));
    }
  }, [currentStep, totalSteps]);

  const currentQuestion = steps[currentStep] === "question" ? visibleQuestions[currentStep - 1] : null;

  const progress = Math.round(((currentStep + 1) / totalSteps) * 100);

  const updateAnswer = (id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const isAnswerMissing = (question: Question) => {
    const value = answers[question.id];
    if (question.type === "checkbox") {
      return !Array.isArray(value) || value.length === 0;
    }
    return value === undefined || value === null || value === "";
  };

  const handleNext = () => {
    setError(null);
    if (steps[currentStep] === "consent" && !consentChecked) {
      setError("Please provide consent to continue.");
      return;
    }

    if (currentQuestion?.required && isAnswerMissing(currentQuestion)) {
      setError("Please answer this question to continue.");
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!contact.firstName || !contact.lastName || !contact.email) {
      setError("Please complete all required contact fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = `${apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"}/api/submit`;
      const payload = {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone || null,
        schoolId,
        campusId,
        programId,
        answers,
        honeypot,
        metadata: {
          utm: Object.fromEntries(new URLSearchParams(window.location.search)),
          referrer: document.referrer,
          userAgent: navigator.userAgent
        },
        consent: {
          consented: consentChecked,
          textVersion: consentVersion,
          timestamp: new Date().toISOString()
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Submission failed");
      }

      setSubmitted(true);
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="form-card">
        <span className="badge">Submission received</span>
        <h2>Thanks! Your info is on the way.</h2>
        <p>We have sent your details to admissions. Expect a response soon.</p>
      </div>
    );
  }

  return (
    <div className="form-card">
      {ctaText && <h3>{ctaText}</h3>}
      <div className="progress">
        <span style={{ width: `${progress}%` }} />
      </div>

      {error && <p style={{ color: "#d9534f" }}>{error}</p>}

      {steps[currentStep] === "consent" && (
        <div className="form-step">
          <h3>Quick consent</h3>
          <input
            type="text"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: "none" }}
          />
          <label>
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />{" "}
            I agree to receive calls, texts, or emails about program info.
          </label>
          <p className="disclaimer">{consentText}</p>
        </div>
      )}

      {currentQuestion && (
        <div className="form-step">
          <label>{currentQuestion.label}</label>
          {currentQuestion.type === "text" && (
            <input
              type="text"
              value={(answers[currentQuestion.id] as string) || ""}
              onChange={(event) => updateAnswer(currentQuestion.id, event.target.value)}
            />
          )}
          {currentQuestion.type === "slider" && (
            <input
              type="range"
              min={0}
              max={10}
              value={(answers[currentQuestion.id] as number) || 5}
              onChange={(event) => updateAnswer(currentQuestion.id, Number(event.target.value))}
            />
          )}
          {currentQuestion.type === "textarea" && (
            <textarea
              value={(answers[currentQuestion.id] as string) || ""}
              onChange={(event) => updateAnswer(currentQuestion.id, event.target.value)}
            />
          )}
          {currentQuestion.type === "select" && (
            <select
              value={(answers[currentQuestion.id] as string) || ""}
              onChange={(event) => updateAnswer(currentQuestion.id, event.target.value)}
            >
              <option value="">Select one</option>
              {currentQuestion.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          {(currentQuestion.type === "radio" || currentQuestion.type === "checkbox") && (
            <div className="option-group">
              {currentQuestion.options?.map((option) => {
                const selected = answers[currentQuestion.id];
                const checked =
                  currentQuestion.type === "checkbox"
                    ? Array.isArray(selected) && selected.includes(option.value)
                    : selected === option.value;

                return (
                  <label key={option.value} className="option">
                    <input
                      type={currentQuestion.type}
                      name={currentQuestion.id}
                      checked={checked}
                      onChange={() => {
                        if (currentQuestion.type === "checkbox") {
                          const currentValues = Array.isArray(selected) ? selected : [];
                          const nextValues = checked
                            ? currentValues.filter((value) => value !== option.value)
                            : [...currentValues, option.value];
                          updateAnswer(currentQuestion.id, nextValues);
                        } else {
                          updateAnswer(currentQuestion.id, option.value);
                        }
                      }}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {steps[currentStep] === "contact" && (
        <div className="form-step">
          <label>First name</label>
          <input
            type="text"
            value={contact.firstName}
            onChange={(event) => setContact({ ...contact, firstName: event.target.value })}
          />
          <label>Last name</label>
          <input
            type="text"
            value={contact.lastName}
            onChange={(event) => setContact({ ...contact, lastName: event.target.value })}
          />
          <label>Email</label>
          <input
            type="email"
            value={contact.email}
            onChange={(event) => setContact({ ...contact, email: event.target.value })}
          />
          <label>Phone</label>
          <input
            type="tel"
            value={contact.phone}
            onChange={(event) => setContact({ ...contact, phone: event.target.value })}
          />
        </div>
      )}

      <div className="actions">
        <button className="secondary" onClick={handleBack} disabled={currentStep === 0}>
          Back
        </button>
        {steps[currentStep] === "contact" ? (
          <button className="primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        ) : (
          <button className="primary" onClick={handleNext}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
