import { Router } from "express";
import auth from "../middleware/auth.js";
import officeGuard from "../middleware/officeGuard.js";
import { permissionGuard } from "../middleware/permission.js";
import auditLogController from "../controller/audit/auditLog.controller.js";

const router = Router();

// GET /api/audit-logs (Tenant & Office based)
router.get(
  "/",
  auth,
  officeGuard,
  permissionGuard("audit.read"),
  auditLogController.getAuditLogs,
);

// GET /api/audit-logs/export
router.get(
  "/export",
  auth,
  officeGuard,
  permissionGuard("audit.export"),
  auditLogController.exportAuditLogs,
);

export default router;
