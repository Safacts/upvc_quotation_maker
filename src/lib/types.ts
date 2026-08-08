export interface ClientConfig {
  clientId: string;
  appName: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail: string;
  companyProprietor: string;
  gstNumber: string;
  bankName: string;
  bankBranch: string;
  bankAccountNo: string;
  bankIfsc: string;
  termsAndConditions: string[];
  defaultGstPercentage: number;
  cost_margin_percent: number;
  enablePricePresets: boolean;
  measuredPresets: { name: string; code: string; description: string; glass: string; rate: number }[];
  unmeasuredPresets: { name: string; code: string; description: string; rate: number }[];
  quotePrefix: string;
  logoUrl: string;
  invoiceTopLogoUrl: string;
  invoiceBackgroundLogoUrl: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  appDownloadUrl: string;
  primaryColor?: number;
  accentColor?: number;
  trialExpiresAt?: string | null;
  lastBuildTriggeredAt?: string;
  lastBuildCompletedAt?: string;
  isActive: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  adminEmails: string[];
  landingHeroTitle: string;
  landingHeroSubtitle: string;
  landingHeroImage: string;
  landingFeatures: string[];
  landingServices: string[];
  landingGallery: string[];
  landingMapUrl: string;
  landingAboutTitle: string;
  landingAboutText: string;
  landingTestimonials: { title?: string; text?: string; author?: string }[];
  landingCTA: string;
  landingFooter: string;
  supplierCompanies: string[];
}

export function parseClientConfig(cfg: Record<string, any>, clientId: string): ClientConfig {
  return {
    clientId: String(cfg.clientId || clientId || ""),
    appName: String(cfg.appName || "UPVC Quotation Maker"),
    companyName: String(cfg.companyName || ""),
    companyAddress: String(cfg.companyAddress || ""),
    companyContact: String(cfg.companyContact || ""),
    companyEmail: String(cfg.companyEmail || ""),
    companyProprietor: String(cfg.companyProprietor || ""),
    gstNumber: String(cfg.gstNumber || ""),
    bankName: String(cfg.bankName || ""),
    bankBranch: String(cfg.bankBranch || ""),
    bankAccountNo: String(cfg.bankAccountNo || ""),
    bankIfsc: String(cfg.bankIfsc || ""),
    termsAndConditions: Array.isArray(cfg.termsAndConditions) 
      ? cfg.termsAndConditions.map(String) 
      : typeof cfg.termsAndConditions === 'string' 
        ? cfg.termsAndConditions.split('\n').filter((s: string) => s.trim() !== '')
        : [],
    defaultGstPercentage: Number(cfg.defaultGstPercentage ?? 18.0),
    cost_margin_percent: Number(cfg.cost_margin_percent ?? 0),
    enablePricePresets: cfg.enablePricePresets === true,
    measuredPresets: Array.isArray(cfg.measuredPresets)
      ? cfg.measuredPresets.map((p: any) => ({
          name: String((p && p.name) || ""),
          code: String((p && p.code) || ""),
          description: String((p && p.description) || ""),
          glass: String((p && p.glass) || ""),
          rate: Number((p && p.rate) || 0),
        }))
      : [],
    unmeasuredPresets: Array.isArray(cfg.unmeasuredPresets)
      ? cfg.unmeasuredPresets.map((p: any) => ({
          name: String((p && p.name) || ""),
          code: String((p && p.code) || ""),
          description: String((p && p.description) || ""),
          rate: Number((p && p.rate) || 0),
        }))
      : [],
    quotePrefix: String(cfg.quotePrefix || "JVUPVC"),
    logoUrl: String(cfg.logoUrl || ""),
    invoiceTopLogoUrl: String(cfg.invoiceTopLogoUrl || ""),
    invoiceBackgroundLogoUrl: String(cfg.invoiceBackgroundLogoUrl || ""),
    seoTitle: String(cfg.seoTitle || ""),
    seoDescription: String(cfg.seoDescription || ""),
    seoKeywords: String(cfg.seoKeywords || ""),
    appDownloadUrl: String(cfg.appDownloadUrl || ""),
    primaryColor: typeof cfg.primaryColor === "number" ? cfg.primaryColor : undefined,
    accentColor: typeof cfg.accentColor === "number" ? cfg.accentColor : undefined,
    trialExpiresAt: cfg.trialExpiresAt ? String(cfg.trialExpiresAt) : null,
    lastBuildTriggeredAt: cfg.lastBuildTriggeredAt ? String(cfg.lastBuildTriggeredAt) : undefined,
    lastBuildCompletedAt: cfg.lastBuildCompletedAt ? String(cfg.lastBuildCompletedAt) : undefined,
    isActive: cfg.isActive !== false,
    supabaseUrl: String(cfg.supabaseUrl || "https://gumpmnbjdtzajhysnnaz.supabase.co"),
    supabaseAnonKey: String(cfg.supabaseAnonKey || ""),
    adminEmails: Array.isArray(cfg.adminEmails) ? cfg.adminEmails.map(String) : [],
    landingHeroTitle: String(cfg.landingHeroTitle || ""),
    landingHeroSubtitle: String(cfg.landingHeroSubtitle || "Quality UPVC solutions for your home"),
    landingHeroImage: String(cfg.landingHeroImage || ""),
    landingFeatures: Array.isArray(cfg.landingFeatures) ? cfg.landingFeatures.map(String) : [],
    landingServices: Array.isArray(cfg.landingServices)
      ? cfg.landingServices.map(String)
      : ["UPVC Windows", "UPVC Doors", "Glass Installation", "Repairs & Maintenance"],
    landingGallery: Array.isArray(cfg.landingGallery) ? cfg.landingGallery.map(String) : [],
    landingMapUrl: String(cfg.landingMapUrl || ""),
    landingAboutTitle: String(cfg.landingAboutTitle || ""),
    landingAboutText: String(cfg.landingAboutText || ""),
    landingTestimonials: Array.isArray(cfg.landingTestimonials)
      ? cfg.landingTestimonials.map((t) => ({
          title: String((t && (t as any).title) || ""),
          text: String((t && (t as any).text) || ""),
          author: String((t && (t as any).author) || ""),
        }))
      : [],
    landingCTA: String(cfg.landingCTA || ""),
    landingFooter: String(cfg.landingFooter || ""),
    supplierCompanies: Array.isArray(cfg.supplierCompanies) ? cfg.supplierCompanies.map(String) : [],
  };
}
