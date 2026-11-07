import { Request } from "express";
import db from "../db/index.js";
import { auditLogs } from "../db/schema/index.js";

export interface CreateAuditLogParams {
  tenantId?: string | null;
  officeId?: string | null;
  userId?: string | null;
  entity: "Cases" | "Documents" | "Billing" | "Users" | "Settings" | "Tasks" | "Clients" | "Advocates" | "Hearings" | "Appointments" | string;
  entityId?: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT" | string;
  description?: string | null;
  ipAddress?: string | null;
  details?: Record<string, unknown> | null;
}

export interface RequestAuditOptions {
  entity: string;
  entityId?: string | null;
  description?: string;
  details?: Record<string, unknown> | null;
  officeId?: string | null;
  tenantId?: string | null;
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  let ip = "";
  if (typeof forwarded === "string") {
    ip = forwarded.split(",")[0].trim();
  } else {
    ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
  }
  return ip.replace(/^::ffff:/, "");
}

export function resolveRequestTenantId(req: Request): string | null {
  return (
    req.user?.tenantId ||
    req.tenantId ||
    (typeof req.headers["x-tenant-id"] === "string" ? req.headers["x-tenant-id"] : null) ||
    null
  );
}

export function resolveRequestOfficeId(req: Request): string | null {
  const headerOffice = req.headers["x-office-id"];
  return (
    req.officeId ||
    (typeof headerOffice === "string" && headerOffice.trim() !== "" ? headerOffice : null) ||
    (req.body && typeof req.body.officeId === "string" ? req.body.officeId : null) ||
    (req.query && typeof req.query.officeId === "string" ? req.query.officeId : null) ||
    null
  );
}

export const auditLogService = {
  async record(params: CreateAuditLogParams) {
    try {
      const [entry] = await db
        .insert(auditLogs)
        .values({
          tenantId: params.tenantId || null,
          officeId: params.officeId || null,
          userId: params.userId || null,
          entity: params.entity,
          entityId: params.entityId || null,
          action: params.action.toUpperCase(),
          description: params.description || null,
          ipAddress: params.ipAddress || null,
          details: params.details || null,
        })
        .returning();

      return entry;
    } catch (err: unknown) {
      console.error("[auditLogService.record] Failed to write audit log:", err);
      return null;
    }
  },

  async logFromRequest(
    req: Request,
    action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "LOGIN" | string,
    options: RequestAuditOptions,
  ) {
    const tenantId = options.tenantId || resolveRequestTenantId(req);
    const officeId = options.officeId || resolveRequestOfficeId(req);
    const userId = req.user?.userId || null;
    const ipAddress = extractClientIp(req);

    return auditLogService.record({
      tenantId,
      officeId,
      userId,
      entity: options.entity,
      entityId: options.entityId || null,
      action: action.toUpperCase(),
      description: options.description || `${action.toUpperCase()} operation on ${options.entity}`,
      ipAddress,
      details: options.details || null,
    });
  },

  async logCreate(req: Request, options: RequestAuditOptions) {
    return auditLogService.logFromRequest(req, "CREATE", options);
  },

  async logUpdate(req: Request, options: RequestAuditOptions) {
    return auditLogService.logFromRequest(req, "UPDATE", options);
  },

  async logDelete(req: Request, options: RequestAuditOptions) {
    return auditLogService.logFromRequest(req, "DELETE", options);
  },

  async logExport(req: Request, options: RequestAuditOptions) {
    return auditLogService.logFromRequest(req, "EXPORT", options);
  },
};

export default auditLogService;
