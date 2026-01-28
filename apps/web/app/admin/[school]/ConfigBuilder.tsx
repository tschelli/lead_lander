"use client";

import { useMemo, useState } from "react";

type Program = {
  id: string;
  name: string;
  landingCopy: {
    headline: string;
    subheadline: string;
    body: string;
    ctaText: string;
  };
};

type ConfigBuilderProps = {
  programs: Program[];
};

function toYaml(lines: Record<string, string>) {
  return [
    "landingCopy:",
    `  headline: \"${lines.headline}\"`,
    `  subheadline: \"${lines.subheadline}\"`,
    `  body: \"${lines.body}\"`,
    `  ctaText: \"${lines.ctaText}\"`
  ].join("\n");
}

export function ConfigBuilder({ programs }: ConfigBuilderProps) {
  const [selectedId, setSelectedId] = useState(programs[0]?.id || "");
  const [status, setStatus] = useState<string | null>(null);

  const selected = useMemo(
    () => programs.find((program) => program.id === selectedId) || programs[0],
    [programs, selectedId]
  );

  const [draft, setDraft] = useState(() => ({
    headline: selected?.landingCopy.headline || "",
    subheadline: selected?.landingCopy.subheadline || "",
    body: selected?.landingCopy.body || "",
    ctaText: selected?.landingCopy.ctaText || ""
  }));

  if (!selected) {
    return <p className="admin-muted">No programs found for this account.</p>;
  }

  const handleChange = (field: keyof typeof draft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setStatus(null);
  };

  const handleSelect = (id: string) => {
    const program = programs.find((item) => item.id === id);
    if (!program) return;
    setSelectedId(id);
    setDraft({
      headline: program.landingCopy.headline,
      subheadline: program.landingCopy.subheadline,
      body: program.landingCopy.body,
      ctaText: program.landingCopy.ctaText
    });
    setStatus(null);
  };

  const yamlPreview = toYaml(draft);

  return (
    <div className="admin-builder">
      <div className="admin-builder__row">
        <label className="admin-muted">Program</label>
        <select
          className="admin-builder__select"
          value={selectedId}
          onChange={(event) => handleSelect(event.target.value)}
        >
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
      </div>

      <div className="admin-builder__fields">
        <div>
          <label className="admin-muted">Headline</label>
          <input
            className="admin-builder__input"
            value={draft.headline}
            onChange={(event) => handleChange("headline", event.target.value)}
          />
        </div>
        <div>
          <label className="admin-muted">Subheadline</label>
          <input
            className="admin-builder__input"
            value={draft.subheadline}
            onChange={(event) => handleChange("subheadline", event.target.value)}
          />
        </div>
        <div>
          <label className="admin-muted">Body</label>
          <textarea
            className="admin-builder__textarea"
            value={draft.body}
            onChange={(event) => handleChange("body", event.target.value)}
          />
        </div>
        <div>
          <label className="admin-muted">CTA Text</label>
          <input
            className="admin-builder__input"
            value={draft.ctaText}
            onChange={(event) => handleChange("ctaText", event.target.value)}
          />
        </div>
      </div>

      <div className="admin-builder__preview">
        <div>
          <p className="admin-muted">YAML preview</p>
          <pre>{yamlPreview}</pre>
        </div>
        <div className="admin-builder__actions">
          <button
            className="admin-btn"
            onClick={() => setStatus("Draft saved locally. Submit for approval when ready.")}
          >
            Save draft
          </button>
          <button
            className="admin-official__ghost"
            onClick={() => setStatus("Submitted for owner approval.")}
          >
            Submit for approval
          </button>
          {status && <p className="admin-muted">{status}</p>}
        </div>
      </div>
    </div>
  );
}
