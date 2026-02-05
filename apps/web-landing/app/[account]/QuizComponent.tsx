"use client";

import { useState, useEffect } from "react";
import type { Account, Program } from "@lead_lander/config-schema";
import { CLIENT_API_BASE_URL } from "../../lib/apiConfig";

type QuizQuestion = {
  id: string;
  questionText: string;
  questionType: "single_choice" | "multiple_choice" | "text";
  helpText?: string;
  displayOrder: number;
  options: Array<{
    id: string;
    optionText: string;
  }>;
};

type QuizComponentProps = {
  account: Account;
  programs: Program[];
  submissionId: string;
  onComplete: () => void;
};

export function QuizComponent({ account, programs, submissionId, onComplete }: QuizComponentProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendedProgram, setRecommendedProgram] = useState<Program | null>(null);

  useEffect(() => {
    loadQuizQuestions();
  }, []);

  const loadQuizQuestions = async () => {
    try {
      const response = await fetch(
        `${CLIENT_API_BASE_URL}/api/public/accounts/${account.slug}/quiz`
      );

      if (!response.ok) {
        throw new Error("Failed to load quiz questions");
      }

      const data = await response.json();
      setQuestions(data.questions || []);
      setLoading(false);
    } catch (err) {
      setError("Failed to load quiz. Please try again.");
      setLoading(false);
    }
  };

  const handleAnswer = (questionId: string, answer: string | string[]) => {
    setAnswers({ ...answers, [questionId]: answer });
  };

  const handleNext = () => {
    const currentQuestion = questions[currentIndex];

    // Validate answer
    if (!answers[currentQuestion.id]) {
      setError("Please answer the question");
      return;
    }

    setError(null);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      submitQuiz();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setError(null);
    }
  };

  const submitQuiz = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // Submit quiz answers and get recommendation
      const response = await fetch(
        `${CLIENT_API_BASE_URL}/api/public/accounts/${account.slug}/quiz/recommend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionId,
            answers
          })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to submit quiz");
      }

      const data = await response.json();

      if (data.recommendedProgram) {
        const program = programs.find((p) => p.id === data.recommendedProgram.id);
        setRecommendedProgram(program || null);
      }

      // Mark as complete after a delay to show recommendation
      setTimeout(() => {
        onComplete();
      }, 3000);
    } catch (err) {
      setError("Failed to submit quiz. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "48px", textAlign: "center" }}>
        <p>Loading quiz...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div style={{ padding: "48px", textAlign: "center" }}>
        <h2>Thank you!</h2>
        <p>A representative will contact you shortly to discuss your options.</p>
        <button onClick={onComplete} className="cta-button" style={{ marginTop: "24px" }}>
          Done
        </button>
      </div>
    );
  }

  if (recommendedProgram) {
    return (
      <div style={{ padding: "48px", textAlign: "center" }}>
        <h2>✅ Quiz Complete!</h2>
        <p style={{ fontSize: "18px", marginTop: "16px" }}>
          Based on your answers, we recommend:
        </p>
        <div
          style={{
            background: "#f0f9ff",
            padding: "24px",
            borderRadius: "8px",
            margin: "24px auto",
            maxWidth: "500px"
          }}
        >
          <h3 style={{ color: "#0369a1", margin: "0 0 8px 0" }}>
            {recommendedProgram.name}
          </h3>
          {recommendedProgram.description && (
            <p style={{ margin: 0, color: "#075985" }}>
              {recommendedProgram.description}
            </p>
          )}
        </div>
        <p style={{ fontSize: "14px", color: "#666" }}>
          A representative will contact you shortly to discuss this program and answer your questions.
        </p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentQuestion.id];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div style={{ padding: "24px", maxWidth: "600px", margin: "0 auto" }}>
      {/* Progress bar */}
      <div style={{ marginBottom: "32px" }}>
        <div
          style={{
            height: "8px",
            background: "#e5e7eb",
            borderRadius: "4px",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              height: "100%",
              background: account.branding.colors.primary,
              width: `${progress}%`,
              transition: "width 0.3s"
            }}
          />
        </div>
        <p style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
          Question {currentIndex + 1} of {questions.length}
        </p>
      </div>

      {/* Question */}
      <div>
        <h2 style={{ marginBottom: "8px" }}>{currentQuestion.questionText}</h2>
        {currentQuestion.helpText && (
          <p style={{ fontSize: "14px", color: "#666", marginBottom: "24px" }}>
            {currentQuestion.helpText}
          </p>
        )}

        {/* Single choice */}
        {currentQuestion.questionType === "single_choice" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {currentQuestion.options.map((option) => (
              <label
                key={option.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "16px",
                  border: currentAnswer === option.id ? "2px solid " + account.branding.colors.primary : "2px solid #e5e7eb",
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: currentAnswer === option.id ? "#f0f9ff" : "white",
                  transition: "all 0.2s"
                }}
              >
                <input
                  type="radio"
                  name={currentQuestion.id}
                  value={option.id}
                  checked={currentAnswer === option.id}
                  onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                  style={{ width: "20px", height: "20px" }}
                />
                <span style={{ flex: 1 }}>{option.optionText}</span>
              </label>
            ))}
          </div>
        )}

        {/* Multiple choice */}
        {currentQuestion.questionType === "multiple_choice" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {currentQuestion.options.map((option) => {
              const isChecked = Array.isArray(currentAnswer) && currentAnswer.includes(option.id);
              return (
                <label
                  key={option.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "16px",
                    border: isChecked ? "2px solid " + account.branding.colors.primary : "2px solid #e5e7eb",
                    borderRadius: "8px",
                    cursor: "pointer",
                    background: isChecked ? "#f0f9ff" : "white",
                    transition: "all 0.2s"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const current = Array.isArray(currentAnswer) ? currentAnswer : [];
                      if (e.target.checked) {
                        handleAnswer(currentQuestion.id, [...current, option.id]);
                      } else {
                        handleAnswer(currentQuestion.id, current.filter((id) => id !== option.id));
                      }
                    }}
                    style={{ width: "20px", height: "20px" }}
                  />
                  <span style={{ flex: 1 }}>{option.optionText}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* Text input */}
        {currentQuestion.questionType === "text" && (
          <textarea
            value={typeof currentAnswer === "string" ? currentAnswer : ""}
            onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "16px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              minHeight: "100px"
            }}
            placeholder="Type your answer here..."
          />
        )}

        {error && (
          <p style={{ color: "red", marginTop: "16px", fontSize: "14px" }}>
            {error}
          </p>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
          {currentIndex > 0 && (
            <button
              onClick={handleBack}
              disabled={submitting}
              style={{
                padding: "12px 24px",
                fontSize: "16px",
                border: "2px solid #e5e7eb",
                borderRadius: "4px",
                background: "white",
                cursor: "pointer"
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={submitting}
            className="cta-button"
            style={{ flex: 1 }}
          >
            {submitting
              ? "Submitting..."
              : currentIndex === questions.length - 1
              ? "Complete Quiz"
              : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
