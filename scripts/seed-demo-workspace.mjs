#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const CLIENT_ID = "upvc-fabricator-demo";
const args = new Set(process.argv.slice(2));
const clientArg = process.argv.find((arg) => arg.startsWith("--client-id="));
const clientId = clientArg ? clientArg.slice("--client-id=".length) : CLIENT_ID;
const dryRun = args.has("--dry-run");

if (!/^upvc-fabricator-demo(?:-[a-z0-9-]+)?$/.test(clientId)) {
  throw new Error("Refusing to seed a non-demo tenant. Use a client id beginning with upvc-fabricator-demo.");
}

const customers = [
  { id: "d1000000-0000-4000-8000-000000000001", name: "Ramesh Kumar", phone: "+91 98490 11223", email: "ramesh.kumar@example.com", company: "Sri Lakshmi Residency", address: "Plot 18, Kompally, Hyderabad - 500014", gst_number: "36AAEFS8123M1Z5" },
  { id: "d1000000-0000-4000-8000-000000000002", name: "Anita Rao", phone: "+91 99887 22110", email: "anita.rao@example.com", company: "Rao Constructions", address: "Madhapur, Hyderabad - 500081", gst_number: "36AABCR4456F1ZP" },
  { id: "d1000000-0000-4000-8000-000000000003", name: "Kiran Homes", phone: "+91 97031 44556", email: "accounts@kiran-homes.example", company: "Kiran Homes", address: "Tellapur, Hyderabad - 500019", gst_number: "36AAEFK7744P1Z2" },
  { id: "d1000000-0000-4000-8000-000000000004", name: "Meera Srinivas", phone: "+91 91210 77889", email: "meera.srinivas@example.com", company: "Srinivas Villa", address: "Nizampet, Hyderabad - 500090", gst_number: "" },
];

const products = [
  { id: "d2000000-0000-4000-8000-000000000001", name: "2-Track Sliding Window", category: "Sliding Windows", description: "60 mm multi-chamber uPVC frame with 5 mm clear glass", price: 285, unit: "SFT", stock_quantity: 120, low_stock_threshold: 20, hsn_code: "39252000", config: { profile_type: "sliding", glass_type: "single", glass_thickness: 5, hardware_type: "standard", color: "white", mesh_type: "plain" } },
  { id: "d2000000-0000-4000-8000-000000000002", name: "3-Track Sliding Window", category: "Sliding Windows", description: "Three-track frame for sliding shutter plus mosquito mesh", price: 335, unit: "SFT", stock_quantity: 85, low_stock_threshold: 15, hsn_code: "39252000", config: { profile_type: "sliding", glass_type: "single", glass_thickness: 5, hardware_type: "premium", color: "white", mesh_type: "plain" } },
  { id: "d2000000-0000-4000-8000-000000000003", name: "uPVC Casement Window", category: "Casement Windows", description: "Side-hung casement with friction stay and espagnolette lock", price: 395, unit: "SFT", stock_quantity: 64, low_stock_threshold: 12, hsn_code: "39252000", config: { profile_type: "casement", glass_type: "toughened", glass_thickness: 5, hardware_type: "premium", color: "white", mesh_type: "magnetic" } },
  { id: "d2000000-0000-4000-8000-000000000004", name: "uPVC French Door", category: "Doors", description: "Double-leaf French door with reinforced steel core", price: 465, unit: "SFT", stock_quantity: 28, low_stock_threshold: 8, hsn_code: "39252000", config: { profile_type: "casement", glass_type: "toughened", glass_thickness: 6, hardware_type: "heavy-duty", color: "woodgrain", mesh_type: null } },
  { id: "d2000000-0000-4000-8000-000000000005", name: "uPVC Fixed Window", category: "Fixed Windows", description: "Non-opening picture window for maximum daylight", price: 235, unit: "SFT", stock_quantity: 150, low_stock_threshold: 25, hsn_code: "39252000", config: { profile_type: "fixed", glass_type: "double", glass_thickness: 5, hardware_type: "standard", color: "grey", mesh_type: "none" } },
  { id: "d2000000-0000-4000-8000-000000000006", name: "Pleated Mosquito Mesh", category: "Accessories", description: "Retractable pleated mesh shutter, supplied with window", price: 95, unit: "SFT", stock_quantity: 42, low_stock_threshold: 10, hsn_code: "39269099", config: { profile_type: "sliding", glass_type: "single", glass_thickness: 5, hardware_type: "standard", color: "black", mesh_type: "pleated" } },
];

const quotations = [
  { id: "d3000000-0000-4000-8000-000000000001", quote_no: "DEMO-25-26-0001", customer_id: customers[0].id, customer_name: customers[0].name, contact_no: customers[0].phone, email: customers[0].email, address: customers[0].address, status: "draft", reference: "Kompally villa - ground floor", date: "2026-08-17", valid_until: "2026-09-16", transport_cost: 1500, created_at: "2026-08-17T08:30:00+05:30" },
  { id: "d3000000-0000-4000-8000-000000000002", quote_no: "DEMO-25-26-0002", customer_id: customers[1].id, customer_name: customers[1].name, contact_no: customers[1].phone, email: customers[1].email, address: customers[1].address, status: "sent", reference: "Office cabin partition", date: "2026-08-15", valid_until: "2026-09-14", transport_cost: 2500, sent_at: "2026-08-15T12:20:00+05:30", created_at: "2026-08-15T10:00:00+05:30" },
  { id: "d3000000-0000-4000-8000-000000000003", quote_no: "DEMO-25-26-0003", customer_id: customers[2].id, customer_name: customers[2].name, contact_no: customers[2].phone, email: customers[2].email, address: customers[2].address, status: "approved", reference: "Premium 4BHK - Phase 1", date: "2026-08-10", valid_until: "2026-09-09", transport_cost: 3500, sent_at: "2026-08-10T15:00:00+05:30", viewed_at: "2026-08-10T16:12:00+05:30", approved_at: "2026-08-11T09:40:00+05:30", created_at: "2026-08-10T14:20:00+05:30" },
];

const measuredItems = [
  { id: "d4000000-0000-4000-8000-000000000001", quotation_id: quotations[0].id, code: "SW-2T", description: "2-Track Sliding Window - living room", width: 1800, height: 1500, units: 2, glass: "5 mm Clear", rate: 285, bom_config: { product_id: products[0].id, profile: { type: "sliding", tracks: 2, color: "white" }, glass: { type: "clear", thickness_mm: 5 }, hardware: "standard" } },
  { id: "d4000000-0000-4000-8000-000000000002", quotation_id: quotations[0].id, code: "CW-UV", description: "uPVC Casement Window - bedrooms", width: 1200, height: 1200, units: 3, glass: "5 mm Toughened", rate: 395, bom_config: { product_id: products[2].id, profile: { type: "casement", color: "white" }, glass: { type: "toughened", thickness_mm: 5 }, hardware: "premium" } },
  { id: "d4000000-0000-4000-8000-000000000003", quotation_id: quotations[1].id, code: "SW-3T", description: "3-Track Sliding Window - conference room", width: 2400, height: 1500, units: 4, glass: "5 mm Clear", rate: 335, bom_config: { product_id: products[1].id, profile: { type: "sliding", tracks: 3, color: "white" }, glass: { type: "clear", thickness_mm: 5 }, hardware: "premium" } },
  { id: "d4000000-0000-4000-8000-000000000004", quotation_id: quotations[2].id, code: "FD-WG", description: "uPVC French Door - patio", width: 1800, height: 2400, units: 1, glass: "6 mm Toughened", rate: 465, bom_config: { product_id: products[3].id, profile: { type: "casement", color: "woodgrain", leaves: 2 }, glass: { type: "toughened", thickness_mm: 6 }, hardware: "heavy-duty" } },
  { id: "d4000000-0000-4000-8000-000000000005", quotation_id: quotations[2].id, code: "FW-GY", description: "Fixed Picture Window - stairwell", width: 2100, height: 1800, units: 2, glass: "Double Glazed", rate: 235, bom_config: { product_id: products[4].id, profile: { type: "fixed", color: "grey" }, glass: { type: "double", thickness_mm: 5 }, hardware: "standard" } },
];

const unmeasuredItems = [
  { id: "d5000000-0000-4000-8000-000000000001", quotation_id: quotations[0].id, description: "Site measurement, delivery and installation", units: 1, rate: 4500 },
  { id: "d5000000-0000-4000-8000-000000000002", quotation_id: quotations[1].id, description: "Transport and installation at Madhapur", units: 1, rate: 6500 },
  { id: "d5000000-0000-4000-8000-000000000003", quotation_id: quotations[2].id, description: "Scaffolding and installation", units: 1, rate: 8000 },
];

const configs = [
  { id: "d6000000-0000-4000-8000-000000000001", config_key: "company_name", value_type: "string", config_value: { value: "Apex uPVC Fabricators" } },
  { id: "d6000000-0000-4000-8000-000000000002", config_key: "tagline", value_type: "string", config_value: { value: "Precision Windows. Beautiful Homes." } },
  { id: "d6000000-0000-4000-8000-000000000003", config_key: "city", value_type: "string", config_value: { value: "Hyderabad, Telangana" } },
  { id: "d6000000-0000-4000-8000-000000000004", config_key: "gst_number", value_type: "string", config_value: { value: "36AABFA1234C1ZQ" } },
  { id: "d6000000-0000-4000-8000-000000000005", config_key: "primary_color", value_type: "color", config_value: { value: 0xff0f766e } },
  { id: "d6000000-0000-4000-8000-000000000006", config_key: "currency", value_type: "string", config_value: { value: "INR" } },
];

const tableRows = { customers, products, quotations, measuredItems, unmeasuredItems };
function withClient(row) { return { ...row, client_id: clientId }; }

async function seed() {
  console.log(`${dryRun ? "[dry-run] " : ""}Demo tenant: ${clientId}`);
  console.log(`Customers ${customers.length}, products ${products.length}, quotations ${quotations.length}, measured items ${measuredItems.length}`);
  if (dryRun) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key === "your-service-role-key") throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required; use --dry-run to validate locally.");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  async function upsert(table, rows, onConflict = "id") {
    const { error } = await supabase.from(table).upsert(rows.map(withClient), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  await upsert("customers", customers);
  await upsert("products", products.map(({ config, ...product }) => product));
  await upsert("upvc_product_config", products.map(({ config, id: product_id }, index) => ({ id: `d7000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, product_id, ...config })));
  await upsert("quotations", quotations);
  await upsert("measured_items", measuredItems);
  await upsert("unmeasured_items", unmeasuredItems);
  const { error: configError } = await supabase.from("client_config_dynamic").upsert(configs.map((row) => ({ ...row, client_id: clientId })), { onConflict: "client_id,config_key" });
  if (configError) throw new Error(`client_config_dynamic: ${configError.message}`);
  console.log("Seed complete. Re-running this command updates only the fixed demo records.");
}

await seed();
