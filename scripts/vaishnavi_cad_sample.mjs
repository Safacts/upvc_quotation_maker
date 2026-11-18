import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, rgb } from "pdf-lib";
import { injectVaishnaviSvg } from "../src/lib/vaishnavi-svg-inject.ts";

const TEMPLATES = join(process.cwd(), "src", "templates", "vaishnavi");
const FONTS = [join(TEMPLATES, "fonts", "Arimo.ttf"), join(TEMPLATES, "fonts", "Tinos-Regular.ttf"), join(TEMPLATES, "fonts", "Tinos-Bold.ttf")];

function hexToRgb(hex){ hex=hex.replace('#',''); const n=parseInt(hex,16); return [(n>>16)/255, ((n>>8)&255)/255, (n&255)/255]; }

const quote = {
  customerName: "Mr. Santhosh Kumar — Jillelaguda",
  quotationNo: "VUPVC-2026-0910-001",
  date: "10-Sep-2026",
  items: [
    { description: "3 track sliding windows with mesh shutter", width: 1828, height: 1828, units: 2, totalSft: 72, rate: 355.93, total: 25626 },
    { description: "2 track sliding window", width: 1200, height: 1500, units: 1, totalSft: 19.4, rate: 355.93, total: 6905 },
    { description: "Casement window openable", width: 900, height: 1200, units: 1, totalSft: 11.6, rate: 420, total: 4872 },
    { description: "Ventilator louver", width: 600, height: 600, units: 2, totalSft: 7.7, rate: 380, total: 2926 },
  ],
  subtotal: 40329,
  gstPercentage: 18,
  grandTotal: 47588,
  amountInWords: "RUPEES FORTY SEVEN THOUSAND FIVE HUNDRED EIGHTY EIGHT ONLY",
};

async function run(){
  const [p1, p2] = await Promise.all([readFile(join(TEMPLATES,"page1.svg"),"utf8"), readFile(join(TEMPLATES,"page2.svg"),"utf8")]);
  const injected1 = injectVaishnaviSvg(p1, quote);
  const injected2 = p2;
  const pngs = [injected1, injected2].map(svg=> new Resvg(svg,{ fitTo:{mode:"width",value:1240}, font:{fontFiles:FONTS,loadSystemFonts:false,defaultFontFamily:"Arimo"}}).render().asPng());
  const pdf = await PDFDocument.create();
  for(const png of pngs){ const img=await pdf.embedPng(png); const page=pdf.addPage([595.28,841.89]); page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()}); }
  // CAD (same as patched route)
  const validMeasured = quote.items.filter(it=> Number(it.width)>0 && Number(it.height)>0);
  if(validMeasured.length>0){
    const frameColor = rgb(...hexToRgb("#0B1E3B")); const glassColor = rgb(...hexToRgb("#E8F0FF")); const A4_W=595.28, A4_H=841.89, M=30, contentW=A4_W-M*2;
    for(let i=0;i<validMeasured.length;i+=2){
      const page = pdf.addPage([A4_W,A4_H]);
      const chunk = validMeasured.slice(i,i+2);
      page.drawText(`VAISHNAVI — CAD Window Elevations ${i+1}-${Math.min(i+2,validMeasured.length)} of ${validMeasured.length}`, {x:30,y:A4_H-30,size:7,color:frameColor});
      page.drawText(`Customer: ${quote.customerName.slice(0,40)}  •  Estimate: ${quote.quotationNo}`, {x:30,y:A4_H-42,size:6,color:rgb(...hexToRgb("#475569"))});
      chunk.forEach((item, idx)=>{
        const yBase=700-idx*350; const wMm=Number(item.width), hMm=Number(item.height); const fx=100,fy=yBase-220,fw=180,fh=220;
        const desc=String(item.description||"").toLowerCase();
        let typeTitle="Window"; if(desc.includes("sliding")) typeTitle=desc.includes("3 track")?"3-Track Sliding":"2-Track Sliding"; else if(desc.includes("door")) typeTitle="Door"; else if(desc.includes("casement")) typeTitle="Casement"; else if(desc.includes("ventilator")||desc.includes("vent")) typeTitle="Ventilator";
        page.drawRectangle({x:fx,y:fy,width:fw,height:fh,borderColor:frameColor,borderWidth:2,color:glassColor});
        page.drawRectangle({x:fx+5,y:fy+5,width:fw-10,height:fh-10,borderColor:frameColor,borderWidth:1});
        const maxDrawW=contentW-70, maxDrawH=220-40, aspect=wMm/Math.max(hMm,1);
        let drawW=fw-10, drawH=fh-10; if(aspect>=maxDrawW/maxDrawH){drawW=maxDrawW;drawH=maxDrawW/aspect;} else {drawH=maxDrawH;drawW=maxDrawH*aspect;}
        drawW=Math.max(40,drawW); drawH=Math.max(60,drawH);
        const originX=fx+(fw-drawW)/2, originY=fy+(fh-drawH)/2+5;
        if(drawW>20&&drawH>20){
          page.drawRectangle({x:originX,y:originY,width:drawW,height:drawH,color:frameColor,borderColor:frameColor,borderWidth:1.2});
          const gw=drawW-8, gh=drawH-8; if(gw>4&&gh>4) page.drawRectangle({x:originX+4,y:originY+4,width:gw,height:gh,color:glassColor,borderColor:rgb(...hexToRgb("#93A4C8")),borderWidth:1});
          if(typeTitle.includes("Sliding")){ const splits=typeTitle.includes("3-Track")?2:1; for(let s=1;s<=splits;s++){ const x=originX+(drawW/(splits+1))*s; page.drawLine({start:{x,y:originY},end:{x,y:originY+drawH},thickness:1.2,color:rgb(...hexToRgb("#475569"))});}}
        }
        page.drawText(`Item ${i+idx+1}: ${String(item.description).slice(0,28)} — ${typeTitle}`,{x:fx,y:fy+fh+12,size:8,color:frameColor});
        page.drawText(`${Math.round(wMm)} x ${Math.round(hMm)} mm  Qty:${item.units}  Rate:Rs ${item.rate}`,{x:fx,y:fy-14,size:7,color:frameColor});
        page.drawLine({start:{x:fx,y:fy-6},end:{x:fx+fw,y:fy-6},thickness:0.8,color:frameColor});
        page.drawLine({start:{x:fx+fw+6,y:fy},end:{x:fx+fw+6,y:fy+fh},thickness:0.8,color:frameColor});
      });
    }
  }
  const bytes = await pdf.save();
  const out = join(process.cwd(), "vaishnavi_sample_with_cad.pdf");
  await writeFile(out, bytes);
  console.log(`Saved ${bytes.length} bytes to ${out} — pages: ${pdf.getPageCount()}`);
}
run().catch(e=>{ console.error(e); process.exit(1); });
