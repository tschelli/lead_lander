"use client";

import { useState, useEffect } from "react";
import "./quiz-builder.css";

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
  isActive: boolean;
  options: QuizAnswerOption[];
};

type QuizAnswerOption = {
  id: string;
  optionText: string;
  displayOrder: number;
  pointAssignments: Record<string, number>;
};

type Program = {
  id: string;
  name: string;
  slug: string;
};

export function QuizBuilderPage({
  schoolSlug,
  programs
}: {
  schoolSlug: string;
  programs: Program[];
}) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/admin/schools/${schoolSlug}/quiz/questions`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to load questions");
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (error) {
      showMessage("error", "Failed to load questions");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const createQuestion = () => {
    setIsCreating(true);
    setEditingQuestion({
      id: "",
      questionText: "",
      questionType: "single_choice",
      helpText: "",
      displayOrder: questions.length,
      isActive: true,
      options: []
    });
  };

  const saveQuestion = async () => {
    if (!editingQuestion) return;

    try {
      const method = editingQuestion.id ? "PUT" : "POST";
      const url = editingQuestion.id
        ? `${apiBase}/api/admin/schools/${schoolSlug}/quiz/questions/${editingQuestion.id}`
        : `${apiBase}/api/admin/schools/${schoolSlug}/quiz/questions`;

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: editingQuestion.questionText,
          questionType: editingQuestion.questionType,
          helpText: editingQuestion.helpText,
          displayOrder: editingQuestion.displayOrder,
          conditionalOn: editingQuestion.conditionalOn,
          isActive: editingQuestion.isActive
        })
      });

      if (!res.ok) throw new Error("Failed to save question");

      const data = await res.json();
      const savedQuestionId = editingQuestion.id || data.id;

      // Save options
      for (const option of editingQuestion.options) {
        await saveOption(savedQuestionId, option);
      }

      showMessage("success", "Question saved successfully");
      setEditingQuestion(null);
      setIsCreating(false);
      await fetchQuestions();
    } catch (error) {
      showMessage("error", "Failed to save question");
      console.error(error);
    }
  };

  const saveOption = async (questionId: string, option: QuizAnswerOption) => {
    try {
      const method = option.id && !option.id.startsWith("temp-") ? "PUT" : "POST";
      const url =
        method === "PUT"
          ? `${apiBase}/api/admin/schools/${schoolSlug}/quiz/questions/${questionId}/options/${option.id}`
          : `${apiBase}/api/admin/schools/${schoolSlug}/quiz/questions/${questionId}/options`;

      await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionText: option.optionText,
          displayOrder: option.displayOrder,
          pointAssignments: option.pointAssignments
        })
      });
    } catch (error) {
      console.error("Failed to save option", error);
    }
  };

  const deleteQuestion = async (questionId: string) => {
    if (!confirm("Delete this question? This will also delete all answer options.")) return;

    try {
      const res = await fetch(
        `${apiBase}/api/admin/schools/${schoolSlug}/quiz/questions/${questionId}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      if (!res.ok) throw new Error("Failed to delete question");

      showMessage("success", "Question deleted");
      await fetchQuestions();
    } catch (error) {
      showMessage("error", "Failed to delete question");
      console.error(error);
    }
  };

  const deleteOption = async (questionId: string, optionId: string) => {
    if (!confirm("Delete this answer option?")) return;

    try {
      await fetch(
        `${apiBase}/api/admin/schools/${schoolSlug}/quiz/questions/${questionId}/options/${optionId}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      showMessage("success", "Option deleted");
      await fetchQuestions();
    } catch (error) {
      showMessage("error", "Failed to delete option");
      console.error(error);
    }
  };

  const addOption = () => {
    if (!editingQuestion) return;
    const newOption: QuizAnswerOption = {
      id: `temp-${Date.now()}`,
      optionText: "",
      displayOrder: editingQuestion.options.length,
      pointAssignments: {}
    };
    setEditingQuestion({
      ...editingQuestion,
      options: [...editingQuestion.options, newOption]
    });
  };

  const updateOption = (optionIndex: number, updates: Partial<QuizAnswerOption>) => {
    if (!editingQuestion) return;
    const updatedOptions = [...editingQuestion.options];
    updatedOptions[optionIndex] = { ...updatedOptions[optionIndex], ...updates };
    setEditingQuestion({ ...editingQuestion, options: updatedOptions });
  };

  const removeOption = (optionIndex: number) => {
    if (!editingQuestion) return;
    const updatedOptions = editingQuestion.options.filter((_, i) => i !== optionIndex);
    setEditingQuestion({ ...editingQuestion, options: updatedOptions });
  };

  if (loading) {
    return (
      <div className="quiz-builder">
        <p>Loading quiz questions...</p>
      </div>
    );
  }

  return (
    <div className="quiz-builder">
      {message && (
        <div className={`quiz-message quiz-message-${message.type}`}>{message.text}</div>
      )}

      <div className="quiz-header">
        <h2>Quiz Builder</h2>
        <button className="admin-btn" onClick={createQuestion}>
          + Create Question
        </button>
      </div>

      {editingQuestion && (
        <div className="quiz-editor-modal">
          <div className="quiz-editor-content">
            <h3>{isCreating ? "Create Question" : "Edit Question"}</h3>

            <div className="form-group">
              <label>Question Text *</label>
              <textarea
                className="form-textarea"
                value={editingQuestion.questionText}
                onChange={(e) =>
                  setEditingQuestion({ ...editingQuestion, questionText: e.target.value })
                }
                rows={3}
                placeholder="Enter your question..."
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Question Type</label>
                <select
                  className="form-input"
                  value={editingQuestion.questionType}
                  onChange={(e) =>
                    setEditingQuestion({
                      ...editingQuestion,
                      questionType: e.target.value as QuizQuestion["questionType"]
                    })
                  }
                >
                  <option value="single_choice">Single Choice</option>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="text">Text Input</option>
                </select>
              </div>

              <div className="form-group">
                <label>Display Order</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingQuestion.displayOrder}
                  onChange={(e) =>
                    setEditingQuestion({
                      ...editingQuestion,
                      displayOrder: parseInt(e.target.value) || 0
                    })
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label>Help Text (optional)</label>
              <input
                type="text"
                className="form-input"
                value={editingQuestion.helpText || ""}
                onChange={(e) =>
                  setEditingQuestion({ ...editingQuestion, helpText: e.target.value })
                }
                placeholder="Additional guidance for users..."
              />
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={editingQuestion.isActive}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, isActive: e.target.checked })
                  }
                />{" "}
                Active
              </label>
            </div>

            {editingQuestion.questionType !== "text" && (
              <div className="quiz-options-section">
                <div className="quiz-options-header">
                  <h4>Answer Options</h4>
                  <button className="admin-btn admin-btn-sm" onClick={addOption}>
                    + Add Option
                  </button>
                </div>

                {editingQuestion.options.map((option, idx) => (
                  <div key={option.id} className="quiz-option-editor">
                    <div className="quiz-option-main">
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Option text..."
                        value={option.optionText}
                        onChange={(e) =>
                          updateOption(idx, { optionText: e.target.value })
                        }
                      />
                      <button
                        className="btn-remove"
                        onClick={() => removeOption(idx)}
                      >
                        ×
                      </button>
                    </div>

                    <div className="quiz-points-grid">
                      <label>Point Assignments:</label>
                      {programs.map((program) => (
                        <div key={program.id} className="quiz-point-item">
                          <span>{program.name}:</span>
                          <input
                            type="number"
                            className="form-input-sm"
                            placeholder="0"
                            value={option.pointAssignments[program.id] || ""}
                            onChange={(e) => {
                              const points = parseInt(e.target.value) || 0;
                              const newAssignments = { ...option.pointAssignments };
                              if (points === 0) {
                                delete newAssignments[program.id];
                              } else {
                                newAssignments[program.id] = points;
                              }
                              updateOption(idx, { pointAssignments: newAssignments });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="quiz-editor-actions">
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  setEditingQuestion(null);
                  setIsCreating(false);
                }}
              >
                Cancel
              </button>
              <button className="admin-btn" onClick={saveQuestion}>
                Save Question
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="quiz-questions-list">
        {questions.length === 0 ? (
          <div className="quiz-empty">
            <p>No questions yet. Create your first question to get started.</p>
          </div>
        ) : (
          questions.map((question) => (
            <div key={question.id} className="quiz-question-card">
              <div className="quiz-question-header">
                <div>
                  <span className="quiz-question-order">#{question.displayOrder + 1}</span>
                  <span className="quiz-question-type">{question.questionType}</span>
                  {!question.isActive && <span className="quiz-badge-inactive">Inactive</span>}
                </div>
                <div className="quiz-question-actions">
                  <button
                    className="admin-btn admin-btn-sm"
                    onClick={() => {
                      setEditingQuestion(question);
                      setIsCreating(false);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    onClick={() => deleteQuestion(question.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="quiz-question-text">{question.questionText}</div>

              {question.helpText && (
                <div className="quiz-question-help">{question.helpText}</div>
              )}

              {question.options.length > 0 && (
                <div className="quiz-question-options">
                  <strong>Options:</strong>
                  <ul>
                    {question.options.map((option) => (
                      <li key={option.id}>
                        {option.optionText}
                        {Object.keys(option.pointAssignments).length > 0 && (
                          <span className="quiz-points-summary">
                            {" "}
                            (
                            {Object.entries(option.pointAssignments)
                              .map(([programId, points]) => {
                                const program = programs.find((p) => p.id === programId);
                                return program ? `${program.name}: ${points}` : null;
                              })
                              .filter(Boolean)
                              .join(", ")}
                            )
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
