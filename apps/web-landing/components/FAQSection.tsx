"use client";

import { useState } from "react";

export type FAQ = {
  question: string;
  answer: string;
};

export function FAQSection({ faqs }: { faqs: FAQ[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!faqs || faqs.length === 0) return null;

  return (
    <section className="faq-section">
      <h2 className="section-title">Frequently Asked Questions</h2>
      <div className="faq-list">
        {faqs.map((faq, i) => (
          <div key={i} className="faq-item">
            <button
              className={`faq-question ${openIndex === i ? "open" : ""}`}
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              aria-expanded={openIndex === i}
            >
              <span>{faq.question}</span>
              <span className="faq-icon">{openIndex === i ? "−" : "+"}</span>
            </button>
            {openIndex === i && (
              <div className="faq-answer">{faq.answer}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
