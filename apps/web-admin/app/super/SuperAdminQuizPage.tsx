"use client";

import { useEffect, useState } from "react";
import { QuestionEditor } from "./QuestionEditor";
import "./super-admin.css";

type ProgramCategory = {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
  programCount: number;
  createdAt: string;
  updatedAt: string;
};

type QuizStage = {
  id: string;
  clientId: string;
  schoolId?: string;
  categoryId?: string;
  categoryName?: string;
  name: string;
  slug: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
};

type SuperAdminQuizPageProps = {
  clientId: string;
};

export function SuperAdminQuizPage({ clientId }: SuperAdminQuizPageProps) {
  const [categories, setCategories] = useState<ProgramCategory[]>([]);
  const [stages, setStages] = useState<QuizStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"categories" | "stages">("categories");
  const [editingStage, setEditingStage] = useState<QuizStage | null>(null);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [categoriesRes, stagesRes] = await Promise.all([
        fetch(`/api/super/clients/${clientId}/categories`, { credentials: "include" }),
        fetch(`/api/super/clients/${clientId}/quiz/stages`, { credentials: "include" })
      ]);

      if (categoriesRes.ok) {
        const catData = await categoriesRes.json();
        setCategories(catData.categories || []);
      }

      if (stagesRes.ok) {
        const stageData = await stagesRes.json();
        setStages(stageData.stages || []);
      }
    } catch (error) {
      console.error("Failed to load quiz data", error);
      showMessage("error", "Failed to load quiz data");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <div className="super-admin-quiz">
      {message && (
        <div className={`super-admin__save-message super-admin__save-message--${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="super-admin__panel-tabs">
        <button
          className={`super-admin__tab ${activeTab === "categories" ? "is-active" : ""}`}
          onClick={() => setActiveTab("categories")}
        >
          Program Categories
        </button>
        <button
          className={`super-admin__tab ${activeTab === "stages" ? "is-active" : ""}`}
          onClick={() => setActiveTab("stages")}
        >
          Quiz Stages
        </button>
      </div>

      {loading ? (
        <div className="super-admin__skeleton">
          <div className="super-admin__skeleton-card"></div>
          <div className="super-admin__skeleton-card"></div>
        </div>
      ) : (
        <>
          {editingStage ? (
            <QuestionEditor
              stageId={editingStage.id}
              stageName={editingStage.name}
              categoryId={editingStage.categoryId}
              onClose={() => setEditingStage(null)}
              onMessage={showMessage}
            />
          ) : (
            <>
              {activeTab === "categories" && (
                <CategoryManager
                  clientId={clientId}
                  categories={categories}
                  onRefresh={loadData}
                  onMessage={showMessage}
                />
              )}
              {activeTab === "stages" && (
                <StageManager
                  clientId={clientId}
                  categories={categories}
                  stages={stages}
                  onRefresh={loadData}
                  onMessage={showMessage}
                  onEditQuestions={setEditingStage}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// Category Manager Component
function CategoryManager({
  clientId,
  categories,
  onRefresh,
  onMessage
}: {
  clientId: string;
  categories: ProgramCategory[];
  onRefresh: () => void;
  onMessage: (type: "success" | "error", text: string) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProgramCategory | null>(null);
  const [formData, setFormData] = useState({ name: "", slug: "", displayOrder: 0 });
  const [saving, setSaving] = useState(false);

  const startCreate = () => {
    setFormData({ name: "", slug: "", displayOrder: categories.length });
    setIsCreating(true);
    setEditingCategory(null);
  };

  const startEdit = (category: ProgramCategory) => {
    setFormData({
      name: category.name,
      slug: category.slug,
      displayOrder: category.displayOrder
    });
    setEditingCategory(category);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.slug) {
      onMessage("error", "Name and slug are required");
      return;
    }

    setSaving(true);
    try {
      const url = editingCategory
        ? `/api/super/clients/${clientId}/categories/${editingCategory.id}`
        : `/api/super/clients/${clientId}/categories`;

      const res = await fetch(url, {
        method: editingCategory ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save category");
      }

      onMessage("success", `Category ${editingCategory ? "updated" : "created"} successfully`);
      setIsCreating(false);
      setEditingCategory(null);
      onRefresh();
    } catch (error) {
      onMessage("error", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this category?")) return;

    try {
      const res = await fetch(`/api/super/clients/${clientId}/categories/${categoryId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete category");
      }

      onMessage("success", "Category deleted successfully");
      onRefresh();
    } catch (error) {
      onMessage("error", (error as Error).message);
    }
  };

  return (
    <div className="super-admin-quiz__section">
      <div className="super-admin-quiz__section-header">
        <h3>Program Categories</h3>
        <button className="super-admin__btn super-admin__btn--primary" onClick={startCreate}>
          + Add Category
        </button>
      </div>

      {(isCreating || editingCategory) && (
        <div className="super-admin__section">
          <div className="super-admin__section-content">
            <h4>{editingCategory ? "Edit Category" : "New Category"}</h4>

            <div className="super-admin__field">
              <label className="super-admin__label">
                Name <span className="super-admin__label-required">*</span>
              </label>
              <input
                className="super-admin__input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Medical"
              />
            </div>

            <div className="super-admin__field">
              <label className="super-admin__label">
                Slug <span className="super-admin__label-required">*</span>
              </label>
              <input
                className="super-admin__input"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="MED"
              />
              <span className="super-admin__help">Short identifier (e.g., BUS, MED, IT)</span>
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
                  setEditingCategory(null);
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
        {categories.length === 0 ? (
          <div className="super-admin__empty-state">
            <div className="super-admin__empty-icon">📁</div>
            <h3>No Categories Yet</h3>
            <p>Create program categories to organize your programs</p>
          </div>
        ) : (
          categories.map((category) => (
            <div key={category.id} className="super-admin-quiz__list-item">
              <div className="super-admin-quiz__list-item-main">
                <div className="super-admin-quiz__list-item-title">
                  {category.name}
                  <span className="super-admin-quiz__list-item-badge">{category.slug}</span>
                </div>
                <div className="super-admin-quiz__list-item-meta">
                  {category.programCount} programs • Order: {category.displayOrder}
                </div>
              </div>
              <div className="super-admin-quiz__list-item-actions">
                <button
                  className="super-admin__btn super-admin__btn--ghost"
                  onClick={() => startEdit(category)}
                >
                  Edit
                </button>
                <button
                  className="super-admin__btn super-admin__btn--ghost"
                  onClick={() => handleDelete(category.id)}
                  disabled={category.programCount > 0}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Stage Manager Component
function StageManager({
  clientId,
  categories,
  stages,
  onRefresh,
  onMessage,
  onEditQuestions
}: {
  clientId: string;
  categories: ProgramCategory[];
  stages: QuizStage[];
  onRefresh: () => void;
  onMessage: (type: "success" | "error", text: string) => void;
  onEditQuestions: (stage: QuizStage) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingStage, setEditingStage] = useState<QuizStage | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    categoryId: "",
    displayOrder: 0
  });
  const [saving, setSaving] = useState(false);

  const startCreate = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      categoryId: "",
      displayOrder: stages.length
    });
    setIsCreating(true);
    setEditingStage(null);
  };

  const startEdit = (stage: QuizStage) => {
    setFormData({
      name: stage.name,
      slug: stage.slug,
      description: stage.description || "",
      categoryId: stage.categoryId || "",
      displayOrder: stage.displayOrder
    });
    setEditingStage(stage);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.slug) {
      onMessage("error", "Name and slug are required");
      return;
    }

    setSaving(true);
    try {
      const url = editingStage
        ? `/api/super/clients/${clientId}/quiz/stages/${editingStage.id}`
        : `/api/super/clients/${clientId}/quiz/stages`;

      const payload = {
        ...formData,
        categoryId: formData.categoryId || null
      };

      const res = await fetch(url, {
        method: editingStage ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save stage");
      }

      onMessage("success", `Stage ${editingStage ? "updated" : "created"} successfully`);
      setIsCreating(false);
      setEditingStage(null);
      onRefresh();
    } catch (error) {
      onMessage("error", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stageId: string) => {
    if (!confirm("Are you sure you want to delete this stage?")) return;

    try {
      const res = await fetch(`/api/super/clients/${clientId}/quiz/stages/${stageId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete stage");
      }

      onMessage("success", "Stage deleted successfully");
      onRefresh();
    } catch (error) {
      onMessage("error", (error as Error).message);
    }
  };

  return (
    <div className="super-admin-quiz__section">
      <div className="super-admin-quiz__section-header">
        <h3>Quiz Stages</h3>
        <button className="super-admin__btn super-admin__btn--primary" onClick={startCreate}>
          + Add Stage
        </button>
      </div>

      {(isCreating || editingStage) && (
        <div className="super-admin__section">
          <div className="super-admin__section-content">
            <h4>{editingStage ? "Edit Stage" : "New Stage"}</h4>

            <div className="super-admin__field">
              <label className="super-admin__label">
                Name <span className="super-admin__label-required">*</span>
              </label>
              <input
                className="super-admin__input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Contact Information"
              />
            </div>

            <div className="super-admin__field">
              <label className="super-admin__label">
                Slug <span className="super-admin__label-required">*</span>
              </label>
              <input
                className="super-admin__input"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="contact_info"
              />
              <span className="super-admin__help">URL-friendly identifier</span>
            </div>

            <div className="super-admin__field">
              <label className="super-admin__label">Description</label>
              <textarea
                className="super-admin__textarea"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Collect basic contact information"
              />
            </div>

            <div className="super-admin__field">
              <label className="super-admin__label">Category (Optional)</label>
              <select
                className="super-admin__input"
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.slug})
                  </option>
                ))}
              </select>
              <span className="super-admin__help">Leave empty for general stages</span>
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
                  setEditingStage(null);
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
        {stages.length === 0 ? (
          <div className="super-admin__empty-state">
            <div className="super-admin__empty-icon">📋</div>
            <h3>No Stages Yet</h3>
            <p>Create quiz stages to define your multi-step quiz flow</p>
          </div>
        ) : (
          stages.map((stage) => (
            <div key={stage.id} className="super-admin-quiz__list-item">
              <div className="super-admin-quiz__list-item-main">
                <div className="super-admin-quiz__list-item-title">
                  {stage.name}
                  {stage.categoryName && (
                    <span className="super-admin-quiz__list-item-badge">{stage.categoryName}</span>
                  )}
                </div>
                <div className="super-admin-quiz__list-item-meta">
                  {stage.questionCount} questions • Order: {stage.displayOrder}
                  {stage.description && ` • ${stage.description}`}
                </div>
              </div>
              <div className="super-admin-quiz__list-item-actions">
                <button
                  className="super-admin__btn super-admin__btn--ghost"
                  onClick={() => startEdit(stage)}
                >
                  Edit
                </button>
                <button
                  className="super-admin__btn super-admin__btn--secondary"
                  onClick={() => onEditQuestions(stage)}
                >
                  Questions ({stage.questionCount})
                </button>
                <button
                  className="super-admin__btn super-admin__btn--ghost"
                  onClick={() => handleDelete(stage.id)}
                  disabled={stage.questionCount > 0}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
