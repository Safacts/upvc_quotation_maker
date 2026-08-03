import { NextRequest, NextResponse } from "next/server";

const configs: Record<string, any> = {
  venkateshwara: {
    clientId: "venkateshwara",
    appName: "Venkateshwara UPVC Quote",
    companyName: "Venkateshwara UPVC Windows & Doors",
    companyAddress: "Plot No: 95, Road No: 2, Near Omkar Nagar Bus Stop, LB NAGAR, HYDERABAD – 500074",
    companyContact: "9246588692, 9441888131",
    companyEmail: "jvenkateshupvc@gmail.com",
    companyProprietor: "J.Venkateshwarlu",
    gstNumber: "36AKDPJ7245B2ZF",
    bankName: "VENKATESHWARA WELDING WORKS",
    bankBranch: "Union Bank, Hastinapuram",
    bankAccountNo: "A/C No : 178511100000061",
    bankIfsc: "IFSC Code : UBIN0817856",
    termsAndConditions: [
      "50% advance, 35% after dispatch, 15% after installation.",
      "Delivery minimum 15 days from advance.",
      "All payments in favor of M/s Niksha Industries Pvt Ltd.",
      "Client responsible for site safety & electricity.",
      "Material can be taken back if payment not received.",
      "Final wall-to-wall measurement includes silicone sealant.",
      "Rates may alter if size changes above 1 foot.",
      "Quotation valid for 15 days.",
      "Above rates inclusive of installation.",
    ],
    defaultGstPercentage: 18.0,
    quotePrefix: "JVUPVC",
    logoUrl: "",
    primaryColor: 6513505,
    accentColor: 15508377,
    isActive: true,
    adminEmails: ["jvenkateshupvc@gmail.com", "kongaaadisheshu@gmail.com"],
  },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const config = configs[clientId];
  if (config) {
    return NextResponse.json(config, { headers: CORS_HEADERS });
  }
  return NextResponse.json(
    { error: "Client not found" },
    { status: 404, headers: CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
