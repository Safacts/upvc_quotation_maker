"use client";
import { useEffect, useState } from "react";
import { useConsole } from "../ConsoleShell";
import { formatMoney, formatDate } from "@/lib/console-format";

type Row = { customer_id: string|null; customer_name: string; outstanding: number; overdue: number; last_invoice?: string; phone?: string };

export default function MoneyClient() {
  const { toast } = useConsole();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load(){
    setLoading(true);
    try{
      const r = await fetch("/api/console/payments/overdue", { credentials:"same-origin"});
      const j = await r.json().catch(()=>null);
      if(r.ok && Array.isArray(j?.rows)) setRows(j.rows);
      else {
        // fallback: aggregate quotations # quick
        const q2 = await fetch("/api/console/quotations?page_size=200", { credentials:"same-origin"}); const j2 = await q2.json().catch(()=>null);
        const list = Array.isArray(j2?.rows) ? j2.rows : Array.isArray(j2) ? j2 : [];
        const map = new Map<string, Row>();
        for (const qq of list){ const k = (qq.customer_name||"Walk-in").trim(); const amt = Number(qq.grand_total ?? qq.net_total ?? 0); const paid = qq.status==="won"?0:amt; if(!map.has(k)) map.set(k,{customer_name:k,customer_id:qq.customer_id,outstanding:0,overdue:0}); map.get(k)!.outstanding+=paid; map.get(k)!.overdue+= (paid && qq.created_at && (Date.now()-new Date(qq.created_at).getTime())/86400000>30 ? paid:0); map.get(k)!.phone=qq.contact_no; }
        setRows(Array.from(map.values()).sort((a,b)=>b.outstanding-a.outstanding));
      }
    } catch(e:any){ toast(e.message,"err")} finally{setLoading(false)}
  }
  useEffect(()=>{ load(); },[]);

  const filtered = rows.filter(r=>!q || r.customer_name.toLowerCase().includes(q.toLowerCase()));
  const total = filtered.reduce((s,r)=>s+r.outstanding,0);
  const overdueTotal = filtered.reduce((s,r)=>s+r.overdue,0);

  function reminderText(r: Row){
    return `Hello ${r.customer_name}, your outstanding with us is ${formatMoney(r.outstanding)} (overdue ${formatMoney(r.overdue)}). Kindly arrange payment. UPI: 6304562779@nyes. Thank you — ${new Date().toLocaleDateString("en-IN")}`;
  }

  return (
    <div style={{ display:"grid", gap:12}}>
      <div style={{ display:"flex", gap:12, alignItems:"center"}}>
        <input placeholder="Search customer" value={q} onChange={e=>setQ(e.target.value)} style={{ padding:8, border:"1px solid #e5e7eb", borderRadius:8, flex:1}} />
        <div style={{ padding:"8px 12px", background:"#f8fafc", borderRadius:8, fontSize:13}}>Total outstanding: <b>{formatMoney(total)}</b> • Overdue 30d+: <b style={{color:"#dc2626"}}>{formatMoney(overdueTotal)}</b></div>
      </div>
      <div className="vc-card" style={{ padding:0, overflow:"hidden"}}>
        <table style={{ width:"100%", fontSize:13, borderCollapse:"collapse"}}>
          <thead><tr style={{ textAlign:"left", color:"#64748b", background:"#f8fafc"}}><th style={{ padding:"8px 10px"}}>Customer</th><th style={{ textAlign:"right"}}>Outstanding</th><th style={{ textAlign:"right"}}>Overdue</th><th>Phone</th><th></th></tr></thead>
          <tbody>
            {loading? <tr><td colSpan={5} style={{ padding:16, textAlign:"center", color:"#64748b"}}>Loading…</td></tr> :
            filtered.length===0? <tr><td colSpan={5} style={{ padding:16, textAlign:"center", color:"#64748b"}}>No outstanding — congrats!</td></tr> :
            filtered.map((r,i)=><tr key={i} style={{ borderTop:"1px solid #f1f5f9"}}>
              <td style={{ padding:"8px 10px", fontWeight:600}}>{r.customer_name}</td>
              <td style={{ textAlign:"right", fontWeight:700}}>{formatMoney(r.outstanding)}</td>
              <td style={{ textAlign:"right", color: r.overdue? "#dc2626":"#16a34a"}}>{formatMoney(r.overdue)}</td>
              <td style={{ color:"#64748b"}}>{r.phone||"—"}</td>
              <td style={{ display:"flex", gap:6, padding:6}}>
                <button onClick={()=>{ navigator.clipboard.writeText(reminderText(r)); toast("Copied reminder","ok")}} style={{ padding:"6px 10px", border:"1px solid #e5e7eb", borderRadius:6}}>Copy reminder</button>
                <a href={`https://wa.me/${(r.phone||"").replace(/\D/g,"")}?text=${encodeURIComponent(reminderText(r))}`} target="_blank" rel="noreferrer" style={{ padding:"6px 10px", background:"#16a34a", color:"#fff", borderRadius:6, textDecoration:"none"}}>WhatsApp</a>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:12, color:"#64748b"}}>Pipeline: Money board → copy reminder → collect. One Rs.30k recovery = 25k software free. Uses payments/quotations live tables.</div>
    </div>
  );
}
