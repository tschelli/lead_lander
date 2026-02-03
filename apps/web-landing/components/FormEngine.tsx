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

type LeadFormField = {
  id: string;
  label: string;
  type: "text" | "email" | "tel" | "select" | "radio" | "checkbox" | "textarea";
  required?: boolean;
  options?: QuestionOption[];
  mapTo?: "answers" | "campus_id";
  placeholder?: string;
};

type FormEngineProps = {
  schoolId: string;
  programId: string;
  consentText: string;
  consentVersion: string;
  questionOverrides?: QuestionOverride[];
  leadFormFields?: LeadFormField[];
  consentLabel?: string;
  thankYou?: {
    title?: string;
    message?: string;
    body?: string;
    ctaText?: string;
    ctaUrl?: string;
  };
  programOptions?: QuestionOption[];
  campusOptions?: QuestionOption[];
  initialAnswers?: Record<string, unknown>;
  apiBaseUrl?: string;
  ctaText?: string;
  enableQuiz?: boolean; // New prop to enable quiz functionality
};

type ContactInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type QuizQuestion = {
  id: string;
  questionText: string;
  questionType: "single_choice" | "multiple_choice" | "text";
  helpText?: string;
  displayOrder: number;
  conditionalOn?: {
    questionId: string;
    optionIds: string[];
  };
  options: Array<{
    id: string;
    optionText: string;
    displayOrder: number;
  }>;
};

type QuizProgram = {
  id: string;
  name: string;
  slug: string;
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

function isQuizQuestionVisible(question: QuizQuestion, quizAnswers: Record<string, string | string[]>) {
  if (!question.conditionalOn) return true;
  const current = quizAnswers[question.conditionalOn.questionId];
  const expected = question.conditionalOn.optionIds;

  if (Array.isArray(current)) {
    return expected.some((optionId) => current.includes(optionId));
  }

  return expected.includes(current as string);
}

export function FormEngine({
  schoolId,
  programId,
  consentText,
  consentVersion,
  questionOverrides,
  leadFormFields,
  consentLabel,
  thankYou,
  programOptions,
  campusOptions,
  initialAnswers,
  apiBaseUrl,
  ctaText,
  enableQuiz = false
}: FormEngineProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers || {});
  const [contact, setContact] = useState<ContactInfo>(defaultContact);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Landing page questions state
  const [landingQuestions, setLandingQuestions] = useState<any[]>([]);
  const [landingAnswers, setLandingAnswers] = useState<Record<string, string | string[]>>({});
  const [landingLoading, setLandingLoading] = useState(false);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizPrograms, setQuizPrograms] = useState<QuizProgram[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[]>>({});
  const [quizLoading, setQuizLoading] = useState(false);
  const [recommendedProgram, setRecommendedProgram] = useState<QuizProgram | null>(null);
  const [quizScores, setQuizScores] = useState<Record<string, number>>({});

  // Fetch landing page questions
  useEffect(() => {
    const fetchLandingQuestions = async () => {
      try {
        setLandingLoading(true);
        const baseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
        const response = await fetch(`${baseUrl}/api/public/schools/${schoolId}/landing-questions`);

        if (!response.ok) throw new Error("Failed to load landing questions");

        const data = await response.json();
        setLandingQuestions(data.questions || []);
      } catch (error) {
        console.error("Landing questions fetch error:", error);
        // Don't block the form if landing questions fail to load
        setLandingQuestions([]);
      } finally {
        setLandingLoading(false);
      }
    };

    fetchLandingQuestions();
  }, [schoolId, apiBaseUrl]);

  // Fetch quiz questions if enabled
  useEffect(() => {
    if (!enableQuiz) return;

    const fetchQuiz = async () => {
      try {
        setQuizLoading(true);
        const baseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
        const response = await fetch(`${baseUrl}/api/public/schools/${schoolId}/quiz`);

        if (!response.ok) throw new Error("Failed to load quiz");

        const data = await response.json();
        setQuizQuestions(data.questions || []);
        setQuizPrograms(data.programs || []);
      } catch (error) {
        console.error("Quiz fetch error:", error);
      } finally {
        setQuizLoading(false);
      }
    };

    fetchQuiz();
  }, [enableQuiz, schoolId, apiBaseUrl]);

  const mergedOverrides = useMemo(() => {
    let merged = questionOverrides || [];

    if (programOptions && programOptions.length > 0) {
      const hasProgramOverride = merged.some(
        (override) => override.id === "program_interest" && override.options?.length
      );
      if (!hasProgramOverride) {
        merged = [...merged, { id: "program_interest", options: programOptions }];
      }
    }

    if (campusOptions && campusOptions.length > 0) {
      const hasCampusOverride = merged.some(
        (override) => override.id === "campus_selection" && override.options?.length
      );
      if (!hasCampusOverride) {
        merged = [...merged, { id: "campus_selection", options: campusOptions }];
      }
    }

    return merged.length > 0 ? merged : undefined;
  }, [campusOptions, programOptions, questionOverrides]);

  const leadQuestions = useMemo(() => {
    if (leadFormFields !== undefined) {
      const fields = leadFormFields || [];
      return fields.map((field) => {
        const options =
          field.mapTo === "campus_id" && (!field.options || field.options.length === 0)
            ? campusOptions
            : field.options;
        return {
          id: field.id,
          type: field.type,
          label: field.label,
          required: field.required,
          options,
          placeholder: field.placeholder,
          mapTo: field.mapTo || "answers"
        } as Question & { mapTo?: "answers" | "campus_id"; placeholder?: string };
      });
    }

    const questions = applyOverrides(DEFAULT_QUESTIONS, mergedOverrides);
    return questions.map((question) => ({
      ...question,
      mapTo: question.id === "campus_selection" ? "campus_id" : "answers"
    })) as Array<Question & { mapTo?: "answers" | "campus_id" }>;
  }, [leadFormFields, mergedOverrides, campusOptions]);

  const visibleLeadQuestions = useMemo(
    () => leadQuestions.filter((question) => isQuestionVisible(question, answers)),
    [leadQuestions, answers]
  );

  // Visible quiz questions based on conditional logic
  const visibleQuizQuestions = useMemo(
    () => quizQuestions.filter((q) => isQuizQuestionVisible(q, quizAnswers)),
    [quizQuestions, quizAnswers]
  );

  // Calculate total steps: 1 (contact) + quiz questions
  const totalSteps = 1 + (enableQuiz ? visibleQuizQuestions.length : 0);
  const isStartStep = currentStep === 0;
  const quizStepsStart = 1;
  const quizStepsEnd = quizStepsStart + visibleQuizQuestions.length;
  const isInQuizStep = enableQuiz && currentStep >= quizStepsStart && currentStep < quizStepsEnd;
  const isLastStep = currentStep === totalSteps - 1;

  const currentQuizQuestion = isInQuizStep ? visibleQuizQuestions[currentStep - quizStepsStart] : null;

  useEffect(() => {
    if (currentStep >= totalSteps) {
      setCurrentStep(Math.max(totalSteps - 1, 0));
    }
  }, [currentStep, totalSteps]);

  const progress = Math.round(((currentStep + 1) / totalSteps) * 100);

  const updateAnswer = (id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const updateLandingAnswer = (id: string, value: string | string[]) => {
    setLandingAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const showToast = (message: string, type: "error" | "success" = "error") => {
    setToast({ message, type });
    setError(null); // Clear inline error
    setTimeout(() => setToast(null), 5000); // Auto-hide after 5 seconds
  };

  const updateQuizAnswer = (questionId: string, value: string | string[]) => {
    setQuizAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const calculateRecommendation = async () => {
    if (!enableQuiz || Object.keys(quizAnswers).length === 0) return;

    try {
      const baseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
      const response = await fetch(`${baseUrl}/api/public/schools/${schoolId}/quiz/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: quizAnswers })
      });

      if (!response.ok) throw new Error("Failed to calculate recommendation");

      const data = await response.json();
      const recommended = data.recommendedProgram || null;
      const scores = data.quizScore || {};
      setRecommendedProgram(recommended);
      setQuizScores(scores);
      return { recommendedProgram: recommended, quizScore: scores };
    } catch (error) {
      console.error("Recommendation error:", error);
    }
  };

  const isAnswerMissing = (question: Question) => {
    const value = answers[question.id];
    if (question.type === "checkbox") {
      return !Array.isArray(value) || value.length === 0;
    }
    return value === undefined || value === null || value === "";
  };

  const isQuizAnswerMissing = (question: QuizQuestion) => {
    const value = quizAnswers[question.id];
    if (question.questionType === "multiple_choice") {
      return !Array.isArray(value) || value.length === 0;
    }
    return !value;
  };

  const renderLandingQuestion = (question: any) => {
    const value = landingAnswers[question.id];
    const isRequired = question.isRequired;

    return (
      <div className="form-question field" key={question.id}>
        <label className="field-label">
          {question.questionText}
          {isRequired && <span style={{ color: "#d9534f" }}> *</span>}
        </label>
        {question.helpText && <p className="field-help" style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>{question.helpText}</p>}

        {question.questionType === "text" && (
          <input
            className="field-input"
            type="text"
            value={(value as string) || ""}
            onChange={(event) => updateLandingAnswer(question.id, event.target.value)}
            required={isRequired}
          />
        )}

        {question.questionType === "email" && (
          <input
            className="field-input"
            type="email"
            value={(value as string) || ""}
            onChange={(event) => updateLandingAnswer(question.id, event.target.value)}
            required={isRequired}
          />
        )}

        {question.questionType === "tel" && (
          <input
            className="field-input"
            type="tel"
            value={(value as string) || ""}
            onChange={(event) => updateLandingAnswer(question.id, event.target.value)}
            required={isRequired}
          />
        )}

        {question.questionType === "number" && (
          <input
            className="field-input"
            type="number"
            value={(value as string) || ""}
            onChange={(event) => updateLandingAnswer(question.id, event.target.value)}
            required={isRequired}
          />
        )}

        {question.questionType === "textarea" && (
          <textarea
            className="field-input"
            value={(value as string) || ""}
            onChange={(event) => updateLandingAnswer(question.id, event.target.value)}
            required={isRequired}
            rows={3}
          />
        )}

        {question.questionType === "select" && (
          <select
            className="field-input"
            value={(value as string) || ""}
            onChange={(event) => updateLandingAnswer(question.id, event.target.value)}
            required={isRequired}
          >
            <option value="">Select one</option>
            {question.options?.map((option: any) => (
              <option key={option.id} value={option.optionValue}>
                {option.optionText}
              </option>
            ))}
          </select>
        )}

        {question.questionType === "radio" && (
          <div className="option-group">
            {question.options?.map((option: any) => (
              <label key={option.id} className="option">
                <input
                  type="radio"
                  name={question.id}
                  checked={value === option.optionValue}
                  onChange={() => updateLandingAnswer(question.id, option.optionValue)}
                  required={isRequired}
                />
                {option.optionText}
              </label>
            ))}
          </div>
        )}

        {question.questionType === "checkbox" && (
          <div className="option-group">
            {question.options?.map((option: any) => {
              const currentValues = Array.isArray(value) ? value : [];
              const checked = currentValues.includes(option.optionValue);

              return (
                <label key={option.id} className="option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const nextValues = checked
                        ? currentValues.filter((v) => v !== option.optionValue)
                        : [...currentValues, option.optionValue];
                      updateLandingAnswer(question.id, nextValues);
                    }}
                  />
                  {option.optionText}
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderQuestion = (question: Question) => {
    return (
      <div className="form-question field" key={question.id}>
        <label className="field-label">{question.label}</label>
        {question.type === "text" && (
          <input
            className="field-input"
            type="text"
            value={(answers[question.id] as string) || ""}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
            placeholder={(question as { placeholder?: string }).placeholder || undefined}
          />
        )}
        {question.type === "email" && (
          <input
            className="field-input"
            type="email"
            value={(answers[question.id] as string) || ""}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
            placeholder={(question as { placeholder?: string }).placeholder || undefined}
          />
        )}
        {question.type === "tel" && (
          <input
            className="field-input"
            type="tel"
            value={(answers[question.id] as string) || ""}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
            placeholder={(question as { placeholder?: string }).placeholder || undefined}
          />
        )}
        {question.type === "slider" && (
          <input
            className="field-input"
            type="range"
            min={0}
            max={10}
            value={(answers[question.id] as number) || 5}
            onChange={(event) => updateAnswer(question.id, Number(event.target.value))}
          />
        )}
        {question.type === "textarea" && (
          <textarea
            className="field-input"
            value={(answers[question.id] as string) || ""}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
            placeholder={(question as { placeholder?: string }).placeholder || undefined}
          />
        )}
        {question.type === "select" && (
          <select
            className="field-input"
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

  const renderQuizQuestion = (question: QuizQuestion) => {
    return (
      <div className="form-question field" key={question.id}>
        <label className="field-label">{question.questionText}</label>
        {question.helpText && <p className="field-help">{question.helpText}</p>}

        {question.questionType === "text" && (
          <input
            className="field-input"
            type="text"
            value={(quizAnswers[question.id] as string) || ""}
            onChange={(event) => updateQuizAnswer(question.id, event.target.value)}
          />
        )}

        {(question.questionType === "single_choice" || question.questionType === "multiple_choice") && (
          <div className="option-group">
            {question.options.map((option) => {
              const selected = quizAnswers[question.id];
              const checked =
                question.questionType === "multiple_choice"
                  ? Array.isArray(selected) && selected.includes(option.id)
                  : selected === option.id;

              return (
                <label key={option.id} className="option">
                  <input
                    type={question.questionType === "multiple_choice" ? "checkbox" : "radio"}
                    name={question.id}
                    checked={checked}
                    onChange={() => {
                      if (question.questionType === "multiple_choice") {
                        const currentValues = Array.isArray(selected) ? selected : [];
                        const nextValues = checked
                          ? currentValues.filter((id) => id !== option.id)
                          : [...currentValues, option.id];
                        updateQuizAnswer(question.id, nextValues);
                      } else {
                        updateQuizAnswer(question.id, option.id);
                      }
                    }}
                  />
                  {option.optionText}
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

    // Step 0: Contact info submission (creates CRM lead)
    if (isStartStep) {
      if (!consentChecked) {
        showToast("Please provide consent to continue.");
        return;
      }

      if (!contact.firstName || !contact.lastName || !contact.email || !contact.phone) {
        showToast("Please complete all required contact fields.");
        return;
      }

      for (const question of visibleLeadQuestions) {
        if (question.required && isAnswerMissing(question)) {
          showToast("Please answer all required questions to continue.");
          return;
        }
      }

      // Validate landing page questions
      for (const question of landingQuestions) {
        if (question.isRequired) {
          const answer = landingAnswers[question.id];
          if (!answer || (Array.isArray(answer) && answer.length === 0) || (typeof answer === "string" && answer.trim() === "")) {
            showToast(`Please answer: ${question.questionText}`);
            return;
          }
        }
      }

      setIsSubmitting(true);
      try {
        const baseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
        const payloadAnswers: Record<string, unknown> = {};
        let campusId: string | null = null;
        for (const question of visibleLeadQuestions) {
          if (answers[question.id] !== undefined) {
            payloadAnswers[question.id] = answers[question.id];
          }
          const mapTo = (question as { mapTo?: "answers" | "campus_id" }).mapTo;
          if (mapTo === "campus_id") {
            const selected = answers[question.id] as string | undefined;
            if (selected && selected !== "not_sure") {
              campusId = selected;
            }
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
          landingAnswers,
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

        const response = await fetch(`${baseUrl}/api/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

        // If no quiz, we're done
        if (!enableQuiz) {
          setSubmitted(true);
          return;
        }

        setCurrentStep(1);
      } catch (submitError) {
        showToast((submitError as Error).message);
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    // Quiz steps: Update CRM lead with quiz answer
    if (isInQuizStep && currentQuizQuestion) {
      if (isQuizAnswerMissing(currentQuizQuestion)) {
        showToast("Please answer this question to continue.");
        return;
      }

      if (!submissionId) {
        showToast("Missing submission id. Please restart.");
        return;
      }

      setIsSubmitting(true);
      try {
        const baseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

        // Send quiz answer to CRM
        const payload = {
          submissionId,
          stepIndex: currentStep + 1,
          answers: { [`quiz_${currentQuizQuestion.id}`]: quizAnswers[currentQuizQuestion.id] }
        };

        const response = await fetch(`${baseUrl}/api/lead/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Submission failed");
        }

        let recommendation: { recommendedProgram: QuizProgram | null; quizScore: Record<string, number> } | undefined;
        if (currentStep === quizStepsEnd - 1) {
          recommendation = await calculateRecommendation();
        }

        if (isLastStep) {
          if (submissionId) {
            const finalAnswers: Record<string, unknown> = {
              quiz_completed: true,
              quiz_answers: quizAnswers,
              quiz_scores: recommendation?.quizScore || quizScores
            };
            const recommended = recommendation?.recommendedProgram || recommendedProgram;
            if (recommended) {
              finalAnswers.recommended_program = recommended.id;
              finalAnswers.recommended_program_name = recommended.name;
            }

            await fetch(`${baseUrl}/api/lead/step`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                submissionId,
                stepIndex: currentStep + 1,
                answers: finalAnswers
              })
            });
          }

          setSubmitted(true);
        } else {
          setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
        }
      } catch (submitError) {
        showToast((submitError as Error).message);
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

  };

  if (submitted) {
    return (
      <div className="form-card">
        <span className="badge">Submission received</span>
        <h2>{thankYou?.title || "Thanks! Your info is on the way."}</h2>
        {enableQuiz && recommendedProgram && (
          <p>
            <strong>Recommended Program:</strong> {recommendedProgram.name}
          </p>
        )}
        {thankYou?.message && <p>{thankYou.message}</p>}
        {thankYou?.body && <p>{thankYou.body}</p>}
        {!thankYou?.message && !thankYou?.body && (
          <p>We have sent your details to admissions. Expect a response soon.</p>
        )}
        {thankYou?.ctaText && thankYou?.ctaUrl && (
          <p>
            <a className="primary" href={thankYou.ctaUrl}>
              {thankYou.ctaText}
            </a>
          </p>
        )}
      </div>
    );
  }

  if (quizLoading) {
    return (
      <div className="form-card">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="form-card">
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: toast.type === "error" ? "#d9534f" : "#5cb85c",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 10000,
            maxWidth: "90%",
            width: "auto",
            minWidth: "300px",
            textAlign: "center",
            fontSize: "14px",
            fontWeight: 500,
            animation: "slideDown 0.3s ease-out"
          }}
        >
          {toast.message}
        </div>
      )}
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
          <div className="field-grid">
            <div className="field">
              <label className="field-label">
                First name
                <span style={{ color: "#d9534f" }}> *</span>
              </label>
              <input
                className="field-input"
                type="text"
                value={contact.firstName}
                onChange={(event) => setContact({ ...contact, firstName: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label className="field-label">
                Last name
                <span style={{ color: "#d9534f" }}> *</span>
              </label>
              <input
                className="field-input"
                type="text"
                value={contact.lastName}
                onChange={(event) => setContact({ ...contact, lastName: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label className="field-label">
                Email
                <span style={{ color: "#d9534f" }}> *</span>
              </label>
              <input
                className="field-input"
                type="email"
                value={contact.email}
                onChange={(event) => setContact({ ...contact, email: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label className="field-label">
                Phone
                <span style={{ color: "#d9534f" }}> *</span>
              </label>
              <input
                className="field-input"
                type="tel"
                value={contact.phone}
                onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                required
              />
            </div>
          </div>
          <div className="field-stack">
            {landingQuestions.length > 0 && (
              <>
                {landingQuestions
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((question) => renderLandingQuestion(question))}
              </>
            )}
            {visibleLeadQuestions.map((question) => renderQuestion(question))}
          </div>
          <p className="disclaimer">{consentText}</p>
          <label className="consent-line">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            <span>{consentLabel || "I agree to receive calls, texts, or emails about program info."}</span>
          </label>
        </div>
      )}

      {currentQuizQuestion && isInQuizStep && (
        <div className="form-step">{renderQuizQuestion(currentQuizQuestion)}</div>
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
