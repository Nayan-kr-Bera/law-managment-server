export interface AiCreditPack {
  id: string;
  name: string;
  drafts: number;
  basePrice: number;
  gstPercent: number;
  gstAmount: number;
  totalPrice: number;
  popular?: boolean;
}

export const AI_CREDIT_PACKS: Record<string, AiCreditPack> = {
  pack_15: {
    id: "pack_15",
    name: "Starter Pack (15 Drafts)",
    drafts: 15,
    basePrice: 149,
    gstPercent: 18,
    gstAmount: 26.82,
    totalPrice: 175.82,
  },
  pack_60: {
    id: "pack_60",
    name: "Value Pack (60 Drafts)",
    drafts: 60,
    basePrice: 599,
    gstPercent: 18,
    gstAmount: 107.82,
    totalPrice: 706.82,
    popular: true,
  },
  pack_180: {
    id: "pack_180",
    name: "Pro Firm Pack (180 Drafts)",
    drafts: 180,
    basePrice: 1499,
    gstPercent: 18,
    gstAmount: 269.82,
    totalPrice: 1768.82,
  },
  pack_600: {
    id: "pack_600",
    name: "Mega Pack (600 Drafts)",
    drafts: 600,
    basePrice: 3599,
    gstPercent: 18,
    gstAmount: 647.82,
    totalPrice: 4246.82,
  },
};
