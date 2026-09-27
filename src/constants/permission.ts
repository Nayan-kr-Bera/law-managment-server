export interface PermissionDefinition {
  code: string;
  description: string;
  isAdminPortal?: boolean;
}

export const PERMISSIONS: PermissionDefinition[] = [
  // ==========================================
  // CLIENT / TENANT PORTAL PERMISSIONS (isAdminPortal: false)
  // ==========================================

  // Dashboard
  { code: "dashboard.read", description: "View dashboard", isAdminPortal: false },
  { code: "dashboard.export", description: "Export dashboard data", isAdminPortal: false },

  // Search
  { code: "search.read", description: "Use search", isAdminPortal: false },

  // Calendar
  { code: "calendar.read", description: "View calendar", isAdminPortal: false },
  { code: "calendar.create", description: "Create calendar events", isAdminPortal: false },
  { code: "calendar.update", description: "Update calendar events", isAdminPortal: false },
  { code: "calendar.delete", description: "Delete calendar events", isAdminPortal: false },

  // Users
  { code: "user.read", description: "View users", isAdminPortal: false },
  { code: "user.create", description: "Create users", isAdminPortal: false },
  { code: "user.update", description: "Update users", isAdminPortal: false },
  { code: "user.delete", description: "Delete users", isAdminPortal: false },
  { code: "user.assign_role", description: "Assign roles to users", isAdminPortal: false },
  { code: "user_permission.manage", description: "Manage user and advocate specific permissions", isAdminPortal: false },

  // Advocates
  { code: "advocate.read", description: "View advocates", isAdminPortal: false },
  { code: "advocate.create", description: "Create advocates", isAdminPortal: false },
  { code: "advocate.update", description: "Update advocates", isAdminPortal: false },
  { code: "advocate.delete", description: "Delete advocates", isAdminPortal: false },

  // Partners
  { code: "partner.read", description: "View partners", isAdminPortal: false },
  { code: "partner.create", description: "Create partners", isAdminPortal: false },
  { code: "partner.update", description: "Update partners", isAdminPortal: false },
  { code: "partner.delete", description: "Delete partners", isAdminPortal: false },

  // Roles
  { code: "role.read", description: "View roles", isAdminPortal: false },
  { code: "role.create", description: "Create roles", isAdminPortal: false },
  { code: "role.update", description: "Update roles", isAdminPortal: false },
  { code: "role.delete", description: "Delete roles", isAdminPortal: false },
  { code: "role.assign", description: "Assign roles and permissions", isAdminPortal: false },

  // Clients
  { code: "client.read", description: "View clients", isAdminPortal: false },
  { code: "client.create", description: "Create clients", isAdminPortal: false },
  { code: "client.update", description: "Update clients", isAdminPortal: false },
  { code: "client.delete", description: "Delete clients", isAdminPortal: false },
  { code: "client.export", description: "Export clients", isAdminPortal: false },

  // Cases
  { code: "case.read", description: "View cases", isAdminPortal: false },
  { code: "case.create", description: "Create cases", isAdminPortal: false },
  { code: "case.update", description: "Update cases", isAdminPortal: false },
  { code: "case.delete", description: "Delete cases", isAdminPortal: false },
  { code: "case.export", description: "Export cases", isAdminPortal: false },
  { code: "case.assign", description: "Assign cases", isAdminPortal: false },
  { code: "case.status_update", description: "Update case status", isAdminPortal: false },

  // Hearings
  { code: "hearing.read", description: "View hearings", isAdminPortal: false },
  { code: "hearing.create", description: "Create hearings", isAdminPortal: false },
  { code: "hearing.update", description: "Update hearings", isAdminPortal: false },
  { code: "hearing.delete", description: "Delete hearings", isAdminPortal: false },

  // Documents & AI Drafter
  { code: "document.read", description: "View documents", isAdminPortal: false },
  { code: "document.create", description: "Create documents", isAdminPortal: false },
  { code: "document.upload", description: "Upload documents", isAdminPortal: false },
  { code: "document.update", description: "Update documents", isAdminPortal: false },
  { code: "document.delete", description: "Delete documents", isAdminPortal: false },
  { code: "document.download", description: "Download documents", isAdminPortal: false },
  { code: "document.share", description: "Share documents", isAdminPortal: false },
  { code: "document.ocr", description: "Extract OCR and Search Scanned Documents", isAdminPortal: false },
  { code: "ai_drafter.use", description: "Use AI drafter", isAdminPortal: false },

  // Tasks
  { code: "task.read", description: "View tasks", isAdminPortal: false },
  { code: "task.read_all", description: "View all chamber tasks", isAdminPortal: false },
  { code: "task.create", description: "Create tasks", isAdminPortal: false },
  { code: "task.update", description: "Update tasks", isAdminPortal: false },
  { code: "task.delete", description: "Delete tasks", isAdminPortal: false },
  { code: "task.assign", description: "Assign tasks", isAdminPortal: false },
  { code: "task.reassign", description: "Reassign tasks", isAdminPortal: false },
  { code: "task.timeline", description: "View task activity timeline and performance tracking", isAdminPortal: false },

  // Reminders
  { code: "reminder.read", description: "View reminders", isAdminPortal: false },
  { code: "reminder.create", description: "Create reminders", isAdminPortal: false },
  { code: "reminder.update", description: "Update reminders", isAdminPortal: false },
  { code: "reminder.delete", description: "Delete reminders", isAdminPortal: false },

  // Appointments
  { code: "appointment.read", description: "View appointments", isAdminPortal: false },
  { code: "appointment.create", description: "Create appointments", isAdminPortal: false },
  { code: "appointment.update", description: "Update appointments", isAdminPortal: false },
  { code: "appointment.delete", description: "Delete appointments", isAdminPortal: false },

  // Billing / Finance
  { code: "billing.read", description: "View billing", isAdminPortal: false },
  { code: "billing.create", description: "Create billing records", isAdminPortal: false },
  { code: "billing_history.read", description: "View billing history", isAdminPortal: false },

  // Invoices
  { code: "invoice.read", description: "View invoices", isAdminPortal: false },
  { code: "invoice.create", description: "Create invoices", isAdminPortal: false },
  { code: "invoice.update", description: "Update invoices", isAdminPortal: false },
  { code: "invoice.delete", description: "Delete invoices", isAdminPortal: false },
  { code: "invoice.download", description: "Download invoices", isAdminPortal: false },

  // Payments
  { code: "payment.read", description: "View payments", isAdminPortal: false },
  { code: "payment.create", description: "Create payments", isAdminPortal: false },
  { code: "payment.update", description: "Update payments", isAdminPortal: false },
  { code: "payment.delete", description: "Delete payments", isAdminPortal: false },

  // Master Data - Case Types
  { code: "case_type.read", description: "View case types", isAdminPortal: false },
  { code: "case_type.create", description: "Create case types", isAdminPortal: false },
  { code: "case_type.update", description: "Update case types", isAdminPortal: false },
  { code: "case_type.delete", description: "Delete case types", isAdminPortal: false },

  // Master Data - Courts
  { code: "court.read", description: "View courts", isAdminPortal: false },
  { code: "court.create", description: "Create courts", isAdminPortal: false },
  { code: "court.update", description: "Update courts", isAdminPortal: false },
  { code: "court.delete", description: "Delete courts", isAdminPortal: false },

  // Master Data - Police Stations
  { code: "police_station.read", description: "View police stations", isAdminPortal: false },
  { code: "police_station.create", description: "Create police stations", isAdminPortal: false },
  { code: "police_station.update", description: "Update police stations", isAdminPortal: false },
  { code: "police_station.delete", description: "Delete police stations", isAdminPortal: false },

  // Master Data - Companies
  { code: "company.read", description: "View companies", isAdminPortal: false },
  { code: "company.create", description: "Create companies", isAdminPortal: false },
  { code: "company.update", description: "Update companies", isAdminPortal: false },
  { code: "company.delete", description: "Delete companies", isAdminPortal: false },

  // Master Data - Under Sections
  { code: "under_section.read", description: "View under sections", isAdminPortal: false },
  { code: "under_section.create", description: "Create under sections", isAdminPortal: false },
  { code: "under_section.update", description: "Update under sections", isAdminPortal: false },
  { code: "under_section.delete", description: "Delete under sections", isAdminPortal: false },

  // Master Data - Empanelments
  { code: "empanelment.read", description: "View empanelments", isAdminPortal: false },
  { code: "empanelment.create", description: "Create empanelments", isAdminPortal: false },
  { code: "empanelment.update", description: "Update empanelments", isAdminPortal: false },
  { code: "empanelment.delete", description: "Delete empanelments", isAdminPortal: false },

  // Master Data - Custom Fields
  { code: "custom_field.read", description: "View custom fields", isAdminPortal: false },
  { code: "custom_field.create", description: "Create custom fields", isAdminPortal: false },
  { code: "custom_field.update", description: "Update custom fields", isAdminPortal: false },
  { code: "custom_field.delete", description: "Delete custom fields", isAdminPortal: false },

  // Master Data - Case Labels
  { code: "case_label.read", description: "View case labels", isAdminPortal: false },
  { code: "case_label.create", description: "Create case labels", isAdminPortal: false },
  { code: "case_label.update", description: "Update case labels", isAdminPortal: false },
  { code: "case_label.delete", description: "Delete case labels", isAdminPortal: false },

  // Notifications
  { code: "notification.read", description: "View notifications", isAdminPortal: false },
  { code: "notification.create", description: "Create notifications", isAdminPortal: false },
  { code: "notification.update", description: "Update notifications", isAdminPortal: false },
  { code: "notification.delete", description: "Delete notifications", isAdminPortal: false },

  // Settings
  { code: "settings.read", description: "View settings", isAdminPortal: false },
  { code: "settings.update", description: "Update settings", isAdminPortal: false },

  // Tenant / SaaS Workspace
  { code: "tenant.read", description: "View tenant settings", isAdminPortal: false },
  { code: "tenant.create", description: "Create tenants", isAdminPortal: false },
  { code: "tenant.update", description: "Update tenant settings", isAdminPortal: false },
  { code: "tenant.delete", description: "Delete tenants", isAdminPortal: false },

  // Workspaces
  { code: "workspace.read", description: "View workspaces", isAdminPortal: false },
  { code: "workspace.switch", description: "Switch workspaces", isAdminPortal: false },

  // Office Management
  { code: "office.read", description: "View offices", isAdminPortal: false },
  { code: "office.create", description: "Create offices", isAdminPortal: false },
  { code: "office.update", description: "Update offices", isAdminPortal: false },
  { code: "office.delete", description: "Delete offices", isAdminPortal: false },

  // Audit Logs
  { code: "audit.read", description: "View audit logs", isAdminPortal: false },
  { code: "audit.export", description: "Export audit logs", isAdminPortal: false },

  // Reports
  { code: "report.read", description: "View reports", isAdminPortal: false },
  { code: "report.export", description: "Export reports", isAdminPortal: false },

  // ==========================================
  // ADMIN CONSOLE / PLATFORM PERMISSIONS (isAdminPortal: true)
  // ==========================================

  // Admin Dashboard & Metrics
  { code: "admin.dashboard.read", description: "Access Admin Dashboard, MRR and platform analytics", isAdminPortal: true },

  // Admin Tenants / Law Firms Management
  { code: "admin.tenants.read", description: "View registered law firms and practices", isAdminPortal: true },
  { code: "admin.tenants.create", description: "Provision new law firm tenants", isAdminPortal: true },
  { code: "admin.tenants.update", description: "Update tenant parameters and firm profile", isAdminPortal: true },
  { code: "admin.tenants.delete", description: "Decommission or delete tenant firms", isAdminPortal: true },
  { code: "admin.tenants.status", description: "Activate, suspend or reactivate law firms", isAdminPortal: true },

  // Admin Subscription Plans & Pricing
  { code: "admin.plans.read", description: "View subscription plans, pricing and limits", isAdminPortal: true },
  { code: "admin.plans.create", description: "Create new subscription plans and tiers", isAdminPortal: true },
  { code: "admin.plans.update", description: "Update subscription plan pricing and feature flags", isAdminPortal: true },
  { code: "admin.plans.delete", description: "Archive or delete subscription plans", isAdminPortal: true },

  // Admin Tenant Subscriptions & Billing Ledger
  { code: "admin.subscriptions.read", description: "View all tenant active subscriptions and transactions", isAdminPortal: true },
  { code: "admin.subscriptions.manage", description: "Manually assign, upgrade or cancel subscriptions", isAdminPortal: true },

  // Admin Cross-Tenant Users & RBAC
  { code: "admin.users.read", description: "View global directory of all system users", isAdminPortal: true },
  { code: "admin.users.create", description: "Create departmental admin users", isAdminPortal: true },
  { code: "admin.users.update", description: "Update user status, roles and permissions", isAdminPortal: true },
  { code: "admin.users.delete", description: "Delete or ban user accounts", isAdminPortal: true },

  // Admin Helpdesk & Leads
  { code: "admin.support.read", description: "View support tickets and contact inquiries", isAdminPortal: true },
  { code: "admin.support.update", description: "Respond to and update support tickets status", isAdminPortal: true },

  // Admin Security & Audit Trail
  { code: "admin.audit.read", description: "View immutable platform security audit logs", isAdminPortal: true },
  { code: "admin.audit.export", description: "Export security logs and authentication events", isAdminPortal: true },

  // Admin Platform Settings
  { code: "admin.settings.read", description: "View global platform runtime settings", isAdminPortal: true },
  { code: "admin.settings.update", description: "Update master architecture and maintenance mode", isAdminPortal: true },
];