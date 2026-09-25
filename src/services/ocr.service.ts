import { createWorker } from "tesseract.js";
import { PDFParse } from "pdf-parse";

export interface OcrExtractionResult {
  text: string;
  source: "pdf_text" | "tesseract_ocr" | "empty";
  charCount: number;
  totalPages: number;
  pagesProcessed: number;
  pagesSkipped: number;
  warning?: string;
}

export const ocrService = {
  /**
   * Download a file buffer from a remote URL (Cloudinary)
   */
  async fetchBufferFromUrl(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },

  /**
   * Extract text from PDF buffer using PDFParse and compute page count.
   * If maxPages is provided, only extracts up to maxPages and skips the rest.
   */
  async extractTextFromPdf(
    buffer: Buffer,
    maxPages?: number,
  ): Promise<{
    text: string | null;
    totalPages: number;
    pagesProcessed: number;
    pagesSkipped: number;
    warning?: string;
  }> {
    try {
      const parser = new PDFParse({ data: buffer });
      const parseOptions =
        maxPages && maxPages > 0 ? { first: maxPages } : {};
      const result = await parser.getText(parseOptions);
      const extracted = (result?.text || "").trim();
      const totalPages = Math.max(1, Number(result?.total || 1));
      const pagesProcessed =
        maxPages && maxPages > 0 ? Math.min(totalPages, maxPages) : totalPages;
      const pagesSkipped = Math.max(0, totalPages - pagesProcessed);
      const warning =
        pagesSkipped > 0
          ? `Processed first ${pagesProcessed} of ${totalPages} pages. Last ${pagesSkipped} pages were skipped due to monthly page limit.`
          : undefined;

      return {
        text: extracted.length > 25 ? extracted : null,
        totalPages,
        pagesProcessed,
        pagesSkipped,
        warning,
      };
    } catch (error) {
      console.warn("[ocrService] Direct PDF text parsing encountered an error:", error);
      return { text: null, totalPages: 1, pagesProcessed: 1, pagesSkipped: 0 };
    }
  },

  /**
   * Quick estimation/retrieval of page count from a document buffer
   */
  async getDocumentPageCount(buffer: Buffer, isPdf: boolean): Promise<number> {
    if (!isPdf) return 1;
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return Math.max(1, Number(result?.total || 1));
    } catch {
      return 1;
    }
  },

  /**
   * Run Tesseract OCR on an image buffer (supports English + Hindi)
   */
  async runTesseractOnImage(
    imageBuffer: Buffer | string,
    language: string = "eng+hin",
  ): Promise<string> {
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      const langList = language.includes("+") ? language.split("+") : language;
      worker = await createWorker(langList);
      const ret = await worker.recognize(imageBuffer);
      return (ret?.data?.text || "").trim();
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // ignore termination errors
        }
      }
    }
  },

  /**
   * Main entrypoint to extract text from a document.
   * If document exceeds maxPages, processes up to maxPages and skips the rest.
   */
  async processDocument({
    fileUrl,
    buffer,
    mimeType,
    fileName,
    language = "eng+hin",
    maxPages,
  }: {
    fileUrl: string;
    buffer?: Buffer;
    mimeType?: string | null;
    fileName: string;
    language?: string;
    maxPages?: number;
  }): Promise<OcrExtractionResult> {
    const isPdf =
      mimeType?.toLowerCase().includes("pdf") ||
      fileName.toLowerCase().endsWith(".pdf");

    const fileBuffer = buffer || (await this.fetchBufferFromUrl(fileUrl));

    if (isPdf) {
      // Step 1: Instant digital PDF text extraction
      const {
        text: directText,
        totalPages,
        pagesProcessed,
        pagesSkipped,
        warning,
      } = await this.extractTextFromPdf(fileBuffer, maxPages);

      if (directText && directText.length > 25) {
        return {
          text: directText,
          source: "pdf_text",
          charCount: directText.length,
          totalPages,
          pagesProcessed,
          pagesSkipped,
          warning,
        };
      }

      // Step 2: Scanned PDF without embedded text.
      // Use Cloudinary page image or PDFParse screenshot for OCR
      try {
        let imageToOcr: Buffer | string = fileBuffer;
        if (fileUrl.includes("res.cloudinary.com")) {
          // Cloudinary renders page 1 of PDF as high-res PNG for OCR
          imageToOcr = fileUrl.replace(/\.pdf$/i, ".png");
        } else {
          try {
            const parser = new PDFParse({ data: fileBuffer });
            if (typeof parser.getScreenshot === "function") {
              const screenshot = await parser.getScreenshot();
              if (screenshot) {
                imageToOcr = Buffer.isBuffer(screenshot)
                  ? screenshot
                  : "data" in screenshot && Buffer.isBuffer((screenshot as { data: Buffer }).data)
                    ? (screenshot as { data: Buffer }).data
                    : Buffer.from(screenshot as unknown as ArrayBuffer);
              }
            }
          } catch (shotError) {
            console.warn("[ocrService] PDF screenshot fallback error:", shotError);
          }
        }

        const ocrText = await this.runTesseractOnImage(imageToOcr, language);
        return {
          text: ocrText,
          source: "tesseract_ocr",
          charCount: ocrText.length,
          totalPages,
          pagesProcessed,
          pagesSkipped,
          warning,
        };
      } catch (ocrErr) {
        console.error("[ocrService] OCR fallback failed for PDF:", ocrErr);
        throw ocrErr;
      }
    }

    // Step 3: Image files (jpg, jpeg, png, webp, tiff)
    const ocrText = await this.runTesseractOnImage(fileBuffer, language);
    return {
      text: ocrText,
      source: "tesseract_ocr",
      charCount: ocrText.length,
      totalPages: 1,
      pagesProcessed: 1,
      pagesSkipped: 0,
    };
  },
};

export default ocrService;
