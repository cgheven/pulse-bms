"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { submitContact } from "@/app/actions/website-inquiry";

// Palette mirrors the PulseHub landing / pricing theme (oklch tokens).
const C = {
  bgCard:        "#FFFFFF",
  muted:         "oklch(0.965 0.004 75)",
  fg:            "oklch(0.20 0.012 60)",
  fgSoft:        "oklch(0.44 0.012 70)",
  fgFaint:       "oklch(0.60 0.012 75)",
  border:        "oklch(0.90 0.008 70)",
  borderStrong:  "oklch(0.84 0.010 70)",
  primary:       "oklch(0.54 0.167 45)",
  primaryHover:  "oklch(0.49 0.165 45)",
  primarySoft:   "oklch(0.54 0.167 45 / 0.08)",
  primaryBorder: "oklch(0.54 0.167 45 / 0.20)",
  primaryRing:   "oklch(0.54 0.167 45 / 0.18)",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13.5, fontWeight: 600, color: C.fg, marginBottom: 6,
};

export function ContactForm() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  function focusOn(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = C.primary;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${C.primaryRing}`;
  }
  function focusOff(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = C.borderStrong;
    e.currentTarget.style.boxShadow = "none";
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", borderRadius: 10,
    border: `1px solid ${C.borderStrong}`, background: C.bgCard, color: C.fg,
    fontSize: 15, fontFamily: "inherit", outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    startTransition(async () => {
      try {
        await submitContact({ name, email, phone, message });
        setSuccess(true);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    });
  }

  if (success) {
    return (
      <div style={{ borderRadius: 20, border: `1px solid ${C.border}`, background: C.bgCard, boxShadow: "0 24px 60px -32px rgba(40,24,10,0.30)", padding: "clamp(28px, 5vw, 40px)", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.primarySoft, border: `1px solid ${C.primaryBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckCircle2 style={{ width: 34, height: 34, color: C.primary }} />
          </div>
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: C.fg, margin: "0 0 8px" }}>Message sent</h3>
        <p style={{ fontSize: 15, color: C.fgSoft, lineHeight: 1.6, margin: 0 }}>
          Thanks for reaching out — our Karachi-based team will get back to you shortly.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ borderRadius: 20, border: `1px solid ${C.border}`, background: C.bgCard, boxShadow: "0 24px 60px -32px rgba(40,24,10,0.30)", padding: "clamp(24px, 4vw, 34px)", display: "flex", flexDirection: "column", gap: 18 }}
    >
      <div>
        <label htmlFor="c_name" style={labelStyle}>Name <span style={{ color: C.primary }}>*</span></label>
        <input id="c_name" type="text" required maxLength={100} value={name}
          onChange={(e) => setName(e.target.value)} onFocus={focusOn} onBlur={focusOff}
          placeholder="e.g. Mr. Khalid Ahmed" style={{ ...fieldStyle, height: 46, padding: "0 14px" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 18 }} className="contact-row">
        <div>
          <label htmlFor="c_email" style={labelStyle}>Email <span style={{ color: C.primary }}>*</span></label>
          <input id="c_email" type="email" required maxLength={254} value={email}
            onChange={(e) => setEmail(e.target.value)} onFocus={focusOn} onBlur={focusOff}
            placeholder="you@example.com" style={{ ...fieldStyle, height: 46, padding: "0 14px" }} />
        </div>
        <div>
          <label htmlFor="c_phone" style={labelStyle}>Phone / WhatsApp</label>
          <input id="c_phone" type="tel" maxLength={30} value={phone}
            onChange={(e) => setPhone(e.target.value)} onFocus={focusOn} onBlur={focusOff}
            placeholder="e.g. 0332-7857333" style={{ ...fieldStyle, height: 46, padding: "0 14px" }} />
        </div>
      </div>

      <div>
        <label htmlFor="c_message" style={labelStyle}>Message <span style={{ color: C.primary }}>*</span></label>
        <textarea id="c_message" required maxLength={1000} rows={5} value={message}
          onChange={(e) => setMessage(e.target.value)} onFocus={focusOn} onBlur={focusOff}
          placeholder="How can we help with your building?" style={{ ...fieldStyle, padding: "12px 14px", resize: "vertical", minHeight: 120, lineHeight: 1.6 }} />
      </div>

      {errorMsg && (
        <p style={{ fontSize: 13.5, color: "oklch(0.55 0.2 27)", margin: 0 }}>{errorMsg}</p>
      )}

      <button
        type="submit" disabled={isPending}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 15, fontWeight: 600, border: "none", cursor: isPending ? "default" : "pointer", fontFamily: "inherit", background: C.primary, color: "#fff", opacity: isPending ? 0.7 : 1, boxShadow: "0 2px 10px oklch(0.54 0.167 45 / 0.28)", transition: "background 0.15s, opacity 0.15s" }}
        onMouseEnter={(e) => { if (!isPending) e.currentTarget.style.background = C.primaryHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = C.primary; }}
      >
        <Send style={{ width: 16, height: 16 }} /> {isPending ? "Sending…" : "Send message"}
      </button>
      <p style={{ fontSize: 12.5, color: C.fgFaint, textAlign: "center", margin: 0 }}>
        Prefer WhatsApp? Message us at +92 332 7857333.
      </p>

      <style>{`@media (min-width: 560px){ .contact-row { grid-template-columns: 1fr 1fr !important; } }`}</style>
    </form>
  );
}
