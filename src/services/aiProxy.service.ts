import OpenAI from "openai";
import { config } from "../config/index.js";
import { type Response } from "express";

export interface JudgmentMetadata {
  title?: string;
  citation?: string;
  court?: string;
  date?: string;
  bench?: string;
  petitioner?: string;
  respondent?: string;
  actSection?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChatParams {
  metadata?: JudgmentMetadata;
  judgmentText?: string;
  history: ChatMessage[];
  res: Response;
  onComplete?: () => Promise<void>;
}

export class AiProxyService {
  public getClient(): OpenAI | null {
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
   * System Prompt tailored for Indian Court Judgments Analysis
   */
  private buildSystemPrompt(metadata?: JudgmentMetadata, judgmentText?: string): string {
    const caseHeader = [
      metadata?.title ? `Case Title: ${metadata.title}` : "",
      metadata?.citation ? `Citation: ${metadata.citation}` : "",
      metadata?.court ? `Court: ${metadata.court}` : "",
      metadata?.bench ? `Bench / Judges: ${metadata.bench}` : "",
      metadata?.date ? `Date of Judgment: ${metadata.date}` : "",
      metadata?.actSection ? `Key Statutes/Sections: ${metadata.actSection}` : "",
    ].filter(Boolean).join("\n");

    return `You are "Nyaya Mitra AI", an elite Senior Advocate and Judicial Research Assistant specializing in Indian law, Supreme Court of India precedents, and High Court rulings.

You are assisting a practicing Indian advocate who is analyzing this specific court judgment.

CASE DETAILS:
${caseHeader}

${judgmentText ? `CASE EXCERPT / JUDGMENT TEXT:\n"""\n${judgmentText.slice(0, 50000)}\n"""` : ""}

YOUR ROLE & INSTRUCTIONS:
1. When asked to brief or summarize the case, use the **Advocate Executive Briefing Format**:
   - **1. Core Dispute & Material Facts**: Brief chronological narrative without unnecessary filler.
   - **2. Substantial Questions of Law**: Exact legal questions determined by the Court.
   - **3. Statutory Provisions Interpreted**: Specific sections (e.g. IPC/BNS, CrPC/BNSS, CPC, Constitution Arts, etc.).
   - **4. Ratio Decidendi (Binding Legal Principle)**: The exact legal reasoning that constitutes the binding precedent.
   - **5. Precedents Cited & Distinguished**: Landmark cases referred to, affirmed, or overruled.
   - **6. Final Order & Holding**: Operative relief, direction to trial court/authorities, acquittal/conviction, or appeal outcome.
2. In follow-up Q&A, answer precisely, citing paragraph numbers or sections where applicable.
3. If an answer cannot be determined from the judgment text, state so clearly and advise standard legal procedure under Indian law.
4. Keep the tone formal, legally rigorous, authoritative, and practical for court arguments.`;
  }

  /**
   * Stream LLM response directly to client via Server-Sent Events (SSE).
   * Supports pluggable external microservice or direct in-process LLM.
   */
  public async streamJudgmentChat(params: StreamChatParams): Promise<void> {
    const { metadata, judgmentText, history, res, onComplete } = params;

    // Check if user has configured an external dedicated AI Microservice
    const externalAiUrl = process.env.JUDGMENT_AI_SERVICE_URL;

    if (externalAiUrl && externalAiUrl.trim() !== "") {
      return this.forwardToExternalMicroservice(externalAiUrl, params);
    }

    // Default: Direct OpenAI / Compatible LLM in-process streaming
    const client = this.getClient();
    if (!client) {
      res.write(`data: ${JSON.stringify({ error: "LLM service is not configured. Please check OPENAI_API_KEY in server environment." })}\n\n`);
      res.end();
      return;
    }

    const systemPrompt = this.buildSystemPrompt(metadata, judgmentText);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const model = config.OPENAI_MODEL || "gpt-4o-mini";

    try {
      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.2,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ token: content })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();

      // Trigger credit deduction upon successful completion
      if (onComplete) {
        await onComplete();
      }
    } catch (err: unknown) {
      console.error("[AiProxyService.streamJudgmentChat] Error during stream:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to generate AI response";
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }

  /**
   * Forwards streaming request to an external dedicated AI microservice
   * (e.g. Future Python / FastAPI / LangGraph service on another VPS)
   */
  private async forwardToExternalMicroservice(url: string, params: StreamChatParams): Promise<void> {
    const { metadata, judgmentText, history, res, onComplete } = params;

    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/api/judgment-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: process.env.JUDGMENT_AI_SECRET ? `Bearer ${process.env.JUDGMENT_AI_SECRET}` : "",
        },
        body: JSON.stringify({ metadata, judgmentText, history }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`External AI microservice error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }

      res.end();

      if (onComplete) {
        await onComplete();
      }
    } catch (err: unknown) {
      console.error("[AiProxyService.forwardToExternalMicroservice] Error:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to reach external AI microservice";
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }
}

export const aiProxyService = new AiProxyService();
export default aiProxyService;
