"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { resetPassword } from "@/app/actions/register";
import Link from "next/link";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-3">
          <p className="text-foreground font-medium">Invalid or missing reset link.</p>
          <p className="text-sm text-muted-foreground">
            Please request a new password reset from the login page.
          </p>
          <Link href="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await resetPassword({ token, email, password });
      setDone(true);
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
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
            Reset password
          </p>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card p-8 shadow-2xl">
          {done ? (
            <div className="text-center space-y-4 py-2">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">Password updated</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  You can now sign in with your new password.
                </p>
              </div>
              <Button
                onClick={() => router.push("/login")}
                className="w-full h-11 bg-primary text-white font-semibold hover:bg-primary/90"
              >
                Sign in →
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-foreground">Set a new password</h2>
                <p className="text-sm text-muted-foreground mt-1">Must be at least 10 characters.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="pw"
                    className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    New password
                  </Label>
                  <div className="relative">
                    <Input
                      id="pw"
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
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={10}
                    disabled={loading}
                    autoComplete="new-password"
                    className="h-11 bg-background/50 border-sidebar-border focus-visible:ring-primary/40"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 mt-2 bg-primary text-white font-semibold hover:bg-primary/90 transition-all duration-200 glow-amber"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Updating…
                    </>
                  ) : (
                    "Update password →"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        <div className="mt-5 text-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
