import db from "../index.js";
import { tags } from "../schema/index.js";

export default async function seedTags() {
  await db
    .insert(tags)
    .values([
      {
        name: "Follow Up",
        slug: "follow_up",
        isBuiltIn: true,
        color: "#F59E0B",
        tenantId: null,
      },
      {
        name: "Watching",
        slug: "watching",
        isBuiltIn: true,
        color: "#3B82F6",
        tenantId: null,
      },
      {
        name: "Out Station",
        slug: "out_station",
        isBuiltIn: true,
        color: "#8B5CF6",
        tenantId: null,
      },
      {
        name: "Urgent",
        slug: "urgent",
        isBuiltIn: true,
        color: "#EF4444",
        tenantId: null,
      },
      {
        name: "Settled",
        slug: "settled",
        isBuiltIn: true,
        color: "#10B981",
        tenantId: null,
      },
    ])
    .onConflictDoNothing();

  console.log("✅ Built-in tags seeded");
}
