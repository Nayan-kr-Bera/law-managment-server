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
  adminBareActController,
  adminJudgmentController,
  adminLeadsController,
} from "../../controller/admin/index.js";
import adminAuth from "../../middleware/adminAuth.js";
import { adminPermissionGuard } from "../../middleware/permission.js";
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
router.get("/stats", adminAuth, adminPermissionGuard("admin.dashboard.read"), adminStatsController.getAdminStats);
router.get("/system-stats", adminAuth, adminPermissionGuard("admin.dashboard.read"), adminStatsController.getAdminStats);

/* =========================================================================
   TENANTS MANAGEMENT
   ========================================================================= */
router.get("/tenants", adminAuth, adminPermissionGuard("admin.tenants.read"), adminTenantController.getTenants);
router.get("/tenants/ecosystem", adminAuth, adminPermissionGuard("admin.tenants.read"), adminTenantController.getTenantEcosystem);
router.get("/tenants/multi-org-customers", adminAuth, adminPermissionGuard("admin.tenants.read"), adminTenantController.getMultiOrgCustomers);
router.get("/tenants/user/:userId/organizations", adminAuth, adminPermissionGuard("admin.tenants.read"), adminTenantController.getUserOrganizations);
router.post("/tenants/provision-for-user", adminAuth, adminPermissionGuard("admin.tenants.create"), adminTenantController.provisionOrganizationForUser);
router.get("/tenants/:id", adminAuth, adminPermissionGuard("admin.tenants.read"), adminTenantController.getTenantById);
router.post("/tenants", adminAuth, adminPermissionGuard("admin.tenants.create"), adminTenantController.createTenant);
router.put("/tenants/:id", adminAuth, adminPermissionGuard("admin.tenants.update"), upload.single("logo"), adminTenantController.updateTenant);
router.delete("/tenants/:id", adminAuth, adminPermissionGuard("admin.tenants.delete"), adminTenantController.deleteTenant);

/* =========================================================================
   SUBSCRIPTION PLANS MANAGEMENT
   ========================================================================= */
router.get("/plans", adminAuth, adminPermissionGuard("admin.plans.read"), adminPlanController.getSubscriptionPlans);
router.get("/plans/:id", adminAuth, adminPermissionGuard("admin.plans.read"), adminPlanController.getPlanById);
router.post("/plans", adminAuth, adminPermissionGuard("admin.plans.create"), adminPlanController.createSubscriptionPlan);
router.put("/plans/:id", adminAuth, adminPermissionGuard("admin.plans.update"), adminPlanController.updateSubscriptionPlan);
router.delete("/plans/:id", adminAuth, adminPermissionGuard("admin.plans.delete"), adminPlanController.deleteSubscriptionPlan);

/* =========================================================================
   TENANT SUBSCRIPTIONS & TRANSACTIONS
   ========================================================================= */
router.get("/subscriptions", adminAuth, adminPermissionGuard("admin.subscriptions.read"), adminSubscriptionController.getAllSubscriptions);
router.get("/payments", adminAuth, adminPermissionGuard("admin.subscriptions.read"), adminSubscriptionController.getPaymentTransactions);
router.post("/subscriptions/:tenantId/change-plan", adminAuth, adminPermissionGuard("admin.subscriptions.manage"), adminSubscriptionController.assignTenantPlan);
router.post("/subscriptions/:tenantId/cancel", adminAuth, adminPermissionGuard("admin.subscriptions.manage"), adminSubscriptionController.cancelTenantSubscription);

/* =========================================================================
   SYSTEM USERS MANAGEMENT
   ========================================================================= */
router.get("/users/permissions", adminAuth, adminPermissionGuard("admin.users.read"), adminUserController.getAvailablePermissions);
router.get("/users", adminAuth, adminPermissionGuard("admin.users.read"), adminUserController.getSystemUsers);
router.post("/users", adminAuth, adminPermissionGuard("admin.users.create"), adminUserController.createAdminUser);
router.put("/users/:userId/permissions", adminAuth, adminPermissionGuard("admin.users.update"), adminUserController.updateAdminPermissions);
router.patch("/users/:userId/status", adminAuth, adminPermissionGuard("admin.users.update"), adminUserController.toggleUserStatus);

/* =========================================================================
   SUPPORT TICKETS & INQUIRIES
   ========================================================================= */
router.get("/support/stats", adminAuth, adminPermissionGuard("admin.support.read"), adminSupportController.getSupportStats);
router.get("/support/tickets", adminAuth, adminPermissionGuard("admin.support.read"), adminSupportController.getSupportTickets);
router.get("/support/tickets/:id", adminAuth, adminPermissionGuard("admin.support.read"), adminSupportController.getTicketById);
router.patch("/support/tickets/:id/status", adminAuth, adminPermissionGuard("admin.support.update"), adminSupportController.updateTicketStatus);
router.post("/support/tickets/:id/reply", adminAuth, adminPermissionGuard("admin.support.update"), adminSupportController.replyTicket);
router.get("/support/inquiries", adminAuth, adminPermissionGuard("admin.support.read"), adminSupportController.getContactInquiries);
router.patch("/support/inquiries/:id/status", adminAuth, adminPermissionGuard("admin.support.update"), adminSupportController.updateContactInquiryStatus);
router.post("/support/inquiries/:id/reply", adminAuth, adminPermissionGuard("admin.support.update"), adminSupportController.replyContactInquiry);

/* =========================================================================
   AUDIT LOGS
   ========================================================================= */
router.get("/audit-logs", adminAuth, adminPermissionGuard("admin.audit.read"), adminAuditController.getAuditLogs);

/* =========================================================================
   BARE ACTS & LEGISLATION REPOSITORY (ADMIN CURATION & SEEDING)
   ========================================================================= */
router.get("/bare-acts", adminAuth, adminPermissionGuard("admin.bare_acts.read"), adminBareActController.getActs);
router.get("/bare-acts/meta/slugs", adminAuth, adminPermissionGuard("admin.bare_acts.read"), adminBareActController.getActSlugs);
router.get("/bare-acts/:id", adminAuth, adminPermissionGuard("admin.bare_acts.read"), adminBareActController.getActById);
router.post("/bare-acts", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.createAct);
router.put("/bare-acts/:id", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.updateAct);
router.delete("/bare-acts/:id", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.deleteAct);

// Chapter routes
router.post("/bare-acts/:id/chapters", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.createChapter);
router.put("/bare-acts/chapters/:chapterId", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.updateChapter);
router.delete("/bare-acts/chapters/:chapterId", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.deleteChapter);
router.post("/bare-acts/chapters/:chapterId/assign-sections", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.assignSections);
router.post("/bare-acts/sections/unassign-chapter", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.unassignSections);

// Section routes
router.post("/bare-acts/:id/sections", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.createSection);
router.put("/bare-acts/sections/:sectionId", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.updateSection);
router.delete("/bare-acts/sections/:sectionId", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.deleteSection);

// Bulk Import & Seeding
router.post("/bare-acts/bulk-import", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.bulkImportAct);
router.post("/bare-acts/seed-library", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.seedLibrary);

// IndiaCode Live Integration (Search, Preview, 1-Click DB Import)
router.get("/bare-acts/indiacode/search", adminAuth, adminPermissionGuard("admin.bare_acts.read"), adminBareActController.searchIndiaCode);
router.get("/bare-acts/indiacode/preview/:actSlug", adminAuth, adminPermissionGuard("admin.bare_acts.read"), adminBareActController.previewIndiaCodeAct);
router.post("/bare-acts/indiacode/import", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminBareActController.importFromIndiaCode);

/* =========================================================================
   COURT JUDGMENTS MANAGEMENT & SEEDING
   ========================================================================= */
router.get("/judgments", adminAuth, adminPermissionGuard("admin.bare_acts.read"), adminJudgmentController.getJudgments);
router.post("/judgments", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminJudgmentController.createJudgment);
router.put("/judgments/:id", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminJudgmentController.updateJudgment);
router.delete("/judgments/:id", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminJudgmentController.deleteJudgment);
router.post("/judgments/seed-landmark", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminJudgmentController.seedLandmarkJudgments);
router.post("/judgments/import-ecourts", adminAuth, adminPermissionGuard("admin.bare_acts.manage"), adminJudgmentController.importFromEcourts);

/* =========================================================================
   STALLED CASES INTELLIGENCE & BUSINESS LEADS (Super Admin / BD Access)
   ========================================================================= */
router.get("/leads/stalled-cases", adminAuth, adminPermissionGuard("admin.leads.read"), adminLeadsController.getStalledCaseLeads);
router.get("/leads/stats", adminAuth, adminPermissionGuard("admin.leads.read"), adminLeadsController.getLeadStats);

export default router;

