import { describe, it, expect } from "vitest";
import { buildQuotationPdf } from "@/lib/quotation-pdf";

describe("buildQuotationPdf — multiline item descriptions", () => {
  it("renders multiline item descriptions across rows with expanded height without crashing", async () => {
    const bytes = await buildQuotationPdf({
      quoteNo: "Q-MULTI-100",
      date: new Date(),
      customerName: "Multiline Test Customer",
      contactNo: "9848012345",
      email: "customer@example.com",
      address: "Plot 10, Banjara Hills, Hyderabad",
      reference: "Ref-101",
      supplierCompany: "KPR UPVC Windows",
      companyName: "Acme Windows",
      companyAddress: "123 Industrial Estate",
      companyProprietor: "Suresh",
      companyContact: "9876543210",
      gstNumber: "36AAAPL1234C1Z1",
      bankName: "HDFC",
      bankBranch: "Main",
      bankAccountNo: "1234567890",
      bankIfsc: "HDFC0001234",
      termsAndConditions: ["1. Standard 5-year profile warranty."],
      totals: {
        totalMeasured: 12000,
        totalUnmeasured: 2000,
        subtotal: 14000,
        transport: 500,
        discountAmount: 0,
        discountPercentage: 0,
        netTotal: 14500,
        gstPercentage: 18,
        gstAmount: 2610,
        grandTotal: 17110,
        advancePaid: 5000,
        balanceDue: 12110,
        roundoff: 0,
        totalSqft: 40,
      },
      measured: [
        {
          code: "W1",
          description: "Hall window\n3-Track Sliding with Mosquito Mesh\nSaint-Gobain 5mm Clear Toughened Glass",
          glass: "5mm Clear",
          width: 1800,
          height: 1500,
          units: 1,
          rate: 550,
        },
        {
          code: "W2",
          description: "Kitchen Casement\nSingle openable sash with top fixed glass",
          glass: "Pinhead",
          width: 900,
          height: 1200,
          units: 2,
          rate: 480,
        },
      ],
      unmeasured: [
        {
          description: "Special fastener kit\nSilicon sealant & weather strips\nInstallation and scaffolding charge",
          units: 1,
          rate: 2000,
        },
      ],
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    // PDF header %PDF-1.x
    expect(bytes[0]).toBe(0x25); // %
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x44); // D
    expect(bytes[3]).toBe(0x46); // F
    // Valid multi-page document
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
