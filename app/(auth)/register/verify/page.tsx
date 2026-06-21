"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2, ArrowLeft, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { verifyOTPAndCreate, resendOTP } from "@/app/actions/register";
import Link from "next/link";

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const registrationId = params.get("id") ?? "";

  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    if (!registrationId) router.replace("/register");
  }, [registrationId, router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || !registrationId) return;
    setResendLoading(true);
    try {
      const result = await resendOTP(registrationId);
      if (result.error) {
        toast({ title: "Could not resend", description: result.error, variant: "destructive" });
      } else {
        setResendCooldown(60);
        toast({ title: "Code resent", description: "Check your inbox for the new code." });
      }
    } catch (err) {
      toast({
        title: "Could not resend",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setResendLoading(false);
    }
  }, [registrationId, resendCooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }
    if (password.length < 10) {
      toast({
        title: "Password too short",
        description: "Use at least 10 characters.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const result = await verifyOTPAndCreate({
        registration_id: registrationId,
        otp: otp.trim(),
        password,
      });
      if (result.error) {
        toast({ title: "Verification failed", description: result.error, variant: "destructive" });
        setLoading(false);
        return;
      }
      // Auto sign-in using the credentials just created
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: result.email!, password });
      if (signInErr) {
        toast({ title: "Account created!", description: "Please sign in with your new credentials." });
        router.push("/login");
        return;
      }
      toast({ title: "Welcome to Pulse BMS!", description: "Your 14-day free trial has started." });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      toast({
        title: "Verification failed",
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
            Verify your email
          </p>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">Check your inbox</h2>
            <p className="text-sm text-muted-foreground mt-1">
              We sent a 6-digit code to your email. Enter it below along with your new password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="otp"
                  className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Verification code
                </Label>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resendLoading}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3 h-3 ${resendLoading ? "animate-spin" : ""}`} />
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                disabled={loading}
                autoComplete="one-time-code"
                className="h-11 text-center text-2xl font-mono tracking-[0.4em] bg-background/50 border-sidebar-border focus-visible:ring-primary/40"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
              >
                Set your password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 10 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={10}
                  disabled={loading}
                  autoComplete="new-password"
                  className="h-11 pr-10 bg-background/50 border-sidebar-border focus-visible:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="confirm"
                className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
              >
                Confirm password
              </Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Same password again"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={10}
                disabled={loading}
                autoComplete="new-password"
                className="h-11 bg-background/50 border-sidebar-border focus-visible:ring-primary/40"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full h-11 mt-2 bg-primary text-white font-semibold hover:bg-primary/90 transition-all duration-200 glow-amber"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating your account…
                </>
              ) : (
                "Verify & create account →"
              )}
            </Button>
          </form>
        </div>

        <div className="mt-5 text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to registration
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
