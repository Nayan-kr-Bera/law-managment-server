import db from "../index.js";
import { subscriptionPlans } from "../schema/index.js";

const subscriptionPlansData = [
  // 1. FREE TRIAL (Onboarding trial - not displayed in commercial plans grid)
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
    monthlyOcrCredits: 100,
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
      "100 OCR Credits / month (10 Pages Indexing & Search)",
      "4 AI Legal Court Drafts (40 Draft Credits)",
      "Court Judgments Search & AI Precedent Chat",
      "Tasks & Reminders",
      "Billing & Invoices Preview",
      "Advanced Notifications",
    ],
    badge: "Full Access Trial",
    isPopular: false,
    isActive: true, // Active trial plan for registered tenants
    isInternal: false,
  },

  // 2. INTERNAL PLAN (Staff & platform maintenance)
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
    monthlyOcrCredits: 9999990,
    monthlyOcrPages: 999999,
    monthlyAiDrafts: 999999,
    features: [],
    badge: "Internal",
    isPopular: false,
    isActive: true,
    isInternal: true,
  },

  // 4. PROFESSIONAL (Starting tier: 3 offices, 20 advocates, 50 OCR pages, 15 AI drafts)
  {
    code: "professional",
    name: "Professional",
    tagline: "Modern practice management & AI tools for legal chambers and advocate practices.",
    description:
      "For independent counsel and expanding legal chambers managing multiple advocates, offices, clients and cases.",
    monthlyPrice: "1999.00",
    annualPrice: "1599.00",
    currency: "INR",
    maxUsers: 20, // 20 advocates
    maxOffices: 3, // 3 offices
    maxStorageGb: 100,
    monthlyOcrCredits: 500, // 50 OCR pages = 500 OCR credits
    monthlyOcrPages: 50,
    monthlyAiDrafts: 15, // 15 AI Legal Drafts = 150 AI draft credits
    features: [
      "Up to 20 Registered Advocate & Associate Accounts",
      "Up to 3 Chamber / Office Locations",
      "500 OCR Credits / month (50 Pages Indexing & Search)",
      "15 AI Legal Court Drafts / month (150 Draft Credits)",
      "AI Court Judgments Research & Intelligence (Supreme Court & High Courts)",
      "Interactive Judgment AI Chat Drawer with Citations",
      "Automated Court Pleading Drafter with 1-Click Word & PDF Export",
      "Live Daily Cause List & Hearing Sync",
      "Advanced Case Management & Procedural Stage Tracking",
      "Interactive Client Portal & Docket Sharing",
      "100 GB Encrypted Legal Document Vault",
      "Tasks, Calendar Reminders & Multi-Channel Alerts",
      "Statutory GST Invoicing & Payment Tracking",
    ],
    badge: "Professional",
    isPopular: false,
    isActive: true,
    isInternal: false,
  },

  // 5. LAW FIRM (Mid tier: 5 offices, 35 advocates, 100 OCR pages, 25 AI drafts)
  {
    code: "law_firm",
    name: "Law Firm",
    tagline: "Complete legal practice management for established law firms and multi-branch practices.",
    description:
      "For established law firms requiring multiple advocates, multi-branch offices and advanced practice management.",
    monthlyPrice: "3999.00",
    annualPrice: "3199.00",
    currency: "INR",
    maxUsers: 35, // 35 advocates
    maxOffices: 5, // 5 offices
    maxStorageGb: 250,
    monthlyOcrCredits: 1000, // 100 OCR pages = 1,000 OCR credits
    monthlyOcrPages: 100,
    monthlyAiDrafts: 25, // 25 AI Legal Drafts = 250 AI draft credits
    features: [
      "Everything in Professional",
      "Up to 35 Advocate, Partner & Staff Accounts",
      "Up to 5 Multi-Branch Office Locations",
      "1,000 OCR Credits / month (100 Pages Indexing & Search)",
      "25 AI Legal Court Drafts / month (250 Draft Credits)",
      "Priority Judgment AI Analysis & Ratio Decidendi Extraction",
      "Advanced Case Management with Hearing History Logs",
      "Granular Role & Permission Management (Partners, Associates, Clerks)",
      "250 GB High-Security Legal Document Vault",
      "Billing, Retainers, TDS Invoicing & Fee Recovery Ledgers",
      "Client Portal with Real-Time Case Progression Updates",
      "Priority Cause List Sync & Real-Time WhatsApp/SMS Alerts",
    ],
    badge: "Popular",
    isPopular: true,
    isActive: true,
    isInternal: false,
  },

  // 6. ENTERPRISE (Apex tier higher than firm: 10 offices, 60 advocates, 500 OCR pages, 60 AI drafts)
  {
    code: "enterprise",
    name: "Enterprise",
    tagline: "Comprehensive multi-tier legal operations and AI suite for large law firms and legal corporations.",
    description:
      "Enterprise-grade legal governance, maximum credits, and multi-office scale for large legal entities.",
    monthlyPrice: "7999.00",
    annualPrice: "6399.00",
    currency: "INR",
    maxUsers: 60, // 60 advocates
    maxOffices: 10, // 10 offices
    maxStorageGb: 500,
    monthlyOcrCredits: 5000, // 500 OCR pages = 5,000 OCR credits
    monthlyOcrPages: 500,
    monthlyAiDrafts: 60, // 60 AI Legal Drafts = 600 AI draft credits
    features: [
      "Everything in Law Firm",
      "Up to 60 Advocate & Senior Counsel Accounts",
      "Up to 10 Pan-India Multi-Branch Office Locations",
      "5,000 OCR Credits / month (500 Pages Indexing & Search)",
      "60 AI Legal Court Drafts / month (600 Draft Credits)",
      "Unlimited Supreme Court, High Court & Tribunal Judgment AI Research",
      "Dedicated Precedent Chat & Automated Legal Memorandum Engine",
      "White-label Client Portal & Custom Firm Branding",
      "500 GB High-Speed Encrypted Cloud Storage Vault",
      "Multi-Entity Billing, Custom Tax Schedules & Bulk Payment Processing",
      "Dedicated Account Manager & Priority 24/7 SLA Support",
    ],
    badge: "Apex Enterprise",
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
          name: plan.name,
          tagline: plan.tagline,
          description: plan.description,
          monthlyPrice: plan.monthlyPrice,
          annualPrice: plan.annualPrice,
          maxUsers: plan.maxUsers,
          maxOffices: plan.maxOffices,
          maxStorageGb: plan.maxStorageGb,
          monthlyOcrCredits: plan.monthlyOcrCredits,
          monthlyOcrPages: plan.monthlyOcrPages,
          monthlyAiDrafts: plan.monthlyAiDrafts,
          features: plan.features,
          badge: plan.badge,
          isPopular: plan.isPopular,
          isActive: plan.isActive,
          isInternal: plan.isInternal,
        },
      });
  }

  console.log("✅ Subscription plans seeded and updated successfully");
}

export default seedSubscriptionPlans;
