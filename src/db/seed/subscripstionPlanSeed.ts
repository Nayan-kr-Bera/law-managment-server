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

    features: [
      "Registered Advocate Account",
      "Chamber / Office Location",
      "Active Daily Cause List",
      "Case Management",
      "Client Management",
      "Basic Document Management",
      "Tasks & Reminders",
    ],

    badge: "Free Trial",

    isPopular: false,

    isActive: true,

    isInternal: true,
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

    features: [
      "Registered Advocate Account",
      "Chamber / Office Location",
      "Active Daily Cause List",
      "Case Management",
      "Client Management",
      "Basic Document Management",
      "Tasks & Reminders",
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

    features: [
      "Everything in Solo Practice",
      "Multiple Advocate Accounts",
      "Multiple Office Locations",
      "Advanced Case Management",
      "Client Portal",
      "Document Management",
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

    features: [
      "Everything in Professional",
      "Multiple Offices",
      "Advanced User Management",
      "Role & Permission Management",
      "Advanced Client Portal",
      "Advanced Document Management",
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
  await db
    .insert(subscriptionPlans)
    .values(subscriptionPlansData)
    .onConflictDoNothing();

  console.log("✅ Subscription plans seeded successfully");
}

export default seedSubscriptionPlans;
