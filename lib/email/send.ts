const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailMessage = { to: string; subject: string; html: string; text: string };
export type EmailResult = "sent" | "failed" | "off";

/** The public origin used inside email links. Server-only; never a request header. */
export function appUrl(): string { return (process.env.NEXT_PUBLIC_APP_URL ?? "https://thegameday.app").replace(/\/+$/, ""); }
export function emailConfigured(): boolean { return Boolean(process.env.RESEND_API_KEY && process.env.GAMEDAY_EMAIL_FROM); }

/**
 * Best-effort transactional send. Membership changes are already committed when
 * this runs, so a provider outage must surface to the commissioner as a warning
 * rather than throw and imply the approval itself failed.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY, from = process.env.GAMEDAY_EMAIL_FROM;
  if (!key || !from) return "off";
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text })
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
