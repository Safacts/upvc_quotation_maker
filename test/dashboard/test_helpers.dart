import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:upvc_quotation_maker/app_state.dart';
import 'package:upvc_quotation_maker/dashboard_screen.dart';
import 'package:upvc_quotation_maker/models.dart';
import 'package:upvc_quotation_maker/config/client_config.dart';

/// Shared test helpers for dashboard tests.
class TestHelpers {
  static const ClientConfig defaultConfig = ClientConfig(
    clientId: 'testclient',
    appName: 'Test UPVC',
    companyName: 'Test Company',
    companyAddress: '123 Test St',
    companyContact: '9999999999',
    companyEmail: 'test@test.com',
    adminEmails: ['admin@test.com'],
  );

  static const ClientConfig venkateshwaraConfig = ClientConfig(
    clientId: 'venkateshwara',
    appName: 'Venkateshwara UPVC Quote',
    companyName: 'Venkateshwara UPVC Windows & Doors',
    adminEmails: ['jvenkateshupvc@gmail.com'],
  );

  static const ClientConfig kprupvcConfig = ClientConfig(
    clientId: 'kprupvc',
    appName: 'KPR UPVC',
    companyName: 'KPR UPVC',
    adminEmails: ['kpr@test.com'],
  );

  static QuotationData sampleQuotation({
    String id = 'q1',
    String customerName = 'John Doe',
    String quotationNo = 'JVUPVC-001',
    QuotationStatus status = QuotationStatus.draft,
    double grandTotal = 50000.0,
    DateTime? createdAt,
  }) {
    return QuotationData.fromMap({
      'id': id,
      'quote_no': quotationNo,
      'customer_name': customerName,
      'date': '2026-08-01',
      'created_at': (createdAt ?? DateTime(2026, 8, 1)).toIso8601String(),
      'status': status.value,
      'transport_cost': 500.0,
      'include_gst': false,
      'gst_percentage': 18.0,
      'grand_total': grandTotal,
    });
  }

  static List<QuotationData> sampleQuotations() {
    return [
      sampleQuotation(
        id: 'q1',
        customerName: 'Alice Smith',
        quotationNo: 'JVUPVC-001',
        status: QuotationStatus.draft,
        grandTotal: 50000.0,
        createdAt: DateTime(2026, 8, 5),
      ),
      sampleQuotation(
        id: 'q2',
        customerName: 'Bob Jones',
        quotationNo: 'JVUPVC-002',
        status: QuotationStatus.won,
        grandTotal: 120000.0,
        createdAt: DateTime(2026, 8, 3),
      ),
      sampleQuotation(
        id: 'q3',
        customerName: 'Charlie Brown',
        quotationNo: 'JVUPVC-003',
        status: QuotationStatus.sent,
        grandTotal: 75000.0,
        createdAt: DateTime(2026, 8, 1),
      ),
    ];
  }

  static Widget buildTestApp({
    required AppState appState,
    String? initialOpenQuote,
  }) {
    return ChangeNotifierProvider.value(
      value: appState,
      child: MaterialApp(
        home: DashboardScreen(initialOpenQuote: initialOpenQuote),
      ),
    );
  }
}
