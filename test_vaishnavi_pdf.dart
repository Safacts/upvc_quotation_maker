import 'dart:io';
import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:pdf/widgets.dart';
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';
import 'package:pdf/widgets.dart';
import 'package:google_fonts/google_fonts.dart';

Future<void> main() async {
  final pdf = pw.Document();
  final currency = NumberFormat.currency(locale: 'en_IN', symbol: 'Rs. ');

  final fontRegular = await PdfGoogleFonts.robotoRegular();
  final fontBold = await PdfGoogleFonts.robotoBold();

  final pageTheme = pw.PageTheme(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(20),
    theme: pw.ThemeData.withFont(base: fontRegular, bold: fontBold),
  );

  // Sample data matching Vaishnavi's estimate
  final items = [
    VaishnaviEstimateItem(sno: 1, itemName: '1828 mm x 1828 mm 2.5 track sliding window', windowsQty: 46, windowsSqFt: 36, mesh: 'Nylon', glass: 'Clear', quantity: 1656, unit: 'Sqf', pricePerUnit: 355.93, gstPercent: 18.0, amount: 106096.27),
    VaishnaviEstimateItem(sno: 2, itemName: '1036 mm x 1828 mm 2.5 track sliding window', windowsQty: 6, windowsSqFt: 20, mesh: 'Nylon', glass: 'Clear', quantity: 122, unit: 'Sqf', pricePerUnit: 355.93, gstPercent: 18.0, amount: 7841.90),
    VaishnaviEstimateItem(sno: 3, itemName: '1525 mm x 1463 mm 2.5 track sliding window', windowsQty: 24, windowsSqFt: 24, mesh: 'Nylon', glass: 'Clear', quantity: 576, unit: 'Sqf', pricePerUnit: 355.93, gstPercent: 18.0, amount: 36903.05),
    VaishnaviEstimateItem(sno: 4, itemName: '1525 mm x 1828 mm 2.5 track sliding window', windowsQty: 11, windowsSqFt: 30, mesh: 'Nylon', glass: 'Clear', quantity: 330, unit: 'Sqf', pricePerUnit: 355.93, gstPercent: 18.0, amount: 21142.37),
    VaishnaviEstimateItem(sno: 5, itemName: '1220 mm x 1828 mm 2.5 track sliding window', windowsQty: 5, windowsSqFt: 24, mesh: 'Nylon', glass: 'Clear', quantity: 120, unit: 'Sqf', pricePerUnit: 355.93, gstPercent: 18.0, amount: 7688.14),
    VaishnaviEstimateItem(sno: 6, itemName: '915 mm x 1828 mm 2.5 track sliding window', windowsQty: 5, windowsSqFt: 18, mesh: 'Nylon', glass: 'Clear', quantity: 90, unit: 'Sqf', pricePerUnit: 355.93, gstPercent: 18.0, amount: 5766.10),
    VaishnaviEstimateItem(sno: 7, itemName: '1828 mm x 1828 mm casement fixed window', windowsQty: 8, windowsSqFt: 36, mesh: 'No', glass: 'Clear', quantity: 288, unit: 'Sqf', pricePerUnit: 355.93, gstPercent: 18.0, amount: 18451.53),
  ];

  final data = VaishnaviEstimateData(
    estimateNumber: '322',
    estimateDate: DateTime(2026, 8, 13),
    customerName: 'Santhosh kumar',
    customerAddress: '',
    companyName: 'VAISHNAVI UPVC WINDOWS AND DOORS',
    companyAddress: 'SY NO 21 AND 22, Near Kharmanghat, Hanuman Temple, Gayatri Nagar X Roads, Jillelaguda, Hyderabad, Rangareddy, Telangana, 50007',
    companyContact: '9640000825',
    companyEmail: 'ecotexupvc@gmail.com',
    gstNumber: '36CSPPV7053P1ZJ',
    proprietor: 'kiran chary',
    items: items,
    subTotal: 1132718.64,
    sgstAmount: 101944.69,
    cgstAmount: 101944.69,
    grandTotal: 1336608.00,
    bankName: 'Yes Bank',
    bankBranch: 'Lb Nagar, Hyderabad',
    bankAccountNo: '11352700000045',
    bankIfsc: 'YESB0001135',
    amountInWords: 'Thirteen Lakh Thirty Six Thousand Six Hundred and Eight Rupees only',
  );

  pdf.addPage(
    pw.MultiPage(
      pageTheme: pageTheme,
      footer: (pw.Context context) {
        return pw.Container(
          alignment: pw.Alignment.center,
          margin: const pw.EdgeInsets.only(top: 8),
          decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColors.grey))),
          padding: const pw.EdgeInsets.only(top: 5),
          child: pw.Text(
            'This is a computer-generated estimate | Page \${context.pageNumber} of \${context.pagesCount}',
            style: pw.TextStyle(fontSize: 7, color: PdfColors.grey700),
          ),
        );
      },
      build: (pw.Context context) {
        return [
          _buildVaishnaviHeader(data),
          pw.SizedBox(height: 8),
          _buildVaishnaviEstimateDetails(data),
          pw.SizedBox(height: 8),
          _buildVaishnaviCustomerDetails(data),
          pw.SizedBox(height: 8),
          _buildVaishnaviItemsTable(data, currency),
          pw.SizedBox(height: 8),
          _buildVaishnaviTaxSummary(data, currency),
          pw.SizedBox(height: 8),
          _buildVaishnaviAmountInWords(data),
          pw.SizedBox(height: 8),
          _buildVaishnaviBankDetails(data),
          pw.SizedBox(height: 8),
          _buildVaishnaviDescription(data),
          pw.SizedBox(height: 20),
          _buildVaishnaviFooter(data),
        ];
      },
    ),
  );

  final bytes = await pdf.save();
  await File('vaishnavi_estimate_sample.pdf').writeAsBytes(bytes);
  print('PDF generated: vaishnavi_estimate_sample.pdf');
}

class VaishnaviEstimateItem {
  final int sno;
  final String itemName;
  final int windowsQty;
  final int windowsSqFt;
  final String mesh;
  final String glass;
  final int quantity;
  final String unit;
  final double pricePerUnit;
  final double gstPercent;
  final double amount;

  VaishnaviEstimateItem({
    required this.sno,
    required this.itemName,
    required this.windowsQty,
    required this.windowsSqFt,
    required this.mesh,
    required this.glass,
    required this.quantity,
    required this.unit,
    required this.pricePerUnit,
    required this.gstPercent,
    required this.amount,
  });
}

class VaishnaviEstimateData {
  final String estimateNumber;
  final DateTime estimateDate;
  final String customerName;
  final String customerAddress;
  final String companyName;
  final String companyAddress;
  final String companyContact;
  final String companyEmail;
  final String gstNumber;
  final String proprietor;
  final List<VaishnaviEstimateItem> items;
  final double subTotal;
  final double sgstAmount;
  final double cgstAmount;
  final double grandTotal;
  final String bankName;
  final String bankBranch;
  final String bankAccountNo;
  final String bankIfsc;
  final String amountInWords;

  VaishnaviEstimateData({
    required this.estimateNumber,
    required this.estimateDate,
    required this.customerName,
    required this.customerAddress,
    required this.companyName,
    required this.companyAddress,
    required this.companyContact,
    required this.companyEmail,
    required this.gstNumber,
    required this.proprietor,
    required this.items,
    required this.subTotal,
    required this.sgstAmount,
    required this.cgstAmount,
    required this.grandTotal,
    required this.bankName,
    required this.bankBranch,
    required this.bankAccountNo,
    required this.bankIfsc,
    required this.amountInWords,
  });
}

pw.Widget _buildVaishnaviHeader(VaishnaviEstimateData data) {
  return pw.Column(
    children: [
      pw.Center(
        child: pw.Text(
          'Estimate',
          style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold, color: PdfColor.fromHex('#1e3a5f')),
        ),
      ),
      pw.SizedBox(height: 6),
      pw.Container(
        width: double.infinity,
        padding: const pw.EdgeInsets.all(10),
        color: PdfColor.fromHex('#1e3a5f'),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.center,
          children: [
            pw.Text(data.companyName, style: pw.TextStyle(color: PdfColors.white, fontSize: 14, fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 2),
            pw.Text('GSTIN: \${data.gstNumber}', style: pw.TextStyle(color: PdfColors.white, fontSize: 9)),
            pw.Text(data.companyAddress, style: pw.TextStyle(color: PdfColors.white, fontSize: 9)),
            pw.Text('Ph: \${data.companyContact}  Email: \${data.companyEmail}', style: pw.TextStyle(color: PdfColors.white, fontSize: 9)),
            pw.Text('Prop: \${data.proprietor}', style: pw.TextStyle(color: PdfColors.white, fontSize: 9)),
          ],
        ),
      ),
    ],
  );
}

pw.Widget _buildVaishnaviEstimateDetails(VaishnaviEstimateData data) {
  return pw.Row(
    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
    children: [
      pw.Text('Estimate No: \${data.estimateNumber}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
      pw.Text('Date: \${DateFormat('dd-MM-yyyy').format(data.estimateDate)}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
    ],
  );
}

pw.Widget _buildVaishnaviCustomerDetails(VaishnaviEstimateData data) {
  return pw.Table(
    columnWidths: {
      0: const pw.FlexColumnWidth(1),
      1: const pw.FlexColumnWidth(2),
    },
    border: pw.TableBorder.all(color: PdfColors.grey800, width: 0.5),
    children: [
      pw.TableRow(
        decoration: pw.BoxDecoration(color: PdfColor.fromHex('#1e3a5f')),
        children: [
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Estimate For', style: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(data.customerName, style: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 10))),
        ],
      ),
      if (data.customerAddress.isNotEmpty)
        pw.TableRow(children: [
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Address', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9))),
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(data.customerAddress, style: pw.TextStyle(fontSize: 9))),
        ]),
    ],
  );
}

pw.Widget _buildVaishnaviItemsTable(VaishnaviEstimateData data, NumberFormat currency) {
  return pw.TableHelper.fromTextArray(
    headers: ['#', 'Item Name', 'Windows\nQTY', 'Windows\nSQ FEET', 'MESH', 'Glass', 'Quantity', 'Unit', 'Price/Unit', 'GST', 'Amount'],
    headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 8),
    headerDecoration: pw.BoxDecoration(color: PdfColor.fromHex('#1e3a5f')),
    headerAlignment: pw.Alignment.center,
    cellStyle: pw.TextStyle(fontSize: 8),
    cellAlignment: pw.Alignment.center,
    border: pw.TableBorder.all(color: PdfColors.grey800, width: 0.5),
    columnWidths: {
      0: const pw.FlexColumnWidth(0.5),
      1: const pw.FlexColumnWidth(3.5),
      2: const pw.FlexColumnWidth(1.2),
      3: const pw.FlexColumnWidth(1.2),
      4: const pw.FlexColumnWidth(1),
      5: const pw.FlexColumnWidth(1),
      6: const pw.FlexColumnWidth(1.2),
      7: const pw.FlexColumnWidth(1),
      8: const pw.FlexColumnWidth(1.5),
      9: const pw.FlexColumnWidth(1),
      10: const pw.FlexColumnWidth(2),
    },
    data: List<List<String>>.generate(data.items.length, (index) {
      final item = data.items[index];
      return [
        '\${item.sno}',
        item.itemName,
        '\${item.windowsQty}',
        '\${item.windowsSqFt}',
        item.mesh,
        item.glass,
        '\${item.quantity}',
        item.unit,
        currency.format(item.pricePerUnit),
        '\${item.gstPercent.toStringAsFixed(1)}%',
        currency.format(item.amount),
      ];
    }),
  );
}

pw.Widget _buildVaishnaviTaxSummary(VaishnaviEstimateData data, NumberFormat currency) {
  return pw.Container(
    color: PdfColor.fromHex('#f1f5fa'),
    child: pw.Table(
      border: pw.TableBorder.all(color: PdfColor.fromHex('#1e3a5f'), width: 0.5),
      columnWidths: {
        0: const pw.FlexColumnWidth(3),
        1: const pw.FlexColumnWidth(2),
      },
      children: [
        pw.TableRow(children: [
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Sub Total', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.subTotal), style: pw.TextStyle(fontSize: 10))),
        ]),
        pw.TableRow(children: [
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('SGST @ 9.0%', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.sgstAmount), style: pw.TextStyle(fontSize: 10))),
        ]),
        pw.TableRow(children: [
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('CGST @ 9.0%', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
          pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text(currency.format(data.cgstAmount), style: pw.TextStyle(fontSize: 10))),
        ]),
        pw.TableRow(
          decoration: pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColor.fromHex('#1e3a5f'), width: 2))),
          children: [
            pw.Padding(padding: const pw.EdgeInsets.all(8), child: pw.Text('Grand Total', textAlign: pw.TextAlign.right, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12))),
            pw.Padding(padding: const pw.EdgeInsets.all(8), child: pw.Text(currency.format(data.grandTotal), style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12, color: PdfColor.fromHex('#1e3a5f')))),
          ],
        ),
      ],
    ),
  );
}

pw.Widget _buildVaishnaviAmountInWords(VaishnaviEstimateData data) {
  return pw.Container(
    width: double.infinity,
    padding: const pw.EdgeInsets.all(8),
    decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.grey800, width: 1)),
    child: pw.Row(
      children: [
        pw.Text('Amount in Words: ', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10)),
        pw.Expanded(child: pw.Text(data.amountInWords, style: pw.TextStyle(fontSize: 9))),
      ],
    ),
  );
}

pw.Widget _buildVaishnaviBankDetails(VaishnaviEstimateData data) {
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Text('Pay To:', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10, color: PdfColor.fromHex('#1e3a5f'))),
      pw.SizedBox(height: 4),
      pw.Table(
        columnWidths: {
          0: const pw.FlexColumnWidth(2),
          1: const pw.FlexColumnWidth(3),
        },
        border: pw.TableBorder.all(color: PdfColors.grey800, width: 0.5),
        children: [
          pw.TableRow(children: [
            pw.Padding(padding: const pw.EdgeInsets.all(4), child: pw.Text('Bank Name', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9))),
            pw.Padding(padding: const pw.EdgeInsets.all(4), child: pw.Text('\${data.bankName}, \${data.bankBranch}', style: pw.TextStyle(fontSize: 9))),
          ]),
          pw.TableRow(children: [
            pw.Padding(padding: const pw.EdgeInsets.all(4), child: pw.Text('Account No', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9))),
            pw.Padding(padding: const pw.EdgeInsets.all(4), child: pw.Text(data.bankAccountNo, style: pw.TextStyle(fontSize: 9))),
          ]),
          pw.TableRow(children: [
            pw.Padding(padding: const pw.EdgeInsets.all(4), child: pw.Text('IFSC', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9))),
            pw.Padding(padding: const pw.EdgeInsets.all(4), child: pw.Text(data.bankIfsc, style: pw.TextStyle(fontSize: 9))),
          ]),
        ],
      ),
      pw.SizedBox(height: 6),
      pw.Text('Account Holder: \${data.companyName}', style: pw.TextStyle(fontSize: 9)),
    ],
  );
}

pw.Widget _buildVaishnaviDescription(VaishnaviEstimateData data) {
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Text('Description', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10, color: PdfColor.fromHex('#1e3a5f'))),
      pw.SizedBox(height: 6),
      pw.Text(
        'proﬁle: " OASIS "\n'
        'Supplying and ﬁxing of Unplasticised Poly Vinyl Chloride (UPVC) 3 track sliding windows with mesh '
        'shutter - (2-glass shutters and 1-mesh shutter) duly manufactured using UPVC reinforced proﬁles '
        '(Composition of proﬁle shall consists a minimum of 5.5 PHR of TiO2 and not more than 12 PHR of '
        'CaCo3 for every 100 parts of PVC resin) of (94mm x 45 mm)/(80 mm x 52 mm) x 2.20 mm for outer '
        'frames, (58 mm x 39 mm)/(54 mm x 38 mm) x 2.20mm for sliding shutter frames capable of '
        'mounting single glazing ally reinforced with system structurally reinforced with hot dip galvanized up '
        'to 50 microns of minimum thickness of 1.0/1.2 mm prefabricated & welded through fusion welding. '
        'The window sash shall be ﬁtted with 5 mm thick clear ﬂoat glass of reputed make and mesh shutter '
        'frame shall be (42 mm x 25mm)/(52 mm x 21.5 mm) x 2.0 mm ﬁtted with Vinyl Coated Fiber mesh- on '
        'rollers/ pulley duly ﬁxed with Grey colour TPV Gasket for sash & Glazing bead shall be co- extruded '
        'with Grey colour soft PVC. System shall have single point locking with Touch Lock and the system is '
        'to be installed at the site using anchor fasteners, silicon rubber sealant, easy glazing/deglazing at site '
        'etc., including cost and conveyance of all materials, accessories, labour charges for transportation, '
        'erection at site including overheads and contractors proﬁt etc., complete for ﬁnished item of work',
        style: pw.TextStyle(fontSize: 8, height: 1.3),
      ),
    ],
  );
}

pw.Widget _buildVaishnaviFooter(VaishnaviEstimateData data) {
  return pw.Stack(
    children: [
      pw.Container(
        width: double.infinity,
        height: 80,
        color: PdfColor.fromHex('#9c88ff'),
        child: pw.Center(
          child: pw.Text(
            'Thank you for your business!',
            style: pw.TextStyle(color: PdfColors.white, fontSize: 12, fontWeight: pw.FontWeight.bold),
          ),
        ),
      ),
      pw.Positioned(
        right: 10,
        bottom: 10,
        child: pw.Container(
          width: 60,
          height: 60,
          decoration: pw.BoxDecoration(
            color: PdfColor.fromHex('#1e3a5f'),
            borderRadius: pw.BorderRadius.circular(8),
          ),
          child: pw.Center(
            child: pw.Text(
              'VAISHNAVI',
              style: pw.TextStyle(color: PdfColors.white, fontSize: 7, fontWeight: pw.FontWeight.bold),
              textAlign: pw.TextAlign.center,
            ),
          ),
        ),
      ),
    ],
  );
}