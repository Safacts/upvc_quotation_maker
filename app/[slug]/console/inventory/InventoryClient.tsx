"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Download, AlertTriangle, RefreshCw } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { formatMoney, toCsv, downloadFile } from "@/lib/console-format";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  unit: string;
  stock_quantity: number;
  low_stock_threshold: number;
  hsn_code: string;
  created_at: string;
}

export default function InventoryClient() {
  const { toast } = useConsole();

  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page] = useState(1);
  const [pageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // New Item / Adjust Stock Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustmentQty, setAdjustmentQty] = useState<string>("");
  const [adjustType, setAdjustType] = useState<"add" | "set">("add");
  const [saving, setSaving] = useState(false);

  // New Item Form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Profiles");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("");
  const [unit, setUnit] = useState("Meter");
  const [stockQuantity, setStockQuantity] = useState<string>("0");
  const [lowStockThreshold, setLowStockThreshold] = useState<string>("10");
  const [hsnCode, setHsnCode] = useState("3925");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/console/inventory?page=${page}&page_size=${pageSize}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load inventory");
      const data = await res.json();
      setRows(data.rows || []);
      setTotalCount(data.total_count || 0);
    } catch (err: any) {
      toast(err?.message || "Failed to load inventory", "err");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Summaries
  const totalStockValue = useMemo(() => {
    return rows.reduce((sum, r) => sum + ((Number(r.price) || 0) * (Number(r.stock_quantity) || 0)), 0);
  }, [rows]);

  const lowStockCount = useMemo(() => {
    return rows.filter((r) => Number(r.stock_quantity) <= Number(r.low_stock_threshold || 10)).length;
  }, [rows]);

  useConsoleStatus({
    count: `${totalCount} items`,
    total: formatMoney(totalStockValue),
    hints: [
      { keys: "F1 / Alt+N", label: "Add Item" },
      { keys: "Ctrl+E", label: "Export CSV" },
    ],
  });

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast("Please enter item name", "err");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/console/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          category,
          description: description.trim(),
          price: parseFloat(price) || 0,
          unit,
          stock_quantity: parseInt(stockQuantity, 10) || 0,
          low_stock_threshold: parseInt(lowStockThreshold, 10) || 10,
          hsn_code: hsnCode.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || "Failed to add inventory item");
      }

      toast("Item added to inventory", "ok");
      setModalOpen(false);
      setName("");
      setDescription("");
      setPrice("");
      setStockQuantity("0");
      void loadData();
    } catch (err: any) {
      toast(err?.message || "Failed to create item", "err");
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const qty = parseInt(adjustmentQty, 10);
    if (isNaN(qty)) {
      toast("Invalid quantity", "err");
      return;
    }

    const newStock = adjustType === "add" ? Math.max(0, selectedItem.stock_quantity + qty) : Math.max(0, qty);

    setSaving(true);
    try {
      const res = await fetch(`/api/console/inventory/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: selectedItem.name,
          category: selectedItem.category,
          stock_quantity: newStock,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || "Failed to update stock");
      }

      toast(`Stock updated to ${newStock} ${selectedItem.unit}`, "ok");
      setAdjustModalOpen(false);
      setSelectedItem(null);
      setAdjustmentQty("");
      void loadData();
    } catch (err: any) {
      toast(err?.message || "Failed to update stock", "err");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast("Nothing to export", "info");
      return;
    }
    const csv = toCsv(
      ["Name", "Category", "Stock Qty", "Unit", "Unit Rate", "HSN"],
      rows.map((r) => [
        r.name,
        r.category,
        r.stock_quantity,
        r.unit,
        r.price,
        r.hsn_code,
      ]),
    );
    downloadFile(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} items`, "ok");
  }, [rows, toast]);

  const onNewAction = useCallback(() => setModalOpen(true), []);

  useConsoleAction("new", onNewAction);
  useConsoleAction("export", exportCsv);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.category || "").toLowerCase().includes(q) ||
          (r.description || "").toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== "all") {
      result = result.filter((r) => (r.category || "").toLowerCase().includes(categoryFilter.toLowerCase()));
    }
    if (lowStockOnly) {
      result = result.filter((r) => Number(r.stock_quantity) <= Number(r.low_stock_threshold || 10));
    }
    return result;
  }, [rows, search, categoryFilter, lowStockOnly]);

  const columns = useMemo<ColumnDef<InventoryItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Item Name & Series",
        size: 260,
        cell: (c) => (
          <div>
            <div style={{ fontWeight: 600, color: "var(--vc-text-hi)" }}>{String(c.getValue() || "")}</div>
            {c.row.original.description && (
              <div style={{ fontSize: "11px", color: "var(--vc-text-sub)" }}>{c.row.original.description}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        size: 130,
        cell: (c) => (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 600,
              background: "rgba(255,255,255,0.06)",
              color: "var(--vc-text-hi)",
            }}
          >
            {String(c.getValue() || "General")}
          </span>
        ),
      },
      {
        accessorKey: "stock_quantity",
        header: "Stock Level",
        size: 140,
        cell: (c) => {
          const qty = Number(c.getValue()) || 0;
          const low = Number(c.row.original.low_stock_threshold) || 10;
          const isLow = qty <= low;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: isLow ? "#ef4444" : "#10b981", fontSize: "13px" }}>
                {qty} {c.row.original.unit || "units"}
              </span>
              {isLow && (
                <span title="Low stock alert" style={{ color: "#ef4444", display: "flex" }}>
                  <AlertTriangle size={14} />
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "price",
        header: "Unit Cost",
        size: 120,
        cell: (c) => (
          <span style={{ fontWeight: 600, color: "var(--vc-text-hi)" }}>
            {formatMoney(Number(c.getValue()) || 0)}
          </span>
        ),
      },
      {
        id: "value",
        header: "Stock Value",
        size: 130,
        cell: (c) => (
          <span style={{ fontWeight: 700, color: "var(--vc-accent)" }}>
            {formatMoney((Number(c.row.original.price) || 0) * (Number(c.row.original.stock_quantity) || 0))}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 110,
        cell: (c) => (
          <button
            onClick={() => {
              setSelectedItem(c.row.original);
              setAdjustmentQty("");
              setAdjustType("add");
              setAdjustModalOpen(true);
            }}
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
            <RefreshCw size={12} /> Adjust Stock
          </button>
        ),
      },
    ],
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Top Stat Summary Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          padding: "16px 20px 0 20px",
        }}
      >
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "var(--vc-text-sub)" }}>Total SKUs / Items</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {totalCount} Items
          </div>
        </div>
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "var(--vc-accent)" }}>Total Inventory Valuation</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {formatMoney(totalStockValue)}
          </div>
        </div>
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "#ef4444" }}>Low Stock Items</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: lowStockCount > 0 ? "#ef4444" : "var(--vc-text-hi)", marginTop: "4px" }}>
            {lowStockCount} Items
          </div>
        </div>
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "#10b981" }}>Healthy Stock SKUs</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {Math.max(0, totalCount - lowStockCount)} Items
          </div>
        </div>
      </div>

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
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
          <div style={{ position: "relative", maxWidth: "300px", width: "100%" }}>
            <Search
              size={15}
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--vc-text-sub)" }}
            />
            <input
              type="text"
              placeholder="Search profile, glass, hardware..."
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

          <div style={{ display: "flex", gap: "6px" }}>
            {["all", "Profiles", "Glass", "Hardware", "Accessories"].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  background: categoryFilter === cat ? "var(--vc-accent)" : "var(--vc-surface)",
                  color: categoryFilter === cat ? "#fff" : "var(--vc-text-sub)",
                  border: "1px solid var(--vc-border)",
                  borderRadius: "6px",
                  padding: "5px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
            style={{
              background: lowStockOnly ? "rgba(239, 68, 68, 0.2)" : "var(--vc-surface)",
              color: lowStockOnly ? "#ef4444" : "var(--vc-text-sub)",
              border: "1px solid",
              borderColor: lowStockOnly ? "#ef4444" : "var(--vc-border)",
              borderRadius: "6px",
              padding: "5px 10px",
              fontSize: "12px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "5px",
              cursor: "pointer",
            }}
          >
            <AlertTriangle size={13} /> Low Stock Only
          </button>
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
            <Plus size={15} /> Add Item (F1)
          </button>
        </div>
      </div>

      {/* Data Grid */}
      <div style={{ flex: 1, padding: "0 20px 16px 20px", overflow: "hidden" }}>
        <DataGrid<InventoryItem>
          columns={columns}
          data={filteredRows}
          getRowId={(r) => r.id}
          loading={loading}
          emptyTitle="No inventory items found"
          emptyHint="Add raw material profiles, glass sheets, or hardware using the Add Item button or Alt+N."
        />
      </div>

      {/* Stock Adjustment Modal */}
      {adjustModalOpen && selectedItem && (
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
            onSubmit={handleAdjustStock}
            style={{
              maxWidth: "400px",
              width: "100%",
              background: "var(--vc-bg)",
              border: "1px solid var(--vc-border)",
              borderRadius: "16px",
              padding: "24px",
              color: "var(--vc-text-hi)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700 }}>Adjust Stock Level</div>
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "var(--vc-text-sub)", cursor: "pointer", fontSize: "16px" }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: "13px", color: "var(--vc-text-hi)", fontWeight: 600, marginBottom: "4px" }}>
              {selectedItem.name}
            </div>
            <div style={{ fontSize: "12px", color: "var(--vc-text-sub)", marginBottom: "16px" }}>
              Current stock: <strong>{selectedItem.stock_quantity} {selectedItem.unit}</strong>
            </div>

            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => setAdjustType("add")}
                style={{
                  flex: 1,
                  padding: "6px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: adjustType === "add" ? "var(--vc-accent)" : "var(--vc-surface)",
                  color: adjustType === "add" ? "#fff" : "var(--vc-text-sub)",
                  border: "1px solid var(--vc-border)",
                  cursor: "pointer",
                }}
              >
                Add Stock (+)
              </button>
              <button
                type="button"
                onClick={() => setAdjustType("set")}
                style={{
                  flex: 1,
                  padding: "6px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: adjustType === "set" ? "var(--vc-accent)" : "var(--vc-surface)",
                  color: adjustType === "set" ? "#fff" : "var(--vc-text-sub)",
                  border: "1px solid var(--vc-border)",
                  cursor: "pointer",
                }}
              >
                Set Exact Quantity
              </button>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                {adjustType === "add" ? "Quantity to Add" : "New Total Stock"} ({selectedItem.unit})
              </label>
              <input
                type="number"
                required
                autoFocus
                value={adjustmentQty}
                onChange={(e) => setAdjustmentQty(e.target.value)}
                placeholder="e.g. 50"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "var(--vc-surface)",
                  border: "1px solid var(--vc-border)",
                  borderRadius: "8px",
                  color: "var(--vc-text-hi)",
                  fontSize: "14px",
                  fontWeight: 700,
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                style={{
                  background: "transparent",
                  color: "var(--vc-text-sub)",
                  border: "1px solid var(--vc-border)",
                  borderRadius: "8px",
                  padding: "8px 14px",
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
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving..." : "Save Stock"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add New Item Modal */}
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
            onSubmit={handleCreateItem}
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
              <div style={{ fontSize: "16px", fontWeight: 700 }}>Add Inventory Item / Material</div>
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
                  Item Name & Series *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3925 Outer Frame (6 Meter Bar)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  >
                    <option value="Profiles">Profiles (Outer/Sash/Mullion)</option>
                    <option value="Glass">Glass Sheets</option>
                    <option value="Hardware">Hardware (Rollers/Handles/Locks)</option>
                    <option value="Accessories">Accessories (Gaskets/Mesh/Woolpile)</option>
                    <option value="Reinforcement">Steel Reinforcement</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Unit of Measurement
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  >
                    <option value="Meter">Meter (m)</option>
                    <option value="Bar (6m)">Bar (6m length)</option>
                    <option value="SFT">Square Feet (SFT)</option>
                    <option value="Piece">Piece / Unit (Pcs)</option>
                    <option value="Kg">Kilogram (kg)</option>
                    <option value="Box">Box / Pack</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Initial Stock Qty
                  </label>
                  <input
                    type="number"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
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

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Low Stock Threshold
                  </label>
                  <input
                    type="number"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Purchase / Unit Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="450.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
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
                    HSN Code
                  </label>
                  <input
                    type="text"
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
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
                  {saving ? "Saving..." : "Add to Inventory"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
