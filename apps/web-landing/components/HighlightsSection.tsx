export type Highlight = {
  icon?: string;
  text: string;
};

export function HighlightsSection({ highlights }: { highlights: Highlight[] }) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <section className="highlights-section">
      <div className="highlights-grid">
        {highlights.map((highlight, i) => (
          <div key={i} className="highlight-item">
            {highlight.icon && <div className="highlight-icon">{highlight.icon}</div>}
            <p className="highlight-text">{highlight.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
