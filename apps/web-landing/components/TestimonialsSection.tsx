export type Testimonial = {
  quote: string;
  author: string;
  role?: string;
  photo?: string;
};

export function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  if (!testimonials || testimonials.length === 0) return null;

  return (
    <section className="testimonials-section">
      <h2 className="section-title">What Our Students Say</h2>
      <div className="testimonials-grid">
        {testimonials.map((testimonial, i) => (
          <div key={i} className="testimonial-card">
            <div className="testimonial-quote">&ldquo;{testimonial.quote}&rdquo;</div>
            <div className="testimonial-author">
              {testimonial.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={testimonial.photo}
                  alt={testimonial.author}
                  className="testimonial-photo"
                />
              )}
              <div>
                <div className="testimonial-name">{testimonial.author}</div>
                {testimonial.role && (
                  <div className="testimonial-role">{testimonial.role}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
