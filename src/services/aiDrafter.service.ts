import OpenAI from "openai";
import { config } from "../config/index.js";

export interface GenerateDraftParams {
  caseDetails?: {
    caseNumber?: string | null;
    title?: string | null;
    courtName?: string | null;
    courtType?: string | null;
    policeStation?: string | null;
    underSections?: string | null;
    clientName?: string | null;
    oppositeParty?: string | null;
  } | null;
  documentType: string;
  language: string; // "English" | "Hindi" | "Bengali"
  facts: string;
  referenceDocumentsText?: string[];
  additionalInstructions?: string;
}

export class AiDrafterService {
  private getClient(): OpenAI | null {
    const apiKey = config.OPENAI_API_KEY || (config.OPENAI_BASE_URL ? "ollama" : "");
    if (!apiKey || apiKey.trim() === "") {
      return null;
    }
    return new OpenAI({
      apiKey,
      baseURL: config.OPENAI_BASE_URL && config.OPENAI_BASE_URL.trim() !== "" ? config.OPENAI_BASE_URL : undefined,
    });
  }

  /**
   * Builds the system prompt for Indian legal drafting with formatting rules
   */
  private buildSystemPrompt(language: string, documentType: string): string {
    const langInstructions: Record<string, string> = {
      English: "Draft the document in formal Indian Legal English (standard legal terminology, honorifics, and court conventions).",
      Hindi: "दस्तावेज़ को औपचारिक कानूनी हिन्दी (न्यायालयीन शब्दावली, वादी, प्रतिवादी, शपथ पत्र, प्रार्थना, आदि) में देवनागरी लिपि में तैयार करें।",
      Bengali: "নথিটি উপযুক্ত আইনি বাংলায় (আদালতের রীতিনীতি, দরখাস্তকারী, প্রতিবাদী, হলফনামা, প্রার্থনা, ইত্যাদি) প্রস্তুত করুন।",
    };

    return `You are an expert Senior Advocate and Legal Drafter specialized in Indian law and court practice.
You prepare precise, comprehensive, and legally robust court pleadings, notices, affidavits, applications, and legal agreements suitable for Indian Courts (Supreme Court of India, High Courts, District & Sessions Courts, Magistrates, Tribunals like NCLT/DRT, etc.).

Your task is to draft a complete, professional, court-ready **${documentType}**.

CRITICAL DRAFTING REQUIREMENTS:
1. **LANGUAGE**: ${langInstructions[language] || langInstructions.English}
2. **STANDARD STRUCTURE**:
   - **Court Header / Forum**: State the exact Hon'ble Court/Forum with jurisdiction.
   - **Cause Title**: Case Number (or leave standard placeholder like [CASE NO. / YEAR]), Party details with Applicant/Petitioner/Plaintiff vs Respondent/Opposite Party/State.
   - **FIR / P.S. Details** (if applicable in criminal matters): FIR No., Under Sections, Police Station, District.
   - **Document Heading**: In bold capital letters describing the exact nature of the application and statutory provision (e.g. under CrPC/BNSS, CPC, Specific Relief Act, Constitution of India Art. 226, NI Act Sec. 138, etc.).
   - **Numbered Paragraphs**: Chronological, clear statement of facts without melodrama. State dates, occurrences, and client's role.
   - **Grounds (if applicable)**: Clear grounds (marked A, B, C...) stating why the relief must be granted in law and fact.
   - **Prayer / Relief Clause**: Specific, unambiguous prayers numbered sequentially, followed by standard residuary prayer ("Pass any other order(s)...").
   - **Verification / Affidavit Clause**: Deponent verification stating what is true to knowledge vs legal advice.
   - **Advocate & Place/Date Footer**: Include placeholders for Advocate on Record / Counsel, Place, and Date.

3. **FACTUAL FIDELITY**:
   - Incorporate all facts and instructions supplied by the advocate accurately.
   - If reference document extracts are provided (e.g., from FIR, agreement, previous orders), cross-reference relevant dates, terms, and clauses faithfully.
   - Do NOT invent false names, dates, or FIR numbers. If a specific detail is omitted in the prompt, use standard legal brackets like "[Date of Incident]" or "[Police Station Name]".

4. **OUTPUT FORMAT**:
   - Provide the clean, formatted legal document directly.
   - Do not include conversational filler like "Sure, here is your draft" before or after the text.`;
  }

  /**
   * Generates a draft using OpenAI, or falls back to a template if no key is configured
   */
  async generateDraft(params: GenerateDraftParams): Promise<{
    content: string;
    modelUsed: string;
    isAiGenerated: boolean;
  }> {
    const openai = this.getClient();
    const { caseDetails, documentType, language, facts, referenceDocumentsText, additionalInstructions } = params;

    const userPromptParts: string[] = [];

    userPromptParts.push(`DOCUMENT TYPE REQUIRED: ${documentType}`);
    userPromptParts.push(`TARGET LANGUAGE: ${language}`);

    if (caseDetails) {
      userPromptParts.push(`\nCASE CONTEXT:
- Case Title: ${caseDetails.title || "N/A"}
- Case Number: ${caseDetails.caseNumber || "N/A"}
- Court / Forum: ${caseDetails.courtName || caseDetails.courtType || "Competent Court of Jurisdiction"}
- Client / Party: ${caseDetails.clientName || "Applicant"}
- Opposite Party: ${caseDetails.oppositeParty || "Respondent / State"}
- Police Station: ${caseDetails.policeStation || "N/A"}
- Under Sections / Acts: ${caseDetails.underSections || "N/A"}`);
    }

    userPromptParts.push(`\nFACTS AND CLIENT INSTRUCTIONS:\n${facts}`);

    if (referenceDocumentsText && referenceDocumentsText.length > 0) {
      userPromptParts.push(`\nEXTRACTS FROM ATTACHED REFERENCE DOCUMENTS / OCR TEXT:`);
      referenceDocumentsText.forEach((docText, idx) => {
        // Cap each doc text to ~3000 chars to avoid token overflow
        const truncated = docText.slice(0, 3000);
        userPromptParts.push(`--- Reference Document #${idx + 1} ---\n${truncated}\n`);
      });
    }

    if (additionalInstructions) {
      userPromptParts.push(`\nADDITIONAL SPECIFIC INSTRUCTIONS:\n${additionalInstructions}`);
    }

    userPromptParts.push(`\nPlease generate the complete, finalized legal draft now.`);

    const userPrompt = userPromptParts.join("\n");

    if (openai) {
      const response = await openai.chat.completions.create({
        model: config.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: this.buildSystemPrompt(language, documentType),
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.25,
      });

      const content = response.choices[0]?.message?.content || "";
      return {
        content: content.trim(),
        modelUsed: response.model || config.OPENAI_MODEL || "gpt-4o-mini",
        isAiGenerated: true,
      };
    }

    // Fallback template when OPENAI_API_KEY is not configured yet
    const fallbackDraft = this.buildFallbackTemplate(params);
    return {
      content: fallbackDraft,
      modelUsed: "template-engine (OpenAI API key not set)",
      isAiGenerated: false,
    };
  }

  private buildFallbackTemplate(params: GenerateDraftParams): string {
    const { caseDetails, documentType, facts } = params;
    const court = caseDetails?.courtName || "HON'BLE DISTRICT & SESSIONS COURT";
    const caseNum = caseDetails?.caseNumber || "CASE NO. ______ / 2026";
    const client = caseDetails?.clientName || "APPLICANT";
    const opp = caseDetails?.oppositeParty || "OPPOSITE PARTY / STATE";

    return `[NOTE: OPENAI_API_KEY is not configured in backend .env. Below is a structured draft template. Add OPENAI_API_KEY to generate real-time AI drafts.]

IN THE COURT OF THE ${court.toUpperCase()}
AT [DISTRICT / CITY]

${caseNum}

IN THE MATTER OF:
${client}
... Applicant / Petitioner

VERSUS

${opp}
... Opposite Party / Respondent

${documentType.toUpperCase()} UNDER APPLICABLE PROVISIONS OF LAW

MOST RESPECTFULLY SHOWETH:

1. That the Applicant is a law-abiding citizen of India residing at the address mentioned in the cause title and is competent to prefer the present application.

2. That the facts giving rise to the present matter are summarized as follows:
${facts.trim()}

3. That the Applicant has not filed any other similar application before this Hon'ble Court or any other Court seeking the same relief.

4. That the present application is preferred bona fide and in the interest of justice.

PRAYER:
Wherefore, in the facts and circumstances stated hereinabove, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:
a) Grant the relief prayed for in terms of this ${documentType};
b) Pass such other or further order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

AND FOR THIS ACT OF KINDNESS, THE APPLICANT SHALL AS IN DUTY BOUND EVER PRAY.

VERIFICATION:
I, the deponent above named, do hereby verify and state on oath that the contents of paragraphs 1 to 4 are true to my knowledge and belief and nothing material has been concealed therefrom.
Verified at Kolkata on this day of ${new Date().toLocaleDateString("en-IN")}.

DEPONENT
THROUGH ADVOCATE`;
  }
}

export const aiDrafterService = new AiDrafterService();
export default aiDrafterService;
