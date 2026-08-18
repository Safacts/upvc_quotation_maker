import { z } from "zod";
import { consoleJson } from "@/lib/console-auth";
import { supaGet } from "@/lib/supabase";

export const itemIdSchema = z.string().uuid("Invalid item id");
export const unitIdSchema = z.string().uuid("Invalid unit id");
export const taxIdSchema = z.string().uuid("Invalid tax id");

const text = (max: number) => z.string().trim().max(max);
const nonNegative = z.coerce.number().finite().min(0);

export const itemWriteSchema = z.object({
  name: text(200).min(1, "Name is required"),
  sku: text(100).default(""),
  description: text(2000).default(""),
  category: text(100).default(""),
  item_type: z.enum(["product", "service", "raw_material", "finished_good"]).default("product"),
  unit_id: z.union([unitIdSchema, z.literal(""), z.null()]).transform((v) => v || null).default(null),
  tax_id: z.union([taxIdSchema, z.literal(""), z.null()]).transform((v) => v || null).default(null),
  hsn_code: text(20).default(""),
  selling_price: nonNegative.default(0),
  purchase_price: nonNegative.default(0),
  min_stock: nonNegative.default(0),
  profile_system: text(100).default(""),
  colour: text(100).default(""),
  glass_specification: text(500).default(""),
  reinforcement: text(200).default(""),
  frame_series: text(100).default(""),
  fabrication_parameters: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
});

export const itemPatchSchema = itemWriteSchema.partial();

export const unitWriteSchema = z.object({
  code: text(20).min(1, "Code is required").transform((v) => v.toUpperCase()),
  name: text(100).min(1, "Name is required"),
  symbol: text(20).min(1, "Symbol is required"),
  decimal_places: z.coerce.number().int().min(0).max(6).default(2),
  is_active: z.boolean().default(true),
});
export const unitPatchSchema = unitWriteSchema.partial();

export function validationError(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return consoleJson({ error: "Validation failed", fields }, 400);
}

export async function assertReferenceOwnership(
  businessId: string,
  unitId: string | null | undefined,
  taxId: string | null | undefined,
) {
  if (unitId) {
    const rows = await supaGet("units", {
      id: `eq.${unitId}`,
      or: `(business_id.is.null,business_id.eq.${businessId})`,
      select: "id,is_active",
      limit: 1,
    });
    if (!rows?.[0]) return "Unit not found or unavailable";
  }
  if (taxId) {
    const rows = await supaGet("taxes", {
      id: `eq.${taxId}`,
      or: `(business_id.is.null,business_id.eq.${businessId})`,
      select: "id,is_active",
      limit: 1,
    });
    if (!rows?.[0]) return "Tax not found or unavailable";
  }
  return null;
}

export const ITEM_SELECT = "id,business_id,sku,name,description,category,item_type,unit_id,tax_id,hsn_code,selling_price,purchase_price,min_stock,profile_system,colour,glass_specification,reinforcement,frame_series,fabrication_parameters,is_active,deleted_at,created_at,updated_at,unit:units(id,code,name,symbol,decimal_places),tax:taxes(id,name,code,rate,tax_type,cgst_rate,sgst_rate,igst_rate)";
