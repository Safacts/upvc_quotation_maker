import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';
import 'app_state.dart';
import 'gst_invoice_model.dart';

Future<Uint8List> generateGstPdfBytes(GstInvoiceData data, AppState appState) async {
  final pdf = pw.Document();
  final currency = NumberFormat.currency(locale: 'en_IN', symbol: 'Rs. ');

  final fontRegular = await PdfGoogleFonts.robotoRegular();
  final fontBold = await PdfGoogleFonts.robotoBold();

  final pageTheme = pw.PageTheme(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(30),
    theme: pw.ThemeData.withFont(base: fontRegular, bold: fontBold),
  );

  data.calculateTotals();

  pdf.addPage(
    pw.MultiPage(
      pageTheme: pageTheme,
      footer: (pw.Context context) {
        return pw.Container(
          alignment: pw.Alignment.center,
          margin: const pw.EdgeInsets.only(top: 10),
          decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColors.grey))),
          padding: const pw.EdgeInsets.only(top: 5),
          child: pw.Text(
            'This is a computer-generated GST invoice | Page ${context.pageNumber} of ${context.pagesCount}',
            style: pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
          ),
        );
      },
      build: (pw.Context context) {
        return [
          _buildHeader(appState),
          pw.SizedBox(height: 12),
          _buildInvoiceDetails(data),
          pw.SizedBox(height: 10),
          _buildSupplierBuyer(data, appState),
          pw.SizedBox(height: 10),
          _buildSectionTitle('Invoice Items'),
          _buildItemsTable(data, currency),
          pw.SizedBox(height: 10),
          _buildTaxSummary(data, currency),
          pw.SizedBox(height: 10),
          _buildAmountInWords(data),
          pw.SizedBox(height: 10),
          _buildTermsAndConditions(appState),
          pw.SizedBox(height: 8),
          _buildBankDetails(appState),
          pw.SizedBox(height: 10),
          _buildReverseCharge(data),
          pw.SizedBox(height: 30),
          _buildSignature(appState),
        ];
      },
    ),
  );

  return pdf.save();
}

pw.Widget _buildHeader(AppState appState) {
  return pw.Column(
    children: [
      pw.Center(
        child: pw.Text(
          'TAX INVOICE',
          style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold, color: PdfColor.fromHex('#C44A10')),
        ),
      ),
      pw.SizedBox(height: 10),
      pw.Container(
        width: double.infinity,
        padding: const pw.EdgeInsets.all(8),
        color: PdfColor.fromHex('#C44A10'),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.center,
          children: [
            pw.Text(appState.companyName, style: pw.TextStyle(color: PdfColors.white, fontSize: 16, fontWeight: pw.FontWeight.bold)),
            pw.Text(appState.companyAddress, style: pw.TextStyle(color: PdfColors.white, fontSize: 10)),
            pw.Text('Prop: ${appState.companyProprietor}   Contact: ${appState.companyContact}', style: pw.TextStyle(color: PdfColors.white, fontSize: 10)),
            pw.Text('GST No: ${appState.gstNumber}', style: pw.TextStyle(color: PdfColors.white, fontSize: 10)),
          ],
        ),
      ),
    ],
  );
}

pw.Widget _buildInvoiceDetails(GstInvoiceData data) {
  return pw.Row(
    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
    children: [
      pw.Text('Invoice No: ${data.invoiceNumber}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
      pw.Text('Date: ${DateFormat('dd-MMM-yyyy').format(data.invoiceDate)}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
      pw.Text('Place of Supply: ${data.placeOfSupply}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
    ],
  );
}

pw.Widget _buildSectionTitle(String title) {
  return pw.Container(
    width: double.infinity,
    padding: const pw.EdgeInsets.all(4),
    margin: const pw.EdgeInsets.only(top: 10, bottom: 4),
    color: PdfColor.fromHex('#C44A10'),
    child: pw.Text(title, style: pw.TextStyle(color: PdfColors.white, fontSize: 11, fontWeight: pw.FontWeight.bold)),
  );
}

pw.Widget _buildSupplierBuyer(GstInvoiceData data, AppState appState) {
  return pw.Table(
    columnWidths: {
      0: const pw.FlexColumnWidth(1),
      1: const pw.FlexColumnWidth(1),
    },
    children: [
      pw.TableRow(children: [
        pw.Container(
          padding: const pw.EdgeInsets.all(6),
          decoration: const pw.BoxDecoration(border: pw.Border.fromBorderSide(pw.BorderSide(color: PdfColors.grey800))),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text('Supplier Details', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
              pw.SizedBox(height: 4),
              pw.Text(appState.companyName, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9)),
              pw.Text(appState.companyAddress, style: pw.TextStyle(fontSize: 9)),
              pw.Text('GSTIN: ${appState.gstNumber}', style: pw.TextStyle(fontSize: 9)),
            ],
          ),
        ),
        pw.Container(
          padding: const pw.EdgeInsets.all(6),
          decoration: const pw.BoxDecoration(border: pw.Border.fromBorderSide(pw.BorderSide(color: PdfColors.grey800))),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text('Bill To (Buyer Details)', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
              pw.SizedBox(height: 4),
              pw.Text(data.buyerName, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9)),
              pw.Text(data.buyerAddress, style: pw.TextStyle(fontSize: 9)),
              pw.Text('GSTIN: ${data.buyerGstin}', style: pw.TextStyle(fontSize: 9)),
              pw.Text('State: ${data.buyerState} (${data.buyerStateCode})', style: pw.TextStyle(fontSize: 9)),
            ],
          ),
        ),
      ]),
    ],
  );
}

pw.Widget _buildItemsTable(GstInvoiceData data, NumberFormat currency) {
  return pw.TableHelper.fromTextArray(
    headers: ['S.No', 'HSN', 'Description', 'Qty', 'Unit', 'Rate', 'Taxable Value'],
    headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
    headerDecoration: pw.BoxDecoration(color: PdfColor.fromHex('#FFF3E6')),
    cellStyle: pw.TextStyle(fontSize: 9),
    cellAlignment: pw.Alignment.center,
    border: pw.TableBorder.all(color: PdfColors.grey800),
    columnWidths: {
      0: const pw.FlexColumnWidth(0.8),
      1: const pw.FlexColumnWidth(1.2),
      2: const pw.FlexColumnWidth(4),
      3: const pw.FlexColumnWidth(1),
      4: const pw.FlexColumnWidth(1),
      5: const pw.FlexColumnWidth(2),
      6: const pw.FlexColumnWidth(2),
    },
    data: List<List<String>>.generate(data.items.length, (index) {
      final item = data.items[index];
      return [
        '${index + 1}',
        item.hsnCode,
        item.description,
        item.quantity.toStringAsFixed(0),
        item.unit,
        currency.format(item.rate),
        currency.format(item.taxableValue),
      ];
    }),
  );
}

pw.Widget _buildTaxSummary(GstInvoiceData data, NumberFormat currency) {
  return pw.Container(
    color: PdfColor.fromHex('#FFFBF6'),
    child: pw.Table(
      border: pw.TableBorder.all(color: PdfColor(0, 0, 0, 0)),
      children: [
        pw.TableRow(children: [
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Subtotal', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.subtotal), style: pw.TextStyle(fontSize: 10))),
        ]),
        pw.TableRow(children: [
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Transport', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.transportCost), style: pw.TextStyle(fontSize: 10))),
        ]),
        pw.TableRow(children: [
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Taxable Value', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.taxableValue), style: pw.TextStyle(fontSize: 10))),
        ]),
        if (data.isInterstate) ...[
          pw.TableRow(children: [
            pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('IGST @ ${data.igstRate}%', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
            pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.igstAmount), style: pw.TextStyle(fontSize: 10))),
          ]),
        ] else ...[
          pw.TableRow(children: [
            pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('CGST @ ${data.cgstRate}%', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
            pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.cgstAmount), style: pw.TextStyle(fontSize: 10))),
          ]),
          pw.TableRow(children: [
            pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('SGST @ ${data.sgstRate}%', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
            pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.sgstAmount), style: pw.TextStyle(fontSize: 10))),
          ]),
        ],
        pw.TableRow(
          decoration: pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColor.fromHex('#C44A10'), width: 2))),
          children: [
            pw.Padding(padding: const pw.EdgeInsets.all(8), child: pw.Text('Grand Total', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12))),
            pw.Padding(padding: const pw.EdgeInsets.all(8), child: pw.Text(currency.format(data.grandTotal), style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12))),
          ],
        ),
      ],
    ),
  );
}

pw.Widget _buildAmountInWords(GstInvoiceData data) {
  return pw.Container(
    width: double.infinity,
    padding: const pw.EdgeInsets.all(6),
    decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.grey800)),
    child: pw.Row(
      children: [
        pw.Text('Amount in Words: ', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
        pw.Expanded(child: pw.Text(data.amountInWords, style: pw.TextStyle(fontSize: 9))),
      ],
    ),
  );
}

pw.Widget _buildTermsAndConditions(AppState appState) {
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Text('Terms & Conditions', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
      pw.SizedBox(height: 4),
      pw.Text(appState.termsAndConditions, style: pw.TextStyle(fontSize: 8)),
    ],
  );
}

pw.Widget _buildBankDetails(AppState appState) {
  final bankName = appState.bankName;
  final bankBranch = appState.bankBranch;
  final bankAccountNo = appState.bankAccountNo;
  final bankIfsc = appState.bankIfsc;
  if (bankName.isEmpty && bankBranch.isEmpty && bankAccountNo.isEmpty && bankIfsc.isEmpty) {
    return pw.SizedBox.shrink();
  }
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Text('Bank Details', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
      pw.SizedBox(height: 4),
      pw.Text('Company Name : ${appState.companyName}', style: pw.TextStyle(fontSize: 9)),
      pw.Text('Bank Name & Branch : $bankName - $bankBranch', style: pw.TextStyle(fontSize: 9)),
      pw.Text('Account No : $bankAccountNo', style: pw.TextStyle(fontSize: 9)),
      pw.Text('IFSC : $bankIfsc', style: pw.TextStyle(fontSize: 9)),
    ],
  );
}

pw.Widget _buildReverseCharge(GstInvoiceData data) {
  return pw.Row(
    children: [
      pw.Text('Reverse Charge: ', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
      pw.Text(data.isReverseCharge ? 'Yes' : 'No', style: pw.TextStyle(fontSize: 10)),
    ],
  );
}

pw.Widget _buildSignature(AppState appState) {
  return pw.Row(
    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
    children: [
      pw.SizedBox(),
      pw.Column(
        children: [
          pw.Text('For ${appState.companyName}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
          pw.SizedBox(height: 20),
          pw.Text('Authorized Signature', style: pw.TextStyle(fontSize: 10)),
        ],
      ),
    ],
  );
}
