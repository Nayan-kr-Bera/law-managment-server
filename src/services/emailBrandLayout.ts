export const MI_LAW_LOGO_CID = "milawlogo@milaw.in";
export const MI_LAW_LOGO_URL =
  "https://res.cloudinary.com/dprkgukne/image/upload/v1793364463/mi-law-brand/mi-law-email-icon-v2.png";

/**
 * Returns the Nodemailer inline attachment array.
 * Since we now use a globally cached HTTPS Cloudinary CDN URL for 100% Gmail/Outlook compatibility,
 * no extra MIME file attachment is required.
 */
export function getMiLawLogoAttachments() {
  return [];
}

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface MiLawEmailLayoutOptions {
  /** HTML page <title> */
  documentTitle: string;
  /** Optional subtitle right under MI LAW in the top brand bar (defaults to firmName or "Legal Practice Management Suite") */
  brandSubtitle?: string;
  /** Semantic status pill HTML rendered above the main heading */
  badgeHtml?: string;
  /** Main H1 title inside the header */
  heading: string;
  /** Subtitle paragraph below the H1 heading */
  subheading?: string;
  /** Inner body HTML (greeting, cards, CTA buttons, security notes) */
  bodyHtml: string;
  /** Top line of the footer explaining why the email was sent */
  footerReason: string;
  /** Optional law firm / tenant name for co-branded footer attribution */
  firmName?: string | null;
}

/**
 * Generates a complete, responsive, table-based HTML email using the unified
 * MI LAW 60-30-10 design system (60% Platinum-White #FFFFFF, 30% Maity Midnight Navy #0B1336, 10% Maity Crimson Red #DC1E28).
 */
export function buildMiLawEmailHtml(options: MiLawEmailLayoutOptions): string {
  const {
    documentTitle,
    brandSubtitle,
    badgeHtml,
    heading,
    subheading,
    bodyHtml,
    footerReason,
    firmName,
  } = options;

  const year = new Date().getFullYear();
  const resolvedBrandSubtitle = escapeHtml(
    brandSubtitle ||
      (firmName
        ? `${firmName} • Legal Workspace`
        : "Legal Practice Management Suite"),
  );
  const coBrandText = firmName
    ? `${escapeHtml(firmName)} • Powered by MI Law (By Maity Innovations)`
    : `MI Law • By Maity Innovations`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(documentTitle)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(15,23,42,0.05);">

          <!-- TOP BRAND & HEADER -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 36px 24px;border-bottom:1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:12px;vertical-align:middle;">
                          <img src="${MI_LAW_LOGO_URL}" width="48" height="48" alt="MI Law" style="display:block;width:48px;height:48px;border:0;outline:none;text-decoration:none;" />
                        </td>
                        <td style="vertical-align:middle;">
                          <div style="font-size:17px;font-weight:800;color:#0b1336;letter-spacing:0.6px;line-height:1.2;font-family:Georgia,'Times New Roman',serif;">MI LAW</div>
                          <div style="font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.3px;">${resolvedBrandSubtitle}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${badgeHtml ? `<div style="margin-bottom:12px;">${badgeHtml}</div>` : ""}

              <h1 style="margin:0 0 6px;color:#0f172a;font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1.3;">
                ${heading}
              </h1>
              ${
                subheading
                  ? `<p style="margin:0;color:#64748b;font-size:14px;line-height:1.5;">${subheading}</p>`
                  : ""
              }
            </td>
          </tr>

          <!-- MAIN CONTENT BODY -->
          <tr>
            <td style="padding:32px 36px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- UNIFIED COMPANY FOOTER -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 36px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 6px;color:#475569;font-size:12px;font-weight:600;">
                ${footerReason}
              </p>
              <p style="margin:0 0 14px;color:#94a3b8;font-size:11px;line-height:1.5;">
                ${coBrandText}<br />
                Enterprise Legal Practice, Case &amp; Chamber Management System
              </p>
              <div style="border-top:1px solid #e2e8f0;padding-top:14px;">
                <p style="margin:0;color:#94a3b8;font-size:11px;">
                  &copy; ${year} MI Law. All rights reserved. Confidential Legal Communication.
                </p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
