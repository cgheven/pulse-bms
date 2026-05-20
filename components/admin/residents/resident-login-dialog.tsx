"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { Copy, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import {
  createResidentLogin,
  resetResidentPassword,
  type LoginResult,
} from "@/app/actions/residents";
import { toIntlNoPlus } from "@/lib/phone";
import { cn } from "@/lib/utils";

type Mode = "create" | "reset";

export function ResidentLoginDialog({
  open,
  onClose,
  mode,
  resident,
  buildingName,
}: {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  resident: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    flat_number: string;
  } | null;
  buildingName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [phone, setPhone] = useState(resident?.phone ?? "");
  const [email, setEmail] = useState(resident?.email ?? "");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<LoginResult | null>(null);

  // Keep form synced when dialog reopens with a different resident
  if (resident && open && phone === "" && email === "" && !result) {
    if (resident.phone) setPhone(resident.phone);
    if (resident.email) setEmail(resident.email);
  }

  const close = () => {
    setResult(null);
    setPhone("");
    setEmail("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resident) return;
    start(async () => {
      try {
        const out =
          mode === "create"
            ? await createResidentLogin(resident.id, { phone, email })
            : await resetResidentPassword(resident.id);
        setResult(out);
        router.refresh();
        toast({
          title: mode === "create" ? "Login created" : "Password reset",
          description: "Share credentials via WhatsApp.",
        });
      } catch (err) {
        toast({
          title: mode === "create" ? "Could not create login" : "Could not reset password",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  };

  if (!resident) return null;

  const title = result
    ? mode === "create"
      ? "Login created"
      : "Password reset"
    : mode === "create"
      ? `Create login — ${resident.full_name}`
      : `Reset password — ${resident.full_name}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {result ? (
          <SuccessStep
            result={result}
            resident={resident}
            buildingName={buildingName}
            onClose={close}
          />
        ) : (
          <FormStep
            mode={mode}
            resident={resident}
            phone={phone}
            setPhone={setPhone}
            email={email}
            setEmail={setEmail}
            pending={pending}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────  Step 1 · Form  ───────────── */

function FormStep({
  mode,
  resident,
  phone,
  setPhone,
  email,
  setEmail,
  pending,
  onSubmit,
  onCancel,
}: {
  mode: Mode;
  resident: { full_name: string; flat_number: string };
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  pending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5 text-xs text-muted-foreground">
        {mode === "create"
          ? `${resident.full_name} (Flat ${resident.flat_number}) will get their own resident portal. We auto-generate a 10-character password — you can share it via WhatsApp on the next step.`
          : `Generate a fresh password for ${resident.full_name}. The old password stops working immediately.`}
      </div>

      {mode === "create" && (
        <>
          <div>
            <Label>Mobile number</Label>
            <Input
              inputMode="tel"
              placeholder="0331-1000006"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label>Email (optional)</Label>
            <Input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            At least one is needed. Mobile is preferred — the resident logs in with it.
          </p>
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="gap-1.5">
          <KeyRound className="w-3.5 h-3.5" />
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Resetting…"
            : mode === "create"
              ? "Create login"
              : "Reset password"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ─────────────  Step 2 · Success + WhatsApp share  ───────────── */

function SuccessStep({
  result,
  resident,
  buildingName,
  onClose,
}: {
  result: LoginResult;
  resident: { full_name: string; flat_number: string };
  buildingName: string;
  onClose: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<"username" | "password" | null>(null);

  // Show credentials verbatim — the user logs in with the canonical phone
  // (no dash), so the message and visual card must match what the resident
  // will actually type.
  const usernameDisplay = result.username;
  const loginUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/login`
      : "https://bms.musabkhan.me/login";

  const message = `Assalam Alaikum ${resident.full_name},

You've been added to Flat ${resident.flat_number} at ${buildingName} on the Resident Portal.

Login Credentials:
Username: ${usernameDisplay}
Password: ${result.password}

Open: ${loginUrl}

You can change your password after first login.`;

  const intl = result.username_kind === "phone" ? toIntlNoPlus(result.username) : null;
  const waUrl = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  const smsUrl = intl ? `sms:+${intl}?body=${encodeURIComponent(message)}` : null;

  const copy = (field: "username" | "password", value: string) => {
    if (typeof navigator === "undefined") return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[hsl(151_70%_55%/0.10)] border border-[hsl(151_70%_55%/0.25)] px-3 py-2.5 text-xs text-[hsl(151_70%_55%)]">
        Credentials ready. Share now — passwords are not shown again here.
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-[11px] uppercase tracking-wider">
            Username
          </span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-medium tabular-nums">
              {usernameDisplay}
            </span>
            <button
              type="button"
              onClick={() => copy("username", result.username)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
              aria-label="Copy username"
            >
              {copied === "username" ? (
                <Check className="w-3.5 h-3.5 text-[hsl(151_70%_55%)]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
          <span className="text-muted-foreground text-[11px] uppercase tracking-wider">
            Password
          </span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-medium">
              {showPassword ? result.password : "••••••••••"}
            </span>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => copy("password", result.password)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
              aria-label="Copy password"
            >
              {copied === "password" ? (
                <Check className="w-3.5 h-3.5 text-[hsl(151_70%_55%)]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg",
          "border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366]",
          "text-sm font-medium hover:bg-[#25D366]/20 transition-colors",
        )}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Send via WhatsApp
      </a>

      {smsUrl && (
        <a
          href={smsUrl}
          className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Or send via SMS
        </a>
      )}

      <DialogFooter>
        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
