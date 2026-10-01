export interface JudgmentCreditPack {
  id: string;
  name: string;
  credits: number;
  reportsCount: number;
  ratePerCredit: number; // ₹1.15 per credit
  basePrice: number;     // credits * 1.15
  gstPercent: number;    // 18%
  gstAmount: number;     // basePrice * 0.18
  totalPrice: number;    // basePrice + gstAmount
  popular?: boolean;
}

export const JUDGMENT_CREDIT_RATE_INR = 1.15;
export const CREDITS_PER_JUDGMENT_REPORT = 15;
export const JUDGMENT_CREDIT_GST_PERCENT = 18;

export const JUDGMENT_CREDIT_PACKS: Record<string, JudgmentCreditPack> = {
  pack_75: {
    id: "pack_75",
    name: "Starter Pack (5 Reports)",
    credits: 75,
    reportsCount: 5,
    ratePerCredit: 1.15,
    basePrice: 86.25,
    gstPercent: 18,
    gstAmount: 15.53,
    totalPrice: 101.78,
  },
  pack_150: {
    id: "pack_150",
    name: "Standard Pack (10 Reports)",
    credits: 150,
    reportsCount: 10,
    ratePerCredit: 1.15,
    basePrice: 172.50,
    gstPercent: 18,
    gstAmount: 31.05,
    totalPrice: 203.55,
  },
  pack_300: {
    id: "pack_300",
    name: "Advocate Value Pack (20 Reports)",
    credits: 300,
    reportsCount: 20,
    ratePerCredit: 1.15,
    basePrice: 345.00,
    gstPercent: 18,
    gstAmount: 62.10,
    totalPrice: 407.10,
    popular: true,
  },
  pack_750: {
    id: "pack_750",
    name: "Senior Counsel Pack (50 Reports)",
    credits: 750,
    reportsCount: 50,
    ratePerCredit: 1.15,
    basePrice: 862.50,
    gstPercent: 18,
    gstAmount: 155.25,
    totalPrice: 1017.75,
  },
  pack_1500: {
    id: "pack_1500",
    name: "Law Firm Bulk Pack (100 Reports)",
    credits: 1500,
    reportsCount: 100,
    ratePerCredit: 1.15,
    basePrice: 1725.00,
    gstPercent: 18,
    gstAmount: 310.50,
    totalPrice: 2035.50,
  },
};
