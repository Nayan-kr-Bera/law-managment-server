import { Request, Response, NextFunction } from "express";
import { and, eq, desc, ilike, or, count, not, inArray, type SQL } from "drizzle-orm";
import db from "../../db/index.js";
import { auditLogs, user } from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

function cleanHumanDetails(
  details: string,
  rawDetails: unknown,
  module: string,
  action: string,
): string {
  if (
    !details ||
    details.startsWith("Created new record in") ||
    details.startsWith("Updated") ||
    details.startsWith("Deleted") ||
    details.includes("in Mobile")
  ) {
    const raw =
      rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails)
        ? (rawDetails as Record<string, unknown>)
        : {};

    if (
      module.toLowerCase().includes("mobile") ||
      details.includes("in Mobile") ||
      raw.deviceId
    ) {
      return "Logged in via Mobile Chamber App";
    }
    if (
      module.toLowerCase().includes("auth") ||
      module.toLowerCase().includes("login")
    ) {
      return "User authentication activity";
    }
    if (raw.caseNumber || raw.title) {
      const ref = raw.caseNumber ? `"${String(raw.caseNumber)}"` : `"${String(raw.title)}"`;
      if (action === "CREATE") return `Created case ${ref}`;
      if (action === "UPDATE") return `Updated case ${ref}`;
      if (action === "DELETE") return `Deleted case ${ref}`;
    }
    if (raw.firstName || raw.companyName) {
      const name =
        `${String(raw.firstName || "")} ${String(raw.lastName || "")}`.trim() ||
        String(raw.companyName || "");
      if (action === "CREATE") return `Added client "${name}"`;
      if (action === "UPDATE") return `Updated client "${name}"`;
    }
    if (raw.invoiceNumber) {
      const amt =
        raw.total || raw.amount ? ` (₹${String(raw.total || raw.amount)})` : "";
      return `Generated invoice #${String(raw.invoiceNumber)}${amt}`;
    }
    if (raw.purpose) {
      return `Scheduled appointment for "${String(raw.purpose)}"`;
    }
    if (raw.name && (module === "Security" || module === "Roles")) {
      return `Configured role "${String(raw.name)}"`;
    }
    if (raw.name && module === "Offices") {
      return `Chamber branch "${String(raw.name)}"`;
    }
  }
  return details;
}

function extractAuditHighlights(rawDetails: unknown): Record<string, string> | null {
  if (
    !rawDetails ||
    typeof rawDetails !== "object" ||
    Array.isArray(rawDetails)
  ) {
    return null;
  }

  const raw = rawDetails as Record<string, unknown>;
  const highlights: Record<string, string> = {};

  if (raw.caseNumber) {
    highlights["Case Number"] = String(raw.caseNumber);
  }
  if (raw.title) {
    highlights["Title"] = String(raw.title);
  }
  if (raw.clientName) {
    highlights["Client"] = String(raw.clientName);
  } else if (raw.firstName || raw.companyName) {
    highlights["Client"] =
      `${String(raw.firstName || "")} ${String(raw.lastName || "")}`.trim() ||
      String(raw.companyName);
  }
  if (raw.advocateName) {
    highlights["Advocate"] = String(raw.advocateName);
  }
  if (raw.invoiceNumber) {
    highlights["Invoice #"] = String(raw.invoiceNumber);
  }
  if (raw.total || raw.amount) {
    highlights["Amount"] = `₹${Number(
      raw.total || raw.amount,
    ).toLocaleString("en-IN")}`;
  }
  if (raw.purpose) {
    highlights["Purpose"] = String(raw.purpose);
  }
  if (raw.mode) {
    highlights["Mode"] = String(raw.mode)
      .replace(/_/g, " ")
      .toUpperCase();
  }
  if (raw.status) {
    highlights["Status"] = String(raw.status).toUpperCase();
  }
  if (raw.date || raw.hearingDate) {
    const d = new Date(String(raw.date || raw.hearingDate));
    if (!isNaN(d.getTime())) {
      highlights["Date"] = d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }
  if (raw.court || raw.courtName) {
    highlights["Court"] = String(raw.court || raw.courtName);
  }
  if (raw.name) {
    highlights["Name"] = String(raw.name);
  }
  if (raw.deviceId) {
    highlights["Device"] = `Mobile Device (${String(
      raw.deviceId,
    ).slice(0, 8)}...)`;
  }

  return Object.keys(highlights).length > 0 ? highlights : null;
}

const auditLogController = {
  async getAuditLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response | void> {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant ID missing in request"),
        );
      }

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
      const offset = (page - 1) * limit;

      const { module, action, search, officeId } = req.query as {
        module?: string;
        action?: string;
        search?: string;
        officeId?: string;
      };

      const conditions: SQL<unknown>[] = [eq(auditLogs.tenantId, tenantId)];

      if (officeId && officeId.trim() !== "" && officeId !== "all") {
        conditions.push(eq(auditLogs.officeId, officeId));
      }

      if (module && module.trim() !== "" && module !== "all") {
        conditions.push(ilike(auditLogs.entity, module));
      } else {
        // Exclude authentication telemetry, device sessions, and personal notification inbox actions
        conditions.push(not(inArray(auditLogs.entity, ["Authentication", "Mobile", "Auth", "Notifications", "Notification"])));
      }

      if (action && action.trim() !== "" && action !== "all") {
        conditions.push(eq(auditLogs.action, action.toUpperCase()));
      }

      if (search && search.trim() !== "") {
        const queryTerm = `%${search.trim()}%`;
        const searchCond = or(
          ilike(auditLogs.description, queryTerm),
          ilike(auditLogs.ipAddress, queryTerm),
          ilike(auditLogs.action, queryTerm),
          ilike(user.name, queryTerm),
          ilike(user.email, queryTerm),
        );
        if (searchCond) {
          conditions.push(searchCond);
        }
      }

      const whereClause = and(...conditions);

      const [totalResult] = await db
        .select({ total: count() })
        .from(auditLogs)
        .leftJoin(user, eq(auditLogs.userId, user.id))
        .where(whereClause);

      const total = totalResult?.total || 0;

      const rawLogs = await db
        .select({
          id: auditLogs.id,
          timestamp: auditLogs.createdAt,
          action: auditLogs.action,
          module: auditLogs.entity,
          ipAddress: auditLogs.ipAddress,
          details: auditLogs.description,
          rawDetails: auditLogs.details,
          userName: user.name,
          userEmail: user.email,
        })
        .from(auditLogs)
        .leftJoin(user, eq(auditLogs.userId, user.id))
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const formattedLogs = rawLogs.map((log) => {
        const actionStr = (log.action || "UPDATE").toUpperCase();
        const moduleStr = log.module || "General";
        const cleanedDetails = cleanHumanDetails(
          log.details || "System operation performed.",
          log.rawDetails,
          moduleStr,
          actionStr,
        );

        return {
          id: log.id,
          timestamp: log.timestamp
            ? new Date(log.timestamp).toISOString()
            : new Date().toISOString(),
          user: log.userName || log.userEmail || "Chamber Administrator",
          userEmail: log.userEmail || "",
          userRole: log.userName ? "Advocate / Staff" : "Managing Partner",
          action: actionStr,
          module: moduleStr === "Mobile" ? "Authentication" : moduleStr,
          ipAddress: (log.ipAddress || "127.0.0.1").replace(/^::ffff:/, ""),
          details: cleanedDetails,
          highlights: extractAuditHighlights(log.rawDetails),
          rawDetails: log.rawDetails,
        };
      });

      return res.status(200).send(
        ResponseHandler(200, "Audit logs retrieved successfully", {
          logs: formattedLogs,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
        }),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch audit logs";
      console.error("[auditLogController.getAuditLogs] Error:", err);
      return next(CustomErrorHandler.serverError(message));
    }
  },

  async exportAuditLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response | void> {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing"));
      }

      const { module, action, search, officeId } = req.query as {
        module?: string;
        action?: string;
        search?: string;
        officeId?: string;
      };

      const conditions: SQL<unknown>[] = [eq(auditLogs.tenantId, tenantId)];

      if (officeId && officeId.trim() !== "" && officeId !== "all") {
        conditions.push(eq(auditLogs.officeId, officeId));
      }
      if (module && module.trim() !== "" && module !== "all") {
        conditions.push(ilike(auditLogs.entity, module));
      } else {
        // Exclude authentication telemetry, device sessions, and personal notification inbox actions
        conditions.push(not(inArray(auditLogs.entity, ["Authentication", "Mobile", "Auth", "Notifications", "Notification"])));
      }
      if (action && action.trim() !== "" && action !== "all") {
        conditions.push(eq(auditLogs.action, action.toUpperCase()));
      }
      if (search && search.trim() !== "") {
        const queryTerm = `%${search.trim()}%`;
        const searchCond = or(
          ilike(auditLogs.description, queryTerm),
          ilike(auditLogs.ipAddress, queryTerm),
          ilike(auditLogs.action, queryTerm),
          ilike(user.name, queryTerm),
          ilike(user.email, queryTerm),
        );
        if (searchCond) {
          conditions.push(searchCond);
        }
      }

      const logs = await db
        .select({
          id: auditLogs.id,
          createdAt: auditLogs.createdAt,
          action: auditLogs.action,
          module: auditLogs.entity,
          ipAddress: auditLogs.ipAddress,
          description: auditLogs.description,
          rawDetails: auditLogs.details,
          userName: user.name,
          userEmail: user.email,
        })
        .from(auditLogs)
        .leftJoin(user, eq(auditLogs.userId, user.id))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1000);

      const rows = logs.map((log) => {
        const actionStr = (log.action || "UPDATE").toUpperCase();
        const moduleStr = log.module || "General";
        const cleanedDetails = cleanHumanDetails(
          log.description || "",
          log.rawDetails,
          moduleStr,
          actionStr,
        );

        return {
          Timestamp: log.createdAt
            ? new Date(log.createdAt).toLocaleString("en-IN")
            : "",
          User: log.userName
            ? `${log.userName} (${log.userEmail})`
            : "Chamber Administrator",
          Action: actionStr,
          Module: moduleStr === "Mobile" ? "Authentication" : moduleStr,
          IPAddress: (log.ipAddress || "127.0.0.1").replace(/^::ffff:/, ""),
          ActivityDescription: cleanedDetails,
        };
      });

      return res.status(200).send(
        ResponseHandler(200, "Audit logs exported successfully", rows),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to export audit logs";
      console.error("[auditLogController.exportAuditLogs] Error:", err);
      return next(CustomErrorHandler.serverError(message));
    }
  },
};

export default auditLogController;
