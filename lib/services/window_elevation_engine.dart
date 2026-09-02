import 'dart:math' as math;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

enum WindowElevationType {
  fixedWindow,
  singleDoor,
  doubleDoor,
  sliding2Track,
  sliding3Track,
  casementWindow,
  ventilator,
}

class WindowElevationEngine {
  /// Detects the window/door type from description or explicit type string.
  static WindowElevationType detectType(String description) {
    final lower = description.toLowerCase();
    if (lower.contains('door') || lower.contains('french')) {
      if (lower.contains('double') || lower.contains('2 sash') || lower.contains('pair')) {
        return WindowElevationType.doubleDoor;
      }
      return WindowElevationType.singleDoor;
    }
    if (lower.contains('3 track') || lower.contains('3-track') || lower.contains('3track') || lower.contains('3 panel')) {
      return WindowElevationType.sliding3Track;
    }
    if (lower.contains('sliding') || lower.contains('slider') || lower.contains('2 track') || lower.contains('2-track')) {
      return WindowElevationType.sliding2Track;
    }
    if (lower.contains('casement') || lower.contains('openable') || lower.contains('side hung')) {
      return WindowElevationType.casementWindow;
    }
    if (lower.contains('ventilator') || lower.contains('vent') || lower.contains('louver') || lower.contains('exhaust')) {
      return WindowElevationType.ventilator;
    }
    return WindowElevationType.fixedWindow;
  }

  /// Returns user-friendly title for the elevation
  static String getDisplayTitle(WindowElevationType type, int itemIndex) {
    switch (type) {
      case WindowElevationType.fixedWindow:
        return 'Fixed Window: Item $itemIndex';
      case WindowElevationType.singleDoor:
        return 'Single Door: Item $itemIndex';
      case WindowElevationType.doubleDoor:
        return 'Double Door: Item $itemIndex';
      case WindowElevationType.sliding2Track:
        return '2-Track Sliding Window: Item $itemIndex';
      case WindowElevationType.sliding3Track:
        return '3-Track Sliding Window: Item $itemIndex';
      case WindowElevationType.casementWindow:
        return 'Casement Window: Item $itemIndex';
      case WindowElevationType.ventilator:
        return 'Ventilator: Item $itemIndex';
    }
  }

  /// Generates a clean, standalone SVG string representing the window with CAD dimension lines
  static String generateSvg({
    required double widthMm,
    required double heightMm,
    required String description,
    int itemIndex = 1,
    double targetWidth = 240,
    double targetHeight = 280,
    String? profileColorName,
  }) {
    final type = detectType(description);
    final w = widthMm <= 0 ? 1000.0 : widthMm;
    final h = heightMm <= 0 ? 1000.0 : heightMm;

    // Drawing area margins for dimension lines & annotations
    const marginLeft = 20.0;
    const marginRight = 65.0; // Space for vertical dimension line & text
    const marginTop = 20.0;
    const marginBottom = 45.0; // Space for horizontal dimension line & text

    final maxDrawWidth = targetWidth - marginLeft - marginRight;
    final maxDrawHeight = targetHeight - marginTop - marginBottom;

    // Aspect ratio calculation
    final aspect = w / h;
    double drawW, drawH;

    if (aspect >= (maxDrawWidth / maxDrawHeight)) {
      drawW = maxDrawWidth;
      drawH = maxDrawWidth / aspect;
    } else {
      drawH = maxDrawHeight;
      drawW = maxDrawHeight * aspect;
    }

    // Minimum visual bounds so tiny windows aren't microscopic
    drawW = math.max(40.0, drawW);
    drawH = math.max(60.0, drawH);

    final originX = marginLeft + (maxDrawWidth - drawW) / 2;
    final originY = marginTop + (maxDrawHeight - drawH) / 2;

    // Profile colors
    final isWhiteProfile = (profileColorName ?? description).toLowerCase().contains('white');
    final frameStroke = isWhiteProfile ? '#718096' : '#1A202C';
    final frameFill = isWhiteProfile ? '#FFFFFF' : '#2D3748';
    final innerBeadStroke = isWhiteProfile ? '#CBD5E0' : '#A0AEC0';
    const glassFill = '#CBE3F5';
    const glassSheen = '#EBF4FC';
    const dimLineColor = '#000000';

    final sb = StringBuffer();
    sb.writeln('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $targetWidth $targetHeight" width="$targetWidth" height="$targetHeight">');

    // Outer frame (Outer UPVC box)
    const frameThickness = 6.0;
    sb.writeln('  <!-- Outer Frame -->');
    sb.writeln('  <rect x="$originX" y="$originY" width="$drawW" height="$drawH" fill="$frameFill" stroke="$frameStroke" stroke-width="2.5" rx="1" />');

    // Inner beading & glass area
    final glassX = originX + frameThickness;
    final glassY = originY + frameThickness;
    final glassW = drawW - (frameThickness * 2);
    final glassH = drawH - (frameThickness * 2);

    if (glassW > 4 && glassH > 4) {
      sb.writeln('  <!-- Glazing Bead -->');
      sb.writeln('  <rect x="$glassX" y="$glassY" width="$glassW" height="$glassH" fill="$glassFill" stroke="$innerBeadStroke" stroke-width="1.5" />');

      // Glass reflection highlight (clean L-shaped sheen)
      final sheenW = glassW * 0.45;
      final sheenH = glassH * 0.40;
      sb.writeln('  <!-- Glass Sheen Corner -->');
      sb.writeln('  <polygon points="$glassX,$glassY ${glassX + sheenW},$glassY ${glassX + sheenW},${glassY + (sheenH * 0.4)} ${glassX + (sheenW * 0.4)},${glassY + (sheenH * 0.4)} ${glassX + (sheenW * 0.4)},${glassY + sheenH} $glassX,${glassY + sheenH}" fill="$glassSheen" opacity="0.85" />');

      // Specific typology overlays
      _appendTypologySvg(
        sb,
        type: type,
        x: glassX,
        y: glassY,
        w: glassW,
        h: glassH,
        frameThickness: frameThickness,
        innerBeadStroke: innerBeadStroke,
        frameStroke: frameStroke,
      );
    }

    // Dimension Lines (CAD style)
    _appendDimensionsSvg(
      sb,
      originX: originX,
      originY: originY,
      drawW: drawW,
      drawH: drawH,
      widthMm: w,
      heightMm: h,
    );

    sb.writeln('</svg>');
    return sb.toString();
  }

  static void _appendTypologySvg(
    StringBuffer sb, {
    required WindowElevationType type,
    required double x,
    required double y,
    required double w,
    required double h,
    required double frameThickness,
    required String innerBeadStroke,
    required String frameStroke,
  }) {
    switch (type) {
      case WindowElevationType.singleDoor:
        // Door swing arrow marker on left/right frame
        final arrowY = y + (h * 0.5);
        sb.writeln('  <!-- Door Swing Marker -->');
        sb.writeln('  <text x="${x + 6}" y="${arrowY - 8}" font-family="Helvetica, Arial, sans-serif" font-size="8" font-weight="bold" fill="#E53E3E" letter-spacing="0.5">SWING</text>');
        sb.writeln('  <polygon points="${x + 6},${arrowY - 5} ${x + 14},${arrowY} ${x + 6},${arrowY + 5}" fill="#E53E3E" />');
        // Bottom kick plate
        if (h > 40) {
          sb.writeln('  <rect x="$x" y="${y + h - 14}" width="$w" height="14" fill="#EDF2F7" stroke="$innerBeadStroke" stroke-width="1" />');
        }
        break;

      case WindowElevationType.doubleDoor:
        // Vertical meeting mullion in center
        final midX = x + (w / 2);
        sb.writeln('  <!-- Center Mullion -->');
        sb.writeln('  <line x1="$midX" y1="$y" x2="$midX" y2="${y + h}" stroke="$frameStroke" stroke-width="3" />');
        // Dual swing markers
        final arrowY2 = y + (h * 0.5);
        sb.writeln('  <polygon points="${midX - 10},${arrowY2 - 4} ${midX - 3},${arrowY2} ${midX - 10},${arrowY2 + 4}" fill="#E53E3E" />');
        sb.writeln('  <polygon points="${midX + 10},${arrowY2 - 4} ${midX + 3},${arrowY2} ${midX + 10},${arrowY2 + 4}" fill="#E53E3E" />');
        break;

      case WindowElevationType.sliding2Track:
        // 2 sashes with center interlock overlap
        final midX = x + (w / 2);
        sb.writeln('  <!-- Sliding 2-Track Sashes -->');
        sb.writeln('  <line x1="$midX" y1="$y" x2="$midX" y2="${y + h}" stroke="$innerBeadStroke" stroke-width="2.5" />');
        // Sliding direction arrows
        final arrowY = y + (h * 0.5);
        sb.writeln('  <line x1="${x + (w * 0.15)}" y1="$arrowY" x2="${x + (w * 0.35)}" y2="$arrowY" stroke="#2B6CB0" stroke-width="1.5" />');
        sb.writeln('  <polygon points="${x + (w * 0.35)},$arrowY ${x + (w * 0.35) - 4},${arrowY - 2.5} ${x + (w * 0.35) - 4},${arrowY + 2.5}" fill="#2B6CB0" />');
        sb.writeln('  <line x1="${midX + (w * 0.15)}" y1="$arrowY" x2="${midX + (w * 0.35)}" y2="$arrowY" stroke="#2B6CB0" stroke-width="1.5" />');
        sb.writeln('  <polygon points="${midX + (w * 0.15)},$arrowY ${midX + (w * 0.15) + 4},${arrowY - 2.5} ${midX + (w * 0.15) + 4},${arrowY + 2.5}" fill="#2B6CB0" />');
        break;

      case WindowElevationType.sliding3Track:
        // 3 sashes
        final paneW = w / 3;
        final div1 = x + paneW;
        final div2 = x + (paneW * 2);
        sb.writeln('  <!-- Sliding 3-Track Sashes -->');
        sb.writeln('  <line x1="$div1" y1="$y" x2="$div1" y2="${y + h}" stroke="$innerBeadStroke" stroke-width="2.5" />');
        sb.writeln('  <line x1="$div2" y1="$y" x2="$div2" y2="${y + h}" stroke="$innerBeadStroke" stroke-width="2.5" />');
        // Slide arrows
        final arrowY = y + (h * 0.5);
        sb.writeln('  <line x1="${x + 6}" y1="$arrowY" x2="${div1 - 6}" y2="$arrowY" stroke="#2B6CB0" stroke-width="1.5" />');
        sb.writeln('  <polygon points="${div1 - 6},$arrowY ${div1 - 10},${arrowY - 2.5} ${div1 - 10},${arrowY + 2.5}" fill="#2B6CB0" />');
        sb.writeln('  <line x1="${div2 + 6}" y1="$arrowY" x2="${x + w - 6}" y2="$arrowY" stroke="#2B6CB0" stroke-width="1.5" />');
        sb.writeln('  <polygon points="${div2 + 6},$arrowY ${div2 + 10},${arrowY - 2.5} ${div2 + 10},${arrowY + 2.5}" fill="#2B6CB0" />');
        break;

      case WindowElevationType.casementWindow:
        // Dashed hinge triangle
        sb.writeln('  <!-- Casement Swing Lines -->');
        sb.writeln('  <line x1="$x" y1="$y" x2="${x + w}" y2="${y + (h / 2)}" stroke="#718096" stroke-width="1" stroke-dasharray="3,3" />');
        sb.writeln('  <line x1="$x" y1="${y + h}" x2="${x + w}" y2="${y + (h / 2)}" stroke="#718096" stroke-width="1" stroke-dasharray="3,3" />');
        break;

      case WindowElevationType.ventilator:
        // Louver blades or top-hung hinge
        final bladeCount = math.max(2, (h / 25).floor());
        final bladeStep = h / (bladeCount + 1);
        sb.writeln('  <!-- Ventilator Louvers -->');
        for (var i = 1; i <= bladeCount; i++) {
          final bladeY = y + (bladeStep * i);
          sb.writeln('  <line x1="$x" y1="$bladeY" x2="${x + w}" y2="$bladeY" stroke="$innerBeadStroke" stroke-width="1.5" />');
        }
        break;

      case WindowElevationType.fixedWindow:
        // Pure fixed clean glass pane
        break;
    }
  }

  static void _appendDimensionsSvg(
    StringBuffer sb, {
    required double originX,
    required double originY,
    required double drawW,
    required double drawH,
    required double widthMm,
    required double heightMm,
  }) {
    const dimGap = 8.0;
    const dimExt = 16.0;

    final bottomExtY = originY + drawH + dimExt;
    final bottomDimY = originY + drawH + dimGap + 4;

    final rightExtX = originX + drawW + dimExt;
    final rightDimX = originX + drawW + dimGap + 4;

    sb.writeln('  <!-- Horizontal Dimension Line (Bottom) -->');
    // Extension witness lines
    sb.writeln('  <line x1="$originX" y1="${originY + drawH + 2}" x2="$originX" y2="$bottomExtY" stroke="#000000" stroke-width="0.8" />');
    sb.writeln('  <line x1="${originX + drawW}" y1="${originY + drawH + 2}" x2="${originX + drawW}" y2="$bottomExtY" stroke="#000000" stroke-width="0.8" />');
    // Dimension line
    sb.writeln('  <line x1="$originX" y1="$bottomDimY" x2="${originX + drawW}" y2="$bottomDimY" stroke="#000000" stroke-width="0.9" />');
    // Left arrow head
    sb.writeln('  <polygon points="$originX,$bottomDimY ${originX + 5},${bottomDimY - 2.5} ${originX + 5},${bottomDimY + 2.5}" fill="#000000" />');
    // Right arrow head
    sb.writeln('  <polygon points="${originX + drawW},$bottomDimY ${originX + drawW - 5},${bottomDimY - 2.5} ${originX + drawW - 5},${bottomDimY + 2.5}" fill="#000000" />');
    // Width label
    final wText = '${widthMm.toStringAsFixed(0)} mm';
    final wTextX = originX + (drawW / 2);
    sb.writeln('  <text x="$wTextX" y="${bottomDimY + 12}" font-family="Helvetica, Arial, sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="#000000">$wText</text>');

    sb.writeln('  <!-- Vertical Dimension Line (Right) -->');
    // Extension witness lines
    sb.writeln('  <line x1="${originX + drawW + 2}" y1="$originY" x2="$rightExtX" y2="$originY" stroke="#000000" stroke-width="0.8" />');
    sb.writeln('  <line x1="${originX + drawW + 2}" y1="${originY + drawH}" x2="$rightExtX" y2="${originY + drawH}" stroke="#000000" stroke-width="0.8" />');
    // Dimension line
    sb.writeln('  <line x1="$rightDimX" y1="$originY" x2="$rightDimX" y2="${originY + drawH}" stroke="#000000" stroke-width="0.9" />');
    // Top arrow head
    sb.writeln('  <polygon points="$rightDimX,$originY ${rightDimX - 2.5},${originY + 5} ${rightDimX + 2.5},${originY + 5}" fill="#000000" />');
    // Bottom arrow head
    sb.writeln('  <polygon points="$rightDimX,${originY + drawH} ${rightDimX - 2.5},${originY + drawH - 5} ${rightDimX + 2.5},${originY + drawH - 5}" fill="#000000" />');
    // Height label (vertical text)
    final hText = '${heightMm.toStringAsFixed(0)} mm';
    final hTextY = originY + (drawH / 2);
    sb.writeln('  <text x="${rightDimX + 11}" y="$hTextY" font-family="Helvetica, Arial, sans-serif" font-size="9" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${rightDimX + 11} $hTextY)" fill="#000000">$hText</text>');
  }

  /// Builds a PDF elevation card with spec header + SVG elevation diagram
  static pw.Widget buildPdfElevationCard({
    required double widthMm,
    required double heightMm,
    required String description,
    required int itemIndex,
    double cardWidth = 240,
    double cardHeight = 280,
  }) {
    final type = detectType(description);
    final title = getDisplayTitle(type, itemIndex);
    final svgString = generateSvg(
      widthMm: widthMm,
      heightMm: heightMm,
      description: description,
      itemIndex: itemIndex,
      targetWidth: cardWidth,
      targetHeight: cardHeight - 65,
    );

    return pw.Container(
      margin: const pw.EdgeInsets.only(bottom: 20),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        children: [
          // Spec Details Header
          pw.Text(
            title,
            style: pw.TextStyle(
              fontSize: 12,
              fontWeight: pw.FontWeight.bold,
              color: PdfColors.black,
            ),
          ),
          pw.SizedBox(height: 3),
          pw.Text(
            'Width: ${widthMm.toStringAsFixed(2)} mm',
            style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey800),
          ),
          pw.Text(
            'Height: ${heightMm.toStringAsFixed(2)} mm',
            style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey800),
          ),
          if (description.isNotEmpty)
            pw.Text(
              description,
              style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey800),
              textAlign: pw.TextAlign.center,
            ),
          pw.SizedBox(height: 10),
          // SVG Diagram
          pw.SvgImage(
            svg: svgString,
            width: cardWidth,
            height: cardHeight - 65,
          ),
        ],
      ),
    );
  }

  /// Builds the full multi-page Window Elevations Schedule for the PDF
  static List<pw.Page> buildElevationPages({
    required List<dynamic> measuredItems,
    required PdfPageFormat pageFormat,
  }) {
    if (measuredItems.isEmpty) return [];

    final pages = <pw.Page>[];
    // 2 items per page for clean, spacious presentation
    const itemsPerPage = 2;

    for (var i = 0; i < measuredItems.length; i += itemsPerPage) {
      final chunk = measuredItems.sublist(
        i,
        math.min(i + itemsPerPage, measuredItems.length),
      );

      pages.add(
        pw.Page(
          pageFormat: pageFormat,
          margin: const pw.EdgeInsets.all(30),
          build: (pw.Context context) {
            return pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                pw.SizedBox(height: 10),
                ...chunk.asMap().entries.map((entry) {
                  final globalIdx = i + entry.key + 1;
                  final item = entry.value;
                  final w = (item.width as num).toDouble();
                  final h = (item.height as num).toDouble();
                  final desc = item.description?.toString() ?? '';

                  return buildPdfElevationCard(
                    widthMm: w,
                    heightMm: h,
                    description: desc,
                    itemIndex: globalIdx,
                    cardWidth: 260,
                    cardHeight: 330,
                  );
                }),
              ],
            );
          },
        ),
      );
    }

    return pages;
  }
}
