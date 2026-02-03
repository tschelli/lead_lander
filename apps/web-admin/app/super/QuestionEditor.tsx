"use client";

import { useState, useEffect } from "react";
import "./super-admin.css";

type QuizQuestion = {
  id: string;
  stageId: string;
  questionText: string;
  questionType: "single_choice" | "multiple_choice" | "text";
  helpText?: string;
  displayOrder: number;
  isContactField: boolean;
  contactFieldType?: string;
  disqualifiesLead: boolean;
  disqualificationReason?: string;
  isActive: boolean;
  options: QuizOption[];
};

type QuizOption = {
  id: string;
  optionText: string;
  displayOrder: number;
  pointAssignments: Record<string, number>;
  categoryPoints: Record<string, number>;
  disqualifiesLead: boolean;
  disqualificationReason?: string;
  routesToProgramId?: string;
};

type ProgramCategory = {
  id: string;
  name: string;
  slug: string;
};

type Program = {
  id: string;
  name: string;
  categoryId?: string;
};

type QuestionEditorProps = {
  stageId: string;
  stageName: string;
  categoryId?: string;
  onClose: () => void;
  onMessage: (type: "success" | "error", text: string) => void;
};

export function QuestionEditor({
  stageId,
  stageName,
  categoryId,
  onClose,
  onMessage
}: QuestionEditorProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [categories, setCategories] = useState<ProgramCategory[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [editingOption, setEditingOption] = useState<{ questionId: string; option: QuizOption | null } | null>(null);

  useEffect(() => {
    loadData();
  }, [stageId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get questions for this stage
      const questionsRes = await fetch(`/api/super/quiz/stages/${stageId}/questions`, {
        credentials: "include"
      });

      if (questionsRes.ok) {
        const data = await questionsRes.json();
        setQuestions(data.questions || []);
      }

      // Get categories and programs from config
      // We'll need to pass clientId - for now just stub
      // In real implementation, get from parent component or context
    } catch (error) {
      console.error("Failed to load questions", error);
      onMessage("error", "Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  const createQuestion = () => {
    setEditingQuestion({
      id: "",
      stageId,
      questionText: "",
      questionType: "single_choice",
      helpText: "",
      displayOrder: questions.length,
      isContactField: false,
      contactFieldType: "",
      disqualifiesLead: false,
      disqualificationReason: "",
      isActive: true,
      options: []
    });
  };

  const saveQuestion = async () => {
    if (!editingQuestion) return;

    try {
      const isNew = !editingQuestion.id;
      const url = isNew
        ? `/api/super/quiz/stages/${stageId}/questions`
        : `/api/super/quiz/questions/${editingQuestion.id}`;

      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: editingQuestion.questionText,
          questionType: editingQuestion.questionType,
          helpText: editingQuestion.helpText,
          displayOrder: editingQuestion.displayOrder,
          isContactField: editingQuestion.isContactField,
          contactFieldType: editingQuestion.contactFieldType,
          disqualifiesLead: editingQuestion.disqualifiesLead,
          disqualificationReason: editingQuestion.disqualificationReason
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save question");
      }

      onMessage("success", `Question ${isNew ? "created" : "updated"} successfully`);
      setEditingQuestion(null);
      loadData();
    } catch (error) {
      onMessage("error", (error as Error).message);
    }
  };

  const deleteQuestion = async (questionId: string) => {
    if (!confirm("Delete this question?")) return;

    try {
      const res = await fetch(`/api/super/quiz/questions/${questionId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!res.ok) {
        throw new Error("Failed to delete question");
      }

      onMessage("success", "Question deleted");
      loadData();
    } catch (error) {
      onMessage("error", (error as Error).message);
    }
  };

  const addOption = (questionId: string) => {
    setEditingOption({
      questionId,
      option: {
        id: "",
        optionText: "",
        displayOrder: 0,
        pointAssignments: {},
        categoryPoints: {},
        disqualifiesLead: false,
        disqualificationReason: "",
        routesToProgramId: ""
      }
    });
  };

  const saveOption = async () => {
    if (!editingOption) return;

    try {
      const isNew = !editingOption.option?.id;
      const url = isNew
        ? `/api/super/quiz/questions/${editingOption.questionId}/options`
        : `/api/super/quiz/options/${editingOption.option?.id}`;

      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingOption.option)
      });

      if (!res.ok) {
        throw new Error("Failed to save option");
      }

      onMessage("success", `Option ${isNew ? "created" : "updated"}`);
      setEditingOption(null);
      loadData();
    } catch (error) {
      onMessage("error", (error as Error).message);
    }
  };

  const deleteOption = async (optionId: string) => {
    if (!confirm("Delete this option?")) return;

    try {
      const res = await fetch(`/api/super/quiz/options/${optionId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!res.ok) {
        throw new Error("Failed to delete option");
      }

      onMessage("success", "Option deleted");
      loadData();
    } catch (error) {
      onMessage("error", (error as Error).message);
    }
  };

  return (
    <div className="question-editor">
      <div className="question-editor__header">
        <div>
          <h2>Questions for: {stageName}</h2>
          <p className="super-admin__help">{questions.length} questions</p>
        </div>
        <div className="question-editor__header-actions">
          <button className="super-admin__btn super-admin__btn--primary" onClick={createQuestion}>
            + Add Question
          </button>
          <button className="super-admin__btn super-admin__btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {loading ? (
        <div className="super-admin__skeleton">
          <div className="super-admin__skeleton-card"></div>
        </div>
      ) : (
        <>
          {/* Question Form */}
          {editingQuestion && (
            <div className="super-admin__section">
              <div className="super-admin__section-content">
                <h4>{editingQuestion.id ? "Edit Question" : "New Question"}</h4>

                <div className="super-admin__field">
                  <label className="super-admin__label">
                    Question Text <span className="super-admin__label-required">*</span>
                  </label>
                  <textarea
                    className="super-admin__textarea"
                    rows={2}
                    value={editingQuestion.questionText}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, questionText: e.target.value })
                    }
                    placeholder="What is your age?"
                  />
                </div>

                <div className="super-admin__field-group">
                  <div className="super-admin__field">
                    <label className="super-admin__label">Question Type</label>
                    <select
                      className="super-admin__input"
                      value={editingQuestion.questionType}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          questionType: e.target.value as any
                        })
                      }
                    >
                      <option value="single_choice">Single Choice</option>
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="text">Text Input</option>
                    </select>
                  </div>

                  <div className="super-admin__field">
                    <label className="super-admin__label">Display Order</label>
                    <input
                      type="number"
                      className="super-admin__input"
                      value={editingQuestion.displayOrder}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          displayOrder: parseInt(e.target.value)
                        })
                      }
                    />
                  </div>
                </div>

                <div className="super-admin__field">
                  <label className="super-admin__label">Help Text</label>
                  <input
                    className="super-admin__input"
                    value={editingQuestion.helpText || ""}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, helpText: e.target.value })
                    }
                    placeholder="Optional hint for users"
                  />
                </div>

                <div className="super-admin__field">
                  <label className="super-admin__checkbox-label">
                    <input
                      type="checkbox"
                      checked={editingQuestion.isContactField}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          isContactField: e.target.checked
                        })
                      }
                    />
                    <span>This is a contact field</span>
                  </label>
                  <span className="super-admin__help">
                    For fields like First Name, Email, Phone that map to lead data
                  </span>
                </div>

                {editingQuestion.isContactField && (
                  <div className="super-admin__field">
                    <label className="super-admin__label">Contact Field Type</label>
                    <select
                      className="super-admin__input"
                      value={editingQuestion.contactFieldType || ""}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          contactFieldType: e.target.value
                        })
                      }
                    >
                      <option value="">Select type...</option>
                      <option value="first_name">First Name</option>
                      <option value="last_name">Last Name</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="campus">Campus</option>
                      <option value="program">Program Interest</option>
                    </select>
                  </div>
                )}

                <div className="super-admin__field">
                  <label className="super-admin__checkbox-label">
                    <input
                      type="checkbox"
                      checked={editingQuestion.disqualifiesLead}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          disqualifiesLead: e.target.checked
                        })
                      }
                    />
                    <span>Can disqualify leads</span>
                  </label>
                  <span className="super-admin__help">
                    If any answer option can mark the lead as unqualified
                  </span>
                </div>

                <div className="super-admin-quiz__form-actions">
                  <button
                    className="super-admin__btn super-admin__btn--primary"
                    onClick={saveQuestion}
                  >
                    Save Question
                  </button>
                  <button
                    className="super-admin__btn super-admin__btn--ghost"
                    onClick={() => setEditingQuestion(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Questions List */}
          <div className="question-editor__questions">
            {questions.length === 0 ? (
              <div className="super-admin__empty-state">
                <div className="super-admin__empty-icon">❓</div>
                <h3>No Questions Yet</h3>
                <p>Add questions to build your quiz flow</p>
              </div>
            ) : (
              questions.map((question) => (
                <div key={question.id} className="question-editor__question">
                  <div className="question-editor__question-header">
                    <div className="question-editor__question-title">
                      Q{question.displayOrder + 1}: {question.questionText}
                      {question.isContactField && (
                        <span className="super-admin-quiz__list-item-badge">
                          Contact: {question.contactFieldType}
                        </span>
                      )}
                    </div>
                    <div className="question-editor__question-actions">
                      <button
                        className="super-admin__btn super-admin__btn--ghost"
                        onClick={() => setEditingQuestion(question)}
                      >
                        Edit
                      </button>
                      <button
                        className="super-admin__btn super-admin__btn--ghost"
                        onClick={() => deleteQuestion(question.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {question.helpText && (
                    <div className="question-editor__question-help">{question.helpText}</div>
                  )}

                  {/* Options */}
                  <div className="question-editor__options">
                    {question.options.map((option, idx) => (
                      <div key={option.id} className="question-editor__option">
                        <div className="question-editor__option-text">
                          {String.fromCharCode(65 + idx)}) {option.optionText}
                          {option.disqualifiesLead && (
                            <span className="question-editor__option-badge question-editor__option-badge--danger">
                              Disqualifies
                            </span>
                          )}
                          {option.routesToProgramId && (
                            <span className="question-editor__option-badge question-editor__option-badge--info">
                              Routes
                            </span>
                          )}
                        </div>
                        <div className="question-editor__option-actions">
                          <button
                            className="super-admin__btn super-admin__btn--ghost"
                            onClick={() => setEditingOption({ questionId: question.id, option })}
                          >
                            Edit
                          </button>
                          <button
                            className="super-admin__btn super-admin__btn--ghost"
                            onClick={() => deleteOption(option.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      className="question-editor__add-option"
                      onClick={() => addOption(question.id)}
                    >
                      + Add Option
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Option Editor Modal */}
          {editingOption && (
            <div className="question-editor__modal" onClick={() => setEditingOption(null)}>
              <div
                className="question-editor__modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="question-editor__modal-header">
                  <h3>{editingOption.option?.id ? "Edit Option" : "New Option"}</h3>
                  <button
                    className="config-preview-modal-close"
                    onClick={() => setEditingOption(null)}
                  >
                    ×
                  </button>
                </div>

                <div className="question-editor__modal-body">
                  <div className="super-admin__field">
                    <label className="super-admin__label">
                      Option Text <span className="super-admin__label-required">*</span>
                    </label>
                    <input
                      className="super-admin__input"
                      value={editingOption.option?.optionText || ""}
                      onChange={(e) =>
                        setEditingOption({
                          ...editingOption,
                          option: { ...editingOption.option!, optionText: e.target.value }
                        })
                      }
                      placeholder="18-25"
                    />
                  </div>

                  <div className="super-admin__field">
                    <label className="super-admin__checkbox-label">
                      <input
                        type="checkbox"
                        checked={editingOption.option?.disqualifiesLead || false}
                        onChange={(e) =>
                          setEditingOption({
                            ...editingOption,
                            option: {
                              ...editingOption.option!,
                              disqualifiesLead: e.target.checked
                            }
                          })
                        }
                      />
                      <span>Disqualifies lead</span>
                    </label>
                  </div>

                  {editingOption.option?.disqualifiesLead && (
                    <div className="super-admin__field">
                      <label className="super-admin__label">Disqualification Reason</label>
                      <input
                        className="super-admin__input"
                        value={editingOption.option?.disqualificationReason || ""}
                        onChange={(e) =>
                          setEditingOption({
                            ...editingOption,
                            option: {
                              ...editingOption.option!,
                              disqualificationReason: e.target.value
                            }
                          })
                        }
                        placeholder="Under 18"
                      />
                    </div>
                  )}

                  <div className="super-admin__help">
                    Point assignments and category routing will be added here
                  </div>

                  <div className="super-admin-quiz__form-actions">
                    <button
                      className="super-admin__btn super-admin__btn--primary"
                      onClick={saveOption}
                    >
                      Save Option
                    </button>
                    <button
                      className="super-admin__btn super-admin__btn--ghost"
                      onClick={() => setEditingOption(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
