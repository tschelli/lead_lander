"use client";

import { useEffect, useState } from "react";
import "./super-admin.css";

type LandingQuestion = {
  id: string;
  schoolId: string;
  questionText: string;
  questionType: string;
  helpText?: string;
  displayOrder: number;
  isRequired: boolean;
  crmFieldName?: string;
  options: Array<{
    id: string;
    optionText: string;
    optionValue: string;
    displayOrder: number;
  }>;
};

type SuperAdminLandingQuestionsPageProps = {
  schoolId: string;
};

export function SuperAdminLandingQuestionsPage({ schoolId }: SuperAdminLandingQuestionsPageProps) {
  const [questions, setQuestions] = useState<LandingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<LandingQuestion | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    questionText: "",
    questionType: "text",
    helpText: "",
    displayOrder: 0,
    isRequired: false,
    crmFieldName: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadQuestions();
  }, [schoolId]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super/schools/${schoolId}/landing-questions`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
      } else {
        showMessage("error", "Failed to load landing questions");
      }
    } catch (error) {
      console.error("Failed to load landing questions", error);
      showMessage("error", "Failed to load landing questions");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const startCreate = () => {
    setFormData({
      questionText: "",
      questionType: "text",
      helpText: "",
      displayOrder: questions.length,
      isRequired: false,
      crmFieldName: ""
    });
    setIsCreating(true);
    setEditingQuestion(null);
  };

  const startEdit = (question: LandingQuestion) => {
    setFormData({
      questionText: question.questionText,
      questionType: question.questionType,
      helpText: question.helpText || "",
      displayOrder: question.displayOrder,
      isRequired: question.isRequired,
      crmFieldName: question.crmFieldName || ""
    });
    setEditingQuestion(question);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!formData.questionText) {
      showMessage("error", "Question text is required");
      return;
    }

    setSaving(true);
    try {
      const url = editingQuestion
        ? `/api/super/landing-questions/${editingQuestion.id}`
        : `/api/super/schools/${schoolId}/landing-questions`;

      const res = await fetch(url, {
        method: editingQuestion ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save question");
      }

      showMessage("success", `Question ${editingQuestion ? "updated" : "created"} successfully`);
      setIsCreating(false);
      setEditingQuestion(null);
      loadQuestions();
    } catch (error) {
      showMessage("error", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (questionId: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;

    try {
      const res = await fetch(`/api/super/landing-questions/${questionId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete question");
      }

      showMessage("success", "Question deleted successfully");
      loadQuestions();
    } catch (error) {
      showMessage("error", (error as Error).message);
    }
  };

  const handleAddOption = async (questionId: string) => {
    const optionText = prompt("Enter option text:");
    if (!optionText) return;

    try {
      const res = await fetch(`/api/super/landing-questions/${questionId}/options`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionText,
          optionValue: optionText,
          displayOrder: 0
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to add option");
      }

      showMessage("success", "Option added successfully");
      loadQuestions();
    } catch (error) {
      showMessage("error", (error as Error).message);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!confirm("Are you sure you want to delete this option?")) return;

    try {
      const res = await fetch(`/api/super/landing-question-options/${optionId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete option");
      }

      showMessage("success", "Option deleted successfully");
      loadQuestions();
    } catch (error) {
      showMessage("error", (error as Error).message);
    }
  };

  const questionTypeOptions = [
    { value: "text", label: "Short Text" },
    { value: "textarea", label: "Long Text" },
    { value: "select", label: "Dropdown" },
    { value: "radio", label: "Radio Buttons" },
    { value: "checkbox", label: "Checkboxes" },
    { value: "number", label: "Number" },
    { value: "tel", label: "Phone" },
    { value: "email", label: "Email" }
  ];

  const needsOptions = ["select", "radio", "checkbox"].includes(formData.questionType);

  return (
    <div className="super-admin-quiz">
      {message && (
        <div className={`super-admin__save-message super-admin__save-message--${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="super-admin-quiz__section">
        <div className="super-admin-quiz__section-header">
          <h3>Landing Page Questions</h3>
          <button className="super-admin__btn super-admin__btn--primary" onClick={startCreate}>
            + Add Question
          </button>
        </div>

        <p className="super-admin__help" style={{ marginTop: "1rem", marginBottom: "2rem" }}>
          These questions will appear on all program landing pages for this school, before the quiz begins.
        </p>

        {loading ? (
          <div className="super-admin__skeleton">
            <div className="super-admin__skeleton-card"></div>
            <div className="super-admin__skeleton-card"></div>
          </div>
        ) : (
          <>
            {(isCreating || editingQuestion) && (
              <div className="super-admin__section">
                <div className="super-admin__section-content">
                  <h4>{editingQuestion ? "Edit Question" : "New Question"}</h4>

                  <div className="super-admin__field">
                    <label className="super-admin__label">
                      Question Text <span className="super-admin__label-required">*</span>
                    </label>
                    <input
                      className="super-admin__input"
                      value={formData.questionText}
                      onChange={(e) => setFormData({ ...formData, questionText: e.target.value })}
                      placeholder="What is your date of birth?"
                    />
                  </div>

                  <div className="super-admin__field">
                    <label className="super-admin__label">Question Type</label>
                    <select
                      className="super-admin__input"
                      value={formData.questionType}
                      onChange={(e) => setFormData({ ...formData, questionType: e.target.value })}
                    >
                      {questionTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="super-admin__field">
                    <label className="super-admin__label">Help Text</label>
                    <input
                      className="super-admin__input"
                      value={formData.helpText}
                      onChange={(e) => setFormData({ ...formData, helpText: e.target.value })}
                      placeholder="Optional guidance text shown below the question"
                    />
                  </div>

                  <div className="super-admin__field">
                    <label className="super-admin__label">Display Order</label>
                    <input
                      type="number"
                      className="super-admin__input"
                      value={formData.displayOrder}
                      onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="super-admin__field">
                    <label className="super-admin__label">
                      <input
                        type="checkbox"
                        checked={formData.isRequired}
                        onChange={(e) => setFormData({ ...formData, isRequired: e.target.checked })}
                        style={{ marginRight: "0.5rem" }}
                      />
                      Required Field
                    </label>
                  </div>

                  <div className="super-admin__field">
                    <label className="super-admin__label">CRM Field Name (Database Column)</label>
                    <select
                      className="super-admin__input"
                      value={formData.crmFieldName}
                      onChange={(e) => setFormData({ ...formData, crmFieldName: e.target.value })}
                    >
                      <option value="">-- Select Field --</option>
                      <option value="date_of_birth">date_of_birth</option>
                      <option value="high_school_graduation_year">high_school_graduation_year</option>
                      <option value="military_status">military_status</option>
                      <option value="employment_status">employment_status</option>
                      <option value="education_level">education_level</option>
                      <option value="citizenship_status">citizenship_status</option>
                      <option value="state_of_residence">state_of_residence</option>
                      <option value="zip_code">zip_code</option>
                      <option value="preferred_start_date">preferred_start_date</option>
                      <option value="program_interest">program_interest</option>
                      <option value="how_did_you_hear">how_did_you_hear</option>
                      <option value="best_time_to_contact">best_time_to_contact</option>
                      <option value="preferred_contact_method">preferred_contact_method</option>
                      <option value="currently_enrolled">currently_enrolled</option>
                      <option value="prior_college_experience">prior_college_experience</option>
                      <option value="financial_aid_interest">financial_aid_interest</option>
                      <option value="schedule_preference">schedule_preference</option>
                      <option value="custom_field_1">custom_field_1</option>
                      <option value="custom_field_2">custom_field_2</option>
                      <option value="custom_field_3">custom_field_3</option>
                    </select>
                    <span className="super-admin__help">
                      Database column name for storing this answer in the submissions table
                    </span>
                  </div>

                  {needsOptions && editingQuestion && (
                    <div className="super-admin__field">
                      <label className="super-admin__label">Options</label>
                      <div style={{ marginBottom: "1rem" }}>
                        {editingQuestion.options.map((option) => (
                          <div
                            key={option.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.5rem",
                              border: "1px solid var(--color-border)",
                              borderRadius: "4px",
                              marginBottom: "0.5rem"
                            }}
                          >
                            <span style={{ flex: 1 }}>{option.optionText}</span>
                            <button
                              className="super-admin__btn super-admin__btn--ghost"
                              onClick={() => handleDeleteOption(option.id)}
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        className="super-admin__btn super-admin__btn--ghost"
                        onClick={() => handleAddOption(editingQuestion.id)}
                      >
                        + Add Option
                      </button>
                    </div>
                  )}

                  {needsOptions && !editingQuestion && (
                    <div className="super-admin__help" style={{ padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
                      Save this question first, then you can add options.
                    </div>
                  )}

                  <div className="super-admin-quiz__form-actions">
                    <button
                      className="super-admin__btn super-admin__btn--primary"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="super-admin__btn super-admin__btn--ghost"
                      onClick={() => {
                        setIsCreating(false);
                        setEditingQuestion(null);
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="super-admin-quiz__list">
              {questions.length === 0 ? (
                <div className="super-admin__empty-state">
                  <div className="super-admin__empty-icon">📝</div>
                  <h3>No Landing Questions Yet</h3>
                  <p>Create custom questions to gather information on your landing pages</p>
                </div>
              ) : (
                questions.map((question) => (
                  <div key={question.id} className="super-admin-quiz__list-item">
                    <div className="super-admin-quiz__list-item-main">
                      <div className="super-admin-quiz__list-item-title">
                        {question.questionText}
                        {question.isRequired && (
                          <span className="super-admin-quiz__list-item-badge" style={{ background: "#dc3545" }}>
                            Required
                          </span>
                        )}
                        <span className="super-admin-quiz__list-item-badge">{question.questionType}</span>
                      </div>
                      <div className="super-admin-quiz__list-item-meta">
                        Order: {question.displayOrder}
                        {question.crmFieldName && ` • CRM: ${question.crmFieldName}`}
                        {question.helpText && ` • ${question.helpText}`}
                        {question.options.length > 0 && ` • ${question.options.length} options`}
                      </div>
                    </div>
                    <div className="super-admin-quiz__list-item-actions">
                      <button
                        className="super-admin__btn super-admin__btn--ghost"
                        onClick={() => startEdit(question)}
                      >
                        Edit
                      </button>
                      {["select", "radio", "checkbox"].includes(question.questionType) && (
                        <button
                          className="super-admin__btn super-admin__btn--secondary"
                          onClick={() => {
                            startEdit(question);
                            // Scroll to options section
                            setTimeout(() => {
                              const optionsSection = document.querySelector('.super-admin__field:has([class*="Options"])');
                              optionsSection?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }, 100);
                          }}
                        >
                          Options ({question.options.length})
                        </button>
                      )}
                      <button
                        className="super-admin__btn super-admin__btn--ghost"
                        onClick={() => handleDelete(question.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
