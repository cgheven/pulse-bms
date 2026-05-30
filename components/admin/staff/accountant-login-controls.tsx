"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  Calculator,
  CheckCircle2,
  Eye,
  EyeOff,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  ShieldPlus,
} from "lucide-react";
import {
  createAccountantAccountForStaff,
  revokeAccountantAccountForStaff,
} from "@/app/actions/guard-accounts";

type StaffMin = {
  id: string;
  full_name: string;
  phone: string | null;
  role: string;
  profile_id: string | null;
};

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

/* ── CreateAccountantLoginDialog ─────────────────────────────────────── */

function CreateAccountantLoginDialog({
  staff,
  open,
  onOpenChange,
}: {
  staff: StaffMin;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function reset() {
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setCreated(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleGenerate() {
    setPassword(generatePassword());
    setShowPassword(true);
  }

  function handleSendWhatsApp() {
    if (!created || !staff.phone) return;
    const digits = staff.phone.replace(/\D/g, "");
    const intl = digits.startsWith("0") ? "92" + digits.slice(1) : digits;
    const msg =
      `Assalam-o-Alaikum ${staff.full_name}!\n\n` +
      `Your accountant portal login:\n` +
      `📧 Email: ${created.email}\n` +
      `🔑 Password: ${created.password}\n\n` +
      `Please keep these confidential.`;
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function handleCopy() {
    if (!created) return;
    const text = `Email: ${created.email}\nPassword: ${created.password}`;
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await createAccountantAccountForStaff(staff.id, { email, password });
        setCreated({ email, password });
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not create login",
          description: friendlyErrorMessage(err, "Creation failed. Please try again."),
          variant: "destructive",
        });
      }
    });
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailValid && password.length >= 8;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            Create Accountant Login
          </DialogTitle>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-[hsl(151_70%_45%)]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Login created for{" "}
                <span className="font-semibold">{staff.full_name}</span>
              </span>
            </div>

            <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Email</span>
                <span className="font-medium truncate">{created.email}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Password</span>
                <span className="font-medium font-mono">{created.password}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Share these credentials. They sign in at the login page using their email and password.
            </p>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              {staff.phone && (
                <Button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="gap-2 bg-[#25D366] hover:bg-[#1ebe5a] text-white w-full sm:w-auto"
                >
                  <MessageCircle className="w-4 h-4" />
                  Send via WhatsApp
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                className="w-full sm:w-auto"
              >
                Copy credentials
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground -mt-2">
              Create an accountant portal login for{" "}
              <span className="font-semibold text-foreground">{staff.full_name}</span>.
              They will sign in using their email and password.
            </p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="acc-login-email" className="text-sm mb-1.5 block">
                  Email Address
                </Label>
                <Input
                  id="acc-login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="accountant@example.com"
                  className="h-11"
                  autoFocus
                  disabled={pending}
                />
              </div>

              <div>
                <Label htmlFor="acc-login-password" className="text-sm mb-1.5 block">
                  Password{" "}
                  <span className="text-muted-foreground font-normal">(min. 8 characters)</span>
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="acc-login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set a secure password"
                      className="h-11 pr-10"
                      minLength={8}
                      disabled={pending}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={handleGenerate}
                    disabled={pending}
                    title="Generate password"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <DialogFooter className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !canSubmit} className="gap-2">
                  <ShieldPlus className="w-4 h-4" />
                  {pending ? "Creating..." : "Create Accountant Login"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── RevokeAccountantButton ──────────────────────────────────────────── */

function RevokeAccountantButton({ staff }: { staff: StaffMin }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  const onRevoke = () => {
    start(async () => {
      try {
        await revokeAccountantAccountForStaff(staff.id);
        setConfirm(false);
        toast({
          title: "Accountant login revoked",
          description: `${staff.full_name} can no longer log in.`,
        });
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not revoke login",
          description: friendlyErrorMessage(err, "Revoke failed. Please try again."),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <>
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
        <ShieldCheck className="w-3 h-3" />
        Login Active
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirm(true)}
        className="text-destructive hover:text-destructive gap-1"
        title="Revoke accountant login"
      >
        <ShieldOff className="w-4 h-4" />
        Revoke
      </Button>
      <ConfirmDialog
        open={confirm}
        title="Revoke accountant login?"
        description={`${staff.full_name} will no longer be able to sign in as an accountant. You can create a new login at any time.`}
        confirmLabel={pending ? "Revoking..." : "Revoke Login"}
        onCancel={() => setConfirm(false)}
        onConfirm={onRevoke}
      />
    </>
  );
}

/* ── AccountantLoginControls (exported) ──────────────────────────────── */

export function AccountantLoginControls({ staff }: { staff: StaffMin }) {
  const [createOpen, setCreateOpen] = useState(false);

  // Chowkidars use guard logins — skip
  if (staff.role === "chowkidar") return null;

  return (
    <>
      {staff.profile_id ? (
        <RevokeAccountantButton staff={staff} />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
        >
          <Calculator className="w-4 h-4" />
          Create Login
        </Button>
      )}

      <CreateAccountantLoginDialog
        staff={staff}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
