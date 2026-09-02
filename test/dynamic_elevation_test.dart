import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:upvc_quotation_maker/services/window_elevation_engine.dart';
import 'package:upvc_quotation_maker/models.dart';

void main() {
  test('dynamically renders 6 diverse, arbitrary window sizes and configurations', () async {
    final pdf = pw.Document();

    final items = [
      MeasuredItem()
        ..description = '3-Track UPVC Sliding Window with Mosquito Mesh'
        ..width = 3200.00
        ..height = 1500.00
        ..units = 2
        ..rate = 550,
      MeasuredItem()
        ..description = 'Casement Openable Window (Side Hung)'
        ..width = 450.00
        ..height = 1800.00
        ..units = 4
        ..rate = 620,
      MeasuredItem()
        ..description = 'Double French Door White Profile'
        ..width = 1800.00
        ..height = 2100.00
        ..units = 1
        ..rate = 750,
      MeasuredItem()
        ..description = 'Toilet Top-Hung Ventilator with Frosted Glass'
        ..width = 900.00
        ..height = 450.00
        ..units = 3
        ..rate = 420,
      MeasuredItem()
        ..description = 'Panoramic Fixed Glass View Window'
        ..width = 2400.00
        ..height = 2400.00
        ..units = 1
        ..rate = 680,
      MeasuredItem()
        ..description = '2-Track 2-Panel Bedroom Slider'
        ..width = 1500.00
        ..height = 1200.00
        ..units = 5
        ..rate = 480,
    ];

    final pages = WindowElevationEngine.buildElevationPages(
      measuredItems: items,
      pageFormat: PdfPageFormat.a4,
    );

    for (final page in pages) {
      pdf.addPage(page);
    }

    final bytes = await pdf.save();
    expect(bytes.isNotEmpty, true);

    final file = File('test_output/dynamic_elevation_batch_test.pdf');
    await file.writeAsBytes(bytes);
    print('Generated dynamic batch test PDF with 6 items across ${pages.length} pages at: ${file.absolute.path}');
  });
}
