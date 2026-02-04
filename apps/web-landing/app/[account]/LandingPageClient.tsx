"use client";

import { useState } from "react";
import type { Account, Location, Program } from "@lead_lander/config-schema";
import { API_BASE_URL } from "../../lib/apiConfig";

type LandingPageClientProps = {
  account: Account;
  locations: Location[];
  programs: Program[];
};

type NearestLocationResponse = {
  location: Location & { distance: number } | null;
};

export function LandingPageClient({
  account,
  locations,
  programs
}: LandingPageClientProps) {
  const [step, setStep] = useState<"landing" | "form" | "quiz">("landing");
  const [zipCode, setZipCode] = useState("");
  const [nearestLocation, setNearestLocation] = useState<(Location & { distance: number }) | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = {
    "--color-primary": account.branding.colors.primary,
    "--color-secondary": account.branding.colors.secondary,
    "--color-accent": account.branding.colors.accent || "#f3d34a",
    "--color-bg": account.branding.colors.background || "#f7f4ef",
    "--color-text": account.branding.colors.text || "#1b1b1b"
  } as React.CSSProperties;

  const handleZipCodeLookup = async () => {
    if (!zipCode || zipCode.length < 5) {
      setError("Please enter a valid ZIP code");
      return;
    }

    setIsLoadingLocation(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/public/accounts/${account.slug}/nearest-location?zip=${zipCode}`
      );

      if (!response.ok) {
        throw new Error("Could not find location");
      }

      const data = (await response.json()) as NearestLocationResponse;

      if (data.location) {
        setNearestLocation(data.location);
        setSelectedLocationId(data.location.id);
        setStep("form");
      } else {
        setError("No locations found near this ZIP code. You can still continue.");
        setStep("form");
      }
    } catch (err) {
      setError("Error finding location. You can still continue.");
      setStep("form");
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastName || !email || !consented) {
      setError("Please fill in all required fields and consent to be contacted.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/lead/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          locationId: selectedLocationId || null,
          firstName,
          lastName,
          email,
          phone,
          zipCode,
          landingAnswers: { zip_code: zipCode },
          consented,
          consentTextVersion: account.compliance.version,
          metadata: {
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            source: "landing_page"
          }
        })
      });

      if (!response.ok) {
        throw new Error("Failed to submit lead");
      }

      const data = await response.json();

      // Store submission ID for quiz
      if (data.submissionId) {
        localStorage.setItem("lead_submission_id", data.submissionId);
      }

      // Move to quiz
      setStep("quiz");
    } catch (err) {
      setError("Error submitting form. Please try again.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Landing step: ZIP code input
  if (step === "landing") {
    return (
      <main style={style}>
        <div className="container">
          <section className="brand-card">
            {account.branding.logoUrl && (
              <img
                src={account.branding.logoUrl}
                alt={`${account.name} logo`}
                className="brand-logo"
              />
            )}
            <h1>Welcome to {account.name}</h1>
            <p style={{ fontSize: "18px", marginBottom: "32px" }}>
              Discover the right program for your career goals.
            </p>

            <div className="form-card" style={{ maxWidth: "500px", margin: "0 auto" }}>
              <h2>Get Started</h2>
              <p>Enter your ZIP code to find your nearest location:</p>

              <div style={{ marginTop: "24px" }}>
                <input
                  type="text"
                  placeholder="ZIP Code"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  maxLength={5}
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: "16px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    marginBottom: "16px"
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleZipCodeLookup();
                    }
                  }}
                />

                {error && (
                  <p style={{ color: "red", marginBottom: "16px", fontSize: "14px" }}>
                    {error}
                  </p>
                )}

                <button
                  onClick={handleZipCodeLookup}
                  disabled={isLoadingLocation || zipCode.length < 5}
                  className="cta-button"
                  style={{ width: "100%" }}
                >
                  {isLoadingLocation ? "Finding location..." : "Continue"}
                </button>
              </div>

              <p style={{ fontSize: "12px", color: "#666", marginTop: "24px" }}>
                We have {locations.length} location{locations.length !== 1 ? "s" : ""} ready to serve you.
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // Form step: Lead capture
  if (step === "form") {
    return (
      <main style={style}>
        <div className="container">
          <section className="brand-card">
            {account.branding.logoUrl && (
              <img
                src={account.branding.logoUrl}
                alt={`${account.name} logo`}
                className="brand-logo"
              />
            )}
            <h1>{account.name}</h1>

            {nearestLocation && (
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.9)",
                  padding: "16px",
                  borderRadius: "8px",
                  marginBottom: "24px"
                }}
              >
                <p style={{ margin: 0, fontWeight: "bold", color: "#333" }}>
                  📍 Nearest Location: {nearestLocation.name}
                </p>
                <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#666" }}>
                  {nearestLocation.city}, {nearestLocation.state} • {nearestLocation.distance} miles away
                </p>
              </div>
            )}
          </section>

          <form onSubmit={handleSubmitLead} className="form-card">
            <h2>Tell us about yourself</h2>
            <p>We'll help you find the perfect program.</p>

            {error && (
              <div style={{ background: "#fee", padding: "12px", borderRadius: "4px", marginBottom: "16px" }}>
                <p style={{ color: "red", margin: 0, fontSize: "14px" }}>{error}</p>
              </div>
            )}

            <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <input
                type="text"
                placeholder="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                style={{ padding: "12px", fontSize: "16px", border: "1px solid #ccc", borderRadius: "4px" }}
              />

              <input
                type="text"
                placeholder="Last Name *"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                style={{ padding: "12px", fontSize: "16px", border: "1px solid #ccc", borderRadius: "4px" }}
              />

              <input
                type="email"
                placeholder="Email *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ padding: "12px", fontSize: "16px", border: "1px solid #ccc", borderRadius: "4px" }}
              />

              <input
                type="tel"
                placeholder="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ padding: "12px", fontSize: "16px", border: "1px solid #ccc", borderRadius: "4px" }}
              />

              {/* Location selector (if multiple locations) */}
              {locations.length > 1 && (
                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
                    Preferred Location
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      fontSize: "16px",
                      border: "1px solid #ccc",
                      borderRadius: "4px"
                    }}
                  >
                    {nearestLocation && (
                      <option value={nearestLocation.id}>
                        {nearestLocation.name} (Nearest - {nearestLocation.distance} mi)
                      </option>
                    )}
                    {locations
                      .filter((loc) => loc.id !== nearestLocation?.id)
                      .map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} - {loc.city}, {loc.state}
                        </option>
                      ))}
                    <option value="">Not sure yet</option>
                  </select>
                </div>
              )}

              <div style={{ marginTop: "8px" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={consented}
                    onChange={(e) => setConsented(e.target.checked)}
                    required
                    style={{ marginTop: "4px" }}
                  />
                  <span style={{ fontSize: "12px", color: "#666" }}>
                    {account.compliance.disclaimerText}
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="cta-button"
                style={{ marginTop: "8px" }}
              >
                {isSubmitting ? "Submitting..." : "Start Quiz"}
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  // Quiz step: Show program quiz
  if (step === "quiz") {
    return (
      <main style={style}>
        <div className="container">
          <div className="form-card" style={{ maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
            <h2>✅ Thank you!</h2>
            <p>Let's find your perfect program.</p>
            <p style={{ marginTop: "24px" }}>
              We have {programs.length} program{programs.length !== 1 ? "s" : ""} to recommend based on your interests.
            </p>

            {account.thankYou && (
              <div style={{ marginTop: "32px", padding: "24px", background: "#f9f9f9", borderRadius: "8px" }}>
                {account.thankYou.title && <h3>{account.thankYou.title}</h3>}
                {account.thankYou.message && <p>{account.thankYou.message}</p>}
                {account.thankYou.body && (
                  <p style={{ fontSize: "14px", color: "#666" }}>{account.thankYou.body}</p>
                )}
                {account.thankYou.ctaUrl && account.thankYou.ctaText && (
                  <a
                    href={account.thankYou.ctaUrl}
                    className="cta-button"
                    style={{ display: "inline-block", marginTop: "16px" }}
                  >
                    {account.thankYou.ctaText}
                  </a>
                )}
              </div>
            )}

            {/* TODO: Implement quiz component */}
            <p style={{ marginTop: "32px", fontSize: "14px", color: "#666" }}>
              Quiz component coming soon. For now, a representative will contact you shortly.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return null;
}
