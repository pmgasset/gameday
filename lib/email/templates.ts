import { appUrl, type EmailMessage } from "./send";

/** Member-supplied names reach an HTML body, so every interpolation is escaped. */
function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

const RULES = [
  "Each week, pick one underdog you believe wins its game outright.",
  "If that underdog wins, you earn its spread as points. No win, no points.",
  "Your pick stays private until its game starts, or Sunday at 1:00 PM ET."
];

export function membershipApprovedEmail({ to, displayName, poolName, poolId }: { to: string; displayName: string; poolName: string; poolId: string }): EmailMessage {
  const link = `${appUrl()}/?pool=${encodeURIComponent(poolId)}`;
  const name = displayName.trim() || "there";
  const text = [
    `Hi ${name},`,
    "",
    `You're approved to play in ${poolName} on GameDay.`,
    "",
    ...RULES.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    `Make your first pick: ${link}`,
    "",
    "Tip: add GameDay to your phone's home screen for one-tap access on game day."
  ].join("\n");

  const html = `<div style="margin:0;padding:24px 12px;background:#0d1422;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#151b28;border:1px solid #2f3a4d;border-radius:16px;padding:28px;">
    <p style="margin:0;color:#1cca7b;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">You're in</p>
    <h1 style="margin:10px 0 0;color:#f5f8fc;font-size:26px;line-height:1.2;">Welcome to ${escapeHtml(poolName)}, ${escapeHtml(name)}.</h1>
    <p style="margin:14px 0 0;color:#94a2b8;font-size:15px;line-height:1.6;">Your commissioner approved your request. Here is the whole game:</p>
    <ol style="margin:18px 0 0;padding-left:20px;color:#f5f8fc;font-size:15px;line-height:1.7;">${RULES.map((rule) => `<li style="margin-bottom:8px;">${escapeHtml(rule)}</li>`).join("")}</ol>
    <p style="margin:26px 0 0;"><a href="${link}" style="display:inline-block;background:#1cca7b;color:#0a1f17;font-size:15px;font-weight:800;text-decoration:none;padding:13px 22px;border-radius:12px;">Make your first pick</a></p>
    <p style="margin:22px 0 0;color:#94a2b8;font-size:13px;line-height:1.6;">If the button does not work, open this link:<br><a href="${link}" style="color:#1cca7b;">${escapeHtml(link)}</a></p>
    <p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #2f3a4d;color:#94a2b8;font-size:13px;line-height:1.6;">Tip: add GameDay to your phone's home screen for one-tap access on game day.</p>
  </div>
</div>`;

  return { to, subject: `You're in — ${poolName}`, html, text };
}
