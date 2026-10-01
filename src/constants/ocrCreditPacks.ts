export interface OcrCreditPack {
  id: string;
  name: string;
  credits: number;
  pagesCount: number;
  ratePerCredit: number; // ₹2.00 per credit
  basePrice: number;     // credits * 2.00
  gstPercent: number;    // 18%
  gstAmount: number;     // basePrice * 0.18
  totalPrice: number;    // basePrice + gstAmount
  popular?: boolean;
}

export const OCR_CREDIT_RATE_INR = 2.0;
export const OCR_CREDITS_PER_PAGE = 10;
export const OCR_CREDIT_GST_PERCENT = 18;

export const OCR_CREDIT_PACKS: Record<string, OcrCreditPack> = {
  pack_100: {
    id: "pack_100",
    name: "Starter Pack (10 Pages)",
    credits: 100,
    pagesCount: 10,
    ratePerCredit: 2.0,
    basePrice: 200,
    gstPercent: 18,
    gstAmount: 36,
    totalPrice: 236,
  },
  pack_250: {
    id: "pack_250",
    name: "Case Dossier Pack (25 Pages)",
    credits: 250,
    pagesCount: 25,
    ratePerCredit: 2.0,
    basePrice: 500,
    gstPercent: 18,
    gstAmount: 90,
    totalPrice: 590,
  },
  pack_500: {
    id: "pack_500",
    name: "Advocate Value Pack (50 Pages)",
    credits: 500,
    pagesCount: 50,
    ratePerCredit: 2.0,
    basePrice: 1000,
    gstPercent: 18,
    gstAmount: 180,
    totalPrice: 1180,
    popular: true,
  },
  pack_1000: {
    id: "pack_1000",
    name: "Senior Counsel Pack (100 Pages)",
    credits: 1000,
    pagesCount: 100,
    ratePerCredit: 2.0,
    basePrice: 2000,
    gstPercent: 18,
    gstAmount: 360,
    totalPrice: 2360,
  },
  pack_2500: {
    id: "pack_2500",
    name: "Law Firm Bulk Pack (250 Pages)",
    credits: 2500,
    pagesCount: 250,
    ratePerCredit: 2.0,
    basePrice: 5000,
    gstPercent: 18,
    gstAmount: 900,
    totalPrice: 5900,
  },
};
