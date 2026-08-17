"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";
import { createWindowTopology, type WindowTopology } from "@/lib/window-topology";

function Model({ topology }: { topology: WindowTopology }) {
  const scale = Math.max(topology.widthMm, topology.heightMm);
  const sx = topology.widthMm / scale * 4.8;
  const sy = topology.heightMm / scale * 4.8;
  const frame = 0.1;
  const panels = topology.root.children.filter((node) => node.kind === "panel");
  return <group>
    <mesh position={[0, 0, -0.08]}><boxGeometry args={[sx, sy, 0.16]} /><meshStandardMaterial color="#64748b" /></mesh>
    <mesh position={[0, 0, 0.03]}><boxGeometry args={[sx - frame, sy - frame, 0.08]} /><meshStandardMaterial color="#dbeafe" transparent opacity={0.55} /></mesh>
    {panels.map((panel, index) => {
      const x = -sx / 2 + (index + 0.5) * sx / panels.length;
      return <group key={panel.id} position={[x, 0, 0.12]}>
        {index > 0 && <mesh position={[-sx / panels.length / 2, 0, 0]}><boxGeometry args={[0.08, sy, 0.12]} /><meshStandardMaterial color="#334155" /></mesh>}
        {panel.opening && <mesh position={[0, 0, 0.08]}><boxGeometry args={[sx / panels.length - 0.16, sy - 0.18, 0.04]} /><meshStandardMaterial color="#f59e0b" wireframe /></mesh>}
      </group>;
    })}
  </group>;
}

export default function ConfiguratorPage() {
  const [width, setWidth] = useState(1800);
  const [height, setHeight] = useState(1200);
  const [configuration, setConfiguration] = useState<WindowTopology["configuration"]>("sliding");
  const [saved, setSaved] = useState(false);
  const topology = useMemo(() => createWindowTopology({ widthMm: width, heightMm: height, configuration }), [width, height, configuration]);
  const panels = topology.root.children.filter((node) => node.kind === "panel").length;

  async function saveDesign() {
    setSaved(false);
    const response = await fetch("/api/console/3d/designs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      name: `${configuration} ${width}x${height}`, profile_type: "uPVC", dimensions: { width_mm: width, height_mm: height, configuration },
      design: { frames: topology.root.children, panels: topology.root.children.filter((node) => node.kind === "panel"), topology }, thumbnail_url: null, model_url: null,
    }) });
    setSaved(response.ok);
  }

  return <main className="vc-console-page" style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 18 }}>
      <div><p className="vc-eyebrow">Factory tools</p><h1 style={{ margin: 0 }}>3D Window Configurator</h1><p style={{ color: "#64748b" }}>Build a window topology that can be reused by the BOQ engine.</p></div>
      <button className="vc-primary-btn" onClick={saveDesign}>Save design</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 18 }}>
      <section className="vc-card" style={{ padding: 18, display: "grid", alignContent: "start", gap: 12 }}>
        <label>Width (mm)<input type="number" min={100} value={width} onChange={(e) => setWidth(Number(e.target.value) || 100)} /></label>
        <label>Height (mm)<input type="number" min={100} value={height} onChange={(e) => setHeight(Number(e.target.value) || 100)} /></label>
        <label>Configuration<select value={configuration} onChange={(e) => setConfiguration(e.target.value as WindowTopology["configuration"])}><option value="sliding">Sliding</option><option value="casement">Casement</option><option value="tilt_turn">Tilt & turn</option><option value="fixed">Fixed</option></select></label>
        <div style={{ color: "#475569", fontSize: 14 }}>{panels} panels · {topology.root.children.length - panels} frame members</div>
        {saved && <div role="status" style={{ color: "#15803d" }}>Design saved.</div>}
      </section>
      <section className="vc-card" style={{ minHeight: 520, overflow: "hidden", background: "#0f172a" }} aria-label="3D window preview">
        <Canvas camera={{ position: [0, 0, 7], fov: 45 }} style={{ height: 520 }}><ambientLight intensity={1.5} /><directionalLight position={[3, 4, 5]} intensity={2} /><Model topology={topology} /><OrbitControls /></Canvas>
      </section>
    </div>
  </main>;
}
