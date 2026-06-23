import "server-only";
import { Resend } from "resend";
import { displayPkPhone } from "@/lib/pk-phone";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Pulse BMS <noreply@yourpulse.io>";

function escapeHtml(str: string): string {
  return str.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

export async function sendOTPEmail(
  to: string,
  name: string,
  otp: string,
  expiresInMinutes = 15,
): Promise<{ error?: string }> {
  const safeName = escapeHtml(name);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verify your email — Pulse BMS</title>
</head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:480px;width:100%;">
        <tr>
          <td style="background:#1e293b;padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Pulse BMS</p>
            <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;">Verify your email</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi ${safeName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
              Use the code below to verify your email and complete your Pulse BMS registration.
              The code expires in <strong>${expiresInMinutes} minutes</strong>.
            </p>
            <div style="background:#f1f5f9;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
              <span style="font-size:36px;font-weight:800;letter-spacing:0.3em;color:#1e293b;font-family:monospace;">${otp}</span>
            </div>
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
              If you did not request this, you can safely ignore this email.
              Do not share this code with anyone.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© Pulse BMS · Building Management System</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: `${otp} — Your Pulse BMS verification code`,
      html,
      text: `Your Pulse BMS verification code is: ${otp}. It expires in ${expiresInMinutes} minutes. Do not share this code with anyone.`,
    });
    if (error) {
      console.error("[email] sendOTPEmail failed:", error);
      return { error: "Failed to send verification email. Please try again." };
    }
    return {};
  } catch (err) {
    console.error("[email] sendOTPEmail exception:", err);
    return { error: "Failed to send verification email. Please try again." };
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<{ error?: string }> {
  // Escape before interpolation so a malformed NEXT_PUBLIC_SITE_URL can't
  // inject markup into the email HTML.
  const safeUrl = escapeHtml(resetUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset your password — Pulse BMS</title>
</head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:480px;width:100%;">
        <tr>
          <td style="background:#1e293b;padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Pulse BMS</p>
            <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;">Password reset</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;color:#374151;">We received a request to reset your Pulse BMS password.</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
              Click the button below to set a new password. This link expires in <strong>1 hour</strong> and can only be used once.
            </p>
            <div style="text-align:center;margin-bottom:24px;">
              <a href="${safeUrl}" style="display:inline-block;background:#1e293b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:8px;">
                Reset my password
              </a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">Or copy and paste this link:</p>
            <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all;">${safeUrl}</p>
            <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">
              If you did not request a password reset, you can safely ignore this email. Your password will not be changed.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© Pulse BMS · Building Management System</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: "Reset your Pulse BMS password",
      html,
      text: `Reset your Pulse BMS password by visiting: ${resetUrl}\n\nThis link expires in 1 hour and can only be used once.\n\nIf you did not request this, ignore this email.`,
    });
    if (error) {
      console.error("[email] sendPasswordResetEmail failed:", error);
      return { error: "Failed to send reset email. Please try again." };
    }
    return {};
  } catch (err) {
    console.error("[email] sendPasswordResetEmail exception:", err);
    return { error: "Failed to send reset email. Please try again." };
  }
}

// ── Follow-up digest ────────────────────────────────────────────────────────

export type DigestLead = {
  id: string;
  building_name: string;
  city: string | null;
  contact_name: string;
  contact_role: string;
  whatsapp_number: string;
  status: string;
  temperature: string;
  next_followup_date: string | null;
  notes: string | null;
  owner_name: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", demo_done: "Demo Done",
  negotiating: "Negotiating", dormant: "Dormant",
};
const STATUS_COLOR: Record<string, string> = {
  new: "#6b7280", contacted: "#2563eb", demo_done: "#7c3aed",
  negotiating: "#d97706", dormant: "#9ca3af",
};
const TEMP_LABEL: Record<string, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };
const TEMP_COLOR: Record<string, string> = { hot: "#ef4444", warm: "#f59e0b", cold: "#3b82f6" };
const ROLE_LABEL: Record<string, string> = {
  president: "President", treasurer: "Treasurer", secretary: "Secretary",
  member: "Member", admin: "Admin", other: "Contact",
};

function leadCard(lead: DigestLead, isOverdue: boolean): string {
  const phone = displayPkPhone(lead.whatsapp_number);
  const waUrl = `https://wa.me/${lead.whatsapp_number.replace(/\D/g, "")}`;
  const statusLabel = STATUS_LABEL[lead.status] ?? lead.status;
  const statusColor = STATUS_COLOR[lead.status] ?? "#6b7280";
  const tempLabel = TEMP_LABEL[lead.temperature] ?? lead.temperature;
  const tempColor = TEMP_COLOR[lead.temperature] ?? "#6b7280";
  const roleLabel = ROLE_LABEL[lead.contact_role] ?? lead.contact_role;
  const notes = lead.notes ? escapeHtml(lead.notes) : "—";
  const location = [lead.building_name, lead.city].filter((s): s is string => Boolean(s)).map(escapeHtml).join(" · ");
  const dueLine = isOverdue && lead.next_followup_date
    ? `<span style="color:#b45309;font-size:12px;font-weight:600;">Overdue since ${lead.next_followup_date}</span>`
    : "";

  return `
  <div style="background:${isOverdue ? "#fffbeb" : "#ffffff"};border:1px solid ${isOverdue ? "#fcd34d" : "#e5e7eb"};border-radius:8px;padding:16px;margin-bottom:12px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#111827;">${escapeHtml(lead.contact_name)} <span style="font-weight:400;color:#6b7280;font-size:13px;">(${roleLabel})</span></p>
          <p style="margin:0 0 8px;font-size:13px;color:#374151;">${location}</p>
          ${dueLine}
        </td>
        <td align="right" style="vertical-align:top;">
          <span style="display:inline-block;background:${statusColor}20;color:${statusColor};font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;white-space:nowrap;">${statusLabel}</span>
          <span style="display:inline-block;background:${tempColor}20;color:${tempColor};font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;white-space:nowrap;margin-left:4px;">${tempLabel}</span>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-top:1px solid ${isOverdue ? "#fde68a" : "#f3f4f6"};padding-top:10px;">
      <tr>
        <td width="50%" style="vertical-align:top;padding-right:8px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;">Contact</p>
          <p style="margin:0 0 4px;font-size:13px;color:#111827;">${escapeHtml(phone)}</p>
          <p style="margin:0 0 6px;font-size:11px;color:#6b7280;">Assigned: ${escapeHtml(lead.owner_name)}</p>
          <p style="margin:0;font-size:11px;color:${isOverdue ? "#b45309" : "#6b7280"};">
            Follow-up: <strong>${isOverdue ? `Overdue since ${lead.next_followup_date}` : lead.next_followup_date ?? "Today"}</strong>
          </p>
        </td>
        <td width="50%" style="vertical-align:top;padding-left:8px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;">Notes</p>
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">${notes}</p>
        </td>
      </tr>
    </table>
    <div style="margin-top:12px;">
      <a href="${waUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;font-size:12px;font-weight:600;text-decoration:none;padding:7px 14px;border-radius:6px;">WhatsApp ↗</a>
    </div>
  </div>`;
}

export async function sendFollowupDigest(
  to: string[],
  cc: string[],
  todayLeads: DigestLead[],
  overdueLeads: DigestLead[],
  dateStr: string,
): Promise<{ error?: string }> {
  const totalCount = todayLeads.length + overdueLeads.length;
  const summary = [
    todayLeads.length > 0 ? `${todayLeads.length} due today` : null,
    overdueLeads.length > 0 ? `${overdueLeads.length} overdue` : null,
  ].filter(Boolean).join(" · ");

  const todaySection = todayLeads.length > 0 ? `
    <tr><td>
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1e293b;">Due Today — ${todayLeads.length}</p>
      ${todayLeads.map(l => leadCard(l, false)).join("")}
    </td></tr>` : "";

  const overdueSection = overdueLeads.length > 0 ? `
    <tr><td style="padding-top:${todayLeads.length > 0 ? "16px" : "0"};">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#b45309;">Overdue — ${overdueLeads.length}</p>
      ${overdueLeads.map(l => leadCard(l, true)).join("")}
    </td></tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Follow-up Digest — ${dateStr}</title>
</head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1e293b;border-radius:12px 12px 0 0;padding:24px 28px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Pulse BMS</p>
          <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;">Daily Follow-up Digest</p>
        </td></tr>

        <!-- Date + summary -->
        <tr><td style="background:#f8fafc;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:16px 28px;">
          <p style="margin:0;font-size:14px;color:#374151;">${dateStr}</p>
          <p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#1e293b;">${summary}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${todaySection}
            ${overdueSection}
            <tr><td style="padding-top:20px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                This digest is sent daily at 11 AM. Leads marked Won or Lost are excluded.<br>
                Questions? Reply to this email.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">© Pulse BMS · Building Management System</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines: string[] = [`Follow-up Digest — ${dateStr}`, `${summary}`, ""];
  if (todayLeads.length > 0) {
    textLines.push("DUE TODAY", "─".repeat(40));
    for (const l of todayLeads) {
      textLines.push(`${l.contact_name} (${l.contact_role}) — ${l.building_name}${l.city ? ", " + l.city : ""}`);
      textLines.push(`Phone: ${displayPkPhone(l.whatsapp_number)}`);
      textLines.push(`Status: ${STATUS_LABEL[l.status] ?? l.status} · ${TEMP_LABEL[l.temperature] ?? l.temperature}`);
      textLines.push(`Assigned: ${l.owner_name}`);
      textLines.push(`Notes: ${l.notes ?? "—"}`);
      textLines.push(`WhatsApp: https://wa.me/${l.whatsapp_number.replace(/\D/g, "")}`);
      textLines.push("");
    }
  }
  if (overdueLeads.length > 0) {
    textLines.push("OVERDUE", "─".repeat(40));
    for (const l of overdueLeads) {
      textLines.push(`[Overdue since ${l.next_followup_date}] ${l.contact_name} — ${l.building_name}`);
      textLines.push(`Phone: ${displayPkPhone(l.whatsapp_number)}`);
      textLines.push(`Status: ${STATUS_LABEL[l.status] ?? l.status} · ${TEMP_LABEL[l.temperature] ?? l.temperature}`);
      textLines.push(`Assigned: ${l.owner_name}`);
      textLines.push(`Notes: ${l.notes ?? "—"}`);
      textLines.push(`WhatsApp: https://wa.me/${l.whatsapp_number.replace(/\D/g, "")}`);
      textLines.push("");
    }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      cc,
      subject: `Follow-up Digest — ${dateStr} (${totalCount} lead${totalCount === 1 ? "" : "s"})`,
      html,
      text: textLines.join("\n"),
    });
    if (error) {
      console.error("[email] sendFollowupDigest failed:", error);
      return { error: "Failed to send digest email." };
    }
    return {};
  } catch (err) {
    console.error("[email] sendFollowupDigest exception:", err);
    return { error: "Failed to send digest email." };
  }
}
