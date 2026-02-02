"use client";

import { useState, useEffect } from "react";
import "./config-builder.css";

type Program = {
  id: string;
  name: string;
  slug: string;
  templateType?: string;
  landingCopy?: {
    headline: string;
    subheadline: string;
    body: string;
    ctaText: string;
  };
  heroImage?: string;
  heroBackgroundColor?: string;
  heroBackgroundImage?: string;
  highlights?: Array<{ icon?: string; text: string }>;
  testimonials?: Array<{ quote: string; author: string; role?: string; photo?: string }>;
  faqs?: Array<{ question: string; answer: string }>;
  stats?: {
    placementRate?: string;
    avgSalary?: string;
    duration?: string;
    graduationRate?: string;
  };
  sectionsConfig?: {
    order: string[];
    visible: Record<string, boolean>;
  };
};

type Draft = {
  id: string;
  entityType: string;
  entityName?: string;
  status: string;
  creatorEmail?: string;
  createdAt: string;
  rejectionReason?: string;
};

export function ConfigBuilderPage({
  schoolSlug,
  programs: initialPrograms
}: {
  schoolSlug: string;
  programs: Program[];
}) {
  const [activeTab, setActiveTab] = useState<"landing" | "drafts">("landing");
  const [programs] = useState<Program[]>(initialPrograms);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(
    programs.length > 0 ? programs[0] : null
  );
  const [config, setConfig] = useState<Program | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);


  useEffect(() => {
    if (selectedProgram) {
      loadProgramConfig(selectedProgram.id);
    }
  }, [selectedProgram?.id]);

  useEffect(() => {
    if (activeTab === "drafts") {
      loadDrafts();
    }
  }, [activeTab]);

  const loadProgramConfig = async (programId: string) => {
    try {
      const res = await fetch(
        `/api/admin/schools/${schoolSlug}/config/landing/${programId}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load config");
      const data = await res.json();
      setConfig(data.program);
      setIsDirty(false);
    } catch (error) {
      showMessage("error", "Failed to load configuration");
    }
  };

  const loadDrafts = async () => {
    try {
      const res = await fetch(`/api/admin/schools/${schoolSlug}/config/drafts`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to load drafts");
      const data = await res.json();
      setDrafts(data.drafts);
    } catch (error) {
      showMessage("error", "Failed to load drafts");
    }
  };

  const saveDraft = async () => {
    if (!selectedProgram || !config) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/admin/schools/${schoolSlug}/config/landing/${selectedProgram.id}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        }
      );

      if (!res.ok) throw new Error("Failed to save draft");

      const data = await res.json();
      showMessage("success", `Draft saved! ID: ${data.draftId}`);
      setIsDirty(false);
    } catch (error) {
      showMessage("error", "Failed to save draft");
    } finally {
      setIsSaving(false);
    }
  };

  const submitDraft = async (draftId: string) => {
    try {
      const res = await fetch(
        `/api/admin/schools/${schoolSlug}/config/drafts/${draftId}/submit`,
        {
          method: "POST",
          credentials: "include"
        }
      );

      if (!res.ok) throw new Error("Failed to submit draft");

      showMessage("success", "Draft submitted for approval!");
      loadDrafts();
    } catch (error) {
      showMessage("error", "Failed to submit draft");
    }
  };

  const approveDraft = async (draftId: string) => {
    try {
      const res = await fetch(
        `/api/admin/schools/${schoolSlug}/config/drafts/${draftId}/approve`,
        {
          method: "POST",
          credentials: "include"
        }
      );

      if (!res.ok) throw new Error("Failed to approve draft");

      showMessage("success", "Draft approved! Changes are now live.");
      loadDrafts();
      if (selectedProgram) loadProgramConfig(selectedProgram.id);
    } catch (error) {
      showMessage("error", "Failed to approve draft");
    }
  };

  const rejectDraft = async (draftId: string) => {
    const reason = prompt("Reason for rejection (optional):");
    try {
      const res = await fetch(
        `/api/admin/schools/${schoolSlug}/config/drafts/${draftId}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason })
        }
      );

      if (!res.ok) throw new Error("Failed to reject draft");

      showMessage("success", "Draft rejected");
      loadDrafts();
    } catch (error) {
      showMessage("error", "Failed to reject draft");
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const updateConfig = (updates: Partial<Program>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
    setIsDirty(true);
  };

  return (
    <div className="config-builder">
      {/* Tabs */}
      <div className="config-tabs">
        <button
          className={`config-tab ${activeTab === "landing" ? "active" : ""}`}
          onClick={() => setActiveTab("landing")}
        >
          Landing Pages
        </button>
        <button
          className={`config-tab ${activeTab === "drafts" ? "active" : ""}`}
          onClick={() => setActiveTab("drafts")}
        >
          Drafts & Approvals
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div className={`config-message config-message-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Landing Page Editor */}
      {activeTab === "landing" && (
        <div className="config-content">
          {/* Program Selector */}
          <div className="config-selector">
            <label>Select Program:</label>
            <select
              value={selectedProgram?.id || ""}
              onChange={(e) => {
                const program = programs.find((p) => p.id === e.target.value);
                setSelectedProgram(program || null);
              }}
              className="config-select"
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>

            {isDirty && (
              <div className="config-actions">
                <button onClick={saveDraft} disabled={isSaving} className="admin-btn">
                  {isSaving ? "Saving..." : "Save Draft"}
                </button>
                <button
                  onClick={() => {
                    if (selectedProgram) loadProgramConfig(selectedProgram.id);
                  }}
                  className="admin-btn-ghost"
                >
                  Discard Changes
                </button>
              </div>
            )}
          </div>

          {/* Editor Grid */}
          {config && (
            <div className="config-grid">
              {/* Left: Editors */}
              <div className="config-editors">
                <TemplateSelector
                  value={config.templateType || "full"}
                  onChange={(templateType) => updateConfig({ templateType })}
                />

                <HeroSectionEditor
                  landingCopy={config.landingCopy}
                  heroImage={config.heroImage}
                  bgColor={config.heroBackgroundColor}
                  bgImage={config.heroBackgroundImage}
                  onChange={updateConfig}
                />

                {config.templateType !== "minimal" && (
                  <>
                    <HighlightsEditor
                      highlights={config.highlights || []}
                      onChange={(highlights) => updateConfig({ highlights })}
                    />

                    <StatsEditor
                      stats={config.stats || {}}
                      onChange={(stats) => updateConfig({ stats })}
                    />

                    <TestimonialsEditor
                      testimonials={config.testimonials || []}
                      onChange={(testimonials) => updateConfig({ testimonials })}
                    />

                    <FAQsEditor
                      faqs={config.faqs || []}
                      onChange={(faqs) => updateConfig({ faqs })}
                    />
                  </>
                )}
              </div>

              {/* Right: Preview */}
              <div className="config-preview">
                <PreviewPanel schoolSlug={schoolSlug} program={selectedProgram} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drafts Manager */}
      {activeTab === "drafts" && (
        <DraftsManager
          drafts={drafts}
          onSubmit={submitDraft}
          onApprove={approveDraft}
          onReject={rejectDraft}
        />
      )}
    </div>
  );
}

// Template Selector Component
function TemplateSelector({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="config-card">
      <h3>Landing Page Template</h3>
      <div className="template-selector">
        <label className={`template-option ${value === "minimal" ? "selected" : ""}`}>
          <input
            type="radio"
            name="template"
            value="minimal"
            checked={value === "minimal"}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="template-preview minimal">
            <div className="template-label">Minimal</div>
            <div className="template-desc">Hero with embedded form (best for conversions)</div>
          </div>
        </label>
        <label className={`template-option ${value === "full" ? "selected" : ""}`}>
          <input
            type="radio"
            name="template"
            value="full"
            checked={value === "full"}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="template-preview full">
            <div className="template-label">Full</div>
            <div className="template-desc">All sections (highlights, testimonials, FAQs, etc.)</div>
          </div>
        </label>
      </div>
    </div>
  );
}

// Hero Section Editor Component
function HeroSectionEditor({
  landingCopy,
  heroImage,
  bgColor,
  bgImage,
  onChange
}: {
  landingCopy?: {
    headline: string;
    subheadline: string;
    body: string;
    ctaText: string;
  };
  heroImage?: string;
  bgColor?: string;
  bgImage?: string;
  onChange: (updates: any) => void;
}) {
  return (
    <div className="config-card">
      <h3>Hero Section</h3>
      <div className="config-form">
        <div className="form-group">
          <label>Headline</label>
          <input
            type="text"
            value={landingCopy?.headline || ""}
            onChange={(e) =>
              onChange({
                landingCopy: { ...landingCopy, headline: e.target.value }
              })
            }
            className="form-input"
            placeholder="Start Your Career in Healthcare"
          />
        </div>

        <div className="form-group">
          <label>Subheadline</label>
          <textarea
            value={landingCopy?.subheadline || ""}
            onChange={(e) =>
              onChange({
                landingCopy: { ...landingCopy, subheadline: e.target.value }
              })
            }
            className="form-textarea"
            rows={2}
            placeholder="Get certified in just 9 months"
          />
        </div>

        <div className="form-group">
          <label>Body Text</label>
          <textarea
            value={landingCopy?.body || ""}
            onChange={(e) =>
              onChange({
                landingCopy: { ...landingCopy, body: e.target.value }
              })
            }
            className="form-textarea"
            rows={4}
            placeholder="Our comprehensive program prepares you..."
          />
        </div>

        <div className="form-group">
          <label>CTA Button Text</label>
          <input
            type="text"
            value={landingCopy?.ctaText || ""}
            onChange={(e) =>
              onChange({
                landingCopy: { ...landingCopy, ctaText: e.target.value }
              })
            }
            className="form-input"
            placeholder="Get Program Info"
          />
        </div>

        <div className="form-group">
          <label>Hero Image URL</label>
          <input
            type="text"
            value={heroImage || ""}
            onChange={(e) => onChange({ heroImage: e.target.value })}
            className="form-input"
            placeholder="https://..."
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Background Color</label>
            <input
              type="color"
              value={bgColor || "#ffffff"}
              onChange={(e) => onChange({ heroBackgroundColor: e.target.value })}
              className="form-color"
            />
          </div>
          <div className="form-group">
            <label>Background Image URL</label>
            <input
              type="text"
              value={bgImage || ""}
              onChange={(e) => onChange({ heroBackgroundImage: e.target.value })}
              className="form-input"
              placeholder="https://..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Highlights Editor Component
function HighlightsEditor({
  highlights,
  onChange
}: {
  highlights: Array<{ icon?: string; text: string }>;
  onChange: (highlights: Array<{ icon?: string; text: string }>) => void;
}) {
  const addHighlight = () => {
    onChange([...highlights, { icon: "✓", text: "" }]);
  };

  const updateHighlight = (index: number, updates: Partial<{ icon?: string; text: string }>) => {
    const newHighlights = [...highlights];
    newHighlights[index] = { ...newHighlights[index], ...updates };
    onChange(newHighlights);
  };

  const removeHighlight = (index: number) => {
    onChange(highlights.filter((_, i) => i !== index));
  };

  return (
    <div className="config-card">
      <h3>Highlights / Benefits</h3>
      <div className="config-list">
        {highlights.map((highlight, index) => (
          <div key={index} className="config-list-item">
            <input
              type="text"
              value={highlight.icon || ""}
              onChange={(e) => updateHighlight(index, { icon: e.target.value })}
              className="form-input-sm"
              placeholder="🎓"
              style={{ width: "60px" }}
            />
            <input
              type="text"
              value={highlight.text}
              onChange={(e) => updateHighlight(index, { text: e.target.value })}
              className="form-input"
              placeholder="9-month program"
            />
            <button onClick={() => removeHighlight(index)} className="btn-remove">
              ×
            </button>
          </div>
        ))}
        <button onClick={addHighlight} className="admin-btn-ghost">
          + Add Highlight
        </button>
      </div>
    </div>
  );
}

// Stats Editor Component
function StatsEditor({
  stats,
  onChange
}: {
  stats: {
    placementRate?: string;
    avgSalary?: string;
    duration?: string;
    graduationRate?: string;
  };
  onChange: (stats: any) => void;
}) {
  return (
    <div className="config-card">
      <h3>Program Stats</h3>
      <div className="form-grid">
        <div className="form-group">
          <label>Placement Rate</label>
          <input
            type="text"
            value={stats.placementRate || ""}
            onChange={(e) => onChange({ ...stats, placementRate: e.target.value })}
            className="form-input"
            placeholder="95%"
          />
        </div>
        <div className="form-group">
          <label>Average Salary</label>
          <input
            type="text"
            value={stats.avgSalary || ""}
            onChange={(e) => onChange({ ...stats, avgSalary: e.target.value })}
            className="form-input"
            placeholder="$65,000"
          />
        </div>
        <div className="form-group">
          <label>Duration</label>
          <input
            type="text"
            value={stats.duration || ""}
            onChange={(e) => onChange({ ...stats, duration: e.target.value })}
            className="form-input"
            placeholder="9 months"
          />
        </div>
        <div className="form-group">
          <label>Graduation Rate</label>
          <input
            type="text"
            value={stats.graduationRate || ""}
            onChange={(e) => onChange({ ...stats, graduationRate: e.target.value })}
            className="form-input"
            placeholder="92%"
          />
        </div>
      </div>
    </div>
  );
}

// Testimonials Editor Component
function TestimonialsEditor({
  testimonials,
  onChange
}: {
  testimonials: Array<{ quote: string; author: string; role?: string; photo?: string }>;
  onChange: (testimonials: Array<{ quote: string; author: string; role?: string; photo?: string }>) => void;
}) {
  const addTestimonial = () => {
    onChange([...testimonials, { quote: "", author: "", role: "", photo: "" }]);
  };

  const updateTestimonial = (index: number, updates: any) => {
    const newTestimonials = [...testimonials];
    newTestimonials[index] = { ...newTestimonials[index], ...updates };
    onChange(newTestimonials);
  };

  const removeTestimonial = (index: number) => {
    onChange(testimonials.filter((_, i) => i !== index));
  };

  return (
    <div className="config-card">
      <h3>Testimonials</h3>
      <div className="config-list">
        {testimonials.map((testimonial, index) => (
          <div key={index} className="testimonial-item">
            <div className="form-group">
              <label>Quote</label>
              <textarea
                value={testimonial.quote}
                onChange={(e) => updateTestimonial(index, { quote: e.target.value })}
                className="form-textarea"
                rows={3}
                placeholder="This program changed my life..."
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Author</label>
                <input
                  type="text"
                  value={testimonial.author}
                  onChange={(e) => updateTestimonial(index, { author: e.target.value })}
                  className="form-input"
                  placeholder="Sarah Martinez"
                />
              </div>
              <div className="form-group">
                <label>Role/Class</label>
                <input
                  type="text"
                  value={testimonial.role || ""}
                  onChange={(e) => updateTestimonial(index, { role: e.target.value })}
                  className="form-input"
                  placeholder="Class of 2023"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Photo URL</label>
              <input
                type="text"
                value={testimonial.photo || ""}
                onChange={(e) => updateTestimonial(index, { photo: e.target.value })}
                className="form-input"
                placeholder="https://..."
              />
            </div>
            <button onClick={() => removeTestimonial(index)} className="btn-remove-block">
              Remove Testimonial
            </button>
          </div>
        ))}
        <button onClick={addTestimonial} className="admin-btn-ghost">
          + Add Testimonial
        </button>
      </div>
    </div>
  );
}

// FAQs Editor Component
function FAQsEditor({
  faqs,
  onChange
}: {
  faqs: Array<{ question: string; answer: string }>;
  onChange: (faqs: Array<{ question: string; answer: string }>) => void;
}) {
  const addFAQ = () => {
    onChange([...faqs, { question: "", answer: "" }]);
  };

  const updateFAQ = (index: number, updates: Partial<{ question: string; answer: string }>) => {
    const newFAQs = [...faqs];
    newFAQs[index] = { ...newFAQs[index], ...updates };
    onChange(newFAQs);
  };

  const removeFAQ = (index: number) => {
    onChange(faqs.filter((_, i) => i !== index));
  };

  return (
    <div className="config-card">
      <h3>FAQs</h3>
      <div className="config-list">
        {faqs.map((faq, index) => (
          <div key={index} className="faq-item">
            <div className="form-group">
              <label>Question</label>
              <input
                type="text"
                value={faq.question}
                onChange={(e) => updateFAQ(index, { question: e.target.value })}
                className="form-input"
                placeholder="Do I need a high school diploma?"
              />
            </div>
            <div className="form-group">
              <label>Answer</label>
              <textarea
                value={faq.answer}
                onChange={(e) => updateFAQ(index, { answer: e.target.value })}
                className="form-textarea"
                rows={3}
                placeholder="Yes, you need a high school diploma or GED..."
              />
            </div>
            <button onClick={() => removeFAQ(index)} className="btn-remove-block">
              Remove FAQ
            </button>
          </div>
        ))}
        <button onClick={addFAQ} className="admin-btn-ghost">
          + Add FAQ
        </button>
      </div>
    </div>
  );
}

// Preview Panel Component
function PreviewPanel({ schoolSlug, program }: { schoolSlug: string; program: Program | null }) {
  if (!program) {
    return (
      <div className="preview-empty">
        <p>Select a program to preview</p>
      </div>
    );
  }

  return (
    <div className="preview-container">
      <div className="preview-header">
        <h4>Live Preview</h4>
        <div className="preview-devices">
          <button className="preview-device active" title="Desktop">
            💻
          </button>
          <button className="preview-device" title="Tablet">
            📱
          </button>
          <button className="preview-device" title="Mobile">
            📱
          </button>
        </div>
      </div>
      <div className="preview-frame">
        <iframe
          src={`/${schoolSlug}?preview=${program.slug}`}
          title="Landing Page Preview"
          className="preview-iframe"
        />
      </div>
    </div>
  );
}

// Drafts Manager Component
function DraftsManager({
  drafts,
  onSubmit,
  onApprove,
  onReject
}: {
  drafts: Draft[];
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      draft: "🟡 Draft",
      pending_approval: "🔵 Pending Approval",
      approved: "🟢 Approved",
      rejected: "🔴 Rejected"
    };
    return badges[status] || status;
  };

  return (
    <div className="drafts-container">
      <h2>Drafts & Approvals</h2>

      {drafts.length === 0 ? (
        <div className="config-card">
          <p className="admin-muted">No drafts found</p>
        </div>
      ) : (
        <div className="drafts-list">
          {drafts.map((draft) => (
            <div key={draft.id} className="draft-card">
              <div className="draft-header">
                <div>
                  <h4>{draft.entityName || draft.entityType}</h4>
                  <p className="admin-muted">
                    Created by {draft.creatorEmail} on{" "}
                    {new Date(draft.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="draft-status">{getStatusBadge(draft.status)}</div>
              </div>

              {draft.rejectionReason && (
                <div className="draft-rejection">
                  <strong>Rejection reason:</strong> {draft.rejectionReason}
                </div>
              )}

              <div className="draft-actions">
                {draft.status === "draft" && (
                  <button onClick={() => onSubmit(draft.id)} className="admin-btn">
                    Submit for Approval
                  </button>
                )}
                {draft.status === "pending_approval" && (
                  <>
                    <button onClick={() => onApprove(draft.id)} className="admin-btn">
                      Approve
                    </button>
                    <button onClick={() => onReject(draft.id)} className="admin-btn-ghost">
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
