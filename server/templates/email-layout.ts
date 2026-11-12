/**
 * Shared branded email layout.
 *
 * Every ops email is built by composing these helpers, so typography, spacing and the brand look
 * change in one place. The main app has its own copy (backend/src/templates/email-layout.ts):
 * a change to the look has to be made in both.
 *
 * The look: a plain white page, the QuizBuzz logo, a left-aligned message, buttons that are clearly
 * buttons, and one fixed footer. Anything that varies per email (a reassurance, a note about a problem)
 * goes at the end of the body in small text, never in the footer. Emails are automated and nobody reads
 * replies, so never tell the reader to reply: the footer says where to contact us.
 *
 * Markup is table-based with inline styles so it renders the same in Gmail, Outlook and on phones.
 */

import { env } from "../config/env";

export const FONT = "Arial, Helvetica, sans-serif";

/** The only text in every footer. Fixed on purpose: never pass it per email. */
export const FOOTER_BRAND = "QuizBuzz, powered by YSM Info Solution";
export const SUPPORT_PHONE = "+91 898 308 3698";
export const SUPPORT_EMAIL = "support@ysminfosolution.com";

/** Emails can't load a relative path, so this is the public site's copy of the logo (frontend/public). */
export const LOGO_FILE = "quizBuzz-logo.png";
const LOGO_URL = `${env.MAIN_APP_FRONTEND_URL.replace(/\/$/, "")}/${LOGO_FILE}`;

export const COLORS = {
    primary: "#059669", // emerald-600
    primaryDark: "#047857", // emerald-700
    primaryEdge: "#065f46", // emerald-800: the button's bottom edge
    primaryLight: "#ecfdf5", // emerald-50
    primaryBorder: "#a7f3d0", // emerald-200
    text: "#0f172a", // slate-900 — headings / emphasis
    textBody: "#334155", // slate-700 — paragraph copy
    textMuted: "#64748b", // slate-500 — labels
    textFaint: "#94a3b8", // slate-400 — fine print
    border: "#e2e8f0", // slate-200
    bg: "#ffffff",
    danger: "#dc2626",
    dangerBg: "#fef2f2",
    dangerBorder: "#dc2626",
    dangerText: "#991b1b",
    warningBg: "#fffbeb",
    warningBorder: "#d97706",
    warningText: "#92400e",
};

export interface EmailLayoutOptions {
    /** Hidden preview text shown in inbox lists. */
    preheader?: string;
    /** Main heading rendered at the top of the body. */
    heading?: string;
    /** Pre-built inner HTML (paragraphs, buttons, tables, etc.) */
    bodyHtml: string;
}

/** Wraps template body content in the shared shell: logo, body, fixed footer. */
export function renderEmailLayout(opts: EmailLayoutOptions): string {
    const preheader = opts.preheader ?? "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>QuizBuzz</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};">
    <span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${COLORS.bg};">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};">
        <tr>
            <td align="center" style="padding:24px 16px 32px 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;text-align:left;">
                    <tr>
                        <td style="padding:0 0 16px 0;border-bottom:1px solid ${COLORS.border};">
                            <img src="${LOGO_URL}" alt="QuizBuzz" width="84" style="display:block;width:84px;height:auto;border:0;font-family:${FONT};font-size:18px;font-weight:700;color:${COLORS.primaryDark};" />
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 0 4px 0;font-family:${FONT};color:${COLORS.textBody};">
                            ${opts.heading ? `<h1 style="margin:0 0 14px 0;font-family:${FONT};font-size:22px;line-height:1.3;color:${COLORS.text};font-weight:700;">${opts.heading}</h1>` : ""}
                            ${opts.bodyHtml}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:18px 0 0 0;border-top:1px solid ${COLORS.border};">
                            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${COLORS.textMuted};">
                                <strong style="color:${COLORS.textBody};">${FOOTER_BRAND}</strong><br/>
                                Contact us: <a href="mailto:${SUPPORT_EMAIL}" style="color:${COLORS.textMuted};text-decoration:underline;">${SUPPORT_EMAIL}</a> &middot; ${SUPPORT_PHONE}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

/** Standard paragraph style — use via: `<p style="${P}">...</p>` */
export const P = `margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${COLORS.textBody};`;

/** Small note at the end of the body: the lines that differ per email. */
export const SMALL = `margin:0 0 10px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.textMuted};`;

/** Inline link: green, bold, underlined, so it's clearly a link. */
export const LINK_STYLE = `color:${COLORS.primaryDark};font-weight:700;text-decoration:underline;`;

/**
 * A bulletproof button (table-wrapped anchor). Primary is solid green with a darker bottom edge;
 * secondary is white with a green outline. Both end in an arrow so they read as actions.
 */
export function emailButton(label: string, href: string, variant: "primary" | "secondary" = "primary"): string {
    const primary = variant === "primary";
    const fill = primary ? COLORS.primary : "#ffffff";
    const color = primary ? "#ffffff" : COLORS.primaryDark;
    const border = primary
        ? `border:1px solid ${COLORS.primary};border-bottom:3px solid ${COLORS.primaryEdge};`
        : `border:2px solid ${COLORS.primary};border-bottom:3px solid ${COLORS.primary};`;
    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 12px 6px 0;display:inline-table;">
        <tr>
            <td align="center" bgcolor="${fill}" style="border-radius:7px;background-color:${fill};">
                <a href="${href}" target="_blank"
                   style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:${color};text-decoration:none;border-radius:7px;background-color:${fill};${border}">
                    ${label} &rarr;
                </a>
            </td>
        </tr>
    </table>`;
}

/** The verification code, large and easy to read. */
export function otpBox(code: string): string {
    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px 0;">
        <tr>
            <td style="border:1px solid ${COLORS.border};border-radius:8px;padding:14px 22px;">
                <span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${COLORS.text};">${code}</span>
            </td>
        </tr>
    </table>`;
}

/** Fallback "copy this link" block shown under a button. */
export function linkFallback(url: string): string {
    return `
    <p style="margin:14px 0 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.textMuted};">
        Button not working? Copy this link into your browser:<br/>
        <span style="word-break:break-all;"><a href="${url}" style="${LINK_STYLE}font-weight:400;">${url}</a></span>
    </p>`;
}

/** Closing line, e.g. "Thanks, Team QuizBuzz". The brand details live in the footer. */
export function signOff(closing: string = "Thanks"): string {
    return `<p style="margin:20px 0 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.textBody};">${closing},<br/><strong style="color:${COLORS.text};">Team QuizBuzz</strong></p>`;
}

/** Two-column label/value rows, e.g. contest date, time, join code. */
export function infoTable(
    rows: Array<{ label: string; value: string; strong?: boolean; valueColor?: string }>
): string {
    const body = rows
        .map(
            (r) => `
        <tr>
            <td style="padding:10px 0;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:13px;color:${COLORS.textMuted};white-space:nowrap;vertical-align:top;">${r.label}</td>
            <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:14px;color:${r.valueColor ?? COLORS.text};font-weight:${r.strong ? 700 : 600};text-align:right;">${r.value}</td>
        </tr>`
        )
        .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;border-collapse:collapse;border-top:1px solid ${COLORS.border};">${body}</table>`;
}

/** Financial breakdown rows with tone-based colouring — used for payout receipts. */
export function ledgerTable(
    rows: Array<{
        label: string;
        value: string;
        tone?: "neutral" | "negative" | "positive";
        strong?: boolean;
        divider?: boolean;
    }>
): string {
    const toneColor: Record<string, string> = {
        neutral: COLORS.text,
        negative: COLORS.danger,
        positive: COLORS.primaryDark,
    };
    const body = rows
        .map(
            (r) => `
        <tr>
            <td style="padding:9px 0;${r.divider ? `border-top:1px solid ${COLORS.border};` : ""}font-family:${FONT};font-size:13px;color:${COLORS.textMuted};">${r.label}</td>
            <td style="padding:9px 0;${r.divider ? `border-top:1px solid ${COLORS.border};` : ""}font-family:${FONT};font-size:14px;font-weight:${r.strong ? 700 : 600};color:${toneColor[r.tone ?? "neutral"]};text-align:right;">${r.value}</td>
        </tr>`
        )
        .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border-collapse:collapse;">${body}</table>`;
}

/** Highlighted note — cancellation or disqualification reasons, warnings. A thin coloured edge, no card. */
export function calloutBox(text: string, variant: "info" | "warning" | "danger" = "info"): string {
    const palette = {
        info: { bg: COLORS.primaryLight, edge: COLORS.primary, text: COLORS.primaryDark },
        warning: { bg: COLORS.warningBg, edge: COLORS.warningBorder, text: COLORS.warningText },
        danger: { bg: COLORS.dangerBg, edge: COLORS.dangerBorder, text: COLORS.dangerText },
    }[variant];
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;">
        <tr>
            <td style="background-color:${palette.bg};border-left:3px solid ${palette.edge};padding:12px 16px;font-family:${FONT};font-size:14px;line-height:1.55;color:${palette.text};">
                ${text}
            </td>
        </tr>
    </table>`;
}

/** Small label above a heading, e.g. "Wishing you a wonderful day". */
export function pill(text: string): string {
    return `<p style="margin:0 0 10px 0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${COLORS.primaryDark};">${text}</p>`;
}

/** Where the owner pays, changes plan and downloads documents. */
export const billingUrl = () => `${env.MAIN_APP_FRONTEND_URL.replace(/\/$/, "")}/settings?tab=billing`;

/** Marks an attached file, so it doesn't read as a link. Not clickable: the file is attached to the email. */
export function fileChip(name: string): string {
    return `<span style="display:inline-block;margin:0 8px 8px 0;border:1px solid ${COLORS.border};border-radius:7px;background-color:#f8fafc;padding:7px 12px;font-family:${FONT};font-size:13px;font-weight:700;color:${COLORS.text};"><span style="background-color:${COLORS.danger};color:#ffffff;font-size:10px;font-weight:700;padding:2px 5px;border-radius:3px;margin-right:8px;">PDF</span>${name}</span>`;
}
