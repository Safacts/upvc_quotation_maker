/**
 * eva-price-structure.ts — Data-driven 20-step Retail Projects structure
 * Mirrors Eva's quotesPriceElements for Aadisheshu (priceStructureId 974)
 * Source: eva-price-elements.json:21 — read-only Aadisheshu capture
 * All rates/formulas are tenant-editable at runtime; this is the default seed.
 */

export type PriceElement = {
  order: number;
  name: string;
  formula: string; // e.g. "#PROFILECOST", "@Profile Cost.value", "1"
  rate: string; // as stored string, e.g. "0.9", "1000"
  calculationTypeId: number;
  effectOnTotal: number;
  showInQuote: boolean;
  showInReport: boolean;
};

export const RETAIL_PROJECTS_ID = 974;
export const RETAIL_PROJECTS_NAME = "Retail Projects";

export const RETAIL_PRICE_ELEMENTS: PriceElement[] = [
  { order: 1, name: "Profile Cost", formula: "#PROFILECOST", rate: "0.9", calculationTypeId: 8, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 2, name: "Profile Wastage", formula: "@Profile Cost.value", rate: "0.9", calculationTypeId: 1, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 3, name: "RI Cost", formula: "#RICOST", rate: "1", calculationTypeId: 8, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 4, name: "RI Wastage", formula: "@RI Cost.value", rate: "5", calculationTypeId: 1, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 5, name: "Hardware Cost", formula: "#HWCOST", rate: "1", calculationTypeId: 8, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 6, name: "Glass Cost", formula: "#GLASSCOST", rate: "1", calculationTypeId: 8, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 7, name: "Glass Wastage", formula: "@Glass Cost.value", rate: "5", calculationTypeId: 1, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 8, name: "Total Raw Material Cost", formula: "@Profile Cost.value+@Profile Wastage.value+@RI Cost.value+@RI Wastage.value+@Hardware Cost.value+@Glass Cost.value+@Glass Wastage.value", rate: "1", calculationTypeId: 8, effectOnTotal: 0, showInQuote: true, showInReport: false },
  { order: 9, name: "Fabrication Labour", formula: "#AreaSqftFg", rate: "70", calculationTypeId: 9, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 10, name: "Installation Labour", formula: "#AreaSqftFg", rate: "50", calculationTypeId: 9, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 11, name: "Sub Total Including Labour", formula: "@Total Raw Material Cost.value+@Fabrication Labour.value+@Installation Labour.value", rate: "1", calculationTypeId: 8, effectOnTotal: 0, showInQuote: true, showInReport: false },
  { order: 12, name: "Profit", formula: "@Sub Total Including Labour.value", rate: "60", calculationTypeId: 1, effectOnTotal: 1, showInQuote: true, showInReport: false },
  { order: 13, name: "Basic Value", formula: "@Sub Total Including Labour.value+@Profit.value", rate: "1", calculationTypeId: 8, effectOnTotal: 0, showInQuote: true, showInReport: true },
  { order: 14, name: "Discount", formula: "@Basic Value.value", rate: "0", calculationTypeId: 1, effectOnTotal: -1, showInQuote: true, showInReport: true },
  { order: 15, name: "Sub Total", formula: "@Basic Value.value+@Discount.value", rate: "1", calculationTypeId: 8, effectOnTotal: 0, showInQuote: true, showInReport: true },
  { order: 16, name: "Transportation Cost", formula: "1", rate: "1000", calculationTypeId: 12, effectOnTotal: 1, showInQuote: true, showInReport: true },
  { order: 17, name: "Loading And Unloading", formula: "1", rate: "1000", calculationTypeId: 12, effectOnTotal: 1, showInQuote: true, showInReport: true },
  { order: 18, name: "Total Project Cost", formula: "@Sub Total.value+@Transportation Cost.value+@Loading And Unloading.value", rate: "1", calculationTypeId: 8, effectOnTotal: 0, showInQuote: true, showInReport: true },
  { order: 19, name: "GST", formula: "@Total Project Cost.value", rate: "18", calculationTypeId: 1, effectOnTotal: 1, showInQuote: true, showInReport: true },
  { order: 20, name: "Grand Total", formula: "@Total Project Cost.value+@GST.value", rate: "1", calculationTypeId: 8, effectOnTotal: 0, showInQuote: true, showInReport: true },
];

export type PriceInputs = {
  profileCost: number;
  riCost: number;
  hwCost: number;
  glassCost: number;
  areaSqft: number;
};

export function calculateRetailPrice(inputs: PriceInputs): Record<string, number> {
  const v: Record<string, number> = {};
  v["Profile Cost"] = inputs.profileCost * parseFloat(RETAIL_PRICE_ELEMENTS[0].rate);
  v["Profile Wastage"] = v["Profile Cost"] * (parseFloat(RETAIL_PRICE_ELEMENTS[1].rate) / 100);
  v["RI Cost"] = inputs.riCost * parseFloat(RETAIL_PRICE_ELEMENTS[2].rate);
  v["RI Wastage"] = v["RI Cost"] * (parseFloat(RETAIL_PRICE_ELEMENTS[3].rate) / 100);
  v["Hardware Cost"] = inputs.hwCost * parseFloat(RETAIL_PRICE_ELEMENTS[4].rate);
  v["Glass Cost"] = inputs.glassCost * parseFloat(RETAIL_PRICE_ELEMENTS[5].rate);
  v["Glass Wastage"] = v["Glass Cost"] * (parseFloat(RETAIL_PRICE_ELEMENTS[6].rate) / 100);
  v["Total Raw Material Cost"] = v["Profile Cost"] + v["Profile Wastage"] + v["RI Cost"] + v["RI Wastage"] + v["Hardware Cost"] + v["Glass Cost"] + v["Glass Wastage"];
  v["Fabrication Labour"] = inputs.areaSqft * parseFloat(RETAIL_PRICE_ELEMENTS[8].rate);
  v["Installation Labour"] = inputs.areaSqft * parseFloat(RETAIL_PRICE_ELEMENTS[9].rate);
  v["Sub Total Including Labour"] = v["Total Raw Material Cost"] + v["Fabrication Labour"] + v["Installation Labour"];
  v["Profit"] = v["Sub Total Including Labour"] * (parseFloat(RETAIL_PRICE_ELEMENTS[11].rate) / 100);
  v["Basic Value"] = v["Sub Total Including Labour"] + v["Profit"];
  v["Discount"] = v["Basic Value"] * (parseFloat(RETAIL_PRICE_ELEMENTS[13].rate) / 100) * Math.sign(RETAIL_PRICE_ELEMENTS[13].effectOnTotal as number);
  v["Sub Total"] = v["Basic Value"] + v["Discount"];
  v["Transportation Cost"] = parseFloat(RETAIL_PRICE_ELEMENTS[15].rate);
  v["Loading And Unloading"] = parseFloat(RETAIL_PRICE_ELEMENTS[16].rate);
  v["Total Project Cost"] = v["Sub Total"] + v["Transportation Cost"] + v["Loading And Unloading"];
  v["GST"] = v["Total Project Cost"] * (parseFloat(RETAIL_PRICE_ELEMENTS[18].rate) / 100);
  v["Grand Total"] = v["Total Project Cost"] + v["GST"];
  return v;
}
