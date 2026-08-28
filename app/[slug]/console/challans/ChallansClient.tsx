"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Download, Truck, Printer } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { formatDate, toCsv, downloadFile } from "@/lib/console-format";

interface ChallanRow {
  id: string;
  challan_number: string;
  quotation_id: string | null;
  customer_name: string;
  delivery_address: string;
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  items_summary: string;
  total_units: number;
  status: "dispatched" | "delivered" | "in_transit" | "cancelled";
  dispatch_date: string;
  created_at: string;
}

export default function ChallansClient() {
  const { companyName, toast } = useConsole();

  const [rows, setRows] = useState<ChallanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page] = useState(1);
  const [pageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // New Challan Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [itemsSummary, setItemsSummary] = useState("");
  const [totalUnits, setTotalUnits] = useState<string>("4");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/console/challans?page=${page}&page_size=${pageSize}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load challans");
      const data = await res.json();
      setRows(data.rows || []);
      setTotalCount(data.total_count || 0);
    } catch (err: any) {
      toast(err?.message || "Failed to load challans", "err");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useConsoleStatus({
    count: `${totalCount} challans`,
    hints: [
      { keys: "F1 / Alt+N", label: "Create Gate Pass" },
      { keys: "Ctrl+E", label: "Export CSV" },
    ],
  });

  const handleCreateChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast("Please enter customer name", "err");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/console/challans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customer_name: customerName.trim(),
          delivery_address: deliveryAddress.trim(),
          vehicle_number: vehicleNumber.trim(),
          driver_name: driverName.trim(),
          driver_phone: driverPhone.trim(),
          items_summary: itemsSummary.trim(),
          total_units: parseInt(totalUnits, 10) || 1,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || "Failed to create delivery challan");
      }

      toast("Delivery Challan & Gate Pass created", "ok");
      setModalOpen(false);
      setCustomerName("");
      setDeliveryAddress("");
      setVehicleNumber("");
      setDriverName("");
      setDriverPhone("");
      setItemsSummary("");
      void loadData();
    } catch (err: any) {
      toast(err?.message || "Failed to create challan", "err");
    } finally {
      setSaving(false);
    }
  };

  const handlePrintChallan = (c: ChallanRow) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Delivery Challan ${c.challan_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; }
            .header { border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
            .title { font-size: 24px; font-weight: bold; }
            .badge { background: #eee; padding: 6px 12px; font-weight: bold; border-radius: 4px; font-size: 14px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
            .card { border: 1px solid #ccc; padding: 14px; border-radius: 6px; }
            .card-title { font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
            th { background: #f5f5f5; }
            .sign { margin-top: 60px; display: flex; justify-content: space-between; }
            .sign-box { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 8px; font-size: 13px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">${companyName || "Vitharn uPVC Fabricators"}</div>
              <div style="font-size: 14px; color: #555; margin-top: 4px;">Factory Dispatch & Gate Pass</div>
            </div>
            <div style="text-align: right;">
              <div class="badge">${c.challan_number}</div>
              <div style="font-size: 13px; margin-top: 6px;">Date: ${formatDate(c.dispatch_date || c.created_at)}</div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-title">Customer & Delivery Site</div>
              <div style="font-size: 16px; font-weight: bold;">${c.customer_name}</div>
              <div style="font-size: 13px; color: #444; margin-top: 4px;">${c.delivery_address || "Factory Handover"}</div>
            </div>
            <div class="card">
              <div class="card-title">Vehicle & Driver Details</div>
              <div style="font-size: 15px; font-weight: bold;">Vehicle: ${c.vehicle_number || "Direct Pickup"}</div>
              <div style="font-size: 13px; color: #444; margin-top: 4px;">Driver: ${c.driver_name || "—"} (${c.driver_phone || "—"})</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px;">S.No</th>
                <th>Material Description / Window Openings</th>
                <th style="width: 100px; text-align: right;">Quantity</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>${c.items_summary || "uPVC Finished Windows & Door Frames"}</td>
                <td style="text-align: right; font-weight: bold;">${c.total_units} Units</td>
              </tr>
            </tbody>
          </table>

          <div class="sign">
            <div class="sign-box">Dispatched By (Factory)</div>
            <div class="sign-box">Driver Signature</div>
            <div class="sign-box">Received By (Customer)</div>
          </div>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast("Nothing to export", "info");
      return;
    }
    const csv = toCsv(
      ["Challan No", "Date", "Customer", "Vehicle", "Driver", "Units", "Status"],
      rows.map((r) => [
        r.challan_number,
        formatDate(r.dispatch_date || r.created_at),
        r.customer_name,
        r.vehicle_number,
        r.driver_name,
        r.total_units,
        r.status,
      ]),
    );
    downloadFile(`challans-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} challans`, "ok");
  }, [rows, toast]);

  const onNewAction = useCallback(() => setModalOpen(true), []);

  useConsoleAction("new", onNewAction);
  useConsoleAction("export", exportCsv);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.challan_number || "").toLowerCase().includes(q) ||
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.vehicle_number || "").toLowerCase().includes(q) ||
        (r.driver_name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const columns = useMemo<ColumnDef<ChallanRow>[]>(
    () => [
      {
        accessorKey: "challan_number",
        header: "Challan / Gate Pass",
        size: 170,
        cell: (c) => (
          <span style={{ fontWeight: 700, color: "var(--vc-accent)", fontFamily: "monospace" }}>
            {String(c.getValue() || "")}
          </span>
        ),
      },
      {
        accessorKey: "dispatch_date",
        header: "Dispatch Date",
        size: 110,
        cell: (c) => <span style={{ fontWeight: 500 }}>{formatDate(String(c.getValue() || c.row.original.created_at))}</span>,
      },
      {
        accessorKey: "customer_name",
        header: "Customer & Site",
        size: 220,
        cell: (c) => (
          <div>
            <div style={{ fontWeight: 600, color: "var(--vc-text-hi)" }}>{String(c.getValue() || "")}</div>
            {c.row.original.delivery_address && (
              <div style={{ fontSize: "11px", color: "var(--vc-text-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.row.original.delivery_address}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "vehicle_number",
        header: "Vehicle & Driver",
        size: 180,
        cell: (c) => (
          <div>
            <div style={{ fontWeight: 600, color: "var(--vc-text-hi)", display: "flex", alignItems: "center", gap: "4px" }}>
              <Truck size={13} color="var(--vc-accent)" /> {String(c.getValue() || "Direct Pickup")}
            </div>
            {c.row.original.driver_name && (
              <div style={{ fontSize: "11px", color: "var(--vc-text-sub)" }}>
                {c.row.original.driver_name} {c.row.original.driver_phone ? `(${c.row.original.driver_phone})` : ""}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "total_units",
        header: "Units",
        size: 100,
        cell: (c) => <span style={{ fontWeight: 700, color: "var(--vc-text-hi)" }}>{Number(c.getValue()) || 1} Units</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 110,
        cell: (c) => (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 600,
              background: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              textTransform: "capitalize",
            }}
          >
            {String(c.getValue() || "Dispatched")}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 90,
        cell: (c) => (
          <button
            onClick={() => handlePrintChallan(c.row.original)}
            title="Print Delivery Challan"
            style={{
              background: "var(--vc-surface)",
              color: "var(--vc-text-hi)",
              border: "1px solid var(--vc-border)",
              borderRadius: "6px",
              padding: "4px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <Printer size={12} /> Print
          </button>
        ),
      },
    ],
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Action Strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          gap: "12px",
        }}
      >
        <div style={{ position: "relative", maxWidth: "320px", width: "100%" }}>
          <Search
            size={15}
            style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--vc-text-sub)" }}
          />
          <input
            type="text"
            placeholder="Search challan no, customer, vehicle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px 7px 32px",
              background: "var(--vc-surface)",
              border: "1px solid var(--vc-border)",
              borderRadius: "8px",
              color: "var(--vc-text-hi)",
              fontSize: "13px",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={exportCsv}
            style={{
              background: "var(--vc-surface)",
              color: "var(--vc-text-hi)",
              border: "1px solid var(--vc-border)",
              borderRadius: "8px",
              padding: "7px 12px",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              background: "var(--vc-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "7px 14px",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> New Gate Pass (F1)
          </button>
        </div>
      </div>

      {/* Data Grid */}
      <div style={{ flex: 1, padding: "0 20px 16px 20px", overflow: "hidden" }}>
        <DataGrid<ChallanRow>
          columns={columns}
          data={filteredRows}
          getRowId={(r) => r.id}
          loading={loading}
          emptyTitle="No delivery challans yet"
          emptyHint="Create material dispatch notes and driver gate passes using New Gate Pass or Alt+N."
        />
      </div>

      {/* New Challan Modal */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <form
            onSubmit={handleCreateChallan}
            style={{
              maxWidth: "480px",
              width: "100%",
              background: "var(--vc-bg)",
              border: "1px solid var(--vc-border)",
              borderRadius: "16px",
              padding: "24px",
              color: "var(--vc-text-hi)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>Generate Delivery Challan / Gate Pass</div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "var(--vc-text-sub)", cursor: "pointer", fontSize: "18px" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Srikanth Reddy"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--vc-surface)",
                    border: "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    color: "var(--vc-text-hi)",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Delivery Site Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. Plot 42, Jubilee Hills, Hyderabad"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--vc-surface)",
                    border: "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    color: "var(--vc-text-hi)",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    placeholder="TS 09 AB 1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Total Window Units
                  </label>
                  <input
                    type="number"
                    value={totalUnits}
                    onChange={(e) => setTotalUnits(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Driver Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Driver Phone
                  </label>
                  <input
                    type="text"
                    placeholder="9876543210"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Material Summary / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2-Track Sliding Windows with mesh + Fixed louver"
                  value={itemsSummary}
                  onChange={(e) => setItemsSummary(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--vc-surface)",
                    border: "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    color: "var(--vc-text-hi)",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: "transparent",
                    color: "var(--vc-text-sub)",
                    border: "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: "var(--vc-accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 20px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Generating..." : "Generate Challan"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
