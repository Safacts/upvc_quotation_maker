import fs from "fs";
import path from "path";
import { buildQuotationPdf } from "../src/lib/quotation-pdf.ts";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, rgb } from "pdf-lib";
import { injectVaishnaviSvg } from "../src/lib/vaishnavi-svg-inject.ts";
import { hexToRgb } from "../src/lib/brand.ts";

const TEMPLATES = join(process.cwd(), "src", "templates", "vaishnavi");
const FONTS = [join(TEMPLATES, "fonts", "Arimo.ttf"), join(TEMPLATES, "fonts", "Tinos-Regular.ttf"), join(TEMPLATES, "fonts", "Tinos-Bold.ttf")];
function hexToRgb2(hex){hex=hex.replace('#','');const n=parseInt(hex,16);return [(n>>16)/255,((n>>8)&255)/255,(n&255)/255];}

const dummyMeasured = [
  { code:"", description:"3 track sliding windows with mesh shutter", glass:"Clear", width:562, height:9985, units:1, rate:100 },
  { code:"", description:"2 track sliding window", glass:"Clear", width:1200, height:1500, units:1, rate:380 },
];

const baseData = {
  measured: dummyMeasured,
  unmeasured: [],
  totals: {
    totalSqft: 548.3+19.4, totalMeasured: 567.7, totalUnmeasured:0,
    subtotal: 54830+7372, transport:0, discountAmount:0, discountPercentage:0,
    gstPercentage:0, gstAmount:0, grandTotal: 62202, advancePaid:0, balanceDue:62202, roundoff:0, netTotal:62202
  },
  termsAndConditions: ["Test term"],
  date: new Date(),
};

// Generic - KPR
const genericData = {
  quoteNo: "KPR-TEST-CAD",
  customerName: "test",
  contactNo:"", email:"", address:"", reference:"", supplierCompany:"",
  measured: dummyMeasured,
  unmeasured: [],
  totals: baseData.totals,
  clientId: "kprupvc",
  companyName:"KPR UPVC", companyAddress:"Test", companyProprietor:"Test", companyContact:"999", gstNumber:"", bankName:"", bankBranch:"", bankAccountNo:"", bankIfsc:"",
  termsAndConditions: baseData.termsAndConditions,
};

const genericBytes = await buildQuotationPdf(genericData);
await writeFile(join(process.cwd(), "generic_KPR_with_cad.pdf"), genericBytes);
console.log(`Generic KPR PDF ${genericBytes.length} bytes`);

// Vaishnavi SVG path (with our fix)
const quoteVaish = {
  customerName:"test",
  quotationNo:"VUPVC-10092026-0101",
  date:"10-Sep-2026",
  items: dummyMeasured.map(m=>({description:m.description,width:m.width,height:m.height,units:m.units,totalSft:(m.width/304.8)*(m.height/304.8)*m.units,rate:m.rate,total:(m.width/304.8)*(m.height/304.8)*m.units*m.rate})),
  subtotal:62202, gstPercentage:0, grandTotal:62202, amountInWords:"TEST"
};
const [p1,p2]=await Promise.all([readFile(join(TEMPLATES,"page1.svg"),"utf8"),readFile(join(TEMPLATES,"page2.svg"),"utf8")]);
const inj1=injectVaishnaviSvg(p1, quoteVaish);
const pngs=[inj1,p2].map(svg=>new Resvg(svg,{fitTo:{mode:"width",value:1240},font:{fontFiles:FONTS,loadSystemFonts:false,defaultFontFamily:"Arimo"}}).render().asPng());
const pdf=await PDFDocument.create(); for(const png of pngs){const img=await pdf.embedPng(png);const pg=pdf.addPage([595.28,841.89]);pg.drawImage(img,{x:0,y:0,width:pg.getWidth(),height:pg.getHeight()});}
const validMeasured=quoteVaish.items.filter(it=>it.width>0&&it.height>0);
if(validMeasured.length>0){
  const frameColor=rgb(...hexToRgb2("#0B1E3B")),glassColor=rgb(...hexToRgb2("#E8F0FF"));const A4_W=595.28,A4_H=841.89,M=30,contentW=A4_W-M*2;
  for(let i=0;i<validMeasured.length;i+=2){
    const pg=pdf.addPage([A4_W,A4_H]);const chunk=validMeasured.slice(i,i+2);
    pg.drawText(`VAISHNAVI — CAD Window Elevations ${i+1}-${Math.min(i+2,validMeasured.length)} of ${validMeasured.length}`,{x:30,y:A4_H-30,size:7,color:frameColor});
    chunk.forEach((item,idx)=>{const yBase=700-idx*350,wMm=item.width,hMm=item.height,fx=100,fy=yBase-220,fw=180,fh=220;const desc=(item.description||"").toLowerCase();let tt="Window";if(desc.includes("sliding"))tt=desc.includes("3 track")?"3-Track Sliding":"2-Track Sliding";let da=wMm/hMm;if(da<0.3)da=0.3;if(da>3)da=3;const maxW=contentW-70,maxH=180;let dw=fw-10,dh=fh-10;if(da>=maxW/maxH){dw=maxW;dh=maxW/da;}else{dh=maxH;dw=maxH*da;}dw=Math.max(40,dw);dh=Math.max(60,dh);const ox=fx+(fw-dw)/2,oy=fy+(fh-dh)/2+5;pg.drawRectangle({x:fx,y:fy,width:fw,height:fh,borderColor:frameColor,borderWidth:2,color:glassColor});pg.drawRectangle({x:fx+5,y:fy+5,width:fw-10,height:fh-10,borderColor:frameColor,borderWidth:1});if(dw>20&&dh>20){pg.drawRectangle({x:ox,y:oy,width:dw,height:dh,color:frameColor,borderColor:frameColor,borderWidth:1.2});const gw=dw-8,gh=dh-8;if(gw>4&&gh>4)pg.drawRectangle({x:ox+4,y:oy+4,width:gw,height:gh,color:glassColor,borderColor:rgb(...hexToRgb2("#93A4C8")),borderWidth:1});if(tt.includes("Sliding")){const sx=ox+dw/2;pg.drawLine({start:{x:sx,y:oy},end:{x:sx,y:oy+dh},thickness:1.2,color:rgb(...hexToRgb2("#475569"))});}}pg.drawText(`Item ${i+idx+1}: ${item.description.slice(0,28)} — ${tt}`,{x:fx,y:fy+fh+12,size:8,color:frameColor});pg.drawText(`${Math.round(wMm)} x ${Math.round(hMm)} mm  Qty:${item.units}`,{x:fx,y:fy-14,size:7,color:frameColor});});
  }
}
const vaishBytes=await pdf.save();
await writeFile(join(process.cwd(), "vaishnavi_WITH_CAD.pdf"), vaishBytes);
console.log(`Vaishnavi SVG PDF ${vaishBytes.length} bytes`);
