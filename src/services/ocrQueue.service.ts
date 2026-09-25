import { and, eq, inArray, sql } from "drizzle-orm";
import db from "../db/index.js";
import {
  caseDocuments,
  subscriptionPlans,
  tenantSubscriptions,
} from "../db/schema/index.js";
import ocrService from "./ocr.service.js";
import ocrEmailService from "./ocrEmail.service.js";

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

  /**
   * Enqueue an OCR job and trigger worker asynchronously
   */
  public addJob(job: OcrJobPayload): void {
    this.queue.push(job);
    console.log(`[ocrQueue] Job enqueued for document ${job.documentId}. Queue size: ${this.queue.length}`);
    
    // Trigger worker asynchronously on next event loop tick so API call returns immediately
    setImmediate(() => {
      this.processNext();
    });
  }

  /**
   * Process the next job in the queue (concurrency = 1 to protect CPU/RAM)
   */
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
      // Yield to event loop before taking next job to keep HTTP server responsive
      setTimeout(() => {
        this.processNext();
      }, 500);
    }
  }

  /**
   * Execute an individual OCR job with strict page limit enforcement
   */
  private async executeJob(job: OcrJobPayload): Promise<void> {
    const { documentId, tenantId, userEmail, userName, language = "eng+hin" } = job;
    console.log(`[ocrQueue] Starting processing for document: ${documentId}`);

    // Step 1: Verify document exists
    const [doc] = await db
      .select()
      .from(caseDocuments)
      .where(and(eq(caseDocuments.id, documentId), eq(caseDocuments.tenantId, tenantId)));

    if (!doc) {
      console.warn(`[ocrQueue] Document ${documentId} not found in database. Skipping.`);
      return;
    }

    // Step 2: Mark document status as 'processing'
    await db
      .update(caseDocuments)
      .set({
        ocrStatus: "processing",
        ocrLanguage: language,
        ocrError: null,
      })
      .where(eq(caseDocuments.id, documentId));

    // Step 3: Fetch active subscription and verify page limit
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
    const monthlyLimit = isInternal
      ? 999999
      : subscription?.plan?.monthlyOcrPages ?? 0;

    let currentUsed = subscription?.ocrPagesUsedThisMonth ?? 0;

    // Check if monthly cycle reset is needed
    if (subscription?.ocrCycleResetDate) {
      const now = new Date();
      const resetDate = new Date(subscription.ocrCycleResetDate);
      if (now > resetDate) {
        currentUsed = 0;
        // Next reset date: 30 days from now
        const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await db
          .update(tenantSubscriptions)
          .set({
            ocrPagesUsedThisMonth: 0,
            ocrCycleResetDate: nextReset.toISOString().split("T")[0],
          })
          .where(eq(tenantSubscriptions.id, subscription.id));
      }
    }

    const remainingPages = isInternal
      ? 999999
      : Math.max(0, monthlyLimit - currentUsed);

    // Quick limit check before heavy processing
    if (!isInternal && remainingPages <= 0) {
      const errorMsg = `Monthly OCR page limit reached (${currentUsed}/${monthlyLimit} pages used). Upgrade your plan to index more pages.`;
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

    // Step 4: Perform OCR extraction up to remaining monthly pages quota
    try {
      const result = await ocrService.processDocument({
        fileUrl: doc.fileUrl,
        fileName: doc.originalName || doc.fileName,
        mimeType: doc.mimeType,
        language,
        maxPages: isInternal ? undefined : remainingPages,
      });

      const totalDocPages = result.totalPages || 1;
      const pagesProcessed = result.pagesProcessed || 1;
      const pagesSkipped = result.pagesSkipped || 0;
      const warningMessage = result.warning || null;

      // Step 5: Update document record with extracted text, page count & warning if partial
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

      // Step 6: Deduct only pagesProcessed from subscription usage
      if (subscription && !isInternal) {
        await db
          .update(tenantSubscriptions)
          .set({
            ocrPagesUsedThisMonth: sql`${tenantSubscriptions.ocrPagesUsedThisMonth} + ${pagesProcessed}`,
          })
          .where(eq(tenantSubscriptions.id, subscription.id));
      }

      const updatedUsed = currentUsed + pagesProcessed;
      console.log(
        `[ocrQueue] OCR completed for ${doc.fileName}: ${pagesProcessed} of ${totalDocPages} pages processed (${pagesSkipped} skipped). Quota: ${updatedUsed}/${monthlyLimit}`,
      );

      // Step 7: Send completion email to user (includes partial warning if any pages were skipped)
      if (userEmail) {
        await ocrEmailService.sendOcrSuccessEmail({
          toEmail: userEmail,
          userName: userName || "Advocate",
          fileName: doc.originalName || doc.fileName,
          pageCount: pagesProcessed,
          totalPages: totalDocPages,
          pagesSkipped,
          charCount: result.charCount,
          monthlyPagesUsed: updatedUsed,
          monthlyPagesLimit: monthlyLimit,
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

  /**
   * Get current queue length and status
   */
  public getStatus(): { isProcessing: boolean; pendingJobs: number } {
    return {
      isProcessing: this.isProcessing,
      pendingJobs: this.queue.length,
    };
  }
}

export const ocrQueueService = new OcrQueueService();
export default ocrQueueService;
