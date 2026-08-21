import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../lib/gst_pdf_generator.dart';
import '../lib/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('Generate Vaishnavi estimate PDF sample', () async {
    final appState = AppState();

    final data = VaishnaviEstimateData.fromSample();

    final bytes = await generateVaishnaviEstimatePdfBytes(data, appState);

    // Write to file
    final file = File('vaishnavi_estimate_sample.pdf');
    await file.writeAsBytes(bytes);

    expect(bytes.length, greaterThan(1000));
    print('PDF generated successfully: vaishnavi_estimate_sample.pdf (${bytes.length} bytes)');
  });
}