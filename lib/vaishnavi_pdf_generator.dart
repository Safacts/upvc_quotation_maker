import 'dart:convert';

import 'package:intl/intl.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'app_state.dart';
import 'models.dart';
import 'models_extra.dart';
import 'services/connectivity_service.dart';

/// Vaishnavi-only estimate renderer.
Future<Uint8List> generateVaishnaviPdfBytes(
  QuotationData data,
  AppState appState, {
  List<QuotationPhoto> photos = const [],
}) async {
  final svgPdf = await _tryGenerateVaishnaviSvgPdf(data, appState);
  if (svgPdf != null) return svgPdf;

  pw.Font regular = pw.Font.helvetica();
  pw.Font bold = pw.Font.helveticaBold();
  if (ConnectivityService.instance.isOnline) {
    try {
      regular = await PdfGoogleFonts.robotoRegular().timeout(const Duration(seconds: 1));
      bold = await PdfGoogleFonts.robotoBold().timeout(const Duration(seconds: 1));
    } catch (_) {
      regular = pw.Font.helvetica();
      bold = pw.Font.helveticaBold();
    }
  }
  final pdf = pw.Document();
  final money = NumberFormat.currency(locale: 'en_IN', symbol: 'Rs. ');

  pdf.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(28, 22, 28, 20),
      theme: pw.ThemeData.withFont(base: regular, bold: bold),
      build: (_) => _pageOne(data, appState, money),
    ),
  );
  pdf.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(28, 22, 28, 20),
      theme: pw.ThemeData.withFont(base: regular, bold: bold),
      build: (_) => _pageTwo(data, appState),
    ),
  );
  return pdf.save();
}

Future<Uint8List?> _tryGenerateVaishnaviSvgPdf(
  QuotationData data,
  AppState appState,
) async {
  if (!ConnectivityService.instance.isOnline) return null;
  final base = kIsWeb ? Uri.base.origin : 'https://app.vitharn.com';
  final items = <Map<String, dynamic>>[
    ...data.measuredItems.map(
      (item) => {
        'description': item.description,
        'width': item.width,
        'height': item.height,
        'units': item.units,
        'totalSft': item.totalSft,
        'rate': item.rate,
        'total': item.total,
      },
    ),
    ...data.unmeasuredItems.map(
      (item) => {
        'description': item.description,
        'width': 0,
        'height': 0,
        'units': item.units,
        'totalSft': 0,
        'rate': item.rate,
        'total': item.total,
      },
    ),
  ];
  final payload = {
    'client_id': appState.clientConfig.clientId,
    'quote': {
      'customerName': data.customerName,
      'quotationNo': data.quotationNo,
      'date': DateFormat('dd-MM-yyyy').format(data.date),
      'items': items,
      'subtotal': data.actualAmount + data.transport,
      'gstPercentage': data.includeGst ? data.gstPercentage : 0,
      'grandTotal': data.grandTotal,
      'amountInWords': data.amountInWords,
    },
  };
  try {
    final response = await http
        .post(
          Uri.parse('$base/api/vaishnavi-estimate/render'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode(payload),
        )
        .timeout(const Duration(seconds: 45));
    if (response.statusCode == 200 && response.bodyBytes.isNotEmpty) {
      return response.bodyBytes;
    }
  } catch (_) {
    // Keep the existing offline Flutter renderer as a safe fallback.
  }
  return null;
}

const _purple = PdfColor(0.61, 0.53, 1.0);
const _line = PdfColor(0.50, 0.50, 0.50);

pw.Widget _pageOne(QuotationData data, AppState appState, NumberFormat money) {
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.stretch,
    children: [
      _header(appState),
      pw.SizedBox(height: 12),
      _estimateMeta(data),
      pw.SizedBox(height: 10),
      _itemsTable(data, money),
      pw.SizedBox(height: 8),
      _totalAndPayTo(data, appState, money),
      pw.SizedBox(height: 10),
      _description(),
      pw.SizedBox(height: 9),
      _amountInWords(data),
    ],
  );
}

pw.Widget _pageTwo(QuotationData data, AppState appState) {
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.stretch,
    children: [
      _header(appState),
      pw.SizedBox(height: 15),
      _sectionTitle('Terms And Conditions'),
      pw.SizedBox(height: 7),
      ..._vaishnaviTerms.map(
        (term) => pw.Padding(
          padding: const pw.EdgeInsets.only(bottom: 5),
          child: pw.Text(
            term,
            style: const pw.TextStyle(fontSize: 8.4, lineSpacing: 1.5),
          ),
        ),
      ),
      pw.SizedBox(height: 8),
      pw.Text(
        'Thank you for doing business with us.',
        style: const pw.TextStyle(fontSize: 8.4),
      ),
      pw.SizedBox(height: 30),
      pw.Align(
        alignment: pw.Alignment.centerLeft,
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(
              'For: ${appState.companyName}',
              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold),
            ),
            pw.SizedBox(height: 35),
            pw.Text(
              'Authorized Signatory',
              style: const pw.TextStyle(fontSize: 8.5),
            ),
          ],
        ),
      ),
    ],
  );
}

pw.Widget _header(AppState appState) {
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.stretch,
    children: [
      pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Expanded(
            flex: 3,
            child: pw.Text(
              appState.companyContact,
              style: const pw.TextStyle(fontSize: 8.2),
            ),
          ),
          pw.Expanded(
            flex: 3,
            child: pw.Text(
              appState.companyEmail,
              textAlign: pw.TextAlign.center,
              style: const pw.TextStyle(fontSize: 8.2),
            ),
          ),
          pw.Expanded(
            flex: 5,
            child: pw.Text(
              appState.companyAddress,
              textAlign: pw.TextAlign.right,
              style: const pw.TextStyle(fontSize: 8.2, lineSpacing: 1.3),
            ),
          ),
        ],
      ),
      pw.SizedBox(height: 7),
      pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  appState.companyName,
                  style: pw.TextStyle(
                    fontSize: 12,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 3),
                pw.Text(
                  'GSTIN: ${appState.gstNumber}',
                  style: const pw.TextStyle(fontSize: 8.2),
                ),
                pw.Text(
                  'State: 36-Telangana',
                  style: const pw.TextStyle(fontSize: 8.2),
                ),
              ],
            ),
          ),
          pw.Text(
            'Estimate',
            style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
          ),
        ],
      ),
      pw.SizedBox(height: 6),
      pw.Divider(color: _line, thickness: .6, height: 1),
    ],
  );
}

pw.Widget _estimateMeta(QuotationData data) {
  return pw.Table(
    border: pw.TableBorder.all(color: _line, width: .5),
    columnWidths: const {
      0: pw.FlexColumnWidth(1.4),
      1: pw.FlexColumnWidth(1.3),
    },
    children: [
      pw.TableRow(
        children: [
          _cell('Estimate For', bold: true, color: _purple),
          _cell(
            'Estimate No.:                 ${data.quotationNo}\nDate:                         ${DateFormat('dd-MM-yyyy').format(data.date)}',
            bold: true,
            align: pw.TextAlign.right,
          ),
        ],
      ),
      pw.TableRow(children: [_cell(data.customerName), _cell('')]),
    ],
  );
}

pw.Widget _itemsTable(QuotationData data, NumberFormat money) {
  final rows = <List<String>>[];
  var number = 1;
  for (final item in data.measuredItems) {
    rows.add([
      '$number',
      _itemName(item),
      '${item.units}',
      item.sft.toStringAsFixed(0),
      'Nylon',
      item.glass.isEmpty ? 'Clear' : item.glass,
      _decimal(item.totalSft),
      'Sqf',
      _plainMoney(money, item.rate),
      _plainMoney(
        money,
        item.total * (data.includeGst ? data.gstPercentage / 100 : 0),
      ),
      _plainMoney(
        money,
        item.total * (1 + (data.includeGst ? data.gstPercentage / 100 : 0)),
      ),
    ]);
    number++;
  }
  for (final item in data.unmeasuredItems) {
    rows.add([
      '$number',
      item.description,
      '${item.units}',
      '-',
      '-',
      '-',
      '${item.units}',
      'Nos',
      _plainMoney(money, item.rate),
      _plainMoney(
        money,
        item.total * (data.includeGst ? data.gstPercentage / 100 : 0),
      ),
      _plainMoney(
        money,
        item.total * (1 + (data.includeGst ? data.gstPercentage / 100 : 0)),
      ),
    ]);
    number++;
  }
  final totalGst =
      data.includeGst ? data.actualAmount * data.gstPercentage / 100 : 0.0;
  rows.add([
    '',
    'Total',
    '',
    '',
    '',
    '',
    _decimal(data.totalSft),
    '',
    '',
    _plainMoney(money, totalGst),
    _plainMoney(money, data.grandTotal),
  ]);

  return pw.TableHelper.fromTextArray(
    headers: const [
      '#',
      'Item Name',
      'Windows\nQTY',
      'Windows\nSQ FEET',
      'MESH',
      'Glass',
      'Quantity',
      'Unit',
      'Price/ Unit',
      'GST',
      'Amount',
    ],
    data: rows,
    headerStyle: pw.TextStyle(fontSize: 5.7, fontWeight: pw.FontWeight.bold),
    headerDecoration: pw.BoxDecoration(color: _purple),
    headerAlignment: pw.Alignment.center,
    cellStyle: const pw.TextStyle(fontSize: 5.8, lineSpacing: 1.05),
    cellAlignment: pw.Alignment.center,
    border: pw.TableBorder.all(color: _line, width: .45),
    columnWidths: const {
      0: pw.FlexColumnWidth(.45),
      1: pw.FlexColumnWidth(3.2),
      2: pw.FlexColumnWidth(.9),
      3: pw.FlexColumnWidth(1.05),
      4: pw.FlexColumnWidth(.8),
      5: pw.FlexColumnWidth(.8),
      6: pw.FlexColumnWidth(1.0),
      7: pw.FlexColumnWidth(.65),
      8: pw.FlexColumnWidth(1.25),
      9: pw.FlexColumnWidth(1.35),
      10: pw.FlexColumnWidth(1.4),
    },
  );
}

pw.Widget _totalAndPayTo(
  QuotationData data,
  AppState appState,
  NumberFormat money,
) {
  final base =
      data.includeGst ? data.actualAmount + data.transport : data.grandTotal;
  final gst = data.includeGst ? data.grandTotal - base : 0.0;
  final half = gst / 2;
  final taxRows = [
    ['Sub Total', _plainMoney(money, base)],
    if (data.includeGst)
      [
        'SGST@${(data.gstPercentage / 2).toStringAsFixed(1)}%',
        _plainMoney(money, half),
      ],
    if (data.includeGst)
      [
        'CGST@${(data.gstPercentage / 2).toStringAsFixed(1)}%',
        _plainMoney(money, half),
      ],
    ['Total', _plainMoney(money, data.grandTotal)],
  ];
  return pw.Row(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Expanded(child: _bank(appState)),
      pw.SizedBox(width: 12),
      pw.SizedBox(
        width: 235,
        child: pw.Table(
          border: pw.TableBorder.all(color: _line, width: .5),
          children:
              taxRows
                  .map(
                    (row) => pw.TableRow(
                      children: [
                        _cell(
                          row[0],
                          align: pw.TextAlign.right,
                          bold: row[0] == 'Total',
                        ),
                        _cell(
                          row[1],
                          align: pw.TextAlign.right,
                          bold: row[0] == 'Total',
                        ),
                      ],
                    ),
                  )
                  .toList(),
        ),
      ),
    ],
  );
}

pw.Widget _bank(AppState appState) {
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      pw.Text(
        'Pay To:',
        style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold),
      ),
      pw.SizedBox(height: 4),
      pw.Text(
        'Bank Name: ${appState.bankName}, ${appState.bankBranch}',
        style: const pw.TextStyle(fontSize: 8),
      ),
      pw.Text(
        'Bank Account No.: ${appState.bankAccountNo}',
        style: const pw.TextStyle(fontSize: 8),
      ),
      pw.Text(
        'Bank IFSC code: ${appState.bankIfsc}',
        style: const pw.TextStyle(fontSize: 8),
      ),
      pw.Text(
        "Account Holder's Name: ${appState.companyName}",
        style: const pw.TextStyle(fontSize: 8),
      ),
    ],
  );
}

pw.Widget _description() {
  return pw.Column(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    children: [
      _sectionTitle('Description'),
      pw.SizedBox(height: 5),
      pw.Text(
        'profile: " OASIS "\n\n'
        'Supplying and fixing of Unplasticised Poly Vinyl Chloride (UPVC) 3 track sliding windows with mesh shutter - (2-glass shutters and 1-mesh shutter) duly manufactured using UPVC reinforced profiles (Composition of profile shall consists a minimum of 5.5 PHR of TiO2 and not more than 12 PHR of CaCo3 for every 100 parts of PVC resin) of (94mm x 45 mm)/(80 mm x 52 mm) x 2.20 mm for outer frames, (58 mm x 39 mm)/(54 mm x 38 mm) x 2.20mm for sliding shutter frames capable of mounting single glazing ally reinforced with system structurally reinforced with hot dip galvanized up to 50 microns of minimum thickness of 1.0/1.2 mm prefabricated & welded through fusion welding. The window sash shall be fitted with 5 mm thick clear float glass of reputed make and mesh shutter frame shall be (42 mm x 25mm)/(52 mm x 21.5 mm) x 2.0 mm fitted with Vinyl Coated Fiber mesh- on rollers/ pulley duly fixed with Grey colour TPV Gasket for sash & Glazing bead shall be co- extruded with Grey colour soft PVC. System shall have single point locking with Touch Lock and the system is to be installed at the site using anchor fasteners, silicon rubber sealant, easy glazing/deglazing at site etc., including cost and conveyance of all materials, accessories, labour charges for transportation, erection at site including overheads and contractors profit etc., complete for finished item of work',
        style: const pw.TextStyle(fontSize: 7.2, lineSpacing: 1.25),
      ),
    ],
  );
}

pw.Widget _amountInWords(QuotationData data) => pw.Column(
  crossAxisAlignment: pw.CrossAxisAlignment.start,
  children: [
    _sectionTitle('Estimate Amount In Words'),
    pw.SizedBox(height: 5),
    pw.Text(data.amountInWords, style: const pw.TextStyle(fontSize: 8.2)),
  ],
);

String _itemName(MeasuredItem item) {
  final dimensions =
      '${item.width.toStringAsFixed(0)} mm x ${item.height.toStringAsFixed(0)} mm';
  final description = item.description.trim();
  if (description.toLowerCase().startsWith(dimensions.toLowerCase())) {
    return description;
  }
  return '$dimensions $description'.trim();
}

pw.Widget _sectionTitle(String title) => pw.Container(
  width: double.infinity,
  padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 6),
  color: _purple,
  child: pw.Text(
    title,
    style: const pw.TextStyle(color: PdfColors.white, fontSize: 9),
  ),
);

pw.Widget _cell(
  String value, {
  bool bold = false,
  pw.TextAlign align = pw.TextAlign.left,
  PdfColor? color,
}) => pw.Padding(
  padding: const pw.EdgeInsets.all(4),
  child: pw.Text(
    value,
    textAlign: align,
    style: pw.TextStyle(
      fontSize: 8,
      fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
      color: color ?? PdfColors.black,
    ),
  ),
);

String _plainMoney(NumberFormat money, double value) => money.format(value);
String _decimal(double value) =>
    value == value.roundToDouble()
        ? value.toStringAsFixed(0)
        : value.toStringAsFixed(1);

const _vaishnaviTerms = <String>[
  '1) the proposal made is based on the routh measurements / dimensions provide to us once the order is confirmed accurate site measurements are taken again.hence there maybe increase or decrease in total SFT.',
  '2) A work order with contract detai need to be provide latter head duly signed along with advance payment.',
  '3) payments TERM: 30% Along with work order 50% after material delivery 20% after work completed',
  "4) delivery Date: 16 day's",
  '5) offer validity: 30 days from date of quatation',
];
