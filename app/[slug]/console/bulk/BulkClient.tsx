"use client";
import { useState } from "react";
import { useConsole } from "../ConsoleShell";
import { formatMoney } from "@/lib/console-format";
import { buildBom, type WindowConfig } from "@/lib/bom-engine";

type Row = { room: string; w: number; h: number; type: string; glass: string; qty: number };

function parseCSV(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const out: Row[] = [];
  const start = lines[0]?.toLowerCase().includes("room") || lines[0]?.toLowerCase().includes("width") ? 1 : 0;
  for (let i=start;i<lines.length;i++){
    const cols = lines[i].split(/[,;\t]/).map(s=>s.trim());
    if (cols.length < 2) continue;
    // try: room, w, h, type, glass, qty
    const room = cols[0]||`W${out.length+1}`;
    const w = parseInt(cols[1],10) || 0;
    const h = parseInt(cols[2],10) || 0;
    const type = (cols[3]||"casement_double").toLowerCase().replace(/\s+/g,"_");
    const glass = cols[4]||"5-12-5";
    const qty = parseInt(cols[5],10)||1;
    if (w>=300 && h>=300) out.push({ room, w, h, type, glass, qty });
  }
  return out;
}

export default function BulkClient(){
  const { toast } = useConsole();
  const [text, setText] = useState("Room,Width,Height,Type,Glass,Qty\nHall,1800,1400,casement_double,5-12-5,2\nBed,1200,1200,sliding_2track_2panel,5mm,1");
  const [rate, setRate] = useState(520);
  const rows = parseCSV(text);
  const totalSqft = rows.reduce((s,r)=> s + (r.w/304.8)*(r.h/304.8)*r.qty,0);
  const totalEst = rows.reduce((s,r)=>{
    const bom = buildBom({ type: (r.type as any) || "casement_double", width: r.w, height: r.h, glassSpec: r.glass, ratePerSqft: rate } as WindowConfig);
    return s + bom.price.total * r.qty;
  },0);

  async function createDraft(){
    if (!rows.length) return toast("No valid rows","err");
    const measured = rows.map(r=> ({ width: r.w, height: r.h, units: r.qty, rate, description: `${r.room} — ${r.type} ${r.w}x${r.h} ${r.glass}`, glass: r.glass }));
    try{
      const res = await fetch("/api/console/quotations",{ method:"POST", headers:{ "Content-Type":"application/json"}, credentials:"same-origin", body: JSON.stringify({ customer_name:"Bulk Site Import", contact_no:"", address:"", measured_items:measured, unmeasured_items:[] }) });
      const j = await res.json().catch(()=>null);
      if (!res.ok) throw new Error(j?.error||"Failed");
      toast(`Draft ${j?.quote_no||j?.id} created — ${rows.length} windows • ${formatMoney(totalEst)}`,"ok");
    }catch(e:any){ toast(e.message,"err")}
  }

  return (
    <div style={{ display:"grid", gap:12}}>
      <div className="vc-card" style={{ padding:14}}>
        <h3 style={{ margin:0}}>Bulk Site Sheet → Quotation</h3>
        <div style={{ fontSize:12, color:"#64748b"}}>Paste from Excel: Room, Width(mm), Height(mm), Type, Glass, Qty. We parse, preview BOM + price, create one draft. Saves 2-hr typing.</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 140px", gap:10, marginTop:10}}>
          <label>Rate / sft<input type="number" value={rate} onChange={e=>setRate(parseFloat(e.target.value||"0"))} style={{ width:"100%", padding:8, border:"1px solid #e5e7eb", borderRadius:6}}/></label>
          <div style={{ display:"flex", alignItems:"end"}}><button onClick={createDraft} style={{ width:"100%", padding:"10px 12px", background:"#0f172a", color:"#fff", borderRadius:8, fontWeight:600}}>Create draft</button></div>
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={8} style={{ width:"100%", marginTop:10, padding:10, border:"1px solid #e5e7eb", borderRadius:8, fontFamily:"ui-monospace,monospace", fontSize:12}} />
        <div style={{ display:"flex", gap:12, marginTop:8, fontSize:12}}><span><b>{rows.length}</b> windows</span><span>{totalSqft.toFixed(2)} sft</span><span style={{ fontWeight:700}}>{formatMoney(totalEst)} est.</span></div>
      </div>
      <div className="vc-card" style={{ padding:14}}>
        <div style={{ fontWeight:700, marginBottom:8}}>Preview</div>
        <table style={{ width:"100%", fontSize:12, borderCollapse:"collapse"}}>
          <thead><tr style={{ textAlign:"left", color:"#64748b"}}><th style={{ padding:"6px 8px"}}>Room</th><th>W×H</th><th>Type</th><th>Glass</th><th style={{ textAlign:"right"}}>Qty</th><th style={{ textAlign:"right"}}>Est.</th></tr></thead>
          <tbody>
            {rows.map((r,i)=>{
              const bom = buildBom({ type: (r.type as any) || "casement_double", width: r.w, height: r.h, glassSpec: r.glass, ratePerSqft: rate } as WindowConfig);
              return <tr key={i} style={{ borderTop:"1px solid #f1f5f9"}}><td style={{ padding:"6px 8px"}}>{r.room}</td><td>{r.w}×{r.h}</td><td>{r.type}</td><td>{r.glass}</td><td style={{ textAlign:"right"}}>{r.qty}</td><td style={{ textAlign:"right"}}>{formatMoney(bom.price.total * r.qty)}</td></tr>
            })}
            {rows.length===0 && <tr><td colSpan={6} style={{ padding:12, textAlign:"center", color:"#64748b"}}>Paste rows above to preview</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
