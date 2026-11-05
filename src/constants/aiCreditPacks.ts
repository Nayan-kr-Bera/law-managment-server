export interface AiCreditPack {
  id: string;
  name: string;
  credits: number;
  drafts: number;
  reportsCount: number;
  ratePerCredit: number;
  basePrice: number;
  gstPercent: number;
  gstAmount: number;
  totalPrice: number;
  popular?: boolean;
}

export const AI_CREDIT_RATE_INR = 1.15;
export const CREDITS_PER_AI_DRAFT = 10;
export const AI_CREDIT_GST_PERCENT = 18;

export const AI_CREDIT_PACKS: Record<string, AiCreditPack> = {
  pack_75: {
    id: "pack_75",
    name: "Starter Pack",
    credits: 75,
    drafts: 7,
    reportsCount: 5,
    ratePerCredit: 1.15,
    basePrice: 86.25,
    gstPercent: 18,
    gstAmount: 15.53,
    totalPrice: 101.78,
  },
  pack_150: {
    id: "pack_150",
    name: "Standard Pack",
    credits: 150,
    drafts: 15,
    reportsCount: 10,
    ratePerCredit: 1.15,
    basePrice: 172.5,
    gstPercent: 18,
    gstAmount: 31.05,
    totalPrice: 203.55,
  },
  pack_300: {
    id: "pack_300",
    name: "Advocate Value Pack",
    credits: 300,
    drafts: 30,
    reportsCount: 20,
    ratePerCredit: 1.15,
    basePrice: 345.0,
    gstPercent: 18,
    gstAmount: 62.1,
    totalPrice: 407.1,
    popular: true,
  },
  pack_750: {
    id: "pack_750",
    name: "Senior Counsel Pack",
    credits: 750,
    drafts: 75,
    reportsCount: 50,
    ratePerCredit: 1.15,
    basePrice: 862.5,
    gstPercent: 18,
    gstAmount: 155.25,
    totalPrice: 1017.75,
  },
  pack_1500: {
    id: "pack_1500",
    name: "Law Firm Bulk Pack",
    credits: 1500,
    drafts: 150,
    reportsCount: 100,
    ratePerCredit: 1.15,
    basePrice: 1725.0,
    gstPercent: 18,
    gstAmount: 310.5,
    totalPrice: 2035.5,
  },
};

