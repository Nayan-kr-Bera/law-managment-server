import { inArray } from "drizzle-orm";
import db from "../db/index.js";
import users from "../db/schema/users.js";
import clients from "../db/schema/clients/clients.js";
import caseNotes from "../db/schema/caseMangment/caseNotes.js";

export interface FormattedCaseRemark {
  id: string;
  caseId: string;
  createdBy?: string | null;
  content: string;
  note: string;
  authorName: string;
  authorRole: "client" | "advocate" | "staff";
  isPrivate: boolean;
  createdAt: Date | string;
}

export async function formatCaseRemarks(
  notes: (typeof caseNotes.$inferSelect)[]
): Promise<FormattedCaseRemark[]> {
  if (!notes || notes.length === 0) return [];

  const creatorIds = Array.from(
    new Set(notes.map((n) => n.createdBy).filter(Boolean) as string[])
  );

  const userMap = new Map<string, { name: string; role: "advocate" | "staff" }>();
  const clientMap = new Map<string, { name: string; role: "client" }>();

  if (creatorIds.length > 0) {
    try {
      const userRecords = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, creatorIds));

      for (const u of userRecords) {
        userMap.set(u.id, {
          name: u.name || "Advocate Counsel",
          role: "advocate",
        });
      }
    } catch (e) {
      console.error("formatCaseRemarks user query error:", e);
    }

    const remainingIds = creatorIds.filter((id) => !userMap.has(id));
    if (remainingIds.length > 0) {
      try {
        const clientRecords = await db
          .select({
            id: clients.id,
            firstName: clients.firstName,
            lastName: clients.lastName,
            companyName: clients.companyName,
          })
          .from(clients)
          .where(inArray(clients.id, remainingIds));

        for (const c of clientRecords) {
          const clientName =
            [c.firstName, c.lastName].filter(Boolean).join(" ") ||
            c.companyName ||
            "Client";
          clientMap.set(c.id, {
            name: clientName,
            role: "client",
          });
        }
      } catch (e) {
        console.error("formatCaseRemarks client query error:", e);
      }
    }
  }

  return notes.map((n) => {
    let authorName = "Legal Counsel";
    let authorRole: "client" | "advocate" | "staff" = "advocate";

    if (n.createdBy) {
      if (userMap.has(n.createdBy)) {
        const u = userMap.get(n.createdBy)!;
        authorName = u.name;
        authorRole = u.role;
      } else if (clientMap.has(n.createdBy)) {
        const c = clientMap.get(n.createdBy)!;
        authorName = c.name;
        authorRole = c.role;
      }
    }

    return {
      id: n.id,
      caseId: n.caseId || "",
      createdBy: n.createdBy,
      content: n.note,
      note: n.note,
      authorName,
      authorRole,
      isPrivate: Boolean(n.isPrivate),
      createdAt: n.createdAt,
    };
  });
}
