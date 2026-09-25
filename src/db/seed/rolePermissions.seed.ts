import { eq } from "drizzle-orm";
import db from "../index.js";
import { permissions, rolePermissions, roles } from "../schema/index.js";

export default async function seedRolePermissions() {
  const [superAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.slug, "super_admin"));

  const [tenantAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.slug, "tenant_admin"));

  if (!superAdminRole || !tenantAdminRole) {
    throw new Error("Required roles not found");
  }

  const allPermissions = await db.select().from(permissions);

  const permissionMap = new Map(
    allPermissions.map((permission) => [permission.code, permission.id]),
  );

  // Super Admin gets everything
  const superAdminPermissions = allPermissions.map((permission) => ({
    roleId: superAdminRole.id,
    permissionId: permission.id,
  }));

  // Tenant Admin permissions
  const TENANT_ADMIN_PERMISSIONS = [
    // Dashboard
    "dashboard.read",
    "dashboard.export",

    // Search
    "search.read",

    // Calendar
    "calendar.read",
    "calendar.create",
    "calendar.update",
    "calendar.delete",

    // Users
    "user.read",
    "user.create",
    "user.update",
    "user.delete",
    "user.assign_role",
    "user_permission.manage",

    // Advocates
    "advocate.read",
    "advocate.create",
    "advocate.update",
    "advocate.delete",

    // Partners
    "partner.read",
    "partner.create",
    "partner.update",
    "partner.delete",

    // Roles
    "role.read",
    "role.create",
    "role.update",
    "role.delete",
    "role.assign",

    // Clients
    "client.read",
    "client.create",
    "client.update",
    "client.delete",
    "client.export",

    // Cases
    "case.read",
    "case.create",
    "case.update",
    "case.delete",
    "case.export",
    "case.assign",
    "case.status_update",

    // Hearings
    "hearing.read",
    "hearing.create",
    "hearing.update",
    "hearing.delete",

    // Documents
    "document.read",
    "document.create",
    "document.upload",
    "document.update",
    "document.delete",
    "document.download",
    "document.share",

    // AI Drafter
    "ai_drafter.use",

    // Tasks
    "task.read",
    "task.create",
    "task.update",
    "task.delete",
    "task.assign",

    // Reminders
    "reminder.read",
    "reminder.create",
    "reminder.update",
    "reminder.delete",

    // Appointments
    "appointment.read",
    "appointment.create",
    "appointment.update",
    "appointment.delete",

    // Billing
    "billing.read",
    "billing.create",
    "billing_history.read",

    // Invoices
    "invoice.read",
    "invoice.create",
    "invoice.update",
    "invoice.delete",
    "invoice.download",

    // Payments
    "payment.read",
    "payment.create",
    "payment.update",
    "payment.delete",

    // Case Types
    "case_type.read",
    "case_type.create",
    "case_type.update",
    "case_type.delete",

    // Courts
    "court.read",
    "court.create",
    "court.update",
    "court.delete",

    // Police Stations
    "police_station.read",
    "police_station.create",
    "police_station.update",
    "police_station.delete",

    // Companies
    "company.read",
    "company.create",
    "company.update",
    "company.delete",

    // Under Sections
    "under_section.read",
    "under_section.create",
    "under_section.update",
    "under_section.delete",

    // Empanelments
    "empanelment.read",
    "empanelment.create",
    "empanelment.update",
    "empanelment.delete",

    // Custom Fields
    "custom_field.read",
    "custom_field.create",
    "custom_field.update",
    "custom_field.delete",

    // Case Labels
    "case_label.read",
    "case_label.create",
    "case_label.update",
    "case_label.delete",

    // Notifications
    "notification.read",
    "notification.create",
    "notification.update",
    "notification.delete",

    // Settings
    "settings.read",
    "settings.update",

    // Tenant
    "tenant.read",
    "tenant.update",

    // Workspaces
    "workspace.read",
    "workspace.switch",

    // Offices
    "office.read",
    "office.create",
    "office.update",
    "office.delete",

    // Audit
    "audit.read",
    "audit.export",

    // Reports
    "report.read",
    "report.export",
  ];
  const tenantAdminPermissions = TENANT_ADMIN_PERMISSIONS.map((code) =>
    permissionMap.get(code),
  )
    .filter((id): id is string => Boolean(id))
    .map((permissionId) => ({
      roleId: tenantAdminRole.id,
      permissionId,
    }));
  await db
    .insert(rolePermissions)
    .values([...superAdminPermissions, ...tenantAdminPermissions])
    .onConflictDoNothing();

  console.log("✅ Role permissions seeded");
}
