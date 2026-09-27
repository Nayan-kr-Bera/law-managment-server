import { Router } from "express";
import {
  adminAuthController,
  adminStatsController,
  adminTenantController,
  adminPlanController,
  adminSubscriptionController,
  adminUserController,
  adminSupportController,
  adminAuditController,
} from "../../controller/admin/index.js";
import adminAuth from "../../middleware/adminAuth.js";
import { upload } from "../../middleware/upload.js";

const router = Router();

/* =========================================================================
   ADMIN AUTHENTICATION & PROFILE
   ========================================================================= */
router.post("/auth/login", adminAuthController.login);
router.post("/auth/refresh-token", adminAuthController.refreshToken);
router.post("/auth/logout", adminAuth, adminAuthController.logout);
router.get("/auth/me", adminAuth, adminAuthController.getProfile);

/* =========================================================================
   ADMIN SYSTEM DASHBOARD / STATS
   ========================================================================= */
router.get("/stats", adminAuth, adminStatsController.getAdminStats);
router.get("/system-stats", adminAuth, adminStatsController.getAdminStats);

/* =========================================================================
   TENANTS MANAGEMENT
   ========================================================================= */
router.get("/tenants", adminAuth, adminTenantController.getTenants);
router.get("/tenants/:id", adminAuth, adminTenantController.getTenantById);
router.post("/tenants", adminAuth, adminTenantController.createTenant);
router.put("/tenants/:id", adminAuth, upload.single("logo"), adminTenantController.updateTenant);
router.delete("/tenants/:id", adminAuth, adminTenantController.deleteTenant);

/* =========================================================================
   SUBSCRIPTION PLANS MANAGEMENT
   ========================================================================= */
router.get("/plans", adminAuth, adminPlanController.getSubscriptionPlans);
router.get("/plans/:id", adminAuth, adminPlanController.getPlanById);
router.post("/plans", adminAuth, adminPlanController.createSubscriptionPlan);
router.put("/plans/:id", adminAuth, adminPlanController.updateSubscriptionPlan);
router.delete("/plans/:id", adminAuth, adminPlanController.deleteSubscriptionPlan);

/* =========================================================================
   TENANT SUBSCRIPTIONS & TRANSACTIONS
   ========================================================================= */
router.get("/subscriptions", adminAuth, adminSubscriptionController.getAllSubscriptions);
router.get("/payments", adminAuth, adminSubscriptionController.getPaymentTransactions);
router.post("/subscriptions/:tenantId/change-plan", adminAuth, adminSubscriptionController.assignTenantPlan);
router.post("/subscriptions/:tenantId/cancel", adminAuth, adminSubscriptionController.cancelTenantSubscription);

/* =========================================================================
   SYSTEM USERS MANAGEMENT
   ========================================================================= */
router.get("/users", adminAuth, adminUserController.getSystemUsers);
router.patch("/users/:userId/status", adminAuth, adminUserController.toggleUserStatus);

/* =========================================================================
   SUPPORT TICKETS & INQUIRIES
   ========================================================================= */
router.get("/support/tickets", adminAuth, adminSupportController.getSupportTickets);
router.patch("/support/tickets/:id/status", adminAuth, adminSupportController.updateTicketStatus);
router.get("/support/inquiries", adminAuth, adminSupportController.getContactInquiries);

/* =========================================================================
   AUDIT LOGS
   ========================================================================= */
router.get("/audit-logs", adminAuth, adminAuditController.getAuditLogs);

export default router;
