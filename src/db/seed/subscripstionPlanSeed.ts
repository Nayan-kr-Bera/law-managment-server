import db from "../index.js";
import { subscriptionPlans } from "../schema/index.js";

const subscriptionPlansData = [
  {
    code: "free_trial",

    name: "Free Trial",

    tagline: "Try the platform before choosing a subscription.",

    description:
      "A limited trial plan for new tenants to explore core legal practice management features.",

    monthlyPrice: "0.00",

    annualPrice: "0.00",

    currency: "INR",

    maxUsers: 1,

    maxOffices: 1,

    maxStorageGb: 2,

    monthlyOcrPages: 10,

    monthlyAiDrafts: 4,

    features: [
      "All Premium Features Unlocked for Trial",
      "Registered Advocate Account",
      "Chamber / Office Location",
      "Active Daily Cause List",
      "Advanced Case Management",
      "Client Management & Client Portal",
      "Advanced Document Management",
      "10 Pages Free OCR Brief Indexing & Search",
      "4 Free AI Legal Court Drafts",
      "Tasks & Reminders",
      "Billing & Invoices Preview",
      "Multiple Offices Preview",
      "Advanced User Management",
      "Role & Permission Management",
      "Advanced Notifications",
    ],

    badge: "Full Access Trial",

    isPopular: false,

    isActive: true,

    isInternal: false,
  },
  // INTERNAL PLAN

  {
    code: "internal",

    name: "Internal Full Access",

    tagline: "Internal unrestricted subscription",

    description:
      "Internal subscription plan with full access to all platform features and resources.",

    monthlyPrice: "0.00",

    annualPrice: "0.00",

    currency: "INR",

    maxUsers: 999999,

    maxOffices: 999999,

    maxStorageGb: 999999,

    monthlyOcrPages: 999999,

    monthlyAiDrafts: 999999,

    features: [],

    badge: "Internal",

    isPopular: false,

    isActive: true,

    isInternal: true,
  },

  // SOLO PRACTICE

  {
    code: "solo",

    name: "Solo Practice",

    tagline:
      "Essential digital workspace for independent legal advocates managing daily cause lists, case dockets, and basic drafts.",

    description:
      "For independent advocates managing a single office and their daily legal practice.",

    monthlyPrice: "999.00",

    annualPrice: "799.00",

    currency: "INR",

    maxUsers: 1,

    maxOffices: 1,

    maxStorageGb: 15,

    monthlyOcrPages: 0,

    monthlyAiDrafts: 3,

    features: [
      "Registered Advocate Account",
      "Chamber / Office Location",
      "Active Daily Cause List",
      "Case Management",
      "Advanced Case Management",
      "Client Management",
      "Basic Document Management",
      "Tasks & Reminders",
      "3 AI Legal Drafts / month",
    ],

    badge: "For Solo Advocates",

    isPopular: false,

    isActive: true,

    isInternal: false,
  },

  // PROFESSIONAL

  {
    code: "professional",

    name: "Professional",

    tagline:
      "Powerful practice management for advocates and growing legal teams.",

    description:
      "For advocates managing multiple users, offices, clients and cases.",

    monthlyPrice: "1999.00",

    annualPrice: "1599.00",

    currency: "INR",

    maxUsers: 5,

    maxOffices: 2,

    maxStorageGb: 50,

    monthlyOcrPages: 500,

    monthlyAiDrafts: 15,

    features: [
      "Everything in Solo Practice",
      "Multiple Advocate Accounts",
      "Multiple Office Locations",
      "Advanced Case Management",
      "Client Portal",
      "Document Management",
      "500 Pages/month OCR Brief Indexing & Search",
      "15 AI Legal Drafts / month",
      "Tasks & Reminders",
      "Notifications",
    ],

    badge: "Popular",

    isPopular: true,

    isActive: true,

    isInternal: false,
  },

  // LAW FIRM

  {
    code: "law_firm",

    name: "Law Firm",

    tagline: "Complete legal practice management for established law firms.",

    description:
      "For growing law firms requiring multiple advocates, offices and advanced practice management.",

    monthlyPrice: "3999.00",

    annualPrice: "3199.00",

    currency: "INR",

    maxUsers: 15,

    maxOffices: 5,

    maxStorageGb: 150,

    monthlyOcrPages: 1500,

    monthlyAiDrafts: 30,

    features: [
      "Everything in Professional",
      "Multiple Offices",
      "Advanced User Management",
      "Role & Permission Management",
      "Advanced Client Portal",
      "Advanced Document Management",
      "1,500 Pages/month OCR Brief Indexing & Search",
      "30 AI Legal Drafts / month",
      "Billing & Invoices",
      "Payment Tracking",
      "Advanced Notifications",
    ],

    badge: "For Law Firms",

    isPopular: false,

    isActive: true,

    isInternal: false,
  },
];

// SEED FUNCTION
async function seedSubscriptionPlans() {
  for (const plan of subscriptionPlansData) {
    await db
      .insert(subscriptionPlans)
      .values(plan)
      .onConflictDoUpdate({
        target: subscriptionPlans.code,
        set: {
          monthlyOcrPages: plan.monthlyOcrPages,
          monthlyAiDrafts: plan.monthlyAiDrafts,
          features: plan.features,
        },
      });
  }

  console.log("✅ Subscription plans seeded and updated successfully");
}

export default seedSubscriptionPlans;
