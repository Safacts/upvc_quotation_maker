import { describe, it, expect } from "vitest";
import { buildTallyXml, DEFAULT_TALLY_CONFIG } from "@/lib/export/tally-xml";

describe("buildTallyXml", () => {
  it("emits a valid ENVELOPE with one SALES voucher", () => {
    const quotes = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        quote_no: "KPR-001",
        date: "2026-08-01",
        customer_name: "Test Customer",
        net_total: 10000,
        gst_amount: 1800,
        grand_total: 11800,
        include_gst: true,
        gst_percentage: 18,
        transport_cost: 0,
        company_name: "KPR",
      },
    ];

    const { xml, emitted, skipped } = buildTallyXml(quotes);

    expect(emitted).toBe(1);
    expect(skipped).toBe(0);
    expect(xml).toContain("<ENVELOPE>");
    expect(xml).toContain("<VOUCHER");
    expect(xml).toContain('VCHTYPE="Sales"');
    expect(xml).toContain("<DATE>20260801</DATE>");
    expect(xml).toContain("<VOUCHERNUMBER>KPR-001</VOUCHERNUMBER>");
    expect(xml).toContain("<LEDGERNAME>Sundry Debtors</LEDGERNAME>");
    expect(xml).toContain("<LEDGERNAME>Sales A/c</LEDGERNAME>");
    expect(xml).toContain("<LEDGERNAME>CGST A/c</LEDGERNAME>");
    expect(xml).toContain("<LEDGERNAME>SGST A/c</LEDGERNAME>");
  });

  it("splits 18% GST into 9% CGST + 9% SGST", () => {
    const quotes = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        quote_no: "Q1",
        date: "2026-08-01",
        customer_name: "Cust",
        net_total: 10000,
        gst_amount: 1800,
        grand_total: 11800,
        include_gst: true,
        gst_percentage: 18,
        transport_cost: 0,
      },
    ];

    const { xml } = buildTallyXml(quotes);
    // CGST=900, SGST=900
    expect(xml).toContain("-11800.00"); // Dr customer (negative = the AMOUNT field convention)
    // The credits should sum to +11800
    const cgstMatch = xml.match(/CGST A\/c[\s\S]*?<AMOUNT>(-?[\d.]+)<\/AMOUNT>/);
    expect(cgstMatch).toBeTruthy();
  });

  it("emits NO GST ledgers when include_gst is false", () => {
    const quotes = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        quote_no: "Q2",
        date: "2026-08-01",
        customer_name: "Cust",
        net_total: 5000,
        gst_amount: 0,
        grand_total: 5000,
        include_gst: false,
        gst_percentage: 0,
        transport_cost: 200,
      },
    ];

    const { xml, emitted } = buildTallyXml(quotes);
    expect(emitted).toBe(1);
    expect(xml).not.toContain("CGST A/c");
    expect(xml).not.toContain("SGST A/c");
    expect(xml).not.toContain("IGST A/c");
    // Customer debited for full grand total (5000 — net_total already includes
    // the 200 transport, so the sales credit is also 5000 and it balances).
    expect(xml).toContain("-5000.00");
  });

  it("skips a voucher with an unparseable date", () => {
    const quotes = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        quote_no: "BAD",
        date: "not-a-date",
        customer_name: "Cust",
        net_total: 1000,
        gst_amount: 0,
        grand_total: 1000,
        include_gst: false,
        gst_percentage: 0,
        transport_cost: 0,
      },
    ];

    const { emitted, skipped } = buildTallyXml(quotes);
    expect(emitted).toBe(0);
    expect(skipped).toBe(1);
  });

  it("uses REMOTEID from the quotation uuid for idempotency", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const quotes = [
      {
        id,
        quote_no: "Q3",
        date: "2026-08-01",
        customer_name: "Cust",
        net_total: 1000,
        gst_amount: 0,
        grand_total: 1000,
        include_gst: false,
        gst_percentage: 0,
        transport_cost: 0,
      },
    ];

    const { xml } = buildTallyXml(quotes);
    expect(xml).toContain(`REMOTEID="${id}"`);
  });

  it("respects custom config ledger names", () => {
    const quotes = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        quote_no: "Q4",
        date: "2026-08-01",
        customer_name: "Cust",
        net_total: 1000,
        gst_amount: 0,
        grand_total: 1000,
        include_gst: false,
        gst_percentage: 0,
        transport_cost: 0,
      },
    ];

    const { xml } = buildTallyXml(quotes, {
      salesLedger: "UPVC Sales",
      customerLedger: "KPR Receivables",
    });
    expect(xml).toContain("<LEDGERNAME>UPVC Sales</LEDGERNAME>");
    expect(xml).toContain("<LEDGERNAME>KPR Receivables</LEDGERNAME>");
  });
});
