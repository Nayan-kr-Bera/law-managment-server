import { pgEnum } from "drizzle-orm/pg-core";

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "inactive",
  "suspended",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "free",
  "starter",
  "professional",
  "enterprise",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "inactive",
  "suspended",
  "invited",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "draft",
  "open",
  "pending",
  "in_progress",
  "stayed",
  "closed",
  "disposed",
  "archived",
]);

export const casePriorityEnum = pgEnum("case_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const reminderTypeEnum = pgEnum("reminder_type", [
  "email",
  "sms",
  "whatsapp",
  "push",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
  "read",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "email",
  "sms",
  "whatsapp",
  "push",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "upi",
  "bank_transfer",
  "card",
  "cheque",
  "online",
]);

export const courtTypeEnum = pgEnum("court_type", [
  "district",
  "high_court",
  "supreme_court",
  "nclt",
  "drt",
  "consumer",
  "family",
  "labour",
  "tribunal",
  "other",
]);

export const documentVisibilityEnum = pgEnum("document_visibility", [
  "private",
  "internal",
  "client",
]);

export const documentCategoryEnum = pgEnum("document_category", [
  "petition",
  "affidavit",
  "notice",
  "agreement",
  "contract",
  "court_order",
  "judgment",
  "evidence",
  "fir",
  "written_statement",
  "reply",
  "other",
]);

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "textarea",
  "number",
  "date",
  "datetime",
  "boolean",
  "email",
  "phone",
  "dropdown",
  "multi_select",
  "radio",
  "checkbox",
  "file",
]);

export const syncProviderEnum = pgEnum("sync_provider", [
  "ecourts",
  "high_court",
  "nclt",
  "drt",
  "manual",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "pending",
  "success",
  "failed",
]);

export const advocateDesignationEnum = pgEnum("advocate_designation", [
  "partner",
  "senior_advocate",
  "advocate",
  "associate",
  "junior_associate",
  "intern",
  "clerk",
]);

export const caseAssignmentRoleEnum = pgEnum("case_assignment_role", [
  "primary",
  "secondary",
  "reviewer",
  "assistant",
]);

export const expenseTypeEnum = pgEnum("expense_type", [
  "court_fee",
  "stamp_duty",
  "travel",
  "courier",
  "photocopy",
  "filing_fee",
  "clerk_charges",
  "other",
]);

export const aiDocumentTypeEnum = pgEnum("ai_document_type", [
  "bail_application",
  "petition",
  "legal_notice",
  "agreement",
  "reply",
  "affidavit",
  "written_statement",
  "other",
]);

export const clientUserStatusEnum = pgEnum("client_user_status", [
  "active",
  "inactive",
  "blocked",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "system",
  "case",
  "hearing",
  "task",
  "appointment",
  "invoice",
  "payment",
  "reminder",
]);
export const appointmentModeEnum = pgEnum("appointment_mode", [
  "in_person",
  "online",
  "phone",
]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "completed",
  "cancelled",
]);


export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "canceled",
  "expired",
  "past_due",
  "trial"
]);

export const billingCycleEnum = pgEnum("billing_cycle", [
  "monthly",
  "annual",
]);

export const subscriptionPaymentStatusEnum = pgEnum(
  "subscription_payment_status",
  ["paid", "pending", "failed", "refunded"]
);