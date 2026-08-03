import { NextRequest, NextResponse } from "next/server";
import { supaGet, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!isServiceKeyConfigured()) {
      return json({ error: "Database not configured" }, 500);
    }

    const clientId = session.client_id;
    
    // Fetch all quotations for this client. 
    // In upvc_quotation_maker, we prefix quote_no or use client_id.
    // Wait, earlier the user showed schema.sql:
    // quotations table has `id`, `quote_no`, `date`, `customer_name`, `status`, `transport_cost`, `created_at`
    // And actually, if it's a multi-tenant DB, quotations must have a `client_id`?
    // Let me check if `client_id` was added to quotations.
    // 1. Fetch quotations matching client_id
    let quotes = await supaGet("quotations", {
      client_id: "eq." + clientId,
      select: "id,quote_no,customer_name,contact_no,status,transport_cost,created_at,measured_items(rate,width,height,units),unmeasured_items(rate,units)",
    });

    if (!Array.isArray(quotes)) {
      quotes = [];
    }

    let totalQuoted = 0;
    let wonQuoted = 0;
    let totalCount = quotes.length;
    let wonCount = 0;

    let thisMonthTotal = 0;
    let lastMonthTotal = 0;

    const pendingFollowUps: Array<{ id: string; quote_no: string; customer_name: string; contact_no: string; created_at: string; total: number }> = [];
    
    const countsByStatus: Record<string, number> = {
      Draft: 0,
      Sent: 0,
      Won: 0,
      Lost: 0
    };

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonth = lastMonthDate.getMonth();

    // Calculate weekly bars for the last 8 weeks
    const weeks: { label: string; amount: number; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1) - i * 7);
      weeks.push({ 
        label: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }), 
        amount: 0, 
        count: 0 
      });
    }

    for (const q of quotes) {
      let qTotal = parseFloat(q.transport_cost || "0");
      if (Array.isArray(q.measured_items)) {
        for (const item of q.measured_items) {
          const w = parseFloat(item.width || "0");
          const h = parseFloat(item.height || "0");
          const r = parseFloat(item.rate || "0");
          const u = parseInt(item.units || "1", 10);
          
          // Width and height are in millimeters. Rate is per Square Foot.
          // Convert mm to square feet: (w / 304.8) * (h / 304.8)
          const sft = (w / 304.8) * (h / 304.8);
          qTotal += (sft * r * u);
        }
      }
      if (Array.isArray(q.unmeasured_items)) {
        for (const item of q.unmeasured_items) {
          const r = parseFloat(item.rate || "0");
          const u = parseInt(item.units || "1", 10);
          qTotal += (r * u);
        }
      }

      totalQuoted += qTotal;
      
      const s = q.status || 'Draft';
      countsByStatus[s] = (countsByStatus[s] || 0) + 1;

      if (s === 'Won') {
        wonCount++;
        wonQuoted += qTotal;
      }

      // Collect pending follow-ups (Sent or Draft)
      if (s === 'Sent' || s === 'Draft') {
        pendingFollowUps.push({
          id: q.id || '',
          quote_no: q.quote_no || 'Quote',
          customer_name: q.customer_name || 'Valued Customer',
          contact_no: q.contact_no || '',
          created_at: q.created_at || new Date().toISOString(),
          total: qTotal
        });
      }

      if (q.created_at) {
        const qDate = new Date(q.created_at);
        
        // Month comparison
        if (qDate.getFullYear() === currentYear && qDate.getMonth() === currentMonth) {
          thisMonthTotal += qTotal;
        } else if (qDate.getFullYear() === lastMonthYear && qDate.getMonth() === lastMonth) {
          lastMonthTotal += qTotal;
        }

        // Find which week it belongs to
        for (let i = 0; i < 8; i++) {
           const wStart = new Date(now);
           wStart.setDate(wStart.getDate() - (wStart.getDay() === 0 ? 6 : wStart.getDay() - 1) - (7 - i) * 7);
           wStart.setHours(0,0,0,0);
           
           const wEnd = new Date(wStart);
           wEnd.setDate(wEnd.getDate() + 7);
           
           if (qDate >= wStart && qDate < wEnd) {
             weeks[i].amount += qTotal;
             weeks[i].count += 1;
             break;
           }
        }
      }
    }

    const winRate = totalCount > 0 ? (wonCount / totalCount) * 100 : 0;
    
    let monthChangePercent = 0;
    if (lastMonthTotal > 0) {
      monthChangePercent = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
    } else if (thisMonthTotal > 0) {
      monthChangePercent = 100;
    }

    return json({
      totalCount,
      wonCount,
      totalQuoted,
      wonQuoted,
      winRate,
      thisMonthTotal,
      lastMonthTotal,
      monthChangePercent,
      countsByStatus,
      weeklyBars: weeks,
      pendingFollowUps: pendingFollowUps.slice(0, 5) // top 5 pending
    });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
