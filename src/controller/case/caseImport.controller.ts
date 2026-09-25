import { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import db from "../../db/index.js";
import { cases, courts, caseTypes } from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

interface CaseImportRow {
  title?: string;
  caseNumber?: string;
  firstParty?: string;
  oppositeParty?: string;
  courtNumber?: string;
  year?: number;
  stage?: string;
  remarks?: string;
}

const caseImportController = {
  /**
   * Dedicated controller for importing cases from Excel / CSV files or JSON rows
   * Route: POST /api/cases/import-excel
   */
  async importExcelCases(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const tenantId = req.user.tenantId;
      const officeId = req.officeId;
      const userId = req.user.userId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      let targetCourtId = req.body.courtId as string | undefined;
      let targetCaseTypeId = req.body.caseTypeId as string | undefined;
      const defaultYear = Number(req.body.year) || new Date().getFullYear();

      // If courtId or caseTypeId not specified, find defaults for this tenant
      if (!targetCourtId) {
        const [defaultCourt] = await db
          .select({ id: courts.id })
          .from(courts)
          .where(and(eq(courts.tenantId, tenantId), eq(courts.isActive, true)))
          .limit(1);

        targetCourtId = defaultCourt?.id;
      }

      if (!targetCaseTypeId) {
        const [defaultType] = await db
          .select({ id: caseTypes.id })
          .from(caseTypes)
          .where(and(eq(caseTypes.tenantId, tenantId), eq(caseTypes.isActive, true)))
          .limit(1);

        targetCaseTypeId = defaultType?.id;
      }

      if (!targetCourtId || !targetCaseTypeId) {
        return next(
          CustomErrorHandler.badRequest(
            "Please configure at least one Court and Case Type in master settings before importing cases.",
          ),
        );
      }

      const rowsToImport: CaseImportRow[] = [];

      // 1. Check if uploaded as a multipart CSV file via req.file
      if (req.file && req.file.buffer) {
        const fileContent = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, "");
        const lines = fileContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

        if (lines.length > 1) {
          const headerLine = lines[0].toLowerCase();
          const headers = headerLine.split(",").map((h) => h.trim().replace(/['"]/g, ""));

          const findIdx = (aliases: string[]) => {
            return headers.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
          };

          const caseNumIdx = findIdx(["case number", "case no", "caseno", "number"]);
          const titleIdx = findIdx(["title", "case title", "name"]);
          const firstPartyIdx = findIdx(["first party", "petitioner", "plaintiff", "firstparty"]);
          const oppPartyIdx = findIdx(["opposite party", "respondent", "defendant", "oppparty"]);
          const courtNoIdx = findIdx(["court room", "court room no", "court no", "courtnum", "room"]);
          const yearIdx = findIdx(["year"]);
          const stageIdx = findIdx(["stage", "purpose"]);
          const remarksIdx = findIdx(["remarks", "notes", "comment"]);

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            const cols: string[] = [];
            let inQuotes = false;
            let current = "";

            for (let ch = 0; ch < line.length; ch++) {
              const char = line[ch];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === "," && !inQuotes) {
                cols.push(current.trim());
                current = "";
              } else {
                current += char;
              }
            }
            cols.push(current.trim());

            const caseNumber = caseNumIdx !== -1 && cols[caseNumIdx] ? cols[caseNumIdx] : cols[0] || "";
            const title = titleIdx !== -1 && cols[titleIdx] ? cols[titleIdx] : cols[1] || "";
            const firstParty = firstPartyIdx !== -1 ? cols[firstPartyIdx] : cols[2] || "";
            const oppositeParty = oppPartyIdx !== -1 ? cols[oppPartyIdx] : cols[3] || "";
            const courtNumber = courtNoIdx !== -1 ? cols[courtNoIdx] : "";
            const year = yearIdx !== -1 && !isNaN(Number(cols[yearIdx])) ? Number(cols[yearIdx]) : defaultYear;
            const stage = stageIdx !== -1 ? cols[stageIdx] : "";
            const remarks = remarksIdx !== -1 ? cols[remarksIdx] : "";

            const resolvedTitle = title || (caseNumber ? `Case ${caseNumber}` : "");

            if (resolvedTitle || caseNumber) {
              rowsToImport.push({
                title: resolvedTitle,
                caseNumber: caseNumber || undefined,
                firstParty: firstParty || undefined,
                oppositeParty: oppositeParty || undefined,
                courtNumber: courtNumber || undefined,
                year,
                stage: stage || undefined,
                remarks: remarks || undefined,
              });
            }
          }
        }
      } else if (Array.isArray(req.body.cases) && req.body.cases.length > 0) {
        // 2. Direct JSON payload from client preview
        for (const item of req.body.cases) {
          const resolvedTitle = item.title || (item.caseNumber ? `Case ${item.caseNumber}` : "");
          if (resolvedTitle || item.caseNumber) {
            rowsToImport.push({
              title: resolvedTitle,
              caseNumber: item.caseNumber || undefined,
              firstParty: item.firstParty || undefined,
              oppositeParty: item.oppositeParty || undefined,
              courtNumber: item.courtNumber || undefined,
              year: Number(item.year) || defaultYear,
              stage: item.stage || undefined,
              remarks: item.remarks || undefined,
            });
          }
        }
      }

      if (rowsToImport.length === 0) {
        return next(
          CustomErrorHandler.badRequest(
            "No valid case rows found to import. Please check file formatting or provide case details.",
          ),
        );
      }

      let successCount = 0;
      let failedCount = 0;

      for (const row of rowsToImport) {
        try {
          await db.insert(cases).values({
            tenantId,
            officeId: officeId || null,
            courtId: targetCourtId,
            caseTypeId: targetCaseTypeId,
            title: row.title || "Untitled Case",
            caseNumber: row.caseNumber || null,
            firstParty: row.firstParty || null,
            oppositeParty: row.oppositeParty || null,
            courtNumber: row.courtNumber || null,
            year: row.year || defaultYear,
            stage: row.stage || null,
            remarks: row.remarks || null,
            status: "open",
            priority: "medium",
            isDecided: false,
            isAbandoned: false,
            isArchived: false,
            createdBy: userId || null,
            updatedBy: userId || null,
          });
          successCount++;
        } catch (insertError) {
          console.error("Failed to insert imported case row:", row, insertError);
          failedCount++;
        }
      }

      return res.status(200).json({
        success: true,
        message: `Successfully imported ${successCount} case${successCount > 1 ? "s" : ""} into your chamber docket.`,
        data: {
          totalProcessed: rowsToImport.length,
          successCount,
          failedCount,
        },
      });
    } catch (error) {
      console.error("importExcelCases error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default caseImportController;
