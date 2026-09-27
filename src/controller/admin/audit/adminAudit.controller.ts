import { and, desc, eq, ilike, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import { auditLogs, user, tenants } from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";

const adminAuditController = {
  // =========================================================================
  // GET PLATFORM AUDIT LOGS
  // =========================================================================
  async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { entityType, page = "1", limit = "50" } = req.query as {
        entityType?: string;
        page?: string;
        limit?: string;
      };

      const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
      const pageNum = Math.max(1, Number(page) || 1);
      const offset = (pageNum - 1) * limitNum;

      const conditions: SQL[] = [];
      if (entityType && entityType !== "all") {
        conditions.push(ilike(auditLogs.entity, entityType));
      }

      const logs = await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entity,
          entityId: auditLogs.entityId,
          ipAddress: auditLogs.ipAddress,
          details: auditLogs.details,
          description: auditLogs.description,
          createdAt: auditLogs.createdAt,
          userName: user.name,
          userEmail: user.email,
          userId: user.id,
          tenantName: tenants.name,
        })
        .from(auditLogs)
        .leftJoin(user, eq(auditLogs.userId, user.id))
        .leftJoin(tenants, eq(auditLogs.tenantId, tenants.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limitNum)
        .offset(offset);

      const formattedLogs = logs.map((l) => ({
        id: l.id,
        action: l.action || "UPDATE",
        entityType: l.entityType || "System",
        entityId: l.entityId || undefined,
        performedBy: {
          id: l.userId || "system",
          name: l.userName || "System Administrator",
          email: l.userEmail || "admin@milawpractice.com",
        },
        tenantName: l.tenantName || undefined,
        ipAddress: l.ipAddress || "127.0.0.1",
        userAgent: "Admin Console Web",
        details: (l.details as Record<string, unknown>) || { description: l.description },
        createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
      }));

      return res.status(200).json(
        ResponseHandler(200, "Audit logs fetched successfully", formattedLogs)
      );
    } catch (error) {
      console.error("Admin get audit logs error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminAuditController;
