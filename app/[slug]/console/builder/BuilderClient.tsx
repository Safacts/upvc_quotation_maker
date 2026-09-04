"use client";
import { useEffect, useMemo, useState } from "react";
import { useConsole } from "../ConsoleShell";
import { formatMoney, formatSqft } from "@/lib/console-format";
import { buildBom, optimizeCuts, STOCK_BAR_MM, type WindowConfig, type WindowType } from "@/lib/bom-engine";

const TYPES: Array<{ v: WindowType; label: string }> = [
  { v: "fixed", label: "Fixed" },
  { v: "casement_single", label: "Casement 1-sash" },
  { v: "casement_double", label: "Casement 2-sash" },
  { v: "casement_fixed_combo", label: "Fixed + Casement" },
  { v: "sliding_2track_2panel", label: "Sliding 2T-2P" },
  { v: "sliding_2track_3panel", label: "Sliding 2T-3P" },
  { v: "sliding_3track", label: "Sliding 3T" },
  { v: "french", label: "French door" },
  { v: "ventilator", label: "Ventilator" },
];

function SvgPreview({ cfg }: { cfg: WindowConfig }) {
  const W = cfg.width, H = cfg.height;
  const vbW = 400, vbH = Math.round((H / W) * 400);
  const t = cfg.type;
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: "100%", height: vbH, background: "#f6f7f8", border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <rect x={4} y={4} width={vbW - 8} height={vbH - 8} fill="none" stroke="#0f172a" strokeWidth={6} rx={2} />
      {t.includes("casement_double") && <line x1={vbW / 2} y1={4} x2={vbW / 2} y2={vbH - 4} stroke="#334155" strokeWidth={4} />}
      {t.includes("casement_fixed_combo") && <line x1={vbW * 0.45} y1={4} x2={vbW * 0.45} y2={vbH - 4} stroke="#334155" strokeWidth={4} />}
      {t.includes("sliding") && (
        <>
          <line x1={vbW / 2} y1={8} x2={vbW / 2} y2={vbH - 8} stroke="#64748b" strokeDasharray="6 4" strokeWidth={3} />
          {t.includes("3panel") || t.includes("3track") ? (
            <>
              <line x1={vbW / 3} y1={8} x2={vbW / 3} y2={vbH - 8} stroke="#64748b" strokeDasharray="6 4" strokeWidth={3} />
              <line x1={(2 * vbW) / 3} y1={8} x2={(2 * vbW) / 3} y2={vbH - 8} stroke="#64748b" strokeDasharray="6 4" strokeWidth={3} />
            </>
          ) : null}
        </>
      )}
      {t === "french" && <line x1={vbW / 2} y1={4} x2={vbW / 2} y2={vbH - 4} stroke="#334155" strokeWidth={4} />}
      <text x={vbW / 2} y={20} textAnchor="middle" fontSize={12} fill="#475569">{W} x {H} mm</text>
      <text x={vbW / 2} y={vbH - 10} textAnchor="middle" fontSize={11} fill="#0ea5e9">{cfg.glassSpec || "5mm"} {cfg.hasMesh ? "+ mesh" : ""}</text>
    </svg>
  );
}

export default function BuilderClient() {
  const { toast } = useConsole();
  const [cfg, setCfg] = useState<WindowConfig>({ type: "casement_double", width: 1800, height: 1400, system: "60mm", glassSpec: "5-12-5", ratePerSqft: 520, hardwareTier: "standard" });
  const [qty, setQty] = useState(2);
  const [offcuts, setOffcuts] = useState<string>("");
  const [rateOptions, setRateOptions] = useState<Array<{name:string,price:number}>>([]);
  useEffect(()=>{ fetch("/api/console/products?page_size=50",{credentials:"same-origin"}).then(r=>r.json()).then(j=>{ const rows = Array.isArray(j?.rows)? j.rows : Array.isArray(j)? j:[]; setRateOptions(rows.map((x:any)=>({name:x.name, price:Number(x.price)||0})).filter(x=>x.price>0).slice(0,8)); }).catch(()=>{}); },[]);

  const bom = useMemo(() => buildBom(cfg), [cfg]);
  const offcutNums = useMemo(() => offcuts.split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0), [offcuts]);
  const scaledCuts = useMemo(() => bom.cuts.map(c => ({ ...c, qty: c.qty * qty })), [bom.cuts, qty]);
  const opt = useMemo(() => optimizeCuts(scaledCuts, STOCK_BAR_MM, offcutNums), [scaledCuts, offcutNums]);

  const barCost = 2850; // Rs per 6m bar (editable later via price master)
  const barsCost = opt.barsUsed * barCost;
  const wasteRs = (opt.wastePct / 100) * barsCost;
  const savedBars = offcutNums.length ? opt.offcutReuse : 0;
  const marginGuard = (cfg.ratePerSqft ?? 0) < 420 ? "Loss risk — rate below Rs.420/sft" : (cfg.ratePerSqft ?? 0) < 480 ? "Thin margin — consider 520+" : "Margin OK";

  async function addToQuote() {
    try {
      const res = await fetch("/api/console/quotations", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({
          customer_name: "Walk-in (Builder)", contact_no: "", address: "",
          measured_items: [{ width: cfg.width, height: cfg.height, units: qty, rate: cfg.ratePerSqft ?? 520, description: `${cfg.type} ${cfg.width}x${cfg.height} ${cfg.glassSpec}`, glass: cfg.glassSpec }],
          unmeasured_items: [{ description: bom.lines.filter(l=>l.kind==="hardware").map(l=>l.label).join(", "), units: qty, rate: bom.price.hardware }],
          window_json: cfg, bom_json: bom,
        }),
      });
      const j = await res.json().catch(()=>null);
      if (!res.ok) throw new Error(j?.error || "Failed");
      toast(`Draft ${j?.quote_no || "created"} — ${formatMoney(bom.price.total * qty)}`, "ok");
    } catch (e: any) { toast(e.message, "err"); }
  }

  function printSawSheet(){
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = opt.bars.map((b,i)=> `<tr><td>Bar ${i+1}</td><td>${b.cuts.join(" + ")||scaledCuts.map(c=>c.lengthMm).slice(i*2,(i+1)*2).join(" + ")}</td><td style="text-align:right">${b.offcut} mm offcut</td><td style="text-align:right">${b.wastePct.toFixed(1)}%</td></tr>`).join("");
    const labels = scaledCuts.map((c,i)=>{ const id=`W-${cfg.width}x${cfg.height}-${i+1}`; const data=encodeURIComponent(id+" | "+c.lengthMm+"mm"); return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center"><img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${data}" width="80" height="80" /><div style="font-size:11px;margin-top:4px">${id}</div><div style="font-size:12px;font-weight:700">${c.lengthMm} mm × ${c.qty}</div></div>`; }).join("");
    w.document.write(`<html><head><title>Saw Sheet — ${cfg.type} ${cfg.width}x${cfg.height} x${qty}</title><style>body{font-family:Inter,system-ui;padding:24px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #e5e7eb;padding:8px;font-size:13px} th{background:#f8fafc}</style></head><body><h2>Saw Sheet — ${cfg.type} ${cfg.width}×${cfg.height} ×${qty}</h2><p>Bars: ${opt.barsUsed} • Waste ${opt.wastePct.toFixed(1)}% • Stock ${STOCK_BAR_MM}mm • ${marginGuard}</p><table><thead><tr><th>Bar</th><th>Cuts</th><th>Offcut</th><th>Waste</th></tr></thead><tbody>${rows}</tbody></table><p>Glass: ${bom.glass.map(g=>`${g.qty*qty}× ${g.w}×${g.h} ${g.spec}`).join(", ")}</p><h3 style="margin-top:18px">Labels (cut → stick on profile)</h3><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10">${labels}</div><script>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
      <div className="vc-card" style={{ padding: 14 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Window (mm)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <label>Width<input type="number" value={cfg.width} onChange={e=>setCfg({...cfg,width:parseInt(e.target.value||"0",10)})} style={{ width: "100%", padding: 8, border:"1px solid #e5e7eb", borderRadius:6}} /></label>
          <label>Height<input type="number" value={cfg.height} onChange={e=>setCfg({...cfg,height:parseInt(e.target.value||"0",10)})} style={{ width: "100%", padding: 8, border:"1px solid #e5e7eb", borderRadius:6}} /></label>
        </div>
        <label style={{ display:"block", marginTop:10}}>Type
          <select value={cfg.type} onChange={e=>setCfg({...cfg,type:e.target.value as WindowType})} style={{ width:"100%", padding:8, border:"1px solid #e5e7eb", borderRadius:6}}>
            {TYPES.map(t=><option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </label>
        <label style={{ display:"block", marginTop:10}}>Glass
          <input value={cfg.glassSpec||""} onChange={e=>setCfg({...cfg,glassSpec:e.target.value})} placeholder="5-12-5" style={{ width:"100%", padding:8, border:"1px solid #e5e7eb", borderRadius:6}} />
        </label>
        {rateOptions.length ? <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6}}>{rateOptions.map(o=><button key={o.name} onClick={()=>setCfg({...cfg, ratePerSqft:o.price})} style={{ padding:"4px 8px", fontSize:11, border:"1px solid #e5e7eb", borderRadius:999, background: cfg.ratePerSqft===o.price?"#0f172a":"#fff", color: cfg.ratePerSqft===o.price?"#fff":"#334155"}}>{o.name} — Rs.{o.price}</button>)}</div> : null}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10}}>
          <label>Rate / sft<input type="number" value={cfg.ratePerSqft} onChange={e=>setCfg({...cfg,ratePerSqft:parseFloat(e.target.value||"0")})} style={{ width:"100%", padding:8, border:"1px solid #e5e7eb", borderRadius:6}} /></label>
          <label>Qty<input type="number" value={qty} min={1} onChange={e=>setQty(Math.max(1,parseInt(e.target.value||"1",10)))} style={{ width:"100%", padding:8, border:"1px solid #e5e7eb", borderRadius:6}} /></label>
        </div>
        <label style={{ display:"flex", gap:8, marginTop:10, alignItems:"center"}}><input type="checkbox" checked={!!cfg.hasMesh} onChange={e=>setCfg({...cfg,hasMesh:e.target.checked})} /> Mesh</label>
        <label style={{ display:"block", marginTop:8}}>Offcuts to reuse (mm, comma-separated)
          <input value={offcuts} onChange={e=>setOffcuts(e.target.value)} placeholder="e.g. 1200, 850" style={{ width:"100%", padding:8, border:"1px solid #e5e7eb", borderRadius:6}} />
        </label>
        {bom.warnings.length ? <div style={{ color:"#b45309", fontSize:12, marginTop:8}}>{bom.warnings.join(" • ")}</div> : null}
        <button onClick={addToQuote} style={{ marginTop:12, width:"100%", padding:"10px 12px", background:"#0f172a", color:"#fff", borderRadius:8, fontWeight:600}}>Add to quotation draft</button>
        <button onClick={printSawSheet} style={{ marginTop:8, width:"100%", padding:"10px 12px", background:"#fff", color:"#0f172a", border:"1px solid #e5e7eb", borderRadius:8, fontWeight:600}}>Print saw sheet + labels</button>
        <div style={{ fontSize:12, color:"#64748b", marginTop:8}}>Deductions tuned for 60/70mm IS 17953 family. One object generates BOM + cuts + price.</div>
      </div>

      <div style={{ display:"grid", gap:16}}>
        <div className="vc-card" style={{ padding:14}}>
          <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:16}}>
            <SvgPreview cfg={cfg} />
            <div>
              <div style={{ fontWeight:700}}>{cfg.type} — {cfg.width} × {cfg.height} mm <span style={{ color:"#64748b", fontWeight:400}}>× {qty} nos • {formatSqft(bom.sqft * qty)} sft</span></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:10}}>
                <div style={{ background:"#f8fafc", padding:10, borderRadius:8}}><div style={{ fontSize:11, color:"#64748b"}}>Material</div><div style={{ fontWeight:700}}>{formatMoney(bom.price.material * qty)}</div></div>
                <div style={{ background:"#f8fafc", padding:10, borderRadius:8}}><div style={{ fontSize:11, color:"#64748b"}}>Hardware+mesh</div><div style={{ fontWeight:700}}>{formatMoney(bom.price.hardware * qty)}</div></div>
                <div style={{ background:"#fff7ed", padding:10, borderRadius:8, border:"1px solid #fed7aa"}}><div style={{ fontSize:11, color:"#9a3412"}}>Total</div><div style={{ fontWeight:800}}>{formatMoney(bom.price.total * qty)}</div></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:10}}>
                <div><div style={{ fontSize:11, color:"#64748b"}}>Bars (6m)</div><div style={{ fontWeight:700}}>{opt.barsUsed} nos</div></div>
                <div><div style={{ fontSize:11, color:"#64748b"}}>Waste</div><div style={{ fontWeight:700, color: opt.wastePct>18?"#dc2626":"#16a34a"}}>{opt.wastePct.toFixed(1)}% • {formatMoney(wasteRs)}</div></div>
                <div><div style={{ fontSize:11, color:"#64748b"}}>Offcut reuse</div><div style={{ fontWeight:700}}>{savedBars} bars saved{ savedBars?` • saves ${formatMoney(savedBars*barCost)}`:""}</div></div>
              </div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:8}}>Bars cost ~ {formatMoney(barsCost)} @ {formatMoney(barCost)}/bar • Cutting: offcut-first Best-Fit-Decreasing</div>
              <div style={{ fontSize:12, marginTop:6, padding:"6px 8px", borderRadius:6, background: marginGuard.includes("Loss")?"#fef2f2":marginGuard.includes("Thin")?"#fffbeb":"#f0fdf4", color: marginGuard.includes("Loss")?"#dc2626":marginGuard.includes("Thin")?"#b45309":"#16a34a", border:"1px solid #e5e7eb"}}>{marginGuard}</div>
            </div>
          </div>
        </div>

        <div className="vc-card" style={{ padding:14}}>
          <div style={{ fontWeight:700, marginBottom:8}}>BOM (×{qty})</div>
          <table style={{ width:"100%", fontSize:13, borderCollapse:"collapse"}}>
            <thead><tr style={{ textAlign:"left", color:"#64748b", fontSize:12}}><th style={{ padding:"6px 8px"}}>Item</th><th>Profile</th><th style={{ textAlign:"right"}}>Length</th><th style={{ textAlign:"right"}}>Qty</th><th style={{ textAlign:"right"}}>Total</th></tr></thead>
            <tbody>
              {bom.lines.map((l,i)=><tr key={i} style={{ borderTop:"1px solid #f1f5f9"}}>
                <td style={{ padding:"6px 8px"}}>{l.label}</td><td>{l.profileId}</td><td style={{ textAlign:"right"}}>{l.lengthMm} mm</td><td style={{ textAlign:"right"}}>{l.qty * (l.kind==="profile"?qty:1)}</td><td style={{ textAlign:"right"}}>{l.kind==="profile" ? `${(l.lengthMm*l.qty*qty)} mm` : l.kind==="hardware" ? `${l.qty} set` : `${l.lengthMm} mm`}</td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <div className="vc-card" style={{ padding:14}}>
          <div style={{ fontWeight:700}}>Glass (×{qty})</div>
          {bom.glass.map((g,i)=><div key={i} style={{ fontSize:13, padding:"4px 0"}}>{g.qty * qty} × {g.w} × {g.h} mm — {g.spec}</div>)}
          <div style={{ fontWeight:700, marginTop:12}}>Cut list (scaled)</div>
          {scaledCuts.map((c,i)=><div key={i} style={{ fontSize:13}}>{c.profileId}: {c.lengthMm} mm × {c.qty}</div>)}
        </div>
      </div>
    </div>
  );
}
