export interface ClientConfig {
  clientId: string;
  appName: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail: string;
  companyProprietor: string;
  gstNumber: string;
  panNumber: string;
  bankName: string;
  bankBranch: string;
  bankAccountNo: string;
  bankIfsc: string;
  upiId: string;
  secondaryContact: string;
  whatsappNumber: string;
  stateCode: string;
  hsnCode: string;
  termsAndConditions: string[];
  defaultGstPercentage: number;
  cost_margin_percent: number;
  quoteValidityDays: number;
  quoteNotes: string;
  authorizedSignatory: string;
  signatureUrl: string;
  placeOfSupply: string;
  labourCostPerSqft: number;
  installationCostPerSqft: number;
  wastagePercent: number;
  defaultTransportCost: number;
  defaultAdvancePercent: number;
  establishmentYear: string;
  businessHours: string;
  serviceAreas: string[];
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  googleMapsUrl: string;
  enablePricePresets: boolean;
  enableRateCard: boolean;
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
  appVersionName?: string;
  appVersionCode?: number;
  appReleaseNotes?: string;
  forceUpdate?: boolean;
  lastBuildVersionName?: string;
  lastBuildVersionCode?: number;
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
  // legado compat
  subBrandName?: string;
  subBrandLogoUrl?: string;
  subBrandTagline?: string;
  isPaid?: boolean;
  tier?: string;
  enableAdvance?: boolean;
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
    panNumber: String(cfg.panNumber || cfg.pan_number || ""),
    bankName: String(cfg.bankName || ""),
    bankBranch: String(cfg.bankBranch || ""),
    bankAccountNo: String(cfg.bankAccountNo || ""),
    bankIfsc: String(cfg.bankIfsc || ""),
    upiId: String(cfg.upiId || cfg.upi_id || ""),
    secondaryContact: String(cfg.secondaryContact || cfg.secondary_contact || ""),
    whatsappNumber: String(cfg.whatsappNumber || cfg.whatsapp_number || cfg.companyContact || ""),
    stateCode: String(cfg.stateCode || cfg.state_code || ""),
    hsnCode: String(cfg.hsnCode || cfg.hsn_code || "3925"),
    termsAndConditions: Array.isArray(cfg.termsAndConditions) 
      ? cfg.termsAndConditions.map(String) 
      : typeof cfg.termsAndConditions === 'string' 
        ? cfg.termsAndConditions.split('\n').filter((s: string) => s.trim() !== '')
        : [],
    defaultGstPercentage: Number(cfg.defaultGstPercentage ?? 18.0),
    cost_margin_percent: Number(cfg.cost_margin_percent ?? 0),
    quoteValidityDays: Number(cfg.quoteValidityDays ?? cfg.quote_validity_days ?? 15),
    quoteNotes: String(cfg.quoteNotes || cfg.quote_notes || ""),
    authorizedSignatory: String(cfg.authorizedSignatory || cfg.authorized_signatory || cfg.companyProprietor || ""),
    signatureUrl: String(cfg.signatureUrl || cfg.signature_url || ""),
    placeOfSupply: String(cfg.placeOfSupply || cfg.place_of_supply || ""),
    labourCostPerSqft: Number(cfg.labourCostPerSqft ?? cfg.labour_cost_per_sqft ?? 0),
    installationCostPerSqft: Number(cfg.installationCostPerSqft ?? cfg.installation_cost_per_sqft ?? 0),
    wastagePercent: Number(cfg.wastagePercent ?? cfg.wastage_percent ?? 3),
    defaultTransportCost: Number(cfg.defaultTransportCost ?? cfg.default_transport_cost ?? 0),
    defaultAdvancePercent: Number(cfg.defaultAdvancePercent ?? cfg.default_advance_percent ?? 50),
    establishmentYear: String(cfg.establishmentYear || cfg.establishment_year || ""),
    businessHours: String(cfg.businessHours || cfg.business_hours || "Mon-Sat 9:30 AM - 7:30 PM"),
    serviceAreas: Array.isArray(cfg.serviceAreas) ? cfg.serviceAreas.map(String) : typeof cfg.serviceAreas === 'string' && cfg.serviceAreas ? cfg.serviceAreas.split(',').map((s:string)=>s.trim()).filter(Boolean) : [],
    facebookUrl: String(cfg.facebookUrl || cfg.facebook_url || ""),
    instagramUrl: String(cfg.instagramUrl || cfg.instagram_url || ""),
    youtubeUrl: String(cfg.youtubeUrl || cfg.youtube_url || ""),
    googleMapsUrl: String(cfg.googleMapsUrl || cfg.google_maps_url || cfg.landingMapUrl || ""),
    enablePricePresets: cfg.enablePricePresets === true,
    enableRateCard: cfg.enableRateCard === true,
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
    appVersionName: cfg.appVersionName ? String(cfg.appVersionName) : undefined,
    appVersionCode: typeof cfg.appVersionCode === "number" ? cfg.appVersionCode : (cfg.appVersionCode != null ? Number(cfg.appVersionCode) : undefined),
    appReleaseNotes: cfg.appReleaseNotes ? String(cfg.appReleaseNotes) : undefined,
    forceUpdate: cfg.forceUpdate === true,
    lastBuildVersionName: cfg.lastBuildVersionName ? String(cfg.lastBuildVersionName) : undefined,
    lastBuildVersionCode: typeof cfg.lastBuildVersionCode === "number" ? cfg.lastBuildVersionCode : (cfg.lastBuildVersionCode != null ? Number(cfg.lastBuildVersionCode) : undefined),
    isActive: cfg.isActive !== false,
    supabaseUrl: String(cfg.supabaseUrl || "https://jqjxhhgfwdzckijnnede.supabase.co"),
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
    subBrandName: cfg.subBrandName ? String(cfg.subBrandName) : (cfg.sub_brand_name ? String(cfg.sub_brand_name) : undefined),
    subBrandLogoUrl: cfg.subBrandLogoUrl ? String(cfg.subBrandLogoUrl) : (cfg.sub_brand_logo_url ? String(cfg.sub_brand_logo_url) : undefined),
    subBrandTagline: cfg.subBrandTagline ? String(cfg.subBrandTagline) : (cfg.sub_brand_tagline ? String(cfg.sub_brand_tagline) : undefined),
    isPaid: typeof cfg.isPaid === 'boolean' ? cfg.isPaid : undefined,
    tier: cfg.tier ? String(cfg.tier) : undefined,
    enableAdvance: cfg.enableAdvance === true ? true : (cfg.enable_advance === true ? true : undefined),
  };
}
