export const PERMISSIONS = [
  // Dashboard
  { code: "dashboard.read", description: "View dashboard" },
  { code: "dashboard.export", description: "Export dashboard data" },

  // Search
  { code: "search.read", description: "Use search" },

  // Calendar
  { code: "calendar.read", description: "View calendar" },
  { code: "calendar.create", description: "Create calendar events" },
  { code: "calendar.update", description: "Update calendar events" },
  { code: "calendar.delete", description: "Delete calendar events" },

  // Users
  { code: "user.read", description: "View users" },
  { code: "user.create", description: "Create users" },
  { code: "user.update", description: "Update users" },
  { code: "user.delete", description: "Delete users" },
  { code: "user.assign_role", description: "Assign roles to users" },
  { code: "user_permission.manage", description: "Manage user and advocate specific permissions" },

  // Advocates
  { code: "advocate.read", description: "View advocates" },
  { code: "advocate.create", description: "Create advocates" },
  { code: "advocate.update", description: "Update advocates" },
  { code: "advocate.delete", description: "Delete advocates" },

  // Partners
  { code: "partner.read", description: "View partners" },
  { code: "partner.create", description: "Create partners" },
  { code: "partner.update", description: "Update partners" },
  { code: "partner.delete", description: "Delete partners" },

  // Roles
  { code: "role.read", description: "View roles" },
  { code: "role.create", description: "Create roles" },
  { code: "role.update", description: "Update roles" },
  { code: "role.delete", description: "Delete roles" },
  { code: "role.assign", description: "Assign roles and permissions" },

  // Clients
  { code: "client.read", description: "View clients" },
  { code: "client.create", description: "Create clients" },
  { code: "client.update", description: "Update clients" },
  { code: "client.delete", description: "Delete clients" },
  { code: "client.export", description: "Export clients" },

  // Cases
  { code: "case.read", description: "View cases" },
  { code: "case.create", description: "Create cases" },
  { code: "case.update", description: "Update cases" },
  { code: "case.delete", description: "Delete cases" },
  { code: "case.export", description: "Export cases" },
  { code: "case.assign", description: "Assign cases" },
  { code: "case.status_update", description: "Update case status" },

  // Hearings
  { code: "hearing.read", description: "View hearings" },
  { code: "hearing.create", description: "Create hearings" },
  { code: "hearing.update", description: "Update hearings" },
  { code: "hearing.delete", description: "Delete hearings" },

  // Documents & AI Drafter
  { code: "document.read", description: "View documents" },
  { code: "document.create", description: "Create documents" },
  { code: "document.upload", description: "Upload documents" },
  { code: "document.update", description: "Update documents" },
  { code: "document.delete", description: "Delete documents" },
  { code: "document.download", description: "Download documents" },
  { code: "document.share", description: "Share documents" },
  { code: "document.ocr", description: "Extract OCR and Search Scanned Documents" },
  { code: "ai_drafter.use", description: "Use AI drafter" },

  // Tasks
  { code: "task.read", description: "View tasks" },
  { code: "task.read_all", description: "View all chamber tasks" },
  { code: "task.create", description: "Create tasks" },
  { code: "task.update", description: "Update tasks" },
  { code: "task.delete", description: "Delete tasks" },
  { code: "task.assign", description: "Assign tasks" },
  { code: "task.reassign", description: "Reassign tasks" },
  { code: "task.timeline", description: "View task activity timeline and performance tracking" },

  // Reminders
  { code: "reminder.read", description: "View reminders" },
  { code: "reminder.create", description: "Create reminders" },
  { code: "reminder.update", description: "Update reminders" },
  { code: "reminder.delete", description: "Delete reminders" },

  // Appointments
  { code: "appointment.read", description: "View appointments" },
  { code: "appointment.create", description: "Create appointments" },
  { code: "appointment.update", description: "Update appointments" },
  { code: "appointment.delete", description: "Delete appointments" },

  // Billing / Finance
  { code: "billing.read", description: "View billing" },
  { code: "billing.create", description: "Create billing records" },
  { code: "billing_history.read", description: "View billing history" },

  // Invoices
  { code: "invoice.read", description: "View invoices" },
  { code: "invoice.create", description: "Create invoices" },
  { code: "invoice.update", description: "Update invoices" },
  { code: "invoice.delete", description: "Delete invoices" },
  { code: "invoice.download", description: "Download invoices" },

  // Payments
  { code: "payment.read", description: "View payments" },
  { code: "payment.create", description: "Create payments" },
  { code: "payment.update", description: "Update payments" },
  { code: "payment.delete", description: "Delete payments" },

  // Master Data - Case Types
  { code: "case_type.read", description: "View case types" },
  { code: "case_type.create", description: "Create case types" },
  { code: "case_type.update", description: "Update case types" },
  { code: "case_type.delete", description: "Delete case types" },

  // Master Data - Courts
  { code: "court.read", description: "View courts" },
  { code: "court.create", description: "Create courts" },
  { code: "court.update", description: "Update courts" },
  { code: "court.delete", description: "Delete courts" },

  // Master Data - Police Stations
  { code: "police_station.read", description: "View police stations" },
  { code: "police_station.create", description: "Create police stations" },
  { code: "police_station.update", description: "Update police stations" },
  { code: "police_station.delete", description: "Delete police stations" },

  // Master Data - Companies
  { code: "company.read", description: "View companies" },
  { code: "company.create", description: "Create companies" },
  { code: "company.update", description: "Update companies" },
  { code: "company.delete", description: "Delete companies" },

  // Master Data - Under Sections
  { code: "under_section.read", description: "View under sections" },
  { code: "under_section.create", description: "Create under sections" },
  { code: "under_section.update", description: "Update under sections" },
  { code: "under_section.delete", description: "Delete under sections" },

  // Master Data - Empanelments
  { code: "empanelment.read", description: "View empanelments" },
  { code: "empanelment.create", description: "Create empanelments" },
  { code: "empanelment.update", description: "Update empanelments" },
  { code: "empanelment.delete", description: "Delete empanelments" },

  // Master Data - Custom Fields
  { code: "custom_field.read", description: "View custom fields" },
  { code: "custom_field.create", description: "Create custom fields" },
  { code: "custom_field.update", description: "Update custom fields" },
  { code: "custom_field.delete", description: "Delete custom fields" },

  // Master Data - Case Labels
  { code: "case_label.read", description: "View case labels" },
  { code: "case_label.create", description: "Create case labels" },
  { code: "case_label.update", description: "Update case labels" },
  { code: "case_label.delete", description: "Delete case labels" },

  // Notifications
  { code: "notification.read", description: "View notifications" },
  { code: "notification.create", description: "Create notifications" },
  { code: "notification.update", description: "Update notifications" },
  { code: "notification.delete", description: "Delete notifications" },

  // Settings
  { code: "settings.read", description: "View settings" },
  { code: "settings.update", description: "Update settings" },

  // Tenant / SaaS
  { code: "tenant.read", description: "View tenant settings" },
  { code: "tenant.create", description: "Create tenants" },
  { code: "tenant.update", description: "Update tenant settings" },
  { code: "tenant.delete", description: "Delete tenants" },

  // Workspaces
  { code: "workspace.read", description: "View workspaces" },
  { code: "workspace.switch", description: "Switch workspaces" },

  // Office Management
  { code: "office.read", description: "View offices" },
  { code: "office.create", description: "Create offices" },
  { code: "office.update", description: "Update offices" },
  { code: "office.delete", description: "Delete offices" },

  // Audit Logs
  { code: "audit.read", description: "View audit logs" },
  { code: "audit.export", description: "Export audit logs" },

  // Reports
  { code: "report.read", description: "View reports" },
  { code: "report.export", description: "Export reports" },
] as const;