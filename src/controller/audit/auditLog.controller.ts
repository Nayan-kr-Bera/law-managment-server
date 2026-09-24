import { Request, Response, NextFunction } from "express";
import { and, eq, desc, ilike, or, count, type SQL } from "drizzle-orm";
import db from "../../db/index.js";
import { auditLogs, user } from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

const auditLogController = {
  // 1. GET AUDIT LOGS (Tenant & Office based)
  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing in request"));
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

      // Base condition: always filter by tenantId (unless super admin)
      const conditions: SQL<unknown>[] = [eq(auditLogs.tenantId, tenantId)];

      // Office-based filtering (if provided)
      if (officeId && officeId.trim() !== "" && officeId !== "all") {
        conditions.push(eq(auditLogs.officeId, officeId));
      }

      // Module filter (Cases, Documents, Billing, Users, Settings, Tasks)
      if (module && module.trim() !== "" && module !== "all") {
        conditions.push(ilike(auditLogs.entity, module));
      }

      // Action filter (CREATE, UPDATE, DELETE, LOGIN, EXPORT)
      if (action && action.trim() !== "" && action !== "all") {
        conditions.push(eq(auditLogs.action, action.toUpperCase()));
      }

      // Search filter across description, IP, action, or user name/email
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

      // Check count
      const [totalResult] = await db
        .select({ total: count() })
        .from(auditLogs)
        .leftJoin(user, eq(auditLogs.userId, user.id))
        .where(whereClause);

      const total = totalResult?.total || 0;

      // Fetch paginated logs
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

      const formattedLogs = rawLogs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
        user: log.userName ? `${log.userName} (${log.userEmail})` : "System / Administrator",
        userRole: log.userName ? "Advocate / Staff" : "System Administrator",
        action: (log.action || "UPDATE").toUpperCase(),
        module: log.module || "General",
        ipAddress: log.ipAddress || "127.0.0.1",
        details: log.details || "System operation performed.",
        rawDetails: log.rawDetails,
      }));

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
      const message = err instanceof Error ? err.message : "Failed to fetch audit logs";
      console.error("[auditLogController.getAuditLogs] Error:", err);
      return next(CustomErrorHandler.serverError(message));
    }
  },

  // 2. EXPORT AUDIT LOGS
  async exportAuditLogs(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
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
          userName: user.name,
          userEmail: user.email,
        })
        .from(auditLogs)
        .leftJoin(user, eq(auditLogs.userId, user.id))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1000);

      const rows = logs.map((log) => ({
        Timestamp: log.createdAt ? new Date(log.createdAt).toLocaleString("en-IN") : "",
        User: log.userName ? `${log.userName} (${log.userEmail})` : "System / Administrator",
        Action: log.action,
        Module: log.module,
        IPAddress: log.ipAddress || "127.0.0.1",
        EventDescription: log.description || "",
      }));

      return res.status(200).send(
        ResponseHandler(200, "Audit logs exported successfully", rows),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to export audit logs";
      console.error("[auditLogController.exportAuditLogs] Error:", err);
      return next(CustomErrorHandler.serverError(message));
    }
  },
};

export default auditLogController;
