"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Eye, EyeOff, MessageCircle, Mail, MessageSquare } from "lucide-react";
import type { CreatedLogin } from "@/app/actions/flats";
import { toIntlNoPlus } from "@/lib/phone";
import { cn } from "@/lib/utils";

export function LoginShareModal({
  open,
  onClose,
  logins,
  flatNumber,
  buildingName,
}: {
  open: boolean;
  onClose: () => void;
  logins: CreatedLogin[];
  flatNumber: string;
  buildingName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Logins ready for Flat {flatNumber}
          </DialogTitle>
          <DialogDescription>
            Share each login with the right person. Passwords are shown once
            here — copy or send via WhatsApp/SMS before closing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {logins.map((login) => (
            <LoginCard
              key={login.profile_id}
              login={login}
              flatNumber={flatNumber}
              buildingName={buildingName ?? "Building"}
            />
          ))}
        </div>

        <DialogFooter className="pt-2">
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoginCard({
  login,
  flatNumber,
  buildingName,
}: {
  login: CreatedLogin;
  flatNumber: string;
  buildingName: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<"username" | "password" | "message" | null>(null);

  const loginUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/login`
      : "https://bms.musabkhan.me/login";

  // The user types/stores the canonical phone (no dash) — show credentials
  // verbatim in both the share message and the visual card so what admin
  // tells the resident is exactly what the resident pastes back.
  const usernameDisplay = login.username;

  const message = buildWelcomeMessage({
    fullName: login.full_name,
    buildingName,
    flatNumber,
    usernameDisplay,
    password: login.password ?? "",
    loginUrl,
  });

  const intl = login.username_kind === "phone" ? toIntlNoPlus(login.username) : null;
  const waUrl = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}`
    : null;
  const smsUrl =
    login.username_kind === "phone" && intl
      ? `sms:+${intl}?body=${encodeURIComponent(message)}`
      : null;
  const mailtoUrl =
    login.username_kind === "email"
      ? `mailto:${login.username}?subject=${encodeURIComponent(`Welcome to ${buildingName} Resident Portal`)}&body=${encodeURIComponent(message)}`
      : null;

  function copy(field: "username" | "password" | "message", value: string) {
    if (typeof navigator === "undefined") return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  // Password is always returned (we rotate even for reused accounts during
  // flat creation), so we can render unconditionally without the null branch.
  const password = login.password ?? "";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">
            {login.full_name}
          </div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
            {login.relationship === "owner" ? "Owner" : "Tenant"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <CredentialRow
          label="Login"
          value={usernameDisplay}
          onCopy={() => copy("username", login.username)}
          copied={copied === "username"}
        />
        <CredentialRow
          label="Password"
          value={showPassword ? password : "••••••••••"}
          mono
          onCopy={() => copy("password", password)}
          copied={copied === "password"}
          extraButton={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          }
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copy("message", message)}
        >
          {copied === "message" ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy welcome message
            </>
          )}
        </Button>
        {waUrl && (
          <Button asChild size="sm" variant="outline" className="!gap-1.5">
            <a href={waUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="w-3.5 h-3.5 text-[hsl(151_70%_55%)]" />
              WhatsApp
            </a>
          </Button>
        )}
        {smsUrl && (
          <Button asChild size="sm" variant="outline">
            <a href={smsUrl}>
              <MessageSquare className="w-3.5 h-3.5" />
              SMS
            </a>
          </Button>
        )}
        {mailtoUrl && (
          <Button asChild size="sm" variant="outline">
            <a href={mailtoUrl}>
              <Mail className="w-3.5 h-3.5" />
              Email
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  mono,
  onCopy,
  copied,
  extraButton,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy: () => void;
  copied: boolean;
  extraButton?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <div
          className={cn(
            "flex-1 min-w-0 text-sm truncate",
            mono && "font-mono tabular-nums",
          )}
        >
          {value}
        </div>
        {extraButton}
        <button
          type="button"
          onClick={onCopy}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-[hsl(151_70%_55%)]" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function buildWelcomeMessage({
  fullName,
  buildingName,
  flatNumber,
  usernameDisplay,
  password,
  loginUrl,
}: {
  fullName: string;
  buildingName: string;
  flatNumber: string;
  usernameDisplay: string;
  password: string;
  loginUrl: string;
}): string {
  return `Assalam Alaikum ${fullName},

You've been added to Flat ${flatNumber} at ${buildingName} on the Resident Portal.

Login Credentials:
Username: ${usernameDisplay}
Password: ${password}

Open: ${loginUrl}

You can change your password after first login.`;
}
