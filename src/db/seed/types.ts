export interface ISeedSubSection {
  number?: string;
  text: string;
}

export interface ISeedSection {
  sectionType: "section" | "article" | "order_rule" | "clause" | "schedule";
  sectionNumber: string;
  sectionNumeric: number;
  title: string;
  slug?: string;
  content: string;
  subSections?: ISeedSubSection[];
  provisos?: string[];
  explanations?: string[];
  illustrations?: string[];
  footnotes?: string[];
  punishment?: string;
  bailableStatus?: "bailable" | "non_bailable" | "not_applicable";
  cognizableStatus?: "cognizable" | "non_cognizable" | "not_applicable";
  compoundableStatus?:
    | "compoundable"
    | "non_compoundable"
    | "compoundable_with_permission"
    | "not_applicable";
  triableBy?: string;
  keywords?: string[];
  crossReferences?: {
    oldEquivalent?: string;
    newEquivalent?: string;
    relatedArticles?: string[];
    relatedSections?: string[];
    landmarkJudgments?: Array<{
      title: string;
      citation: string;
      year?: number;
      summary?: string;
    }>;
  };
  orderIndex: number;
}

export interface ISeedChapter {
  partNumber?: string;
  partTitle?: string;
  chapterNumber?: string;
  title: string;
  description?: string;
  startSection?: string;
  endSection?: string;
  orderIndex: number;
  sections?: ISeedSection[];
}

export interface ISeedSchedule {
  scheduleNumber: string;
  title: string;
  content?: string;
  tableData?: Record<string, unknown>[];
  orderIndex: number;
}

export interface ISeedAct {
  title: string;
  shortCode?: string;
  slug: string;
  longTitle?: string;
  actNumber?: string;
  actYear: number;
  category:
    | "constitutional"
    | "criminal"
    | "civil_procedure"
    | "corporate_commercial"
    | "banking_finance"
    | "family_personal"
    | "property_realestate"
    | "labour_employment"
    | "taxation"
    | "cyber_ipr"
    | "consumer_environment"
    | "motor_accidents"
    | "arbitration_adr"
    | "general_special";
  jurisdiction: "central" | "state";
  stateJurisdiction?: string;
  ministry?: string;
  status: "active" | "repealed" | "amended" | "pending_enforcement";
  enactmentDate?: string;
  enforcementDate?: string;
  source: "system_seed" | "admin_upload";
  isFeatured?: boolean;
  totalSections?: number;
  totalChapters?: number;
  keywords?: string[];
  preamble?: string;
  description?: string;
  repealedBy?: string;
  replacesAct?: string;
  chapters?: ISeedChapter[];
  schedules?: ISeedSchedule[];
}
