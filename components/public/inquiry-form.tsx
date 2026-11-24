"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPackageForFlats, type PackageId } from "@/lib/packages";
import { submitInquiry } from "@/app/actions/website-inquiry";

interface InquiryFormProps {
  dark?: boolean;
}

export function InquiryForm({ dark = false }: InquiryFormProps) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [presidentName, setPresidentName] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [city, setCity] = useState("");
  const [numFlats, setNumFlats] = useState<string>("");
  const [selectedPackage, setSelectedPackage] = useState<PackageId>("starter");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [contactTiming, setContactTiming] = useState("");
  const [startingDate, setStartingDate] = useState("");
  const [message, setMessage] = useState("");

  // Shorthand for picking between dark/light class strings
  const d = (darkCls: string, lightCls: string) => (dark ? darkCls : lightCls);

  function handleFlatsChange(val: string) {
    setNumFlats(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) {
      setSelectedPackage(getPackageForFlats(n).id);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    startTransition(async () => {
      try {
        await submitInquiry({
          president_name: presidentName,
          building_name: buildingName,
          city: city || undefined,
          num_flats: parseInt(numFlats, 10),
          package: selectedPackage,
          phone,
          whatsapp: whatsapp || undefined,
          email: email || undefined,
          contact_timing: contactTiming || undefined,
          starting_date: startingDate || undefined,
          message: message || undefined,
        });
        setSuccess(true);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    });
  }

  const inputCls = cn(
    "w-full h-11 text-base rounded-lg border px-3 outline-none transition focus:ring-2 focus:ring-primary/30 focus:border-primary",
    d(
      "bg-background border-sidebar-border text-foreground placeholder:text-muted-foreground/50",
      "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400",
    ),
  );

  const labelCls = cn(
    "block text-sm font-semibold",
    d("text-foreground", "text-gray-700"),
  );

  // One simple rate, per flat — matches the pricing page.
  const PER_FLAT_MONTHLY = 50;
  const PER_FLAT_ANNUAL = 480; // vs 600 monthly → save 20%
  const flatsNum = Math.max(0, parseInt(numFlats, 10) || 0);

  if (success) {
    return (
      <div className={cn(
        "rounded-2xl border p-8 sm:p-10",
        d("bg-card border-sidebar-border", "bg-white border-gray-200 shadow-sm"),
      )}>
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className={cn(
            "flex items-center justify-center w-20 h-20 rounded-full border-2",
            d("bg-primary/10 border-primary/30", "bg-green-50 border-green-200"),
          )}>
            <CheckCircle2 className={cn("w-10 h-10", d("text-primary", "text-green-600"))} />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center mb-8">
          <h3 className={cn("text-2xl font-bold mb-2", d("text-foreground", "text-gray-900"))}>
            Request received!
          </h3>
          <p className={cn("text-sm", d("text-muted-foreground", "text-gray-500"))}>
            We&apos;ll reach out within a few hours to get your building onboarded.
          </p>
        </div>

        {/* What happens next */}
        <div className={cn(
          "rounded-xl border p-5 space-y-4",
          d("bg-background border-sidebar-border", "bg-gray-50 border-gray-200"),
        )}>
          <p className={cn("text-xs font-bold uppercase tracking-widest", d("text-muted-foreground", "text-gray-400"))}>
            What happens next
          </p>
          {[
            { step: "01", text: "We review your details and prepare your building account." },
            { step: "02", text: "Our team calls or WhatsApps you to confirm and answer any questions." },
            { step: "03", text: "Your building goes live and we walk you through the setup together." },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <span className={cn(
                "shrink-0 font-mono text-xs font-bold tabular-nums mt-0.5",
                d("text-primary/60", "text-gray-400"),
              )}>
                {step}
              </span>
              <p className={cn("text-sm leading-relaxed", d("text-foreground", "text-gray-700"))}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "rounded-2xl border p-6 sm:p-8 space-y-6",
        d("bg-card border-sidebar-border", "bg-white border-gray-200 shadow-sm"),
      )}
    >
      {/* President Name */}
      <div className="space-y-1.5">
        <label htmlFor="president_name" className={labelCls}>
          President / Contact Name <span className="text-red-500">*</span>
        </label>
        <input
          id="president_name"
          type="text"
          required
          value={presidentName}
          onChange={(e) => setPresidentName(e.target.value)}
          maxLength={100}
          className={inputCls}
          placeholder="e.g. Mr. Khalid Ahmed"
        />
      </div>

      {/* Building Name */}
      <div className="space-y-1.5">
        <label htmlFor="building_name" className={labelCls}>
          Building / Society Name <span className="text-red-500">*</span>
        </label>
        <input
          id="building_name"
          type="text"
          required
          value={buildingName}
          onChange={(e) => setBuildingName(e.target.value)}
          maxLength={100}
          className={inputCls}
          placeholder="e.g. Clifton Heights"
        />
      </div>

      {/* City */}
      <div className="space-y-1.5">
        <label htmlFor="city" className={labelCls}>
          City
        </label>
        <input
          id="city"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          maxLength={100}
          className={inputCls}
          placeholder="e.g. Karachi, Lahore, Islamabad"
        />
      </div>

      {/* Number of Flats */}
      <div className="space-y-1.5">
        <label htmlFor="num_flats" className={labelCls}>
          Number of Flats <span className="text-red-500">*</span>
        </label>
        <input
          id="num_flats"
          type="number"
          required
          min={1}
          max={2000}
          value={numFlats}
          onChange={(e) => handleFlatsChange(e.target.value)}
          className={inputCls}
          placeholder="e.g. 40"
        />
      </div>

      {/* Your estimated cost — single flat rate, PKR 50/flat/mo (480/yr) */}
      <div className="space-y-2">
        <p className={cn("text-sm font-semibold", d("text-foreground", "text-gray-700"))}>
          Your estimated cost
        </p>
        <div className={cn(
          "rounded-xl border p-4",
          d("bg-background border-sidebar-border", "bg-gray-50 border-gray-200"),
        )}>
          {flatsNum > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className={cn("text-sm", d("text-muted-foreground", "text-gray-600"))}>
                  {flatsNum.toLocaleString("en-PK")} flats × PKR {PER_FLAT_MONTHLY}/flat
                </span>
                <span className={cn("text-lg font-bold tabular-nums", d("text-foreground", "text-gray-900"))}>
                  PKR {(flatsNum * PER_FLAT_MONTHLY).toLocaleString("en-PK")}
                  <span className="text-sm font-medium text-muted-foreground"> / mo</span>
                </span>
              </div>
              <div className={cn(
                "flex items-center justify-between gap-3 pt-3 border-t",
                d("border-sidebar-border", "border-gray-200"),
              )}>
                <span className={cn("text-sm", d("text-muted-foreground", "text-gray-600"))}>
                  Billed yearly · save 20%
                </span>
                <span className="text-lg font-bold tabular-nums text-primary">
                  PKR {(flatsNum * PER_FLAT_ANNUAL).toLocaleString("en-PK")}
                  <span className="text-sm font-medium text-primary/70"> / yr</span>
                </span>
              </div>
            </div>
          ) : (
            <p className={cn("text-sm", d("text-muted-foreground", "text-gray-500"))}>
              Enter your number of flats above to see your price — just PKR {PER_FLAT_MONTHLY} per flat each month, every feature included.
            </p>
          )}
        </div>
      </div>

      {/* Contact Number + WhatsApp */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="phone" className={labelCls}>
            Contact Number <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            className={inputCls}
            placeholder="e.g. 0331-1234567"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="whatsapp" className={labelCls}>
            WhatsApp Number
          </label>
          <input
            id="whatsapp"
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            maxLength={20}
            className={inputCls}
            placeholder="Leave blank if same as above"
          />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className={labelCls}>
          Email Address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          className={inputCls}
          placeholder="e.g. president@greenheights.pk"
        />
      </div>

      {/* Contact Timing + Start Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="contact_timing" className={labelCls}>
            Best Time to Contact
          </label>
          <input
            id="contact_timing"
            type="text"
            value={contactTiming}
            onChange={(e) => setContactTiming(e.target.value)}
            maxLength={100}
            className={inputCls}
            placeholder='e.g. "9am–6pm weekdays"'
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="starting_date" className={labelCls}>
            Expected Start Date
          </label>
          <input
            id="starting_date"
            type="date"
            value={startingDate}
            onChange={(e) => setStartingDate(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <label htmlFor="message" className={labelCls}>
          Additional Message
        </label>
        <textarea
          id="message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={cn(
            "w-full text-base rounded-lg border px-3 py-2.5 outline-none transition focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none",
            d(
              "bg-background border-sidebar-border text-foreground placeholder:text-muted-foreground/50",
              "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400",
            ),
          )}
          maxLength={1000}
          placeholder="Anything else you'd like us to know?"
        />
      </div>

      {/* Error */}
      {errorMsg && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-sm",
          d("bg-destructive/10 border-destructive/30 text-destructive", "bg-red-50 border-red-200 text-red-700"),
        )}>
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full h-14 rounded-xl bg-primary text-primary-foreground text-lg font-bold hover:bg-primary/90 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Sending…" : "Send Request →"}
      </button>

      <p className="text-center text-xs text-muted-foreground/60">
        We typically respond within a few hours during business days.
      </p>
    </form>
  );
}
