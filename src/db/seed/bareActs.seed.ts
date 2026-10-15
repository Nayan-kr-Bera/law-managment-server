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

export async function seedBareActs(force = false) {
  console.log("📜 Initializing Indian Bare Acts via IndiaCode / Statutory Service...");

  const existingActs = await db.select({ slug: bareActs.slug }).from(bareActs);
  const existingSet = new Set(existingActs.map((a) => a.slug.toLowerCase()));

  const slugsToSeed = force
    ? FLAGSHIP_INDIAN_ACT_SLUGS
    : FLAGSHIP_INDIAN_ACT_SLUGS.filter((s) => !existingSet.has(s.toLowerCase()));

  if (slugsToSeed.length === 0) {
    console.log("ℹ️ All flagship Indian Bare Acts are already installed in the database.");
    return;
  }

  console.log(`🌐 Seeding flagship Acts (${slugsToSeed.length}): ${slugsToSeed.join(", ")}`);

  for (const slug of slugsToSeed) {
    try {
      console.log(`  ⏳ Ingesting '${slug}'...`);
      // Seed with initial provisions for lightning-fast bootstrapping
      await indiaCodeService.importActWithSections(slug, {
        maxSections: 20,
        batchSize: 5,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠️ Could not seed '${slug}': ${message}`);
    }
  }

  console.log("🎉 Flagship Bare Acts seeded successfully!");
}

export default seedBareActs;
