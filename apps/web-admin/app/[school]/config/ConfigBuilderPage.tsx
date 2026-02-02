"use client";

import { useState, useEffect } from "react";
import "./config-builder.css";

type Program = {
  id: string;
  name: string;
  slug: string;
  templateType?: string;
  leadForm?: LeadFormConfig;
  schoolThankYou?: ThankYouConfig;
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

type LeadFormField = {
  id: string;
  label: string;
  type: "text" | "email" | "tel" | "select" | "radio" | "checkbox" | "textarea";
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  mapTo?: "answers" | "campus_id";
  placeholder?: string;
};

type LeadFormConfig = {
  fields?: LeadFormField[];
  consentLabel?: string;
};

type ThankYouConfig = {
  title?: string;
  message?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
};

const DEFAULT_SECTIONS = ["hero", "highlights", "stats", "testimonials", "form", "faqs"] as const;

export function ConfigBuilderPage({
  schoolSlug,
  programs: initialPrograms
}: {
  schoolSlug: string;
  programs: Program[];
}) {
  const [programs] = useState<Program[]>(initialPrograms);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(
    programs.length > 0 ? programs[0] : null
  );
  const [config, setConfig] = useState<Program | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const landingPreviewBase = process.env.NEXT_PUBLIC_LANDING_BASE_URL || "";


  useEffect(() => {
    if (selectedProgram) {
      loadProgramConfig(selectedProgram.id);
    }
  }, [selectedProgram?.id]);

  const loadProgramConfig = async (programId: string) => {
    try {
      const res = await fetch(
        `/api/admin/schools/${schoolSlug}/config/landing/${programId}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load config");
      const data = await res.json();
      const program = data.program as Program & { lead_form_config?: LeadFormConfig };
      const rawLeadForm = program.leadForm || program.lead_form_config;
      const leadForm =
        rawLeadForm && Array.isArray(rawLeadForm.fields)
          ? rawLeadForm
          : rawLeadForm
          ? { ...rawLeadForm, fields: [] }
          : undefined;
      const schoolThankYou = data.school?.thankYou || program.schoolThankYou;
      const highlights = Array.isArray(program.highlights) ? program.highlights : [];
      const testimonials = Array.isArray(program.testimonials) ? program.testimonials : [];
      const faqs = Array.isArray(program.faqs) ? program.faqs : [];
      const stats = program.stats && typeof program.stats === "object" ? program.stats : {};
      const existing = program.sectionsConfig || {
        order: [...DEFAULT_SECTIONS],
        visible: Object.fromEntries(DEFAULT_SECTIONS.map((key) => [key, true]))
      };
      setConfig({
        ...program,
        leadForm: leadForm || { fields: [] },
        schoolThankYou: schoolThankYou || {},
        highlights,
        testimonials,
        faqs,
        stats,
        sectionsConfig: existing
      });
      setIsDirty(false);
    } catch (error) {
      showMessage("error", "Failed to load configuration");
    }
  };

  const saveConfig = async () => {
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

      if (!res.ok) throw new Error("Failed to save changes");

      showMessage("success", "Changes saved.");
      setIsDirty(false);
    } catch (error) {
      showMessage("error", "Failed to save changes");
    } finally {
      setIsSaving(false);
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
      {/* Messages */}
      {message && (
        <div className={`config-message config-message-${message.type}`}>
          {message.text}
        </div>
      )}

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
              <button onClick={saveConfig} disabled={isSaving} className="admin-btn">
                {isSaving ? "Saving..." : "Save changes"}
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

              <ThankYouEditor
                value={config.schoolThankYou}
                onChange={(schoolThankYou) => updateConfig({ schoolThankYou })}
              />

              <LeadFormEditor
                leadForm={config.leadForm}
                onChange={(leadForm) => updateConfig({ leadForm })}
              />

              <SectionsPanel
                sectionsConfig={config.sectionsConfig}
                onChange={(sectionsConfig) => updateConfig({ sectionsConfig })}
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
                  {config.sectionsConfig?.visible?.highlights !== false && (
                    <HighlightsEditor
                      highlights={config.highlights || []}
                      onChange={(highlights) => updateConfig({ highlights })}
                    />
                  )}

                  {config.sectionsConfig?.visible?.stats !== false && (
                    <StatsEditor
                      stats={config.stats || {}}
                      onChange={(stats) => updateConfig({ stats })}
                    />
                  )}

                  {config.sectionsConfig?.visible?.testimonials !== false && (
                    <TestimonialsEditor
                      testimonials={config.testimonials || []}
                      onChange={(testimonials) => updateConfig({ testimonials })}
                    />
                  )}

                  {config.sectionsConfig?.visible?.faqs !== false && (
                    <FAQsEditor
                      faqs={config.faqs || []}
                      onChange={(faqs) => updateConfig({ faqs })}
                    />
                  )}
                </>
              )}
            </div>

            {/* Right: Preview */}
            <div className="config-preview">
              <PreviewPanel
                schoolSlug={schoolSlug}
                program={selectedProgram}
                baseUrl={landingPreviewBase}
              />
            </div>
          </div>
        )}
      </div>
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

function SectionsPanel({
  sectionsConfig,
  onChange
}: {
  sectionsConfig?: { order: string[]; visible: Record<string, boolean> };
  onChange: (value: { order: string[]; visible: Record<string, boolean> }) => void;
}) {
  const visible = sectionsConfig?.visible || {};
  const order = sectionsConfig?.order || [...DEFAULT_SECTIONS];

  const toggle = (key: string) => {
    onChange({
      order,
      visible: {
        ...visible,
        [key]: visible[key] === false
      }
    });
  };

  return (
    <div className="config-card">
      <h3>Section Visibility</h3>
      <div className="config-toggle-grid">
        {DEFAULT_SECTIONS.map((key) => (
          <label key={key} className="config-toggle">
            <input
              type="checkbox"
              checked={visible[key] !== false}
              onChange={() => toggle(key)}
            />
            <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
          </label>
        ))}
      </div>
      <p className="admin-muted">
        Turn sections on or off for this program. Ordering support comes next.
      </p>
    </div>
  );
}

function ThankYouEditor({
  value,
  onChange
}: {
  value?: ThankYouConfig;
  onChange: (value: ThankYouConfig) => void;
}) {
  return (
    <div className="config-card">
      <h3>Thank You Message</h3>
      <div className="config-form">
        <div className="form-group">
          <label>Title</label>
          <input
            className="form-input"
            value={value?.title || ""}
            onChange={(event) => onChange({ ...value, title: event.target.value })}
            placeholder="Thanks! Your info is on the way."
          />
        </div>
        <div className="form-group">
          <label>Message</label>
          <input
            className="form-input"
            value={value?.message || ""}
            onChange={(event) => onChange({ ...value, message: event.target.value })}
            placeholder="We’ve sent your details to admissions."
          />
        </div>
        <div className="form-group">
          <label>Body</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={value?.body || ""}
            onChange={(event) => onChange({ ...value, body: event.target.value })}
            placeholder="Expect a response soon. In the meantime, explore program details."
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>CTA Text</label>
            <input
              className="form-input"
              value={value?.ctaText || ""}
              onChange={(event) => onChange({ ...value, ctaText: event.target.value })}
              placeholder="Learn more"
            />
          </div>
          <div className="form-group">
            <label>CTA Link</label>
            <input
              className="form-input"
              value={value?.ctaUrl || ""}
              onChange={(event) => onChange({ ...value, ctaUrl: event.target.value })}
              placeholder="https://example.com"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadFormEditor({
  leadForm,
  onChange
}: {
  leadForm?: LeadFormConfig;
  onChange: (value: LeadFormConfig) => void;
}) {
  const fields = Array.isArray(leadForm?.fields) ? leadForm?.fields || [] : [];

  const updateField = (index: number, updates: Partial<LeadFormField>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...updates };
    onChange({ ...leadForm, fields: next });
  };

  const addField = () => {
    const nextId = `field_${fields.length + 1}`;
    onChange({
      ...leadForm,
      fields: [
        ...fields,
        {
          id: nextId,
          label: "New field",
          type: "text",
          required: false,
          mapTo: "answers"
        }
      ]
    });
  };

  const removeField = (index: number) => {
    const next = fields.filter((_, i) => i !== index);
    onChange({ ...leadForm, fields: next });
  };

  const updateOption = (fieldIndex: number, optionIndex: number, updates: Partial<{ label: string; value: string }>) => {
    const field = fields[fieldIndex];
    const options = [...(field.options || [])];
    options[optionIndex] = { ...options[optionIndex], ...updates };
    updateField(fieldIndex, { options });
  };

  const addOption = (fieldIndex: number) => {
    const field = fields[fieldIndex];
    const options = [...(field.options || []), { label: "Option", value: "option" }];
    updateField(fieldIndex, { options });
  };

  const removeOption = (fieldIndex: number, optionIndex: number) => {
    const field = fields[fieldIndex];
    const options = (field.options || []).filter((_, i) => i !== optionIndex);
    updateField(fieldIndex, { options });
  };

  return (
    <div className="config-card">
      <h3>Lead Form</h3>
      <p className="admin-muted">
        Core fields are always included: first name, last name, email, phone, and consent.
      </p>

      <div className="form-grid">
        <div className="form-group">
          <label>Consent Checkbox Label</label>
          <input
            className="form-input"
            type="text"
            value={leadForm?.consentLabel || ""}
            onChange={(event) => onChange({ ...leadForm, consentLabel: event.target.value })}
            placeholder="I agree to receive calls, texts, or emails about program info."
          />
        </div>
      </div>

      <div className="lead-form-fields">
        {fields.map((field, index) => {
          const supportsOptions = field.type === "select" || field.type === "radio" || field.type === "checkbox";
          const options = Array.isArray(field.options) ? field.options : [];
          return (
            <div key={`${field.id}-${index}`} className="lead-form-field">
              <div className="lead-form-row">
                <div className="form-group">
                  <label>Field Label</label>
                  <input
                    className="form-input"
                    value={field.label}
                    onChange={(event) => updateField(index, { label: event.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Field ID</label>
                  <input
                    className="form-input"
                    value={field.id}
                    onChange={(event) => updateField(index, { id: event.target.value })}
                  />
                </div>
              </div>

              <div className="lead-form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select
                    className="form-input"
                    value={field.type}
                    onChange={(event) => updateField(index, { type: event.target.value as LeadFormField["type"] })}
                  >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="tel">Phone</option>
                    <option value="textarea">Textarea</option>
                    <option value="select">Select</option>
                    <option value="radio">Radio</option>
                    <option value="checkbox">Checkbox</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Map To</label>
                  <select
                    className="form-input"
                    value={field.mapTo || "answers"}
                    onChange={(event) => updateField(index, { mapTo: event.target.value as "answers" | "campus_id" })}
                  >
                    <option value="answers">Extra answers (JSON)</option>
                    <option value="campus_id">Campus ID</option>
                  </select>
                </div>
                <div className="form-group form-inline">
                  <label>
                    <input
                      type="checkbox"
                      checked={field.required === true}
                      onChange={(event) => updateField(index, { required: event.target.checked })}
                    />
                    Required
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Placeholder</label>
                <input
                  className="form-input"
                  value={field.placeholder || ""}
                  onChange={(event) => updateField(index, { placeholder: event.target.value })}
                />
              </div>

              {supportsOptions && (
                <div className="lead-form-options">
                  <label className="admin-muted">Options</label>
                  {options.map((option, optionIndex) => (
                    <div key={`${field.id}-option-${optionIndex}`} className="config-list-item">
                      <input
                        className="form-input-sm"
                        value={option.label}
                        onChange={(event) => updateOption(index, optionIndex, { label: event.target.value })}
                        placeholder="Label"
                      />
                      <input
                        className="form-input-sm"
                        value={option.value}
                        onChange={(event) => updateOption(index, optionIndex, { value: event.target.value })}
                        placeholder="Value"
                      />
                      <button className="btn-remove" onClick={() => removeOption(index, optionIndex)}>
                        ×
                      </button>
                    </div>
                  ))}
                  <button className="admin-btn-ghost" onClick={() => addOption(index)}>
                    + Add Option
                  </button>
                </div>
              )}

              <div className="lead-form-actions">
                <button className="admin-btn-ghost" onClick={() => removeField(index)}>
                  Remove Field
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="admin-btn-ghost" onClick={addField}>
        + Add Field
      </button>
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
function PreviewPanel({
  schoolSlug,
  program,
  baseUrl
}: {
  schoolSlug: string;
  program: Program | null;
  baseUrl: string;
}) {
  if (!program) {
    return (
      <div className="preview-empty">
        <p>Select a program to preview</p>
      </div>
    );
  }

  if (!baseUrl) {
    return (
      <div className="preview-empty">
        <p>Set NEXT_PUBLIC_LANDING_BASE_URL to enable live preview.</p>
      </div>
    );
  }

  const normalizedBase = baseUrl.replace(/\/$/, "");

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
          src={`${normalizedBase}/${program.slug}`}
          title="Landing Page Preview"
          className="preview-iframe"
        />
      </div>
    </div>
  );
}
