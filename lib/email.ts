import "server-only";
import { Resend } from "resend";

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
