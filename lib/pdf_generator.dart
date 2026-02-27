import 'package:flutter/material.dart' show BuildContext;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';
import 'models.dart';

Future<void> generateAndPreviewPdf(QuotationData data, BuildContext context) async {
  final pdf = pw.Document();
  final NumberFormat currency = NumberFormat.currency(locale: 'en_IN', symbol: 'Rs. ');
  
  final watermarkUrl = 'https://t3.ftcdn.net/jpg/08/52/27/60/360_F_852276023_G4klsazIrvQwxpJOsje5gDf8zqlWWEmQ.jpg';
  final watermarkImage = await networkImage(watermarkUrl);
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
          _buildHeader(watermarkImage),
          _buildTopBar(data),
          _buildSectionTitle('Customer Details'),
          _buildCustomerDetails(data),
          _buildSectionTitle('Quotation Details'),
          if (data.measuredItems.isNotEmpty) _buildMeasuredTable(data, currency),
          if (data.unmeasuredItems.isNotEmpty) ...[
            _buildSectionTitle('Add Items without Measurements (Only Quantity)'),
            _buildUnmeasuredTable(data, currency),
          ],
          pw.SizedBox(height: 10),
          _buildTotalsTable(data, currency),
          _buildSectionTitle('Bank Details'),
          _buildTermsAndBankDetails(),
          pw.SizedBox(height: 40),
          _buildSignatures(),
        ];
      },
    ),
  );

  await Printing.layoutPdf(onLayout: (PdfPageFormat format) async => pdf.save());
}

pw.Widget _buildHeader(pw.ImageProvider logo) {
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
            pw.Text('Venkateshwara UPVC Windows & Doors', style: pw.TextStyle(color: PdfColors.white, fontSize: 16, fontWeight: pw.FontWeight.bold)),
            pw.Text('Plot No: 95, Road No: 2, Near Omkar Nagar Bus Stop, LB NAGAR, HYDERABAD - 500074', style: pw.TextStyle(color: PdfColors.white, fontSize: 10)),
            pw.Text('Prop: J.Venkateshwarlu    Contact: 9246588692, 9441888131', style: pw.TextStyle(color: PdfColors.white, fontSize: 10)),
            pw.Text('GST No: 36AKDPJ7245B2ZF', style: pw.TextStyle(color: PdfColors.white, fontSize: 10)),
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
    ],
  );
}

pw.Widget _buildMeasuredTable(QuotationData data, NumberFormat currency) {
  return pw.TableHelper.fromTextArray(
    headers: ['S.No', 'Code', 'Description', 'W', 'H', 'Units', 'Glass', 'SFT', 'T.SFT', 'Rate', 'Total'],
    headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
    headerDecoration: pw.BoxDecoration(color: PdfColor.fromHex('#dce6f1')),
    cellStyle: pw.TextStyle(fontSize: 9),
    cellAlignment: pw.Alignment.center,
    border: pw.TableBorder.all(color: PdfColors.grey800),
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
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text('Actual Amount', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.actualAmount), style: pw.TextStyle(fontSize: 10))),
        ]),
        pw.TableRow(children: [
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text('Transport', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.transport), style: pw.TextStyle(fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text('Grand Total', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.grandTotal), style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
        ]),
        pw.TableRow(
          decoration: pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColor.fromHex('#1e3a5f'), width: 2))),
          children: [
          pw.Padding(padding: pw.EdgeInsets.all(8), child: pw.Text('Amount in Words', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(
            padding: pw.EdgeInsets.all(8), 
            child: pw.Text(data.amountInWords, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11))
          ),
          pw.SizedBox(), pw.SizedBox()
        ]),
      ]
    )
  );
}

pw.Widget _buildTermsAndBankDetails() {
  return pw.Row(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Expanded(
        flex: 1,
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text('Company Name : VENKATESHWARA WELDING WORKS', style: pw.TextStyle(fontSize: 9)),
            pw.Text('Bank Name & Branch : Union Bank, Hastinapuram', style: pw.TextStyle(fontSize: 9)),
            pw.Text('A/C No : 178511100000061', style: pw.TextStyle(fontSize: 9)),
            pw.Text('IFSC Code : UBIN0817856', style: pw.TextStyle(fontSize: 9)),
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
              '1. Glass mentioned is of any reputed make.\n'
              '2. 50% advance, 35% after dispatch, 15% after installation.\n'
              '3. Delivery minimum 15 days from advance.\n'
              '4. All payments in favor of M/s Niksha Industries Pvt Ltd.\n'
              '5. Client responsible for site safety & electricity.\n'
              '6. Material can be taken back if payment not received.\n'
              '7. Final wall-to-wall measurement includes silicone sealant.\n'
              '8. Rates may alter if size changes above 1 foot.\n'
              '9. Quotation valid for 15 days.\n'
              '10. Above rates inclusive of installation.', 
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
