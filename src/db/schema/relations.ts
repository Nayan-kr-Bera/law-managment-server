// Relations
// Core
export { userRelation } from "./users.js";
export { tenantRelation } from "./tenants.js";
export { officeRelation } from "./offices.js";
export { userScopeRelation } from "./userScope.js";
export { userScopeOfficeRelation } from "./userscopeoffices.js";
export { refreshTokenRelations } from "./refreshToken.js";
export { emailOtpRelations } from "./emailOtp.js";

// Authorization
export { roleRelations } from "./rolePermission/roles.js";
export { permissionRelations } from "./rolePermission/permission.js";
export { rolePermissionRelations } from "./rolePermission/rolePermission.js";
export { userRoleRelations } from "./rolePermission/userRoles.js";
export { userPermissionRelations } from "./rolePermission/userPermission.js";

// Clients
export { clientRelation } from "./clients/clients.js";
export { clientUserRelation } from "./clients/clientUsers.js";
export { clientConsentRelation } from "./clients/clientConsents.js";
export { clientLedgerRelation } from "./clients/clientLedger.js";
// Advocates
export { advocateRelation } from "./advocates/advocates.js";
export { partnerRelation } from "./advocates/partners.js";

// Case Management
export { caseRelation } from "./caseMangment/cases.js";
export { hearingRelation } from "./caseMangment/hearings.js";
export { hearingOrderRelation } from "./caseMangment/hearingOrders.js";
export { caseUpdateRelation } from "./caseMangment/caseUpdates.js";
export { caseAdvocateRelation } from "./caseMangment/caseAdvocates.js";
export { caseClientRelation } from "./caseMangment/caseClients.js";
export { caseDeadlineRelation } from "./caseMangment/caseDeadlines.js";
export { caseExpenseRelation } from "./caseMangment/caseExpenses.js";
export { caseNoteRelation } from "./caseMangment/caseNotes.js";
export { caseTagRelation } from "./caseMangment/caseTags.js";
export { caseTimelineRelation } from "./caseMangment/caseTimelines.js";
export { caseStatusHistoryRelation } from "./caseMangment/caseStatusHistory.js";
export { caseCustomFieldValueRelation } from "./caseMangment/caseCustomFieldValues.js";
export { caseLinksRelations } from "./caseMangment/caseLinks.js";
export {caseDecisionRelations}from "./caseMangment/caseDecision.js"
// Documents
export { documentFolderRelation } from "./documents/documentFolders.js";
export { caseDocumentRelation } from "./documents/caseDocuments.js";

// Master Data
export { caseTypeRelation } from "./masterData/caseTypes.js";
export { courtRelation } from "./masterData/courts.js";
export { policeStationRelation } from "./masterData/policeStations.js";
export { companyRelation } from "./masterData/companies.js";
export { empanelmentRelation } from "./masterData/empanelments.js";
export { underSectionRelation } from "./masterData/underSections.js";
export { customFieldRelation } from "./masterData/customFields.js";
export { customFieldOptionRelation } from "./masterData/customFieldOptions.js";
export { tagRelation } from "./masterData/tags.js";

// Tasks
export { taskRelation } from "./task/tasks.js";
export { appointmentRelation } from "./task/appointments.js";
export { reminderRelation } from "./task/reminders.js";
export { customReminderRelation } from "./task/customReminders.js";
export { taskCommentRelations } from "./task/taskComments.js";

// Finance
export { invoiceRelation } from "./finance/invoices.js";
export { invoiceItemRelation } from "./finance/invoiceItems.js";
export { paymentRelation } from "./finance/payments.js";

// Notifications
export { notificationRelation } from "./notifications/notifications.js";
export { notificationTemplateRelation } from "./notifications/notificationTemplates.js";
export { notificationQueueRelation } from "./notifications/notificationQueue.js";
export { notificationLogRelation } from "./notifications/notificationLogs.js";

// AI
export { aiDraftRelation } from "./ai/aiDrafts.js";

// Integrations
export { courtSyncRelation } from "./integrations/courtSyncs.js";
export { causeListRelation } from "./integrations/causeLists.js";

// Audit
export { auditLogRelation } from "./audit/auditLogs.js";

//subscription
export {subscriptionPaymentHistoryRelation} from "./subscription/subscriptionPaymentHistory.js"
export {tenantSubscriptionRelation} from "./subscription/tenantSubscriptions.js"
export {subscriptionPlanRelations} from "./subscription/subscriptionPlans.js"

// Support
export { supportTicketRelations } from "./support/supportTickets.js";
export { supportTicketMessageRelations } from "./support/supportTicketMessages.js";