import db from "../index.js";
import { bareActs } from "../schema/index.js";
import { eq } from "drizzle-orm";
import { indiaCodeService } from "../../services/indiaCode.service.js";

// Top flagship Indian Bare Acts to seed automatically on initial setup
export const FLAGSHIP_INDIAN_ACT_SLUGS = [
  "companies-act",
  "constitution-of-india",
  "bns",
  "bnss",
  "bsa",
  "cpc",
  "contract-act",
  "ni-act",
  "competition-act",
  "insolvency-bankruptcy-code-2016",
];

export async function seedBareActs() {
  console.log("📜 Initializing Indian Bare Acts via IndiaCode Hybrid Service...");

  // Check how many acts already exist in the database
  const existingCount = await db.select().from(bareActs).limit(1);

  if (existingCount.length > 0) {
    console.log("ℹ️ Bare Acts table already contains acts. Skipping initial seed.");
    console.log("💡 You can import any of the 10,000+ Acts on-demand via the Admin API: POST /api/v1/admin/bare-acts/indiacode/import");
    return;
  }

  console.log(`🌐 Seeding flagship Acts from IndiaCode API: ${FLAGSHIP_INDIAN_ACT_SLUGS.join(", ")}`);

  for (const slug of FLAGSHIP_INDIAN_ACT_SLUGS) {
    try {
      console.log(`  ⏳ Ingesting '${slug}' from IndiaCode...`);
      // Seed with initial top 10 sections for lightning-fast bootstrapping
      await indiaCodeService.importActWithSections(slug, {
        maxSections: 10,
        batchSize: 5,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠️ Could not seed '${slug}': ${message}`);
    }
  }

  console.log("🎉 Flagship Bare Acts seeded successfully via IndiaCode API!");
  console.log("💡 Any additional act or section is automatically fetched and cached when accessed.");
}

export default seedBareActs;
