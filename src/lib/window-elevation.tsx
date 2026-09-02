import React from "react";

export type WindowElevationType =
  | "fixedWindow"
  | "singleDoor"
  | "doubleDoor"
  | "sliding2Track"
  | "sliding3Track"
  | "casementWindow"
  | "ventilator";

/**
 * Detects the window/door type from description or item code.
 * Matches Flutter lib/services/window_elevation_engine.dart
 */
export function detectWindowElevationType(description: string = ""): WindowElevationType {
  const lower = description.toLowerCase();
  if (lower.includes("door") || lower.includes("french")) {
    if (lower.includes("double") || lower.includes("2 sash") || lower.includes("pair")) {
      return "doubleDoor";
    }
    return "singleDoor";
  }
  if (
    lower.includes("3 track") ||
    lower.includes("3-track") ||
    lower.includes("3track") ||
    lower.includes("3 panel")
  ) {
    return "sliding3Track";
  }
  if (
    lower.includes("sliding") ||
    lower.includes("slider") ||
    lower.includes("2 track") ||
    lower.includes("2-track")
  ) {
    return "sliding2Track";
  }
  if (
    lower.includes("casement") ||
    lower.includes("openable") ||
    lower.includes("side hung")
  ) {
    return "casementWindow";
  }
  if (
    lower.includes("ventilator") ||
    lower.includes("vent") ||
    lower.includes("louver") ||
    lower.includes("exhaust")
  ) {
    return "ventilator";
  }
  return "fixedWindow";
}

/**
 * Returns human-readable title for a detected elevation type.
 */
export function getWindowElevationTitle(type: WindowElevationType, itemIndex: number = 1): string {
  switch (type) {
    case "singleDoor":
      return `Single Door (Item ${itemIndex})`;
    case "doubleDoor":
      return `Double Door (Item ${itemIndex})`;
    case "sliding2Track":
      return `2-Track Sliding Window (Item ${itemIndex})`;
    case "sliding3Track":
      return `3-Track Sliding Window (Item ${itemIndex})`;
    case "casementWindow":
      return `Casement Window (Item ${itemIndex})`;
    case "ventilator":
      return `Ventilator (Item ${itemIndex})`;
    case "fixedWindow":
    default:
      return `Fixed Window (Item ${itemIndex})`;
  }
}

export interface WindowElevationOptions {
  widthMm: number;
  heightMm: number;
  description?: string;
  itemIndex?: number;
  targetWidth?: number;
  targetHeight?: number;
  profileColorName?: string;
}

/**
 * Generates pure vector SVG string representing the window with CAD dimension lines
 */
export function generateWindowElevationSvg({
  widthMm,
  heightMm,
  description = "",
  itemIndex = 1,
  targetWidth = 260,
  targetHeight = 280,
  profileColorName,
}: WindowElevationOptions): string {
  const type = detectWindowElevationType(description);
  const w = widthMm <= 0 ? 1000 : widthMm;
  const h = heightMm <= 0 ? 1000 : heightMm;

  // Drawing area margins for dimension lines & annotations
  const marginLeft = 20.0;
  const marginRight = 68.0; // Space for vertical dimension line & text
  const marginTop = 20.0;
  const marginBottom = 45.0; // Space for horizontal dimension line & text

  const maxDrawWidth = targetWidth - marginLeft - marginRight;
  const maxDrawHeight = targetHeight - marginTop - marginBottom;

  // Aspect ratio calculation
  const aspect = w / h;
  let drawW: number;
  let drawH: number;

  if (aspect >= maxDrawWidth / maxDrawHeight) {
    drawW = maxDrawWidth;
    drawH = maxDrawWidth / aspect;
  } else {
    drawH = maxDrawHeight;
    drawW = maxDrawHeight * aspect;
  }

  // Minimum visual bounds so tiny windows aren't microscopic
  drawW = Math.max(45.0, drawW);
  drawH = Math.max(55.0, drawH);

  const originX = marginLeft + (maxDrawWidth - drawW) / 2;
  const originY = marginTop + (maxDrawHeight - drawH) / 2;

  // Profile colors
  const isWhiteProfile = (profileColorName || description).toLowerCase().includes("white");
  const frameStroke = isWhiteProfile ? "#718096" : "#1A202C";
  const frameFill = isWhiteProfile ? "#FFFFFF" : "#2D3748";
  const innerBeadStroke = isWhiteProfile ? "#CBD5E0" : "#A0AEC0";
  const glassFill = "#CBE3F5";
  const glassSheen = "#EBF4FC";

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetWidth} ${targetHeight}" width="100%" height="100%" style="max-height:${targetHeight}px;display:block;">`
  );

  // Outer frame
  const frameThickness = 6.0;
  lines.push(`  <!-- Outer Frame -->`);
  lines.push(
    `  <rect x="${originX.toFixed(1)}" y="${originY.toFixed(1)}" width="${drawW.toFixed(1)}" height="${drawH.toFixed(1)}" fill="${frameFill}" stroke="${frameStroke}" stroke-width="2.5" rx="1" />`
  );

  // Inner beading & glass area
  const glassX = originX + frameThickness;
  const glassY = originY + frameThickness;
  const glassW = drawW - frameThickness * 2;
  const glassH = drawH - frameThickness * 2;

  if (glassW > 4 && glassH > 4) {
    lines.push(`  <!-- Glazing Bead -->`);
    lines.push(
      `  <rect x="${glassX.toFixed(1)}" y="${glassY.toFixed(1)}" width="${glassW.toFixed(1)}" height="${glassH.toFixed(1)}" fill="${glassFill}" stroke="${innerBeadStroke}" stroke-width="1.5" />`
    );

    // Glass reflection highlight
    const sheenW = glassW * 0.45;
    const sheenH = glassH * 0.4;
    lines.push(`  <!-- Glass Sheen Corner -->`);
    lines.push(
      `  <polygon points="${glassX.toFixed(1)},${glassY.toFixed(1)} ${(glassX + sheenW).toFixed(1)},${glassY.toFixed(1)} ${(glassX + sheenW).toFixed(1)},${(glassY + sheenH * 0.4).toFixed(1)} ${(glassX + sheenW * 0.4).toFixed(1)},${(glassY + sheenH * 0.4).toFixed(1)} ${(glassX + sheenW * 0.4).toFixed(1)},${(glassY + sheenH).toFixed(1)} ${glassX.toFixed(1)},${(glassY + sheenH).toFixed(1)}" fill="${glassSheen}" opacity="0.85" />`
    );

    // Typology details
    if (type === "singleDoor") {
      const arrowY = glassY + glassH * 0.5;
      lines.push(`  <!-- Door Swing Marker -->`);
      lines.push(
        `  <text x="${(glassX + 6).toFixed(1)}" y="${(arrowY - 8).toFixed(1)}" font-family="Helvetica, Arial, sans-serif" font-size="8" font-weight="bold" fill="#E53E3E" letter-spacing="0.5">SWING</text>`
      );
      lines.push(
        `  <polygon points="${(glassX + 6).toFixed(1)},${(arrowY - 5).toFixed(1)} ${(glassX + 14).toFixed(1)},${arrowY.toFixed(1)} ${(glassX + 6).toFixed(1)},${(arrowY + 5).toFixed(1)}" fill="#E53E3E" />`
      );
      if (glassH > 40) {
        lines.push(
          `  <rect x="${glassX.toFixed(1)}" y="${(glassY + glassH - 14).toFixed(1)}" width="${glassW.toFixed(1)}" height="14" fill="#EDF2F7" stroke="${innerBeadStroke}" stroke-width="1" />`
        );
      }
    } else if (type === "doubleDoor") {
      const midX = glassX + glassW / 2;
      lines.push(`  <!-- Center Mullion -->`);
      lines.push(
        `  <line x1="${midX.toFixed(1)}" y1="${glassY.toFixed(1)}" x2="${midX.toFixed(1)}" y2="${(glassY + glassH).toFixed(1)}" stroke="${frameStroke}" stroke-width="3" />`
      );
      const arrowY2 = glassY + glassH * 0.5;
      lines.push(
        `  <polygon points="${(midX - 10).toFixed(1)},${(arrowY2 - 4).toFixed(1)} ${(midX - 3).toFixed(1)},${arrowY2.toFixed(1)} ${(midX - 10).toFixed(1)},${(arrowY2 + 4).toFixed(1)}" fill="#E53E3E" />`
      );
      lines.push(
        `  <polygon points="${(midX + 10).toFixed(1)},${(arrowY2 - 4).toFixed(1)} ${(midX + 3).toFixed(1)},${arrowY2.toFixed(1)} ${(midX + 10).toFixed(1)},${(arrowY2 + 4).toFixed(1)}" fill="#E53E3E" />`
      );
    } else if (type === "sliding2Track") {
      const midX = glassX + glassW / 2;
      lines.push(`  <!-- Sliding 2-Track Sashes -->`);
      lines.push(
        `  <line x1="${midX.toFixed(1)}" y1="${glassY.toFixed(1)}" x2="${midX.toFixed(1)}" y2="${(glassY + glassH).toFixed(1)}" stroke="${innerBeadStroke}" stroke-width="2.5" />`
      );
      const arrowY = glassY + glassH * 0.5;
      const x1 = glassX + glassW * 0.15;
      const x2 = glassX + glassW * 0.38;
      lines.push(
        `  <line x1="${x1.toFixed(1)}" y1="${arrowY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${arrowY.toFixed(1)}" stroke="#2B6CB0" stroke-width="1.5" />`
      );
      lines.push(
        `  <polygon points="${x2.toFixed(1)},${arrowY.toFixed(1)} ${(x2 - 4).toFixed(1)},${(arrowY - 2.5).toFixed(1)} ${(x2 - 4).toFixed(1)},${(arrowY + 2.5).toFixed(1)}" fill="#2B6CB0" />`
      );

      const mx1 = midX + glassW * 0.15;
      const mx2 = midX + glassW * 0.38;
      lines.push(
        `  <line x1="${mx1.toFixed(1)}" y1="${arrowY.toFixed(1)}" x2="${mx2.toFixed(1)}" y2="${arrowY.toFixed(1)}" stroke="#2B6CB0" stroke-width="1.5" />`
      );
      lines.push(
        `  <polygon points="${mx1.toFixed(1)},${arrowY.toFixed(1)} ${(mx1 + 4).toFixed(1)},${(arrowY - 2.5).toFixed(1)} ${(mx1 + 4).toFixed(1)},${(arrowY + 2.5).toFixed(1)}" fill="#2B6CB0" />`
      );
    } else if (type === "sliding3Track") {
      const paneW = glassW / 3;
      const div1 = glassX + paneW;
      const div2 = glassX + paneW * 2;
      lines.push(`  <!-- Sliding 3-Track Sashes -->`);
      lines.push(
        `  <line x1="${div1.toFixed(1)}" y1="${glassY.toFixed(1)}" x2="${div1.toFixed(1)}" y2="${(glassY + glassH).toFixed(1)}" stroke="${innerBeadStroke}" stroke-width="2.5" />`
      );
      lines.push(
        `  <line x1="${div2.toFixed(1)}" y1="${glassY.toFixed(1)}" x2="${div2.toFixed(1)}" y2="${(glassY + glassH).toFixed(1)}" stroke="${innerBeadStroke}" stroke-width="2.5" />`
      );
      const arrowY = glassY + glassH * 0.5;
      lines.push(
        `  <line x1="${(glassX + 6).toFixed(1)}" y1="${arrowY.toFixed(1)}" x2="${(div1 - 6).toFixed(1)}" y2="${arrowY.toFixed(1)}" stroke="#2B6CB0" stroke-width="1.5" />`
      );
      lines.push(
        `  <polygon points="${(div1 - 6).toFixed(1)},${arrowY.toFixed(1)} ${(div1 - 10).toFixed(1)},${(arrowY - 2.5).toFixed(1)} ${(div1 - 10).toFixed(1)},${(arrowY + 2.5).toFixed(1)}" fill="#2B6CB0" />`
      );
      lines.push(
        `  <line x1="${(div2 + 6).toFixed(1)}" y1="${arrowY.toFixed(1)}" x2="${(glassX + glassW - 6).toFixed(1)}" y2="${arrowY.toFixed(1)}" stroke="#2B6CB0" stroke-width="1.5" />`
      );
      lines.push(
        `  <polygon points="${(div2 + 6).toFixed(1)},${arrowY.toFixed(1)} ${(div2 + 10).toFixed(1)},${(arrowY - 2.5).toFixed(1)} ${(div2 + 10).toFixed(1)},${(arrowY + 2.5).toFixed(1)}" fill="#2B6CB0" />`
      );
    } else if (type === "casementWindow") {
      lines.push(`  <!-- Casement Swing Lines -->`);
      lines.push(
        `  <line x1="${glassX.toFixed(1)}" y1="${glassY.toFixed(1)}" x2="${(glassX + glassW).toFixed(1)}" y2="${(glassY + glassH / 2).toFixed(1)}" stroke="#718096" stroke-width="1" stroke-dasharray="3,3" />`
      );
      lines.push(
        `  <line x1="${glassX.toFixed(1)}" y1="${(glassY + glassH).toFixed(1)}" x2="${(glassX + glassW).toFixed(1)}" y2="${(glassY + glassH / 2).toFixed(1)}" stroke="#718096" stroke-width="1" stroke-dasharray="3,3" />`
      );
    } else if (type === "ventilator") {
      const bladeCount = Math.max(2, Math.floor(glassH / 25));
      const bladeStep = glassH / (bladeCount + 1);
      lines.push(`  <!-- Ventilator Louvers -->`);
      for (let i = 1; i <= bladeCount; i++) {
        const bladeY = glassY + bladeStep * i;
        lines.push(
          `  <line x1="${glassX.toFixed(1)}" y1="${bladeY.toFixed(1)}" x2="${(glassX + glassW).toFixed(1)}" y2="${bladeY.toFixed(1)}" stroke="${innerBeadStroke}" stroke-width="1.5" />`
        );
      }
    }
  }

  // Dimension Lines (CAD style)
  const dimGap = 8.0;
  const dimExt = 16.0;

  const bottomExtY = originY + drawH + dimExt;
  const bottomDimY = originY + drawH + dimGap + 4;

  const rightExtX = originX + drawW + dimExt;
  const rightDimX = originX + drawW + dimGap + 4;

  lines.push(`  <!-- Horizontal Dimension Line (Bottom) -->`);
  lines.push(
    `  <line x1="${originX.toFixed(1)}" y1="${(originY + drawH + 2).toFixed(1)}" x2="${originX.toFixed(1)}" y2="${bottomExtY.toFixed(1)}" stroke="#000000" stroke-width="0.8" />`
  );
  lines.push(
    `  <line x1="${(originX + drawW).toFixed(1)}" y1="${(originY + drawH + 2).toFixed(1)}" x2="${(originX + drawW).toFixed(1)}" y2="${bottomExtY.toFixed(1)}" stroke="#000000" stroke-width="0.8" />`
  );
  lines.push(
    `  <line x1="${originX.toFixed(1)}" y1="${bottomDimY.toFixed(1)}" x2="${(originX + drawW).toFixed(1)}" y2="${bottomDimY.toFixed(1)}" stroke="#000000" stroke-width="0.9" />`
  );
  lines.push(
    `  <polygon points="${originX.toFixed(1)},${bottomDimY.toFixed(1)} ${(originX + 5).toFixed(1)},${(bottomDimY - 2.5).toFixed(1)} ${(originX + 5).toFixed(1)},${(bottomDimY + 2.5).toFixed(1)}" fill="#000000" />`
  );
  lines.push(
    `  <polygon points="${(originX + drawW).toFixed(1)},${bottomDimY.toFixed(1)} ${(originX + drawW - 5).toFixed(1)},${(bottomDimY - 2.5).toFixed(1)} ${(originX + drawW - 5).toFixed(1)},${(bottomDimY + 2.5).toFixed(1)}" fill="#000000" />`
  );

  const wText = `${Math.round(w)} mm`;
  const wTextX = originX + drawW / 2;
  lines.push(
    `  <text x="${wTextX.toFixed(1)}" y="${(bottomDimY + 12).toFixed(1)}" font-family="Helvetica, Arial, sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="#000000">${wText}</text>`
  );

  lines.push(`  <!-- Vertical Dimension Line (Right) -->`);
  lines.push(
    `  <line x1="${(originX + drawW + 2).toFixed(1)}" y1="${originY.toFixed(1)}" x2="${rightExtX.toFixed(1)}" y2="${originY.toFixed(1)}" stroke="#000000" stroke-width="0.8" />`
  );
  lines.push(
    `  <line x1="${(originX + drawW + 2).toFixed(1)}" y1="${(originY + drawH).toFixed(1)}" x2="${rightExtX.toFixed(1)}" y2="${(originY + drawH).toFixed(1)}" stroke="#000000" stroke-width="0.8" />`
  );
  lines.push(
    `  <line x1="${rightDimX.toFixed(1)}" y1="${originY.toFixed(1)}" x2="${rightDimX.toFixed(1)}" y2="${(originY + drawH).toFixed(1)}" stroke="#000000" stroke-width="0.9" />`
  );
  lines.push(
    `  <polygon points="${rightDimX.toFixed(1)},${originY.toFixed(1)} ${(rightDimX - 2.5).toFixed(1)},${(originY + 5).toFixed(1)} ${(rightDimX + 2.5).toFixed(1)},${(originY + 5).toFixed(1)}" fill="#000000" />`
  );
  lines.push(
    `  <polygon points="${rightDimX.toFixed(1)},${(originY + drawH).toFixed(1)} ${(rightDimX - 2.5).toFixed(1)},${(originY + drawH - 5).toFixed(1)} ${(rightDimX + 2.5).toFixed(1)},${(originY + drawH - 5).toFixed(1)}" fill="#000000" />`
  );

  const hText = `${Math.round(h)} mm`;
  const hTextY = originY + drawH / 2;
  lines.push(
    `  <text x="${(rightDimX + 11).toFixed(1)}" y="${hTextY.toFixed(1)}" font-family="Helvetica, Arial, sans-serif" font-size="9" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${(rightDimX + 11).toFixed(1)} ${hTextY.toFixed(1)})" fill="#000000">${hText}</text>`
  );

  lines.push(`</svg>`);
  return lines.join("\n");
}

/**
 * Interactive React component for instant 2D CAD elevation diagrams.
 */
export const WindowElevationSvg: React.FC<WindowElevationOptions> = (props) => {
  const svg = React.useMemo(() => generateWindowElevationSvg(props), [
    props.widthMm,
    props.heightMm,
    props.description,
    props.itemIndex,
    props.targetWidth,
    props.targetHeight,
    props.profileColorName,
  ]);

  return (
    <div
      style={{ width: props.targetWidth || 260, height: props.targetHeight || 280 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
