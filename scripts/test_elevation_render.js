import fs from 'fs';
import path from 'path';

function generateElevationSvg({
  widthMm,
  heightMm,
  description,
  itemIndex = 1,
  targetWidth = 260,
  targetHeight = 280,
  profileColor = 'black'
}) {
  const w = widthMm <= 0 ? 1000.0 : widthMm;
  const h = heightMm <= 0 ? 1000.0 : heightMm;

  const marginLeft = 20.0;
  const marginRight = 65.0;
  const marginTop = 20.0;
  const marginBottom = 45.0;

  const maxDrawWidth = targetWidth - marginLeft - marginRight;
  const maxDrawHeight = targetHeight - marginTop - marginBottom;

  const aspect = w / h;
  let drawW, drawH;

  if (aspect >= (maxDrawWidth / maxDrawHeight)) {
    drawW = maxDrawWidth;
    drawH = maxDrawWidth / aspect;
  } else {
    drawH = maxDrawHeight;
    drawW = maxDrawHeight * aspect;
  }

  drawW = Math.max(40.0, drawW);
  drawH = Math.max(60.0, drawH);

  const originX = marginLeft + (maxDrawWidth - drawW) / 2;
  const originY = marginTop + (maxDrawHeight - drawH) / 2;

  const lowerDesc = description.toLowerCase();
  const isWhite = profileColor === 'white' || lowerDesc.includes('white');
  const frameStroke = isWhite ? '#718096' : '#1A202C';
  const frameFill = isWhite ? '#F7FAFC' : '#2D3748';
  const innerBeadStroke = isWhite ? '#CBD5E0' : '#A0AEC0';
  const glassFill = '#CBE3F5';
  const glassSheen = '#EBF4FC';
  const dimLineColor = '#000000';

  let type = 'fixed';
  if (lowerDesc.includes('door') || lowerDesc.includes('french')) type = 'door';
  else if (lowerDesc.includes('3 track') || lowerDesc.includes('3-track')) type = 'sliding3';
  else if (lowerDesc.includes('sliding') || lowerDesc.includes('2 track')) type = 'sliding2';
  else if (lowerDesc.includes('casement')) type = 'casement';
  else if (lowerDesc.includes('ventilator') || lowerDesc.includes('vent')) type = 'ventilator';

  let title = `Fixed Window: Item ${itemIndex}`;
  if (type === 'door') title = `Single Door: Item ${itemIndex}`;
  else if (type === 'sliding2') title = `2-Track Sliding: Item ${itemIndex}`;
  else if (type === 'sliding3') title = `3-Track Sliding: Item ${itemIndex}`;
  else if (type === 'casement') title = `Casement Window: Item ${itemIndex}`;
  else if (type === 'ventilator') title = `Fixed Window: Item ${itemIndex}`;

  const frameThickness = 6.0;
  const glassX = originX + frameThickness;
  const glassY = originY + frameThickness;
  const glassW = drawW - (frameThickness * 2);
  const glassH = drawH - (frameThickness * 2);

  const sheenW = glassW * 0.45;
  const sheenH = glassH * 0.40;

  let typologyOverlay = '';
  if (type === 'door') {
    const arrowY = glassY + (glassH * 0.5);
    typologyOverlay = `
      <text x="${glassX + 6}" y="${arrowY - 8}" font-family="Helvetica, Arial, sans-serif" font-size="8" font-weight="bold" fill="#E53E3E">SWING</text>
      <polygon points="${glassX + 6},${arrowY - 5} ${glassX + 14},${arrowY} ${glassX + 6},${arrowY + 5}" fill="#E53E3E" />
      ${glassH > 40 ? `<rect x="${glassX}" y="${glassY + glassH - 14}" width="${glassW}" height="14" fill="#EDF2F7" stroke="${innerBeadStroke}" stroke-width="1" />` : ''}
    `;
  } else if (type === 'sliding2') {
    const midX = glassX + (glassW / 2);
    const arrowY = glassY + (glassH * 0.5);
    typologyOverlay = `
      <line x1="${midX}" y1="${glassY}" x2="${midX}" y2="${glassY + glassH}" stroke="${innerBeadStroke}" stroke-width="2.5" />
      <line x1="${glassX + (glassW * 0.15)}" y1="${arrowY}" x2="${glassX + (glassW * 0.35)}" y2="${arrowY}" stroke="#2B6CB0" stroke-width="1.5" marker-end="url(#arrowEnd)" />
      <line x1="${midX + (glassW * 0.35)}" y1="${arrowY}" x2="${midX + (glassW * 0.15)}" y2="${arrowY}" stroke="#2B6CB0" stroke-width="1.5" marker-end="url(#arrowStart)" />
    `;
  }

  const dimGap = 8.0;
  const dimExt = 16.0;
  const bottomExtY = originY + drawH + dimExt;
  const bottomDimY = originY + drawH + dimGap + 4;
  const rightExtX = originX + drawW + dimExt;
  const rightDimX = originX + drawW + dimGap + 4;

  const wText = `${Math.round(widthMm)} mm`;
  const wTextX = originX + (drawW / 2);
  const hText = `${Math.round(heightMm)} mm`;
  const hTextY = originY + (drawH / 2);

  return `
  <div style="font-family: Arial, sans-serif; display: inline-block; margin: 20px; text-align: center; background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${title}</div>
    <div style="font-size: 11px; color: #4A5568;">Width: ${widthMm.toFixed(2)} mm</div>
    <div style="font-size: 11px; color: #4A5568;">Height: ${heightMm.toFixed(2)} mm</div>
    <div style="font-size: 11px; color: #4A5568; margin-bottom: 12px;">${description}</div>
    
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetWidth} ${targetHeight}" width="${targetWidth}" height="${targetHeight}">
      <defs>
        <marker id="arrowStart" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 10 2 L 0 5 L 10 8 z" fill="${dimLineColor}" />
        </marker>
        <marker id="arrowEnd" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 2 L 10 5 L 0 8 z" fill="${dimLineColor}" />
        </marker>
      </defs>

      <!-- Outer Frame -->
      <rect x="${originX}" y="${originY}" width="${drawW}" height="${drawH}" fill="${frameFill}" stroke="${frameStroke}" stroke-width="2.5" rx="1" />
      
      <!-- Glazing Bead & Glass -->
      <rect x="${glassX}" y="${glassY}" width="${glassW}" height="${glassH}" fill="${glassFill}" stroke="${innerBeadStroke}" stroke-width="1.5" />
      
      <!-- Glass Sheen Highlight -->
      <polygon points="${glassX},${glassY} ${glassX + sheenW},${glassY} ${glassX + sheenW},${glassY + (sheenH * 0.4)} ${glassX + (sheenW * 0.4)},${glassY + (sheenH * 0.4)} ${glassX + (sheenW * 0.4)},${glassY + sheenH} ${glassX},${glassY + sheenH}" fill="${glassSheen}" opacity="0.85" />
      
      ${typologyOverlay}

      <!-- Horizontal Dimension Line (Bottom) -->
      <line x1="${originX}" y1="${originY + drawH + 2}" x2="${originX}" y2="${bottomExtY}" stroke="#000000" stroke-width="0.8" />
      <line x1="${originX + drawW}" y1="${originY + drawH + 2}" x2="${originX + drawW}" y2="${bottomExtY}" stroke="#000000" stroke-width="0.8" />
      <line x1="${originX + 2}" y1="${bottomDimY}" x2="${originX + drawW - 2}" y2="${bottomDimY}" stroke="#000000" stroke-width="0.9" marker-start="url(#arrowStart)" marker-end="url(#arrowEnd)" />
      <text x="${wTextX}" y="${bottomDimY + 12}" font-family="Helvetica, Arial, sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="#000000">${wText}</text>

      <!-- Vertical Dimension Line (Right) -->
      <line x1="${originX + drawW + 2}" y1="${originY}" x2="${rightExtX}" y2="${originY}" stroke="#000000" stroke-width="0.8" />
      <line x1="${originX + drawW + 2}" y1="${originY + drawH}" x2="${rightExtX}" y2="${originY + drawH}" stroke="#000000" stroke-width="0.8" />
      <line x1="${rightDimX}" y1="${originY + 2}" x2="${rightDimX}" y2="${originY + drawH - 2}" stroke="#000000" stroke-width="0.9" marker-start="url(#arrowStart)" marker-end="url(#arrowEnd)" />
      <text x="${rightDimX + 11}" y="${hTextY}" font-family="Helvetica, Arial, sans-serif" font-size="9" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${rightDimX + 11} ${hTextY})" fill="#000000">${hText}</text>
    </svg>
  </div>
  `;
}

const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Window Elevation Drawing Test Preview</title>
  <style>
    body { background: #f0f4f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; }
    h1 { color: #1a202c; text-align: center; }
    .container { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; }
  </style>
</head>
<body>
  <h1>Window Elevation Diagrams — Local Render Test</h1>
  <div class="container">
    ${generateElevationSvg({ widthMm: 1829.00, heightMm: 2438.80, description: '5mm fixed glass black profile', itemIndex: 1, profileColor: 'black' })}
    ${generateElevationSvg({ widthMm: 610.00, heightMm: 2134.00, description: 'white door', itemIndex: 2, profileColor: 'white' })}
    ${generateElevationSvg({ widthMm: 610.00, heightMm: 610.00, description: 'ventilator', itemIndex: 3, profileColor: 'black' })}
  </div>
</body>
</html>
`;

fs.writeFileSync('public/elevation_preview.html', html);
console.log('Saved preview to public/elevation_preview.html');
