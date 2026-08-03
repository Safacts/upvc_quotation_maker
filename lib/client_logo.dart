import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'config/client_config.dart';

class ClientLogo extends StatelessWidget {
  final ClientConfig config;
  final double width;
  final double height;
  final BoxFit fit;

  const ClientLogo({
    super.key,
    required this.config,
    this.width = 120,
    this.height = 120,
    this.fit = BoxFit.contain,
  });

  @override
  Widget build(BuildContext context) {
    final url = config.logoUrl.trim();
    if (url.isEmpty) {
      return Image.asset('assets/logo.png', width: width, height: height, fit: fit);
    }
    return Image.network(
      url,
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (_, __, ___) => Image.asset('assets/logo.png', width: width, height: height, fit: fit),
    );
  }
}

Future<Uint8List> loadLogoBytes(ClientConfig config) async {
  final url = config.logoUrl.trim();
  if (url.isNotEmpty) {
    try {
      final bytes = await NetworkAssetBundle(Uri.parse(url)).load(url);
      return bytes.buffer.asUint8List();
    } catch (_) {}
  }
  final data = await rootBundle.load('assets/logo.png');
  return data.buffer.asUint8List();
}
