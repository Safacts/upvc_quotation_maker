import 'dart:convert';
import 'dart:typed_data';

import 'package:excel/excel.dart';
import 'package:intl/intl.dart';

import 'app_state.dart';
import 'export_download.dart';
import 'models.dart';

Future<void> exportQuotationXlsx(QuotationData data, AppState appState) async {
  final bytes = buildXlsx(data, appState);
  await downloadFileBytes(
    bytes,
    '${data.quotationNo}.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

Future<void> exportQuotationCsv(QuotationData data, AppState appState) async {
  final csv = buildCsv(data, appState);
  final bytes = Uint8List.fromList(utf8.encode('\uFEFF$csv'));
  await downloadFileBytes(bytes, '${data.quotationNo}.csv', 'text/csv');
}

Uint8List buildXlsx(QuotationData data, AppState appState) {
  final excel = Excel.createExcel();
  excel.rename('Sheet1', 'Summary');

  final summary = excel['Summary'];

  summary.appendRow([
    TextCellValue(appState.companyName),
  ]);
  summary.appendRow([TextCellValue('Quotation No: ${data.quotationNo}')]);
  summary.appendRow([TextCellValue('Date: ${DateFormat('dd-MMM-yyyy').format(data.date)}')]);
  summary.appendRow([TextCellValue('')]);
  summary.appendRow([TextCellValue('Customer: ${data.customerName}')]);
  summary.appendRow([TextCellValue('Reference: ${data.reference}')]);
  summary.appendRow([TextCellValue('Address: ${data.address}')]);
  summary.appendRow([TextCellValue('Contact: ${data.contactNo}')]);
  summary.appendRow([TextCellValue('Email: ${data.email}')]);
  summary.appendRow([TextCellValue('')]);
  summary.appendRow([TextCellValue('Subtotal (Items)'), DoubleCellValue(data.actualAmount)]);
  summary.appendRow([TextCellValue('Transport'), DoubleCellValue(data.transport)]);
  summary.appendRow([
    TextCellValue('GST (${data.gstPercentage.toStringAsFixed(2)}%)'),
    DoubleCellValue(data.igst),
  ]);
  summary.appendRow([TextCellValue('Grand Total'), DoubleCellValue(data.grandTotal)]);
  summary.appendRow([TextCellValue('Total Sft'), DoubleCellValue(data.totalSft)]);
  summary.appendRow([TextCellValue('')]);
  summary.appendRow([TextCellValue('Amount in Words')]);
  summary.appendRow([TextCellValue(data.amountInWords)]);

  final measured = excel['Measured Items'];
  measured.appendRow([
    TextCellValue('Code'),
    TextCellValue('Description'),
    TextCellValue('Width (mm)'),
    TextCellValue('Height (mm)'),
    TextCellValue('Units'),
    TextCellValue('Sft'),
    TextCellValue('Glass'),
    TextCellValue('Rate'),
    TextCellValue('Total'),
  ]);
  for (final item in data.measuredItems) {
    measured.appendRow([
      TextCellValue(item.code),
      TextCellValue(item.description),
      DoubleCellValue(item.width),
      DoubleCellValue(item.height),
      IntCellValue(item.units),
      DoubleCellValue(item.sft),
      TextCellValue(item.glass),
      DoubleCellValue(item.rate),
      DoubleCellValue(item.total),
    ]);
  }

  final unmeasured = excel['Unmeasured Items'];
  unmeasured.appendRow([
    TextCellValue('Description'),
    TextCellValue('Units'),
    TextCellValue('Rate'),
    TextCellValue('Total'),
  ]);
  for (final item in data.unmeasuredItems) {
    unmeasured.appendRow([
      TextCellValue(item.description),
      IntCellValue(item.units),
      DoubleCellValue(item.rate),
      DoubleCellValue(item.total),
    ]);
  }

  for (var col = 1; col <= 9; col++) {
    measured.setColumnAutoFit(col);
  }
  for (var col = 1; col <= 4; col++) {
    unmeasured.setColumnAutoFit(col);
  }
  summary.setColumnAutoFit(1);

  final bytes = excel.encode();
  return bytes != null ? Uint8List.fromList(bytes) : Uint8List(0);
}

String buildCsv(QuotationData data, AppState appState) {
  final b = StringBuffer();
  String cell(Object? v) {
    final s = v?.toString() ?? '';
    if (s.contains(',') || s.contains('"') || s.contains('\n')) {
      return '"${s.replaceAll('"', '""')}"';
    }
    return s;
  }

  void row(List<Object?> values) {
    b.writeln(values.map(cell).join(','));
  }

  row([appState.companyName]);
  row(['Quotation No', data.quotationNo]);
  row(['Date', DateFormat('dd-MMM-yyyy').format(data.date)]);
  row(['Customer', data.customerName]);
  row(['Reference', data.reference]);
  row(['Address', data.address]);
  row(['Contact', data.contactNo]);
  row(['Email', data.email]);
  row([]);
  row([]);
  row(['Code', 'Description', 'Width (mm)', 'Height (mm)', 'Units', 'Sft', 'Glass', 'Rate', 'Total']);
  for (final item in data.measuredItems) {
    row([item.code, item.description, item.width, item.height, item.units, item.sft, item.glass, item.rate, item.total]);
  }
  row([]);
  row(['Description', 'Units', 'Rate', 'Total']);
  for (final item in data.unmeasuredItems) {
    row([item.description, item.units, item.rate, item.total]);
  }
  row([]);
  row(['Subtotal (Items)', data.actualAmount]);
  row(['Transport', data.transport]);
  row(['GST (${data.gstPercentage.toStringAsFixed(2)}%)', data.igst]);
  row(['Grand Total', data.grandTotal]);
  row(['Total Sft', data.totalSft]);
  row([]);
  row(['Amount in Words']);
  row([data.amountInWords]);

  return b.toString();
}
