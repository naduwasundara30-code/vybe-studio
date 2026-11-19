import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

// Campaigns saved to the cloud. Anyone with the id can open a read-only copy;
// only the holder of edit_key (kept in the creator's browser) can overwrite it.
export const campaigns = pgTable("campaigns", {
  id: uuid().primaryKey().defaultRandom(),
  editKey: text("edit_key").notNull(),
  name: text().notNull().default(""),
  brand: text().notNull().default(""),
  data: jsonb().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
