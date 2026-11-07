import { Request, Response, NextFunction } from "express";
import auditLogService, {
  extractClientIp,
  resolveRequestOfficeId,
  resolveRequestTenantId,
} from "../services/auditLog.service.js";

const MODULE_NAME_MAP: Record<string, string> = {
  cases: "Cases",
  hearings: "Hearings",
  document: "Documents",
  documents: "Documents",
  documentfolder: "Documents",
  task: "Tasks",
  tasks: "Tasks",
  "task-comments": "Tasks",
  appointments: "Appointments",
  clients: "Clients",
  advocates: "Advocates",
  offices: "Offices",
  invoices: "Billing",
  user: "Users",
  users: "Users",
  role: "Security",
  permission: "Security",
  tenant: "Settings",
  subscriptions: "Subscriptions",
  tenantsubscription: "Subscriptions",
  companies: "Companies",
  courts: "Courts",
  reminders: "Reminders",
  "support-tickets": "Support",
  "case-actions": "Cases",
};

const SENSITIVE_KEYS = new Set([
  "password",
  "oldpassword",
  "newpassword",
  "confirmpassword",
  "token",
  "refreshtoken",
  "refresh_token",
  "access_token",
  "accesstoken",
  "otp",
  "secret",
  "authorization",
]);

function sanitizeRequestBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      sanitized[key] = sanitizeRequestBody(val);
    } else {
      sanitized[key] = val;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function resolveModuleName(req: Request): string {
  const url = (req.originalUrl || req.url || "").toLowerCase();
  if (url.includes("/mobile/auth") || url.includes("/mobile-auth")) {
    return "Authentication";
  }

  const segments = req.baseUrl
    ? req.baseUrl.split("/").filter(Boolean)
    : req.path.split("/").filter(Boolean);

  const raw = segments[1] || segments[0] || "General";
  const normalized = raw.toLowerCase();

  return (
    MODULE_NAME_MAP[normalized] ||
    raw.charAt(0).toUpperCase() + raw.slice(1)
  );
}

type AuditPayload = Record<string, string | number | boolean | null | undefined>;

function generateHumanFriendlyDescription(
  entity: string,
  action: string,
  req: Request,
  entityId: string | null,
): string {
  const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body
    : {}) as AuditPayload;
  const url = (req.originalUrl || req.url || "").toLowerCase();

  // 1. Mobile & Web Authentication
  if (entity === "Authentication" || url.includes("/mobile/auth") || url.includes("/auth")) {
    if (url.includes("login")) {
      return url.includes("mobile")
        ? "Logged in via Mobile Chamber App"
        : "Logged in via Web Portal";
    }
    if (url.includes("logout")) {
      return url.includes("mobile")
        ? "Logged out from Mobile Chamber App"
        : "Logged out from Web Portal";
    }
    if (url.includes("refresh")) {
      return "Refreshed session credentials";
    }
    if (url.includes("register")) {
      return "Registered new chamber account";
    }
  }

  // 2. Cases
  if (entity === "Cases") {
    const caseRef = body.caseNumber
      ? `"${body.caseNumber}"`
      : body.title
      ? `"${body.title}"`
      : "";

    if (url.includes("/assign")) {
      const advocate = body.advocateName || body.assignedTo || "advocate";
      return `Assigned case ${caseRef} to ${advocate}`.trim();
    }
    if (action === "CREATE") {
      return caseRef ? `Created case ${caseRef}` : "Created new litigation case";
    }
    if (action === "UPDATE") {
      return caseRef ? `Updated case ${caseRef}` : "Updated case details";
    }
    if (action === "DELETE") {
      return caseRef ? `Deleted case ${caseRef}` : "Deleted case record";
    }
  }

  // 3. Clients
  if (entity === "Clients") {
    const name = `${body.firstName || body.name || ""} ${body.lastName || ""}`.trim() || body.companyName;
    if (action === "CREATE") {
      return name ? `Added client "${name}"` : "Added new client to directory";
    }
    if (action === "UPDATE") {
      return name ? `Updated client "${name}"` : "Updated client profile";
    }
    if (action === "DELETE") {
      return name ? `Removed client "${name}"` : "Deleted client record";
    }
  }

  // 4. Advocates
  if (entity === "Advocates") {
    const name = `${body.firstName || body.name || ""} ${body.lastName || ""}`.trim();
    if (action === "CREATE") {
      return name ? `Added advocate "${name}" to chamber` : "Added new advocate to chamber";
    }
    if (action === "UPDATE") {
      return name ? `Updated advocate profile for "${name}"` : "Updated advocate details";
    }
    if (action === "DELETE") {
      return name ? `Removed advocate "${name}" from chamber` : "Deleted advocate record";
    }
  }

  // 5. Appointments
  if (entity === "Appointments") {
    const purpose = body.purpose ? `"${body.purpose}"` : "consultation";
    const dateFormatted = body.date
      ? `on ${new Date(String(body.date)).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}`
      : "";
    if (url.includes("/status")) {
      return `Updated appointment status to "${body.status || "updated"}"`;
    }
    if (action === "CREATE") {
      return `Scheduled appointment for ${purpose} ${dateFormatted}`.trim();
    }
    if (action === "UPDATE") {
      return `Rescheduled appointment for ${purpose} ${dateFormatted}`.trim();
    }
    if (action === "DELETE") {
      return "Cancelled scheduled appointment";
    }
  }

  // 6. Hearings
  if (entity === "Hearings") {
    const court = body.court || body.courtName ? `at ${body.court || body.courtName}` : "";
    const caseRef = body.caseNumber ? `for Case "${body.caseNumber}"` : "";
    const dateFormatted = body.hearingDate
      ? `on ${new Date(String(body.hearingDate)).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}`
      : "";
    if (action === "CREATE") {
      return `Scheduled court hearing ${caseRef} ${dateFormatted} ${court}`.trim();
    }
    if (action === "UPDATE") {
      const reason = body.adjournmentReason || body.notes ? ` (Reason: "${body.adjournmentReason || body.notes}")` : "";
      return `Adjourned / Rescheduled hearing ${caseRef} to ${dateFormatted} ${court}${reason}`.trim();
    }
    if (action === "DELETE") {
      return `Cancelled scheduled court hearing ${caseRef}`.trim();
    }
  }

  // 7. Invoices / Billing / Fee Receipts
  if (entity === "Billing" || entity === "Invoices") {
    if (url.includes("receipt")) {
      const receiptNo = body.receiptNumber ? `#${body.receiptNumber}` : "";
      const amt = body.amount ? `₹${Number(body.amount).toLocaleString("en-IN")}` : "";
      const mode = body.paymentMode || body.mode ? `via ${body.paymentMode || body.mode}` : "";
      if (action === "CREATE") {
        return `Recorded fee payment receipt ${receiptNo} ${amt ? `of ${amt}` : ""} ${mode}`.trim();
      }
      if (action === "UPDATE") {
        return `Updated payment receipt ${receiptNo} ${amt ? `(${amt})` : ""}`.trim();
      }
      if (action === "DELETE") {
        return `Cancelled / Voided payment receipt ${receiptNo}`.trim();
      }
    }

    const inv = body.invoiceNumber ? `#${body.invoiceNumber}` : "";
    const amt = body.total || body.amount ? `₹${Number(body.total || body.amount).toLocaleString("en-IN")}` : "";
    const client = body.clientName || body.client ? `for Client "${body.clientName || body.client}"` : "";
    if (action === "CREATE") {
      return `Generated invoice ${inv} ${amt ? `for ${amt}` : ""} ${client}`.trim();
    }
    if (action === "UPDATE") {
      return `Updated invoice ${inv} details ${amt ? `(${amt})` : ""}`.trim();
    }
    if (action === "DELETE") {
      return `Deleted / Cancelled invoice ${inv}`.trim();
    }
  }

  // 8. Documents
  if (entity === "Documents") {
    const docName = body.name || body.title || body.fileName ? `"${body.name || body.title || body.fileName}"` : "";
    if (action === "CREATE") {
      return docName ? `Uploaded document ${docName}` : "Uploaded new case document";
    }
    if (action === "UPDATE") {
      return docName ? `Updated document ${docName}` : "Updated document";
    }
    if (action === "DELETE") {
      return docName ? `Deleted document ${docName}` : "Deleted document";
    }
  }

  // 9. Tasks
  if (entity === "Tasks") {
    const taskName = body.title ? `"${body.title}"` : "";
    if (action === "CREATE") {
      return taskName ? `Created task ${taskName}` : "Assigned new chamber task";
    }
    if (action === "UPDATE") {
      return taskName ? `Updated task ${taskName}` : "Updated task status";
    }
    if (action === "DELETE") {
      return taskName ? `Deleted task ${taskName}` : "Deleted chamber task";
    }
  }

  // 10. Security / Roles
  if (entity === "Security") {
    const roleName = body.name ? `"${body.name}"` : "";
    if (action === "CREATE") {
      return roleName ? `Created chamber role ${roleName}` : "Created new chamber role";
    }
    if (action === "UPDATE") {
      return roleName ? `Updated permissions for role ${roleName}` : "Updated role permissions";
    }
    if (action === "DELETE") {
      return roleName ? `Deleted chamber role ${roleName}` : "Deleted chamber role";
    }
  }

  // 11. Offices / Branches
  if (entity === "Offices") {
    const officeName = body.name ? `"${body.name}"` : "";
    if (action === "CREATE") {
      return officeName ? `Added chamber branch ${officeName}` : "Added new chamber branch";
    }
    if (action === "UPDATE") {
      return officeName ? `Updated chamber branch ${officeName}` : "Updated branch details";
    }
    if (action === "DELETE") {
      return officeName ? `Removed branch ${officeName}` : "Deleted branch office";
    }
  }

  // 12. Default Fallback
  const idSuffix = entityId ? ` (${entityId.slice(0, 8)})` : "";
  switch (action) {
    case "CREATE":
      return `Created new ${entity.toLowerCase()} record${idSuffix}`;
    case "UPDATE":
      return `Updated ${entity.toLowerCase()} record${idSuffix}`;
    case "DELETE":
      return `Removed ${entity.toLowerCase()} record${idSuffix}`;
    case "EXPORT":
      return `Exported ${entity} data`;
    default:
      return `${action} performed on ${entity}`;
  }
}

export const autoAuditMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const method = req.method.toUpperCase();
  const url = req.originalUrl || req.url;
  const lowerUrl = url.toLowerCase();
  const isExport = lowerUrl.includes("export") || lowerUrl.includes("download");

  // Exclude all authentication, login, logout, password, OTP, and session endpoints.
  // Also exclude personal user notification inbox actions (advocates reading/dismissing their personal alerts).
  // A law firm owner's audit log is strictly for operational business actions
  // (Cases, Hearings, Invoices, Payments, Clients, Documents, Chamber Roles).
  // Routine logins and self-notification dismissals are personal UI actions, NOT chamber business events.
  if (
    lowerUrl.includes("/auth") ||
    lowerUrl.includes("/mobile/auth") ||
    lowerUrl.includes("/login") ||
    lowerUrl.includes("/logout") ||
    lowerUrl.includes("/refresh") ||
    lowerUrl.includes("/otp") ||
    lowerUrl.includes("/password") ||
    lowerUrl.includes("/token") ||
    lowerUrl.includes("/notifications") ||
    lowerUrl.includes("/notification")
  ) {
    return next();
  }

  let action: string | null = null;
  if (isExport) {
    action = "EXPORT";
  } else if (method === "POST") {
    action = "CREATE";
  } else if (method === "PUT" || method === "PATCH") {
    action = "UPDATE";
  } else if (method === "DELETE") {
    action = "DELETE";
  }

  if (!action) {
    return next();
  }

  // Skip audit viewing endpoints to avoid infinite recursion
  if (url.includes("/api/audit-logs") && !isExport) {
    return next();
  }

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return;
    }

    try {
      const tenantId = resolveRequestTenantId(req);
      const officeId = resolveRequestOfficeId(req);
      const userId = req.user?.userId || null;

      if (!tenantId && !officeId) {
        return;
      }

      const entity = resolveModuleName(req);
      const entityId =
        (res.locals.auditEntityId as string) ||
        req.params?.id ||
        (req.body && typeof req.body.id === "string" ? req.body.id : null) ||
        null;

      const description =
        (res.locals.auditDescription as string) ||
        generateHumanFriendlyDescription(entity, action!, req, entityId);

      const ipAddress = extractClientIp(req);
      const details =
        res.locals.auditDetails ||
        (action !== "EXPORT" && req.body ? sanitizeRequestBody(req.body) : null);

      auditLogService.record({
        tenantId,
        officeId,
        userId,
        entity,
        entityId,
        action: action!,
        description,
        ipAddress,
        details,
      });
    } catch (err: unknown) {
      console.error("[autoAuditMiddleware] Error capturing audit log:", err);
    }
  });

  next();
};

export default autoAuditMiddleware;
