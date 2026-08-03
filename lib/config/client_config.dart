import 'package:flutter/material.dart';

class ClientConfig {
  final String clientId;
  final String appName;
  final String companyName;
  final String companyAddress;
  final String companyContact;
  final String companyEmail;
  final String companyProprietor;
  final String gstNumber;
  final String bankName;
  final String bankBranch;
  final String bankAccountNo;
  final String bankIfsc;
  final List<String> termsAndConditions;
  final double defaultGstPercentage;
  final String quotePrefix;
  final String logoUrl;
  final String portalPasswordHash;
  final Color primaryColor;
  final Color accentColor;
  final DateTime? trialExpiresAt;
  final bool isActive;
  final String supabaseUrl;
  final String supabaseAnonKey;
  final List<String> adminEmails;
  final String landingHeroTitle;
  final String landingHeroSubtitle;
  final String landingHeroImage;
  final List<String> landingFeatures;
  final List<String> landingServices;
  final List<String> landingGallery;
  final String landingMapUrl;
  final String landingAboutTitle;
  final String landingAboutText;
  final List<Map<String, String>> landingTestimonials;
  final String landingCTA;
  final String landingFooter;
  // Profit & margin — what % of revenue goes to materials + labor (default 65%)
  final double costMarginPercent;

  const ClientConfig({
    this.clientId = 'default',
    this.appName = 'UPVC Quotation Maker',
    this.companyName = 'Venkateshwara UPVC Windows & Doors',
    this.companyAddress = 'Plot No: 95, Road No: 2, Near Omkar Nagar Bus Stop, LB NAGAR, HYDERABAD – 500074',
    this.companyContact = '9246588692, 9441888131',
    this.companyEmail = 'jvenkateshupvc@gmail.com',
    this.companyProprietor = 'J.Venkateshwarlu',
    this.gstNumber = '36AKDPJ7245B2ZF',
    this.bankName = 'VENKATESHWARA WELDING WORKS',
    this.bankBranch = 'Union Bank, Hastinapuram',
    this.bankAccountNo = 'A/C No : 178511100000061',
    this.bankIfsc = 'IFSC Code : UBIN0817856',
    this.termsAndConditions = const [
      '50% advance, 35% after dispatch, 15% after installation.',
      'Delivery minimum 15 days from advance.',
      'All payments in favor of M/s Niksha Industries Pvt Ltd.',
      'Client responsible for site safety & electricity.',
      'Material can be taken back if payment not received.',
      'Final wall-to-wall measurement includes silicone sealant.',
      'Rates may alter if size changes above 1 foot.',
      'Quotation valid for 15 days.',
      'Above rates inclusive of installation.',
    ],
    this.defaultGstPercentage = 18.0,
    this.quotePrefix = 'JVUPVC',
    this.logoUrl = '',
    this.portalPasswordHash = '',
    this.primaryColor = const Color(0xFF6366F1),
    this.accentColor = const Color(0xFFEC4899),
    this.trialExpiresAt,
    this.isActive = true,
    this.supabaseUrl = 'https://effxrwrbsjduvhmorvrq.supabase.co',
    this.supabaseAnonKey = 'sb_publishable_GmfOXLriCvXdppszTkF6Mg_FuLXt6PN',
    this.adminEmails = const ['jvenkateshupvc@gmail.com'],
    this.landingHeroTitle = '',
    this.landingHeroSubtitle = 'Quality UPVC solutions for your home',
    this.landingHeroImage = '',
    this.landingFeatures = const [],
    this.landingServices = const ['UPVC Windows', 'UPVC Doors', 'Glass Installation', 'Repairs & Maintenance'],
    this.landingGallery = const [],
    this.landingMapUrl = '',
    this.landingAboutTitle = '',
    this.landingAboutText = '',
    this.landingTestimonials = const [],
    this.landingCTA = '',
    this.landingFooter = '',
    this.costMarginPercent = 65.0,
  });

  String get termsAsString => termsAndConditions.asMap().entries.map((e) => '${e.key + 1}. ${e.value}').join('\n');

  Map<String, dynamic> toJson() => {
    'clientId': clientId,
    'appName': appName,
    'companyName': companyName,
    'companyAddress': companyAddress,
    'companyContact': companyContact,
    'companyEmail': companyEmail,
    'companyProprietor': companyProprietor,
    'gstNumber': gstNumber,
    'bankName': bankName,
    'bankBranch': bankBranch,
    'bankAccountNo': bankAccountNo,
    'bankIfsc': bankIfsc,
    'termsAndConditions': termsAndConditions,
    'defaultGstPercentage': defaultGstPercentage,
    'quotePrefix': quotePrefix,
    'logoUrl': logoUrl,
    'portalPasswordHash': portalPasswordHash,
    'primaryColor': primaryColor.value,
    'accentColor': accentColor.value,
    'trialExpiresAt': trialExpiresAt?.toIso8601String(),
    'isActive': isActive,
    'supabaseUrl': supabaseUrl,
    'supabaseAnonKey': supabaseAnonKey,
    'adminEmails': adminEmails,
    'landingHeroTitle': landingHeroTitle,
    'landingHeroSubtitle': landingHeroSubtitle,
    'landingHeroImage': landingHeroImage,
    'landingFeatures': landingFeatures,
    'landingServices': landingServices,
    'landingGallery': landingGallery,
    'landingMapUrl': landingMapUrl,
    'landingAboutTitle': landingAboutTitle,
    'landingAboutText': landingAboutText,
    'landingTestimonials': landingTestimonials.map((t) => Map<String, String>.from(t)).toList(),
    'landingCTA': landingCTA,
    'landingFooter': landingFooter,
    'costMarginPercent': costMarginPercent,
  };

  factory ClientConfig.fromJson(Map<String, dynamic> json) => ClientConfig(
    clientId: json['clientId'] as String? ?? 'default',
    appName: json['appName'] as String? ?? 'UPVC Quotation Maker',
    companyName: json['companyName'] as String? ?? '',
    companyAddress: json['companyAddress'] as String? ?? '',
    companyContact: json['companyContact'] as String? ?? '',
    companyEmail: json['companyEmail'] as String? ?? '',
    companyProprietor: json['companyProprietor'] as String? ?? '',
    gstNumber: json['gstNumber'] as String? ?? '',
    bankName: json['bankName'] as String? ?? '',
    bankBranch: json['bankBranch'] as String? ?? '',
    bankAccountNo: json['bankAccountNo'] as String? ?? '',
    bankIfsc: json['bankIfsc'] as String? ?? '',
    termsAndConditions: (json['termsAndConditions'] as List?)?.cast<String>() ?? const [],
    defaultGstPercentage: (json['defaultGstPercentage'] as num?)?.toDouble() ?? 18.0,
    quotePrefix: json['quotePrefix'] as String? ?? 'JVUPVC',
    logoUrl: json['logoUrl'] as String? ?? '',
    portalPasswordHash: json['portalPasswordHash'] as String? ?? '',
    primaryColor: Color(json['primaryColor'] as int? ?? 0xFF6366F1),
    accentColor: Color(json['accentColor'] as int? ?? 0xFFEC4899),
    trialExpiresAt: json['trialExpiresAt'] != null ? DateTime.tryParse(json['trialExpiresAt']) : null,
    isActive: json['isActive'] as bool? ?? true,
    supabaseUrl: json['supabaseUrl'] as String? ?? 'https://effxrwrbsjduvhmorvrq.supabase.co',
    supabaseAnonKey: json['supabaseAnonKey'] as String? ?? '',
    adminEmails: (json['adminEmails'] as List?)?.cast<String>() ?? ['jvenkateshupvc@gmail.com'],
    landingHeroTitle: json['landingHeroTitle'] as String? ?? '',
    landingHeroSubtitle: json['landingHeroSubtitle'] as String? ?? 'Quality UPVC solutions for your home',
    landingHeroImage: json['landingHeroImage'] as String? ?? '',
    landingFeatures: (json['landingFeatures'] as List?)?.cast<String>() ?? const [],
    landingServices: (json['landingServices'] as List?)?.cast<String>() ?? const ['UPVC Windows', 'UPVC Doors', 'Glass Installation', 'Repairs & Maintenance'],
    landingGallery: (json['landingGallery'] as List?)?.cast<String>() ?? const [],
    landingMapUrl: json['landingMapUrl'] as String? ?? '',
    landingAboutTitle: json['landingAboutTitle'] as String? ?? '',
    landingAboutText: json['landingAboutText'] as String? ?? '',
    landingTestimonials: (json['landingTestimonials'] as List?)?.map((e) => Map<String, String>.from(e as Map)).toList() ?? const [],
    landingCTA: json['landingCTA'] as String? ?? '',
    landingFooter: json['landingFooter'] as String? ?? '',
    costMarginPercent: (json['costMarginPercent'] as num?)?.toDouble() ?? 65.0,
  );
}
