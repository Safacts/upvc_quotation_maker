"use client";

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "../ConsoleShell";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  status: string;
  due_at: string | null;
  created_at: string;
}

/**
 * TasksClient -- ADDITIVE ONLY. Owner/manager assigns field visits.
 * Reuses the console shell + same-origin session. No pricing/PDF logic here.
 */
export default function TasksClient() {
  const { toast } = useConsole();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueAt, setDueAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/console/executive-tasks?page_size=100", {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Failed to load tasks", "err");
        setRows([]);
        return;
      }
      setRows(data.rows || []);
    } catch (e: unknown) {
      toast(String((e as Error)?.message ?? e), "err");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    if (!title.trim()) {
      toast("Title is required", "err");
      return;
    }
    try {
      const res = await fetch("/api/console/executive-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: title.trim(),
          assigned_to: assignee.trim(),
          due_at: dueAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Could not create task", "err");
        return;
      }
      toast("Visit assigned", "ok");
      setTitle("");
      setAssignee("");
      setDueAt("");
      void load();
    } catch (e: unknown) {
      toast(String((e as Error)?.message ?? e), "err");
    }
  }, [title, assignee, dueAt, toast, load]);

  return (
    <div>
      <div className="vc-card">
        <div className="vc-card-title">Assign field visit</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Visit title (e.g. Measure 5 windows - Sharma)"
            style={{ flex: 2, minWidth: 220 }}
          />
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Executive email/phone"
            style={{ flex: 1, minWidth: 160 }}
          />
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
          <button className="vc-btn vc-btn-primary" type="button" onClick={create}>
            Assign
          </button>
        </div>
      </div>
      <div className="vc-card">
        <div className="vc-card-title">
          Field visits {loading ? "(loading…)" : `(${rows.length})`}
        </div>
        {rows.length === 0 && !loading ? (
          <div className="vc-muted">No visits yet.</div>
        ) : (
          <table className="vc-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td>{r.assigned_to}</td>
                  <td>{r.status}</td>
                  <td>{r.due_at ? r.due_at.slice(0, 10) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
