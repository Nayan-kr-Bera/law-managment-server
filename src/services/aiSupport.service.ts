import OpenAI from "openai";
import { config } from "../config/index.js";

export interface SupportChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiSupportResponse {
  message: string;
  isEscalated: boolean;
  escalationReason?: string;
  suggestedCategory: "technical" | "billing" | "account" | "case_management" | "general";
  suggestedPriority: "low" | "medium" | "high" | "urgent";
  suggestedOptions?: string[];
  shouldAskIfSolved?: boolean;
  isTicketClosed?: boolean;
}

export class AiSupportService {
  private getClient(): OpenAI | null {
    const apiKey = config.OPENAI_API_KEY || (config.OPENAI_BASE_URL ? "ollama" : "");
    if (!apiKey || apiKey.trim() === "") {
      return null;
    }
    return new OpenAI({
      apiKey,
      baseURL:
        config.OPENAI_BASE_URL && config.OPENAI_BASE_URL.trim() !== ""
          ? config.OPENAI_BASE_URL
          : undefined,
    });
  }

  /**
   * System Prompt tailored for conversational, agentic 24/7 support.
   */
  private getSystemPrompt(): string {
    return `You are "Nyaya Sahayak AI", a helpful, friendly, and knowledgeable 24/7 AI Support Specialist on the MI Law Practice Management Platform.

CONVERSATION & TONE GUIDELINES (CRITICAL):
- You are chatting live in a messaging window with an advocate. Speak naturally like a friendly support colleague.
- PLAIN TEXT ONLY: Absolutely DO NOT use markdown asterisks (*, **, or ***) anywhere in your text. No bold formatting, no star bullet points.
- Keep responses short, conversational, and direct (2 to 3 short sentences or a simple natural paragraph, around 35 to 55 words total).
- NEVER write long manuals, 5-step numbered tutorials, nested bullet points, or formal documentation essays.
- NEVER write markdown callouts like "> Tip" or giant headings.
- Answer the user's question directly, clearly, and concisely.
- DO NOT add "Did this resolve your problem?", "Did that work for you?", or check-in questions at the end of your answer. Just give the answer directly.
- DO NOT suggest speaking to a human agent unless the user explicitly asks for one.

QUICK FLOW RULES:
1. GREETINGS ("Hi", "Hello", "Hey", "Good morning"):
- Greet warmly and briefly ask how you can assist them today.

2. WHEN USER SAYS PROBLEM IS SOLVED ("Yes", "Solved", "It worked", "Thank you"):
- Reply warmly: "I'm glad I could help resolve this for you! May I go ahead and close this support ticket?"

3. WHEN USER CONFIRMS CLOSURE ("Yes, close ticket", "Close ticket", "Close it", "All done"):
- Reply warmly: "Ticket closed successfully! Feel free to reach out anytime if you need help. Have a wonderful day!"
- Set isTicketClosed to true in metadata.

4. WHEN USER EXPLICITLY ASKS FOR A HUMAN / LIVE AGENT ("Human", "Agent", "Speak to agent", "Talk to human", "I need to talk with agent"):
- Reply: "Checking for an active human support specialist for you now."
- Set isEscalated to true in metadata.

PLATFORM CAPABILITIES YOU COVER:
- Case Management: Filing matters, CNR tracking, Vakalatnama upload, case stages, causelist hearings.
- Invoicing & Billing: Retainers, milestone billing, GST invoices, payment receipts.
- Bare Acts & Precedents: Searching central/state acts, section lookup, Supreme Court/High Court judgment summaries.
- Client Portal: Inviting clients, client logins, shared case updates.
- Chamber Management: Adding associate advocates, clerks, permissions.

STRICT ACTION BOUNDARIES (CRITICAL - YOU CANNOT PERFORM DATABASE MUTATIONS):
- You CANNOT create new law firm chambers / organizations / tenants in the database.
- You CANNOT change billing subscriptions, change passwords, or perform direct administrative actions.
- NEVER pretend, claim, or hallucinate that you created an organization/chamber, registered a firm, or performed administrative actions.
- When an advocate asks to create an organization / law firm chamber or requests any administrative setup:
  - Explicitly reply: "I cannot create new organizations or law firm chambers directly. I am transferring your request to our support team and assigning a specialist to assist you. If our specialists are currently offline, your request has been marked High Priority, and you will be notified as soon as a specialist is online."
  - ALWAYS set isEscalated to true, suggestedPriority to "high", and suggestedCategory to "account" in metadata!

ALWAYS OUTPUT STRICT METADATA BLOCK AT THE VERY END (SINGLE COMPACT LINE):
<!--META:{"isEscalated":boolean,"escalationReason":string|null,"suggestedCategory":"technical"|"billing"|"account"|"case_management"|"general","suggestedPriority":"low"|"medium"|"high"|"urgent","isTicketClosed":boolean}-->
`;
  }

  /**
   * Process a chat query with conversation history
   */
  async processSupportChat(
    history: SupportChatMessage[],
    userMessage: string
  ): Promise<AiSupportResponse> {
    const trimmedQuery = userMessage.trim().toLowerCase();

    // Check common conversational quick triggers first
    const isGreeting =
      trimmedQuery === "hi" ||
      trimmedQuery === "hello" ||
      trimmedQuery === "hey" ||
      trimmedQuery === "namaste" ||
      trimmedQuery === "start" ||
      trimmedQuery === "help";

    const isSolvedConfirmation =
      trimmedQuery === "yes" ||
      trimmedQuery === "yes, problem solved" ||
      trimmedQuery === "yes solved" ||
      trimmedQuery === "problem solved" ||
      trimmedQuery === "it worked" ||
      trimmedQuery === "solved" ||
      trimmedQuery === "thank you, solved";

    const isCloseConfirmation =
      trimmedQuery === "yes, close ticket" ||
      trimmedQuery === "close ticket" ||
      trimmedQuery === "close it" ||
      trimmedQuery === "please close" ||
      trimmedQuery === "close";

    const isExplicitEscalate =
      trimmedQuery.includes("human") ||
      trimmedQuery.includes("agent") ||
      trimmedQuery.includes("speak to") ||
      trimmedQuery.includes("talk to") ||
      trimmedQuery.includes("call support") ||
      trimmedQuery.includes("transfer me") ||
      trimmedQuery === "no, need more help" ||
      trimmedQuery === "not solved";

    const isOrgCreationRequest =
      /creat(e|ing|ion)\s+(of\s+)?(a\s+)?(new\s+)?(org|organization|chamber|law firm|firm|tenant)/i.test(trimmedQuery) ||
      /new\s+(org|organization|chamber|law firm|firm|tenant)/i.test(trimmedQuery) ||
      /request\s+(the\s+)?creation\s+of\s+(a\s+)?(new\s+)?(org|organization|chamber|law firm|firm)/i.test(trimmedQuery) ||
      /estimated\s+advocates/i.test(trimmedQuery) ||
      history.some((h) =>
        /creat(e|ing|ion)\s+(of\s+)?(a\s+)?(new\s+)?(org|organization|chamber|law firm|firm|tenant)/i.test(h.content) ||
        /estimated\s+advocates/i.test(h.content)
      );

    const client = this.getClient();

    // Fallback if no OpenAI API Key configured
    if (!client) {
      if (isOrgCreationRequest) {
        return {
          message:
            "I cannot create new organizations or law firm chambers directly. I have marked your ticket as High Priority and assigned it to our support desk. If our specialists are currently offline, you will be notified as soon as an agent is online to assist you with setting up your chamber.",
          isEscalated: true,
          escalationReason: "Requesting organization or chamber creation",
          suggestedCategory: "account",
          suggestedPriority: "high",
        };
      }
      if (isGreeting) {
        return {
          message:
            "Hello! I am Nyaya Sahayak, your 24/7 AI Legal Support Specialist. How can I help you today?\n\nPlease choose an option below or type your question directly:",
          isEscalated: false,
          suggestedCategory: "general",
          suggestedPriority: "low",
          suggestedOptions: [
            "How to create an invoice for a client",
            "How to add a Vakalatnama or case document",
            "Search Bare Acts & court judgments",
          ],
        };
      }

      if (isSolvedConfirmation) {
        return {
          message: "Glad I could help resolve this for you! May I go ahead and close this support ticket?",
          isEscalated: false,
          suggestedCategory: "general",
          suggestedPriority: "low",
          suggestedOptions: ["Yes, Close Ticket", "Keep Ticket Open"],
        };
      }

      if (isCloseConfirmation) {
        return {
          message:
            "Ticket closed successfully! Feel free to reach out anytime if you need help. Have a wonderful day!",
          isEscalated: false,
          suggestedCategory: "general",
          suggestedPriority: "low",
          isTicketClosed: true,
        };
      }

      if (isExplicitEscalate) {
        return {
          message:
            "Checking for an active human support specialist for you now.",
          isEscalated: true,
          escalationReason: "User requested human agent assistance",
          suggestedCategory: "general",
          suggestedPriority: "high",
        };
      }

      // Default problem solving in fallback mode
      return {
        message:
          "You can do this directly from the relevant sidebar section (like Case Management or Billing). Click the primary action button to get started!",
        isEscalated: false,
        suggestedCategory: "general",
        suggestedPriority: "medium",
      };
    }

    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: this.getSystemPrompt() },
        ...history.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user", content: userMessage },
      ];

      const model = config.OPENAI_MODEL || "gpt-4o-mini";

      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 1000,
      });

      const rawContent = completion.choices[0]?.message?.content || "";

      // Extract metadata tag safely (supports full or partial comments)
      const metaMatch = rawContent.match(/<!--META:([\s\S]*?)(?:-->|$)/i);
      let isEscalated = false;
      let escalationReason: string | undefined;
      let suggestedCategory: AiSupportResponse["suggestedCategory"] = "general";
      let suggestedPriority: AiSupportResponse["suggestedPriority"] = "medium";
      let suggestedOptions: string[] | undefined;
      let shouldAskIfSolved = false;
      let isTicketClosed = false;

      if (metaMatch && metaMatch[1]) {
        try {
          const jsonStr = metaMatch[1].trim().replace(/-->$/, "");
          const parsed = JSON.parse(jsonStr);
          isEscalated = Boolean(parsed.isEscalated);
          escalationReason = parsed.escalationReason || undefined;
          if (parsed.suggestedCategory) suggestedCategory = parsed.suggestedCategory;
          if (parsed.suggestedPriority) suggestedPriority = parsed.suggestedPriority;
          if (Array.isArray(parsed.suggestedOptions)) suggestedOptions = parsed.suggestedOptions;
          if (parsed.shouldAskIfSolved) shouldAskIfSolved = Boolean(parsed.shouldAskIfSolved);
          if (parsed.isTicketClosed) isTicketClosed = Boolean(parsed.isTicketClosed);
        } catch {
          // ignore parsing error
        }
      }

      // Reinforce explicit triggers
      if (isExplicitEscalate) {
        isEscalated = true;
        escalationReason = escalationReason || "User requested human agent escalation";
        suggestedPriority = "high";
      }

      if (isCloseConfirmation) {
        isTicketClosed = true;
      }

      if (isSolvedConfirmation) {
        suggestedOptions = ["Yes, Close Ticket", "Keep Ticket Open"];
      }

      if (isGreeting && (!suggestedOptions || suggestedOptions.length === 0)) {
        suggestedOptions = [
          "How to create an invoice for a client",
          "How to add a Vakalatnama or case document",
          "Search Bare Acts & court judgments",
          "Speak with a Live Support Specialist",
        ];
      }

      // Clean message: completely strip any META comments, HTML comments, partial tags, and asterisks
      let cleanMessage = rawContent
        .replace(/<!--META:[\s\S]*?(?:-->|$)/gi, "")
        .replace(/<!--[\s\S]*?(?:-->|$)/gi, "")
        .replace(/\[\[META:[\s\S]*?(?:\]\]|$)/gi, "")
        .replace(/META:\{[\s\S]*/gi, "")
        .replace(/\*{1,3}/g, "")
        .trim();

      // Guardrail against hallucination of entity creation
      const hallucinatedCreation =
        /created successfully|has been created|I'll create the (new )?chamber|set that up for you/i.test(
          cleanMessage
        ) && /chamber|organization|firm|tenant/i.test(cleanMessage);

      if (isOrgCreationRequest || hallucinatedCreation) {
        isEscalated = true;
        suggestedPriority = "high";
        suggestedCategory = "account";
        escalationReason = "Organization or chamber creation request";
        cleanMessage =
          "I cannot create new organizations or law firm chambers directly. I have marked your ticket as High Priority and assigned it to our support desk. If our specialists are currently offline, you will be notified as soon as an agent is online to assist you with setting up your chamber.";
      }

      return {
        message: cleanMessage,
        isEscalated,
        escalationReason,
        suggestedCategory,
        suggestedPriority,
        suggestedOptions,
        shouldAskIfSolved,
        isTicketClosed,
      };
    } catch (error) {
      console.error("AI Support Chat Error:", error);
      return {
        message:
          "I ran into a momentary connection issue. Let me transfer you directly to an active online support specialist who can assist you right now.",
        isEscalated: true,
        escalationReason: "AI service failover escalation",
        suggestedCategory: "technical",
        suggestedPriority: "high",
      };
    }
  }
}

export const aiSupportService = new AiSupportService();
export default aiSupportService;
