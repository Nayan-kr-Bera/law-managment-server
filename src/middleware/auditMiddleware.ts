import { Request, Response, NextFunction } from "express";
import auditLogService, {
  extractClientIp,
  resolveRequestOfficeId,
  resolveRequestTenantId,
} from "../services/auditLog.service.js";

// Standard module names mapped from URL segment
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

// Sensitive property keys to scrub from recorded details
const SENSITIVE_KEYS = new Set([
  "password",
  "oldpassword",
  "newpassword",
  "confirmpassword",
  "token",
  "refreshtoken",
  "accesstoken",
  "otp",
  "secret",
  "authorization",
]);

/**
 * Strips sensitive credentials from request body before logging to JSONB
 */
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

/**
 * Infers human-readable module name from Express request path
 */
function resolveModuleName(req: Request): string {
  const segments = req.baseUrl
    ? req.baseUrl.split("/").filter(Boolean)
    : req.path.split("/").filter(Boolean);

  // e.g. /api/cases -> segments = ['api', 'cases']
  const raw = segments[1] || segments[0] || "General";
  const normalized = raw.toLowerCase();

  return (
    MODULE_NAME_MAP[normalized] ||
    raw.charAt(0).toUpperCase() + raw.slice(1)
  );
}

/**
 * Global Automatic Audit Middleware
 * Intercepts CREATE, UPDATE, DELETE, and EXPORT actions and records them with
 * tenantId, officeId, userId, and client IP without blocking or delaying the API response.
 */
export const autoAuditMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const method = req.method.toUpperCase();
  const url = req.originalUrl || req.url;
  const isExport = url.toLowerCase().includes("export") || url.toLowerCase().includes("download");

  // Determine action
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

  // Only audit state-changing mutations or exports
  if (!action) {
    return next();
  }

  // Skip audit viewing endpoints to avoid infinite recursion
  if (url.includes("/api/audit-logs") && !isExport) {
    return next();
  }

  // Skip authentication and OTP endpoints where user/tenant context is not yet established
  if (url.startsWith("/api/auth/login") || url.startsWith("/api/otp")) {
    return next();
  }

  // Listen for response completion
  res.on("finish", () => {
    // Only record successful operations (HTTP 200 - 299)
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return;
    }

    try {
      const tenantId = resolveRequestTenantId(req);
      const officeId = resolveRequestOfficeId(req);
      const userId = req.user?.userId || null;

      // Only record events that belong to a tenant or office context
      if (!tenantId && !officeId) {
        return;
      }

      const entity = resolveModuleName(req);
      const entityId =
        (res.locals.auditEntityId as string) ||
        req.params?.id ||
        (req.body && typeof req.body.id === "string" ? req.body.id : null) ||
        null;

      // Extract or generate friendly description
      let description = res.locals.auditDescription as string | undefined;
      if (!description) {
        const idSuffix = entityId ? ` (ID: ${entityId.slice(0, 8)})` : "";
        switch (action) {
          case "CREATE":
            description = `Created new record in ${entity}${idSuffix}`;
            break;
          case "UPDATE":
            description = `Updated ${entity} record${idSuffix}`;
            break;
          case "DELETE":
            description = `Deleted ${entity} record${idSuffix}`;
            break;
          case "EXPORT":
            description = `Exported data from ${entity}`;
            break;
          default:
            description = `${action} performed on ${entity}`;
        }
      }

      const ipAddress = extractClientIp(req);
      const details =
        res.locals.auditDetails ||
        (action !== "EXPORT" && req.body ? sanitizeRequestBody(req.body) : null);

      // Asynchronous record (non-blocking)
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
