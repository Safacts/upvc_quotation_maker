import 'package:flutter/material.dart' show BuildContext, debugPrint;
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';
import 'package:barcode/barcode.dart';
import 'models.dart';
import 'models_extra.dart';
import 'app_state.dart';
import 'services/upi_service.dart';

Future<Uint8List> generatePdfBytes(QuotationData data, AppState appState, {List<QuotationPhoto> photos = const []}) async {
  final pdf = pw.Document();
  final NumberFormat currency = NumberFormat.currency(locale: 'en_IN', symbol: 'Rs. ');
  
  final defaultLogoUrl = 'https://t3.ftcdn.net/jpg/08/52/27/60/360_F_852276023_G4klsazIrvQwxpJOsje5gDf8zqlWWEmQ.jpg';
  final clientConfig = appState.clientConfig;
  final topLogoUrl = clientConfig.invoiceTopLogoUrl.isNotEmpty ? clientConfig.invoiceTopLogoUrl : defaultLogoUrl;
  final bgLogoUrl = clientConfig.invoiceBackgroundLogoUrl.isNotEmpty
      ? clientConfig.invoiceBackgroundLogoUrl
      : (clientConfig.invoiceTopLogoUrl.isNotEmpty ? clientConfig.invoiceTopLogoUrl : defaultLogoUrl);
  final headerLogo = await _loadLogoImage(topLogoUrl, defaultLogoUrl);
  final watermarkImage = bgLogoUrl == topLogoUrl ? headerLogo : await _loadLogoImage(bgLogoUrl, defaultLogoUrl);
  final fontRegular = await PdfGoogleFonts.robotoRegular();
  final fontBold = await PdfGoogleFonts.robotoBold();

  final pageTheme = pw.PageTheme(
    pageFormat: PdfPageFormat.a4,
    margin: pw.EdgeInsets.all(30),
    theme: pw.ThemeData.withFont(base: fontRegular, bold: fontBold),
    buildBackground: (pw.Context context) {
      return pw.FullPage(
        ignoreMargins: true,
        child: pw.Opacity(
          opacity: 0.06,
          child: pw.Image(watermarkImage, fit: pw.BoxFit.cover),
        ),
      );
    },
  );

  pdf.addPage(
    pw.MultiPage(
      pageTheme: pageTheme,
      footer: (pw.Context context) {
        return pw.Container(
          alignment: pw.Alignment.center,
          margin: pw.EdgeInsets.only(top: 10),
          decoration: pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColors.grey))),
          padding: pw.EdgeInsets.only(top: 5),
          child: pw.Text(
            'Generated on ${DateFormat('dd-MM-yyyy hh:mm a').format(DateTime.now())} | This is a computer-generated quotation | Page ${context.pageNumber} of ${context.pagesCount}',
            style: pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
          ),
        );
      },
      build: (pw.Context context) {
        return [
          _buildHeader(headerLogo, appState),
          _buildTopBar(data),
          _buildSectionTitle('Customer Details'),
          _buildCustomerDetails(data),
          _buildSectionTitle('Quotation Details'),
          if (data.measuredItems.isNotEmpty) _buildMeasuredTable(data, currency, kprSimplified: clientConfig.clientId == 'kprupvc'),
          if (data.unmeasuredItems.isNotEmpty) ...[
            _buildSectionTitle('Add Items without Measurements (Only Quantity)'),
            _buildUnmeasuredTable(data, currency),
          ],
          pw.SizedBox(height: 10),
          _buildTotalsTable(data, currency),
          if (photos.isNotEmpty) ...[
            pw.SizedBox(height: 10),
            _buildSitePhotosSection(photos),
          ],
          _buildSectionTitle('Bank Details'),
          _buildTermsAndBankDetails(appState),
          if (appState.clientConfig.hasUpi) ...[
            pw.SizedBox(height: 10),
            _buildUpiQrSection(data, appState),
          ],
          pw.SizedBox(height: 40),
          _buildSignatures(),
        ];
      },
    ),
  );

  return pdf.save();
}

Future<void> generateAndPreviewPdf(QuotationData data, BuildContext context, AppState appState) async {
  final bytes = await generatePdfBytes(data, appState);
  await Printing.layoutPdf(onLayout: (PdfPageFormat format) async => bytes);
}

Future<pw.ImageProvider> _loadLogoImage(String url, String fallbackUrl) async {
  Future<pw.MemoryImage> fetch(String u) async {
    final resp = await http.get(Uri.parse(u));
    if (resp.statusCode != 200) throw Exception('HTTP ${resp.statusCode}');
    return pw.MemoryImage(resp.bodyBytes);
  }
  try {
    return await fetch(url);
  } catch (e) {
    debugPrint('Logo load failed for $url: $e — trying fallback');
    try {
      return await fetch(fallbackUrl);
    } catch (e2) {
      debugPrint('Fallback logo also failed: $e2');
      rethrow;
    }
  }
}

pw.Widget _buildHeader(pw.ImageProvider logo, AppState appState) {
  return pw.Column(
    children: [
      pw.Center(child: pw.Image(logo, width: 80)),
      pw.SizedBox(height: 10),
      pw.Container(
        width: double.infinity,
        padding: pw.EdgeInsets.all(8),
        color: PdfColor.fromHex('#1e3a5f'),
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
    ]
  );
}

pw.Widget _buildTopBar(QuotationData data) {
  return pw.Padding(
    padding: pw.EdgeInsets.symmetric(vertical: 8),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text('Quotation No: ${data.quotationNo}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
        pw.Text('Date: ${DateFormat('dd-MMM-yyyy').format(data.date)}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
      ]
    )
  );
}

pw.Widget _buildSectionTitle(String title) {
  return pw.Container(
    width: double.infinity,
    padding: pw.EdgeInsets.all(4),
    margin: pw.EdgeInsets.only(top: 10, bottom: 4),
    color: PdfColor.fromHex('#1e3a5f'),
    child: pw.Text(title, style: pw.TextStyle(color: PdfColors.white, fontSize: 11, fontWeight: pw.FontWeight.bold)),
  );
}

pw.Widget _buildCustomerDetails(QuotationData data) {
  return pw.Table(
    columnWidths: { 0: pw.FlexColumnWidth(1), 1: pw.FlexColumnWidth(2), 2: pw.FlexColumnWidth(1), 3: pw.FlexColumnWidth(2) },
    children: [
      pw.TableRow(children: [
        pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text('Name', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
        pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text(data.customerName, style: pw.TextStyle(fontSize: 10))),
        pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text('Reference', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
        pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text(data.reference, style: pw.TextStyle(fontSize: 10))),
      ]),
      pw.TableRow(children: [
        pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text('Address', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
        pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text(data.address, style: pw.TextStyle(fontSize: 10))),
        pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text('Contact No', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
        pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text(data.contactNo, style: pw.TextStyle(fontSize: 10))),
      ]),
      if (data.supplierCompany.isNotEmpty)
        pw.TableRow(children: [
          pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text('Supplier Company', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(4), child: pw.Text(data.supplierCompany, style: pw.TextStyle(fontSize: 10))),
          pw.SizedBox(),
          pw.SizedBox(),
        ]),
    ],
  );
}

pw.Widget _buildMeasuredTable(QuotationData data, NumberFormat currency, {bool kprSimplified = false}) {
  if (kprSimplified) {
    return pw.TableHelper.fromTextArray(
      headers: ['S.No', 'Description', 'W', 'H', 'Units', 'Glass', 'SFT', 'Rate', 'Total'],
      headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
      headerDecoration: pw.BoxDecoration(color: PdfColor.fromHex('#dce6f1')),
      cellStyle: pw.TextStyle(fontSize: 9),
      cellAlignment: pw.Alignment.center,
      border: pw.TableBorder.all(color: PdfColors.grey800),
      columnWidths: {
        0: pw.FlexColumnWidth(1),
        1: pw.FlexColumnWidth(6),
        2: pw.FlexColumnWidth(1.2),
        3: pw.FlexColumnWidth(1.2),
        4: pw.FlexColumnWidth(1.5),
        5: pw.FlexColumnWidth(2),
        6: pw.FlexColumnWidth(1.5),
        7: pw.FlexColumnWidth(2),
        8: pw.FlexColumnWidth(2.5),
      },
      data: List<List<String>>.generate(data.measuredItems.length, (index) {
        final item = data.measuredItems[index];
        return [
          '${index + 1}', item.description, item.width.toStringAsFixed(0), item.height.toStringAsFixed(0),
          item.units.toString(), item.glass, item.sft.toStringAsFixed(2),
          currency.format(item.rate), currency.format(item.total),
        ];
      }),
    );
  }
  return pw.TableHelper.fromTextArray(
    headers: ['S.No', 'Code', 'Description', 'W', 'H', 'Units', 'Glass', 'SFT', 'T.SFT', 'Rate', 'Total'],
    headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
    headerDecoration: pw.BoxDecoration(color: PdfColor.fromHex('#dce6f1')),
    cellStyle: pw.TextStyle(fontSize: 9),
    cellAlignment: pw.Alignment.center,
    border: pw.TableBorder.all(color: PdfColors.grey800),
    columnWidths: {
      0: pw.FlexColumnWidth(1),
      1: pw.FlexColumnWidth(1.5),
      2: pw.FlexColumnWidth(6),
      3: pw.FlexColumnWidth(1.2),
      4: pw.FlexColumnWidth(1.2),
      5: pw.FlexColumnWidth(1.5),
      6: pw.FlexColumnWidth(2),
      7: pw.FlexColumnWidth(1.5),
      8: pw.FlexColumnWidth(1.5),
      9: pw.FlexColumnWidth(2),
      10: pw.FlexColumnWidth(2.5),
    },
    data: List<List<String>>.generate(data.measuredItems.length, (index) {
      final item = data.measuredItems[index];
      return [
        '${index + 1}', item.code, item.description, item.width.toStringAsFixed(0), item.height.toStringAsFixed(0),
        item.units.toString(), item.glass, item.sft.toStringAsFixed(2), item.totalSft.toStringAsFixed(2),
        currency.format(item.rate), currency.format(item.total),
      ];
    }),
  );
}

pw.Widget _buildUnmeasuredTable(QuotationData data, NumberFormat currency) {
  return pw.TableHelper.fromTextArray(
    headers: ['S.No', 'Description', 'Units', 'Rate Per Unit', 'Total'],
    headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
    headerDecoration: pw.BoxDecoration(color: PdfColor.fromHex('#dce6f1')),
    cellStyle: pw.TextStyle(fontSize: 9),
    cellAlignment: pw.Alignment.center,
    border: pw.TableBorder.all(color: PdfColors.grey800),
    columnWidths: {
      0: pw.FlexColumnWidth(1),
      1: pw.FlexColumnWidth(6),
      2: pw.FlexColumnWidth(1.5),
      3: pw.FlexColumnWidth(2.5),
      4: pw.FlexColumnWidth(2.5),
    },
    data: List<List<String>>.generate(data.unmeasuredItems.length, (index) {
      final item = data.unmeasuredItems[index];
      return ['${index + 1}', item.description, item.units.toString(), currency.format(item.rate), currency.format(item.total)];
    }),
  );
}

pw.Widget _buildTotalsTable(QuotationData data, NumberFormat currency) {
  return pw.Container(
    color: PdfColor.fromHex('#f1f5fa'),
    child: pw.Table(
      border: pw.TableBorder.all(color: PdfColor(0,0,0,0)),
      children: [
        pw.TableRow(children: [
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text('Total SFT', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text(data.totalSft.toStringAsFixed(2), style: pw.TextStyle(fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text('Subtotal', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.actualAmount), style: pw.TextStyle(fontSize: 10))),
        ]),
        pw.TableRow(children: [
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text('Transport', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.transport), style: pw.TextStyle(fontSize: 10))),
          data.includeGst ? pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text('IGST @ ${data.gstPercentage}%', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))) : pw.SizedBox(),
          data.includeGst ? pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.igst), style: pw.TextStyle(fontSize: 10))) : pw.SizedBox(),
        ]),
        pw.TableRow(children: [
          pw.SizedBox(),
          pw.SizedBox(),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text('Grand Total', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.grandTotal), style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
        ]),
        pw.TableRow(
          decoration: pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColor.fromHex('#1e3a5f'), width: 2))),
          children: [
            pw.Padding(padding: pw.EdgeInsets.all(8), child: pw.Text('Amount in Words', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
            pw.Padding(
              padding: pw.EdgeInsets.all(8), 
              child: pw.Text(data.amountInWords, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9))
            ),
            pw.SizedBox(), 
            pw.SizedBox()
          ]
        ),
      ]
    )
  );
}

pw.Widget _buildTermsAndBankDetails(AppState appState) {
  return pw.Row(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Expanded(
        flex: 1,
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text('Company Name : ${appState.companyName}', style: pw.TextStyle(fontSize: 9)),
            pw.Text('Bank Name & Branch : ${appState.bankName} - ${appState.bankBranch}', style: pw.TextStyle(fontSize: 9)),
            pw.Text(appState.bankAccountNo, style: pw.TextStyle(fontSize: 9)),
            pw.Text(appState.bankIfsc, style: pw.TextStyle(fontSize: 9)),
          ]
        )
      ),
      pw.SizedBox(width: 10),
      pw.Expanded(
        flex: 1,
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text('Terms & Conditions', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
            pw.Text(
              appState.termsAndConditions, 
              style: pw.TextStyle(fontSize: 7.5)
            ),
          ]
        )
      )
    ]
  );
}

pw.Widget _buildSignatures() {
  return pw.Row(
    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
    children: [
      pw.Text('Authorised Signature', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
      pw.Text('Customer Signature', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
    ]
  );
}

pw.Widget _buildUpiQrSection(QuotationData data, AppState appState) {
  final clientConfig = appState.clientConfig;
  final vpa = clientConfig.upiId;
  final payeeName = clientConfig.upiPayeeNameOrCompany;
  final amount = data.grandTotal;
  final note = 'Quote ${data.quotationNo}';
  final transactionRef = data.quotationNo;

  final upiUri = UpiService.buildUri(
    vpa: vpa,
    payeeName: payeeName,
    amount: amount,
    note: note,
    transactionRef: transactionRef,
  );

  if (upiUri.isEmpty) return pw.SizedBox.shrink();

  final qrCode = Barcode.qrCode();
  final qrImage = qrCode.toSvg(upiUri, width: 180, height: 180);

  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.center,
    children: [
      pw.Container(
        padding: pw.EdgeInsets.all(12),
        decoration: pw.BoxDecoration(
          border: pw.TableBorder.all(color: PdfColors.grey300),
          borderRadius: pw.BorderRadius.circular(8),
        ),
        child: pw.Column(
          children: [
            pw.SvgImage(svg: qrImage),
            pw.SizedBox(height: 8),
            pw.Text(
              'Scan to Pay via UPI',
              style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold),
            ),
            pw.SizedBox(height: 4),
            pw.Text(
              'VPA: $vpa',
              style: pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
            ),
            pw.SizedBox(height: 4),
            pw.Text(
              'Amount: ${NumberFormat.currency(locale: 'en_IN', symbol: 'Rs. ').format(amount)}',
              style: pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
            ),
          ],
        ),
      ),
    ],
  );
}

pw.Widget _buildSitePhotosSection(List<QuotationPhoto> photos) {
  // Pre-load images for PDF (synchronously not possible, so we use placeholder and note)
  // For production, consider downloading images before PDF generation
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      _buildSectionTitle('Site Photos'),
      pw.Wrap(
        spacing: 10,
        runSpacing: 10,
        children: photos.map((photo) {
          return pw.Container(
            width: 180,
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey300),
              borderRadius: pw.BorderRadius.circular(8),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Container(
                  height: 135,
                  width: double.infinity,
                  decoration: pw.BoxDecoration(
                    borderRadius: const pw.BorderRadius.only(
                      topLeft: pw.Radius.circular(8),
                      topRight: pw.Radius.circular(8),
                    ),
                    color: PdfColors.grey100,
                  ),
                  child: pw.Center(
                    child: pw.Column(
                      mainAxisAlignment: pw.MainAxisAlignment.center,
                      children: [
                        pw.Icon(pw.IconData(0xe3f4), size: 32, color: PdfColors.grey400),
                        pw.SizedBox(height: 4),
                        pw.Text(
                          'Site Photo',
                          style: pw.TextStyle(fontSize: 10, color: PdfColors.grey600),
                        ),
                        pw.Text(
                          photo.sizeLabel,
                          style: pw.TextStyle(fontSize: 8, color: PdfColors.grey500),
                        ),
                      ],
                    ),
                  ),
                ),
                if (photo.caption.isNotEmpty)
                  pw.Padding(
                    padding: const pw.EdgeInsets.all(8),
                    child: pw.Text(
                      photo.caption,
                      style: pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
                      maxLines: 2,
                      overflow: pw.TextOverflow.clip,
                    ),
                  ),
              ],
            ),
          );
        }).toList(),
      ),
      pw.SizedBox(height: 8),
      pw.Text(
        '${photos.length} site photo(s) attached',
        style: pw.TextStyle(fontSize: 8, color: PdfColors.grey600, fontStyle: pw.FontStyle.italic),
      ),
    ],
  );
}
