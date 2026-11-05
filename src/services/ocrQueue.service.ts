import { and, eq, inArray, sql } from "drizzle-orm";
import db from "../db/index.js";
import {
  caseDocuments,
  subscriptionPlans,
  tenantSubscriptions,
} from "../db/schema/index.js";
import ocrService from "./ocr.service.js";
import ocrEmailService from "./ocrEmail.service.js";
import { OCR_CREDITS_PER_PAGE } from "../constants/ocrCreditPacks.js";

export interface OcrJobPayload {
  documentId: string;
  tenantId: string;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  language?: string;
}

class OcrQueueService {
  private queue: OcrJobPayload[] = [];
  private isProcessing = false;

  public addJob(job: OcrJobPayload): void {
    this.queue.push(job);
    console.log(`[ocrQueue] Job enqueued for document ${job.documentId}. Queue size: ${this.queue.length}`);
    
    setImmediate(() => {
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.isProcessing = true;

    try {
      await this.executeJob(job);
    } catch (err: unknown) {
      console.error(`[ocrQueue] Uncaught error processing document ${job.documentId}:`, err);
    } finally {
      this.isProcessing = false;
      setTimeout(() => {
        this.processNext();
      }, 500);
    }
  }

  private async executeJob(job: OcrJobPayload): Promise<void> {
    const { documentId, tenantId, userEmail, userName, language = "eng+hin" } = job;
    console.log(`[ocrQueue] Starting processing for document: ${documentId}`);

    const [doc] = await db
      .select()
      .from(caseDocuments)
      .where(and(eq(caseDocuments.id, documentId), eq(caseDocuments.tenantId, tenantId)));

    if (!doc) {
      console.warn(`[ocrQueue] Document ${documentId} not found in database. Skipping.`);
      return;
    }

    await db
      .update(caseDocuments)
      .set({
        ocrStatus: "processing",
        ocrLanguage: language,
        ocrError: null,
      })
      .where(eq(caseDocuments.id, documentId));

    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        inArray(tenantSubscriptions.status, ["active", "trial"]),
      ),
      with: {
        plan: true,
      },
    });

    const isInternal = subscription?.plan?.code === "internal";
    const monthlyCreditLimit = isInternal
      ? 9999990
      : (subscription?.plan?.monthlyOcrCredits ?? ((subscription?.plan?.monthlyOcrPages ?? 0) * OCR_CREDITS_PER_PAGE));
    const monthlyPageLimit = Math.floor(monthlyCreditLimit / OCR_CREDITS_PER_PAGE);

    let currentCreditsUsed = subscription?.ocrCreditsUsedThisMonth ?? ((subscription?.ocrPagesUsedThisMonth ?? 0) * OCR_CREDITS_PER_PAGE);

    if (subscription?.ocrCycleResetDate) {
      const now = new Date();
      const resetDate = new Date(subscription.ocrCycleResetDate);
      if (now > resetDate) {
        currentCreditsUsed = 0;
        const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await db
          .update(tenantSubscriptions)
          .set({
            ocrCreditsUsedThisMonth: 0,
            ocrPagesUsedThisMonth: 0,
            ocrAddonCredits: 0,
            ocrCycleResetDate: nextReset.toISOString().split("T")[0],
          })
          .where(eq(tenantSubscriptions.id, subscription.id));
      }
    }

    const remainingMonthlyCredits = isInternal
      ? 9999990
      : Math.max(0, monthlyCreditLimit - currentCreditsUsed);
    const addonCredits = subscription?.ocrAddonCredits ?? 0;
    const totalAvailableCredits = isInternal
      ? 9999990
      : remainingMonthlyCredits + addonCredits;
    const maxPagesAllowed = isInternal
      ? undefined
      : Math.floor(totalAvailableCredits / OCR_CREDITS_PER_PAGE);

    if (!isInternal && (totalAvailableCredits < OCR_CREDITS_PER_PAGE || (maxPagesAllowed ?? 0) <= 0)) {
      const errorMsg = `Insufficient OCR credits (${totalAvailableCredits} credits available). Each page requires ${OCR_CREDITS_PER_PAGE} OCR credits. Please top up your OCR credits.`;
      console.warn(`[ocrQueue] Quota exceeded for tenant ${tenantId}: ${errorMsg}`);
      
      await db
        .update(caseDocuments)
        .set({
          ocrStatus: "failed",
          ocrError: errorMsg,
        })
        .where(eq(caseDocuments.id, documentId));

      if (userEmail) {
        await ocrEmailService.sendOcrFailureEmail({
          toEmail: userEmail,
          userName: userName || "Advocate",
          fileName: doc.originalName || doc.fileName,
          errorReason: errorMsg,
        });
      }
      return;
    }

    try {
      const result = await ocrService.processDocument({
        fileUrl: doc.fileUrl,
        fileName: doc.originalName || doc.fileName,
        mimeType: doc.mimeType,
        language,
        maxPages: isInternal ? undefined : maxPagesAllowed,
      });

      const totalDocPages = result.totalPages || 1;
      const pagesProcessed = result.pagesProcessed || 1;
      const pagesSkipped = result.pagesSkipped || 0;
      const creditsCost = pagesProcessed * OCR_CREDITS_PER_PAGE;
      const warningMessage =
        pagesSkipped > 0
          ? `Processed first ${pagesProcessed} of ${totalDocPages} pages (${creditsCost} OCR credits used). Last ${pagesSkipped} pages were skipped due to available credit limit.`
          : (result.warning || null);

      // Deduct credits before marking completed so clients reading "completed" always see the updated balance
      if (subscription && !isInternal) {
        const fromMonthlyCredits = Math.min(remainingMonthlyCredits, creditsCost);
        const fromAddonCredits = creditsCost - fromMonthlyCredits;
        const pagesToAddToMonthly = Math.ceil(fromMonthlyCredits / OCR_CREDITS_PER_PAGE);

        await db
          .update(tenantSubscriptions)
          .set({
            ocrCreditsUsedThisMonth: sql`${tenantSubscriptions.ocrCreditsUsedThisMonth} + ${fromMonthlyCredits}`,
            ocrPagesUsedThisMonth: sql`${tenantSubscriptions.ocrPagesUsedThisMonth} + ${pagesToAddToMonthly}`,
            ...(fromAddonCredits > 0
              ? {
                  ocrAddonCredits: sql`GREATEST(0, ${tenantSubscriptions.ocrAddonCredits} - ${fromAddonCredits})`,
                }
              : {}),
          })
          .where(eq(tenantSubscriptions.id, subscription.id));
      }

      await db
        .update(caseDocuments)
        .set({
          ocrStatus: "completed",
          ocrText: result.text,
          pageCount: totalDocPages,
          ocrPagesProcessed: pagesProcessed,
          ocrWarning: warningMessage,
          ocrProcessedAt: new Date(),
          ocrError: null,
        })
        .where(eq(caseDocuments.id, documentId));

      console.log(
        `[ocrQueue] OCR completed for ${doc.fileName}: ${pagesProcessed} of ${totalDocPages} pages (${creditsCost} credits consumed).`,
      );

      if (userEmail) {
        await ocrEmailService.sendOcrSuccessEmail({
          toEmail: userEmail,
          userName: userName || "Advocate",
          fileName: doc.originalName || doc.fileName,
          pageCount: pagesProcessed,
          totalPages: totalDocPages,
          pagesSkipped,
          charCount: result.charCount,
          monthlyPagesUsed: Math.floor(currentCreditsUsed / OCR_CREDITS_PER_PAGE) + pagesProcessed,
          monthlyPagesLimit: monthlyPageLimit,
          previewText: result.text,
          documentUrl: doc.fileUrl,
          warning: warningMessage || undefined,
        });
      }
    } catch (ocrErr: unknown) {
      console.error(`[ocrQueue] OCR extraction error for document ${documentId}:`, ocrErr);
      const errorMsg = ocrErr instanceof Error ? ocrErr.message : "Failed to process document OCR";

      await db
        .update(caseDocuments)
        .set({
          ocrStatus: "failed",
          ocrError: errorMsg,
        })
        .where(eq(caseDocuments.id, documentId));

      if (userEmail) {
        await ocrEmailService.sendOcrFailureEmail({
          toEmail: userEmail,
          userName: userName || "Advocate",
          fileName: doc.originalName || doc.fileName,
          errorReason: errorMsg,
        });
      }
    }
  }

  public getStatus(): { isProcessing: boolean; pendingJobs: number } {
    return {
      isProcessing: this.isProcessing,
      pendingJobs: this.queue.length,
    };
  }
}

export const ocrQueueService = new OcrQueueService();
export default ocrQueueService;
