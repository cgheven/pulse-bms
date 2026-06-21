"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { startRegistration } from "@/app/actions/register";
import Link from "next/link";

const CITIES = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
  "Other",
];

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    building_name: "",
    city: "Karachi",
    flat_limit: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const flatLimit = parseInt(form.flat_limit, 10);
    if (!Number.isFinite(flatLimit) || flatLimit < 1 || flatLimit > 1500) {
      toast({
        title: "Invalid flat count",
        description: "Enter a number between 1 and 1,500.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const result = await startRegistration({
        email: form.email,
        full_name: form.full_name,
        building_name: form.building_name,
        city: form.city,
        flat_limit: flatLimit,
      });
      router.push(`/register/verify?id=${result.registration_id}`);
    } catch (err) {
      toast({
        title: "Registration failed",
        description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <h1 className="font-serif text-3xl text-foreground tracking-tight">Pulse</h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
            14-day free trial
          </p>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">Create your account</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Set up your building in minutes. No credit card required.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="full_name"
                className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
              >
                Your name
              </Label>
              <Input
                id="full_name"
                type="text"
                placeholder="Ahmed Khan"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                required
                disabled={loading}
                autoComplete="name"
                className="h-11 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
              >
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
                className="h-11 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="building_name"
                className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
              >
                Building name
              </Label>
              <Input
                id="building_name"
                type="text"
                placeholder="Al-Hamd Apartments"
                value={form.building_name}
                onChange={(e) => set("building_name", e.target.value)}
                required
                disabled={loading}
                className="h-11 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="city"
                  className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
                >
                  City
                </Label>
                <select
                  id="city"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  disabled={loading}
                  className="flex h-11 w-full rounded-md border border-sidebar-border bg-background/50 px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="flat_limit"
                  className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
                >
                  No. of flats
                </Label>
                <Input
                  id="flat_limit"
                  type="number"
                  min={1}
                  max={1500}
                  step={1}
                  placeholder="48"
                  value={form.flat_limit}
                  onChange={(e) => set("flat_limit", e.target.value)}
                  required
                  disabled={loading}
                  className="h-11 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-2 bg-primary text-white font-semibold hover:bg-primary/90 transition-all duration-200 glow-amber"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Sending code…
                </>
              ) : (
                "Continue — verify email →"
              )}
            </Button>
          </form>
        </div>

        <div className="mt-5 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
