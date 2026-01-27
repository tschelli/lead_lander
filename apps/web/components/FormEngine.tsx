"use client";

import { useEffect, useMemo, useState } from "react";
import { Question, QuestionOption, DEFAULT_QUESTIONS } from "./questions";

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
  programOptions?: QuestionOption[];
  initialAnswers?: Record<string, unknown>;
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

const INITIAL_QUESTION_ID_SET = new Set([
  "program_interest",
  "education_level",
  "campus_interest"
]);

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
  programOptions,
  initialAnswers,
  apiBaseUrl,
  ctaText
}: FormEngineProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers || {});
  const [contact, setContact] = useState<ContactInfo>(defaultContact);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const mergedOverrides = useMemo(() => {
    if (!programOptions || programOptions.length === 0) {
      return questionOverrides;
    }

    const hasProgramOverride = questionOverrides?.some(
      (override) => override.id === "program_interest" && override.options?.length
    );

    if (hasProgramOverride) {
      return questionOverrides;
    }

    return [
      ...(questionOverrides || []),
      {
        id: "program_interest",
        options: programOptions
      }
    ];
  }, [programOptions, questionOverrides]);

  const questions = useMemo(
    () => applyOverrides(DEFAULT_QUESTIONS, mergedOverrides),
    [mergedOverrides]
  );
  const visibleQuestions = useMemo(
    () => questions.filter((question) => isQuestionVisible(question, answers)),
    [questions, answers]
  );
  const initialQuestions = useMemo(
    () => visibleQuestions.filter((question) => INITIAL_QUESTION_ID_SET.has(question.id)),
    [visibleQuestions]
  );
  const remainingQuestions = useMemo(
    () => visibleQuestions.filter((question) => !INITIAL_QUESTION_ID_SET.has(question.id)),
    [visibleQuestions]
  );

  const totalSteps = 1 + remainingQuestions.length;
  const isStartStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const currentQuestion = !isStartStep ? remainingQuestions[currentStep - 1] : null;

  useEffect(() => {
    if (currentStep >= totalSteps) {
      setCurrentStep(Math.max(totalSteps - 1, 0));
    }
  }, [currentStep, totalSteps]);

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

  const renderQuestion = (question: Question) => {
    return (
      <div className="form-question" key={question.id}>
        <label>{question.label}</label>
        {question.type === "text" && (
          <input
            type="text"
            value={(answers[question.id] as string) || ""}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
          />
        )}
        {question.type === "slider" && (
          <input
            type="range"
            min={0}
            max={10}
            value={(answers[question.id] as number) || 5}
            onChange={(event) => updateAnswer(question.id, Number(event.target.value))}
          />
        )}
        {question.type === "textarea" && (
          <textarea
            value={(answers[question.id] as string) || ""}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
          />
        )}
        {question.type === "select" && (
          <select
            value={(answers[question.id] as string) || ""}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
          >
            <option value="">Select one</option>
            {question.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        {(question.type === "radio" || question.type === "checkbox") && (
          <div className="option-group">
            {question.options?.map((option) => {
              const selected = answers[question.id];
              const checked =
                question.type === "checkbox"
                  ? Array.isArray(selected) && selected.includes(option.value)
                  : selected === option.value;

              return (
                <label key={option.value} className="option">
                  <input
                    type={question.type}
                    name={question.id}
                    checked={checked}
                    onChange={() => {
                      if (question.type === "checkbox") {
                        const currentValues = Array.isArray(selected) ? selected : [];
                        const nextValues = checked
                          ? currentValues.filter((value) => value !== option.value)
                          : [...currentValues, option.value];
                        updateAnswer(question.id, nextValues);
                      } else {
                        updateAnswer(question.id, option.value);
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
    );
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleNext = async () => {
    setError(null);

    if (isStartStep) {
      if (!consentChecked) {
        setError("Please provide consent to continue.");
        return;
      }

      if (!contact.firstName || !contact.lastName || !contact.email || !contact.phone) {
        setError("Please complete all required contact fields.");
        return;
      }

      for (const question of initialQuestions) {
        if (question.required && isAnswerMissing(question)) {
          setError("Please answer all required questions to continue.");
          return;
        }
      }

      setIsSubmitting(true);
      try {
        const baseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
        const payloadAnswers: Record<string, unknown> = {};
        for (const question of initialQuestions) {
          if (answers[question.id] !== undefined) {
            payloadAnswers[question.id] = answers[question.id];
          }
        }

        const payload = {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          schoolId,
          campusId,
          programId,
          answers: payloadAnswers,
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

        const response = await fetch(`${baseUrl}/api/lead/start`, {
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

        const data = (await response.json()) as { submissionId?: string };
        if (data?.submissionId) {
          setSubmissionId(data.submissionId);
        }

        if (remainingQuestions.length === 0) {
          setSubmitted(true);
          return;
        }

        setCurrentStep(1);
      } catch (submitError) {
        setError((submitError as Error).message);
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    if (currentQuestion?.required && isAnswerMissing(currentQuestion)) {
      setError("Please answer this question to continue.");
      return;
    }

    if (!submissionId) {
      setError("Missing submission id. Please restart.");
      return;
    }

    setIsSubmitting(true);
    try {
      const baseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
      const payload = {
        submissionId,
        stepIndex: currentStep + 1,
        answers: currentQuestion ? { [currentQuestion.id]: answers[currentQuestion.id] } : {}
      };

      const response = await fetch(`${baseUrl}/api/lead/step`, {
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

      if (isLastStep) {
        setSubmitted(true);
      } else {
        setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
      }
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

      {isStartStep && (
        <div className="form-step">
          <h3>Get started</h3>
          <input
            type="text"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: "none" }}
          />
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
          {initialQuestions.map((question) => renderQuestion(question))}
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

      {currentQuestion && !isStartStep && (
        <div className="form-step">{renderQuestion(currentQuestion)}</div>
      )}

      <div className="actions">
        <button className="secondary" onClick={handleBack} disabled={currentStep === 0 || isSubmitting}>
          Back
        </button>
        <button className="primary" onClick={handleNext} disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : isStartStep ? "Get Started" : isLastStep ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
