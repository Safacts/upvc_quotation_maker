import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:upvc_quotation_maker/services/window_elevation_engine.dart';
import 'package:upvc_quotation_maker/models.dart';

void main() {
  test('generates 2D window elevations PDF matching client sample', () async {
    final pdf = pw.Document();

    final item1 = MeasuredItem()
      ..description = '5mm fixed glass black profile'
      ..width = 1829.00
      ..height = 2438.80
      ..units = 3
      ..rate = 650;

    final item2 = MeasuredItem()
      ..description = 'white door'
      ..width = 610.00
      ..height = 2134.00
      ..units = 1
      ..rate = 499;

    final item3 = MeasuredItem()
      ..description = 'ventilator'
      ..width = 610.00
      ..height = 610.00
      ..units = 2
      ..rate = 450;

    final measuredItems = [item1, item2, item3];

    // Build pages
    final pages = WindowElevationEngine.buildElevationPages(
      measuredItems: measuredItems,
      pageFormat: PdfPageFormat.a4,
    );

    for (final page in pages) {
      pdf.addPage(page);
    }

    final bytes = await pdf.save();
    expect(bytes.isNotEmpty, true);

    final testOutDir = Directory('test_output');
    if (!testOutDir.existsSync()) {
      testOutDir.createSync(recursive: true);
    }
    final file = File('test_output/window_elevations_test.pdf');
    await file.writeAsBytes(bytes);
    print('Generated test PDF at: ${file.absolute.path}');
  });
}
