"use client";

import { useState, useEffect } from "react";
import "./QuizFlow.css";

type QuizQuestion = {
  id: string;
  stageSlug: string;
  questionText: string;
  questionType: "single_choice" | "multiple_choice" | "text";
  helpText?: string;
  isContactField: boolean;
  contactFieldType?: string;
  options: Array<{
    id: string;
    optionText: string;
  }>;
};

type QuizFlowProps = {
  schoolId: string;
  defaultProgramId?: string;
  apiBaseUrl: string;
  onComplete: (leadId: string) => void;
};

export function QuizFlow({ schoolId, defaultProgramId, apiBaseUrl, onComplete }: QuizFlowProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [answer, setAnswer] = useState<string>("");
  const [multipleAnswers, setMultipleAnswers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [recommendedProgramId, setRecommendedProgramId] = useState<string | null>(null);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [financialAidInterested, setFinancialAidInterested] = useState(false);

  useEffect(() => {
    startSession();
  }, []);

  const startSession = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/public/quiz/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId })
      });

      if (!res.ok) {
        throw new Error("Failed to start quiz session");
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      await loadNextQuestion(data.sessionId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadNextQuestion = async (sid?: string) => {
    const activeSessionId = sid || sessionId;
    if (!activeSessionId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/public/quiz/sessions/${activeSessionId}/next`);

      if (!res.ok) {
        throw new Error("Failed to load next question");
      }

      const data = await res.json();

      if (data.completed) {
        setCompleted(true);
        setRecommendedProgramId(data.recommendedProgramId || defaultProgramId || null);
        setIsDisqualified(data.isDisqualified || false);
      } else {
        setCurrentQuestion(data.question);
        setAnswer("");
        setMultipleAnswers(new Set());
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!sessionId || !currentQuestion) return;

    if (currentQuestion.questionType === "text" && !answer.trim()) {
      setError("Please provide an answer");
      return;
    }

    if (currentQuestion.questionType === "single_choice" && !answer) {
      setError("Please select an option");
      return;
    }

    if (currentQuestion.questionType === "multiple_choice" && multipleAnswers.size === 0) {
      setError("Please select at least one option");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = { questionId: currentQuestion.id };

      if (currentQuestion.questionType === "text") {
        payload.textAnswer = answer;
      } else if (currentQuestion.questionType === "single_choice") {
        payload.optionId = answer;
      } else {
        // Multiple choice - for now, just submit first selected
        payload.optionId = Array.from(multipleAnswers)[0];
      }

      const res = await fetch(`${apiBaseUrl}/api/public/quiz/sessions/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error("Failed to submit answer");
      }

      const data = await res.json();

      if (data.directRoute) {
        setCompleted(true);
        setRecommendedProgramId(data.directRoute);
      } else {
        await loadNextQuestion();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitFinalLead = async () => {
    if (!sessionId || !recommendedProgramId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/public/quiz/sessions/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedProgramId: recommendedProgramId,
          financialAidInterested
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit");
      }

      const data = await res.json();
      onComplete(data.leadId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMultipleAnswer = (optionId: string) => {
    const newAnswers = new Set(multipleAnswers);
    if (newAnswers.has(optionId)) {
      newAnswers.delete(optionId);
    } else {
      newAnswers.add(optionId);
    }
    setMultipleAnswers(newAnswers);
  };

  if (completed) {
    return (
      <div className="quiz-flow">
        <div className="quiz-flow__completion">
          <h2>
            {isDisqualified
              ? "Thank you for your interest"
              : "Based on your answers, we have a recommendation!"}
          </h2>

          {isDisqualified ? (
            <p>
              Unfortunately, we're unable to process your application at this time. Please contact
              us if you have questions.
            </p>
          ) : (
            <>
              <p>The recommended program for you is displayed below.</p>

              <div className="quiz-flow__field">
                <label className="quiz-flow__checkbox-label">
                  <input
                    type="checkbox"
                    checked={financialAidInterested}
                    onChange={(e) => setFinancialAidInterested(e.target.checked)}
                  />
                  <span>I'm interested in learning about financial aid</span>
                </label>
              </div>

              <button
                className="quiz-flow__button quiz-flow__button--primary"
                onClick={submitFinalLead}
                disabled={loading}
              >
                {loading ? "Submitting..." : "Submit & Get More Information"}
              </button>
            </>
          )}

          {error && <div className="quiz-flow__error">{error}</div>}
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="quiz-flow">
        <div className="quiz-flow__loading">
          {loading ? "Loading..." : "No questions available"}
        </div>
        {error && <div className="quiz-flow__error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="quiz-flow">
      <div className="quiz-flow__question">
        <h3 className="quiz-flow__question-text">{currentQuestion.questionText}</h3>
        {currentQuestion.helpText && (
          <p className="quiz-flow__help-text">{currentQuestion.helpText}</p>
        )}

        {currentQuestion.questionType === "text" && (
          <div className="quiz-flow__field">
            <input
              type={
                currentQuestion.contactFieldType === "email"
                  ? "email"
                  : currentQuestion.contactFieldType === "phone"
                  ? "tel"
                  : "text"
              }
              className="quiz-flow__input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={
                currentQuestion.contactFieldType === "email"
                  ? "your@email.com"
                  : currentQuestion.contactFieldType === "phone"
                  ? "(555) 123-4567"
                  : "Your answer"
              }
              required={currentQuestion.isContactField}
            />
          </div>
        )}

        {currentQuestion.questionType === "single_choice" && (
          <div className="quiz-flow__options">
            {currentQuestion.options.map((option) => (
              <label key={option.id} className="quiz-flow__option">
                <input
                  type="radio"
                  name="quiz-option"
                  value={option.id}
                  checked={answer === option.id}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <span>{option.optionText}</span>
              </label>
            ))}
          </div>
        )}

        {currentQuestion.questionType === "multiple_choice" && (
          <div className="quiz-flow__options">
            {currentQuestion.options.map((option) => (
              <label key={option.id} className="quiz-flow__option">
                <input
                  type="checkbox"
                  checked={multipleAnswers.has(option.id)}
                  onChange={() => toggleMultipleAnswer(option.id)}
                />
                <span>{option.optionText}</span>
              </label>
            ))}
          </div>
        )}

        {error && <div className="quiz-flow__error">{error}</div>}

        <button
          className="quiz-flow__button quiz-flow__button--primary"
          onClick={submitAnswer}
          disabled={loading}
        >
          {loading ? "Submitting..." : "Next"}
        </button>
      </div>
    </div>
  );
}
