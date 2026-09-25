// ===== ENUMS =====
export * from "./enum.js";
export {default as systemAlerts} from "./systemAlerts.js"
// Core
export { default as tenants } from "./tenants.js";
export { default as offices } from "./offices.js";
export { default as user } from "./users.js";
export { default as userScopes } from "./userScope.js";
export { default as refreshTokens } from "./refreshToken.js";
export { default as emailOtp } from "./emailOtp.js";
export { default as userScopeOffices } from "./userscopeoffices.js";

// Authorization

export { default as roles } from "./rolePermission/roles.js";
export { default as permissions } from "./rolePermission/permission.js";
export { default as rolePermissions } from "./rolePermission/rolePermission.js";
export { default as userRoles } from "./rolePermission/userRoles.js";
export { default as userPermissions } from "./rolePermission/userPermission.js";

// Clients

export { default as clients } from "./clients/clients.js";
export { default as clientProfiles } from "./clients/clientProfiles.js";
export { default as clientConsents } from "./clients/clientConsents.js";
export { default as clientLedger } from "./clients/clientLedger.js";

// Advocates

export { default as advocates } from "./advocates/advocates.js";
export { default as partners } from "./advocates/partners.js";

// Case Management

export { default as cases } from "./caseMangment/cases.js";
export { default as hearings } from "./caseMangment/hearings.js";
export { default as hearingOrders } from "./caseMangment/hearingOrders.js";

export { default as caseUpdates } from "./caseMangment/caseUpdates.js";
export { default as caseAdvocates } from "./caseMangment/caseAdvocates.js";
export { default as caseClients } from "./caseMangment/caseClients.js";

export { default as caseDeadlines } from "./caseMangment/caseDeadlines.js";
export { default as caseExpenses } from "./caseMangment/caseExpenses.js";

export { default as caseNotes } from "./caseMangment/caseNotes.js";
export { default as caseTags } from "./caseMangment/caseTags.js";

export { default as caseTimelines } from "./caseMangment/caseTimelines.js";
export { default as caseStatusHistory } from "./caseMangment/caseStatusHistory.js";

export { default as caseCustomFieldValues } from "./caseMangment/caseCustomFieldValues.js";

export { default as caseLinks } from "./caseMangment/caseLinks.js";
export { default as caseDecisions } from "./caseMangment/caseDecision.js";

// Documents

export { default as documentFolders } from "./documents/documentFolders.js";
export { default as caseDocuments } from "./documents/caseDocuments.js";

// Master Data

export { default as caseTypes } from "./masterData/caseTypes.js";
export { default as courts } from "./masterData/courts.js";
export { default as policeStations } from "./masterData/policeStations.js";
export { default as companies } from "./masterData/companies.js";
export { default as empanelments } from "./masterData/empanelments.js";
export { default as underSections } from "./masterData/underSections.js";
export { default as customFields } from "./masterData/customFields.js";
export { default as customFieldOptions } from "./masterData/customFieldOptions.js";
export { default as tags } from "./masterData/tags.js";

// Tasks & Calendar

export { default as tasks } from "./task/tasks.js";
export { default as appointments } from "./task/appointments.js";
export { default as reminders } from "./task/reminders.js";
export { default as customReminders } from "./task/customReminders.js";
export { default as taskComments } from "./task/taskComments.js";
export { default as taskTimelines } from "./task/taskTimelines.js";
// Finance

export { default as invoices } from "./finance/invoices.js";
export { default as invoiceItems } from "./finance/invoiceItems.js";
export { default as payments } from "./finance/payments.js";

// Notifications

export { default as notifications } from "./notifications/notifications.js";
export { default as notificationTemplates } from "./notifications/notificationTemplates.js";
export { default as notificationQueue } from "./notifications/notificationQueue.js";
export { default as notificationLogs } from "./notifications/notificationLogs.js";

// AI

export { default as aiDrafts } from "./ai/aiDrafts.js";

// Court Integration

export { default as courtSyncs } from "./integrations/courtSyncs.js";
export { default as causeLists } from "./integrations/causeLists.js";

// Audit

export { default as auditLogs } from "./audit/auditLogs.js";

/// subscription
export { default as subscriptionPlans } from "./subscription/subscriptionPlans.js";

export {
  default as tenantSubscriptions,
} from "./subscription/tenantSubscriptions.js";

export {
  default as subscriptionPaymentHistory,
} from "./subscription/subscriptionPaymentHistory.js";

// Support Tickets
export { default as supportTickets } from "./support/supportTickets.js";
export { default as supportTicketMessages } from "./support/supportTicketMessages.js";

// Contact Us & Inquiries
export { default as contactUsMessages } from "./contactUs.js";