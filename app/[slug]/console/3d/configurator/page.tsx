"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Box,
  Columns3,
  Grid3X3,
  MousePointer2,
  Move3d,
  PanelTop,
  Rows3,
  Ruler,
  Save,
  Settings2,
  Square,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  createWindowTopology,
  flattenWindowTopology,
  type WindowTopology,
  type WindowTopologyNode,
} from "@/lib/window-topology";

const FRAME_COLOR = "#f4f3f0";
const SASH_COLOR = "#e8e6e1";
const GASKET_COLOR = "#20242a";
const GLASS_COLOR = "#d9f2fa";
const HANDLE_COLOR = "#b8bec6";
const METRES_PER_MM = 1 / 1000;

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function safeInset(bounds: Bounds, inset: number): Bounds {
  const xInset = Math.min(inset, Math.max(0, bounds.width / 2 - 0.003));
  const yInset = Math.min(inset, Math.max(0, bounds.height / 2 - 0.003));
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(0.006, bounds.width - xInset * 2),
    height: Math.max(0.006, bounds.height - yInset * 2),
  };
}

function profileThickness(width: number, height: number) {
  const shortestSide = Math.max(0.01, Math.min(width, height));
  return Math.min(0.082, Math.max(0.032, shortestSide * 0.055), shortestSide * 0.22);
}

function ProfileExtrusion({
  width,
  height,
  thickness,
  depth,
  color,
  z = 0,
}: {
  width: number;
  height: number;
  thickness: number;
  depth: number;
  color: string;
  z?: number;
}) {
  const safeThickness = Math.max(
    0.002,
    Math.min(thickness, width / 2 - 0.002, height / 2 - 0.002),
  );
  const shape = useMemo(() => {
    const outer = new THREE.Shape();
    outer.moveTo(-width / 2, -height / 2);
    outer.lineTo(width / 2, -height / 2);
    outer.lineTo(width / 2, height / 2);
    outer.lineTo(-width / 2, height / 2);
    outer.closePath();

    const innerWidth = Math.max(0.002, width - safeThickness * 2);
    const innerHeight = Math.max(0.002, height - safeThickness * 2);
    const inner = new THREE.Path();
    inner.moveTo(-innerWidth / 2, -innerHeight / 2);
    inner.lineTo(-innerWidth / 2, innerHeight / 2);
    inner.lineTo(innerWidth / 2, innerHeight / 2);
    inner.lineTo(innerWidth / 2, -innerHeight / 2);
    inner.closePath();
    outer.holes.push(inner);
    return outer;
  }, [height, safeThickness, width]);
  const extrusion = useMemo(
    () => ({
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: Math.min(0.004, safeThickness * 0.08),
      bevelThickness: Math.min(0.004, depth * 0.08),
    }),
    [depth, safeThickness],
  );

  return (
    <mesh position={[0, 0, z - depth / 2]} castShadow receiveShadow>
      <extrudeGeometry args={[shape, extrusion]} />
      <meshStandardMaterial color={color} roughness={0.32} metalness={0.04} />
    </mesh>
  );
}

function MemberExtrusion({
  width,
  height,
  depth,
  z = 0.002,
}: {
  width: number;
  height: number;
  depth: number;
  z?: number;
}) {
  const shape = useMemo(() => {
    const member = new THREE.Shape();
    member.moveTo(-width / 2, -height / 2);
    member.lineTo(width / 2, -height / 2);
    member.lineTo(width / 2, height / 2);
    member.lineTo(-width / 2, height / 2);
    member.closePath();
    return member;
  }, [height, width]);
  const extrusion = useMemo(
    () => ({
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: Math.min(0.0035, Math.min(width, height) * 0.08),
      bevelThickness: 0.003,
    }),
    [depth, height, width],
  );

  return (
    <mesh position={[0, 0, z - depth / 2]} castShadow receiveShadow>
      <extrudeGeometry args={[shape, extrusion]} />
      <meshStandardMaterial color={FRAME_COLOR} roughness={0.34} metalness={0.035} />
    </mesh>
  );
}

function Gasket({ width, height, depth, z }: { width: number; height: number; depth: number; z: number }) {
  const ringWidth = Math.min(0.012, Math.min(width, height) * 0.05);
  return (
    <ProfileExtrusion
      width={width}
      height={height}
      thickness={ringWidth}
      depth={Math.max(0.006, depth * 0.08)}
      color={GASKET_COLOR}
      z={z}
    />
  );
}

function GlassPane({ width, height, z }: { width: number; height: number; z: number }) {
  return (
    <mesh position={[0, 0, z]} castShadow receiveShadow>
      <boxGeometry args={[width, height, 0.009]} />
      <meshPhysicalMaterial
        color={GLASS_COLOR}
        transmission={0.9}
        opacity={0.72}
        metalness={0.02}
        roughness={0.08}
        ior={1.5}
        thickness={0.016}
        transparent
      />
    </mesh>
  );
}

function Handle({ panelWidth, panelHeight, depth }: { panelWidth: number; panelHeight: number; depth: number }) {
  const size = Math.min(1, Math.max(0.55, panelHeight / 1.2));
  const x = panelWidth / 2 - Math.min(0.055, panelWidth * 0.14);
  const z = depth / 2 + 0.014;
  return (
    <group position={[x, 0, z]} scale={size}>
      <mesh castShadow>
        <boxGeometry args={[0.025, 0.09, 0.018]} />
        <meshStandardMaterial color={HANDLE_COLOR} roughness={0.28} metalness={0.68} />
      </mesh>
      <mesh position={[-0.035, -0.045, 0.018]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.09, 16]} />
        <meshStandardMaterial color={HANDLE_COLOR} roughness={0.24} metalness={0.72} />
      </mesh>
    </group>
  );
}

function PanelNode({
  node,
  bounds,
  frameThickness,
  frameDepth,
  configuration,
}: {
  node: WindowTopologyNode;
  bounds: Bounds;
  frameThickness: number;
  frameDepth: number;
  configuration: WindowTopology["configuration"];
}) {
  const hasSash = Boolean(node.opening) || configuration === "sliding";
  const sashInset = Math.min(0.014, frameThickness * 0.2);
  const sashBounds = safeInset({ ...bounds, x: 0, y: 0 }, sashInset);
  const sashThickness = Math.min(frameThickness * 0.72, Math.min(sashBounds.width, sashBounds.height) * 0.18);
  const glassBounds = safeInset(sashBounds, hasSash ? sashThickness + 0.008 : 0.014);
  const glassNode = node.children.find((child) => child.kind === "glass");
  const glazingNodes = node.children.filter((child) => child.kind !== "glass");

  return (
    <group position={[bounds.x, bounds.y, hasSash ? 0.015 : 0]}>
      {hasSash && (
        <ProfileExtrusion
          width={sashBounds.width}
          height={sashBounds.height}
          thickness={sashThickness}
          depth={frameDepth * 0.68}
          color={SASH_COLOR}
          z={0.025}
        />
      )}
      {glassNode && (
        <TopologyNode3D
          node={glassNode}
          bounds={{ ...glassBounds, x: 0, y: 0 }}
          frameThickness={frameThickness}
          frameDepth={frameDepth}
          configuration={configuration}
        />
      )}
      {glazingNodes.map((child) => (
        <TopologyNode3D
          key={child.id}
          node={child}
          bounds={{ ...glassBounds, x: 0, y: 0 }}
          frameThickness={frameThickness}
          frameDepth={frameDepth}
          configuration={configuration}
        />
      ))}
      {node.opening && <Handle panelWidth={sashBounds.width} panelHeight={sashBounds.height} depth={frameDepth} />}
    </group>
  );
}

function WindowNode({
  node,
  bounds,
  frameThickness,
  frameDepth,
  configuration,
}: {
  node: WindowTopologyNode;
  bounds: Bounds;
  frameThickness: number;
  frameDepth: number;
  configuration: WindowTopology["configuration"];
}) {
  const panels = node.children.filter((child) => child.kind === "panel");
  const frameNodes = node.children.filter((child) => child.kind === "frame");
  const mullions = node.children.filter((child) => child.kind === "mullion");
  const transoms = node.children.filter((child) => child.kind === "transom");
  const contentBounds = safeInset(bounds, frameThickness * 1.04);
  const panelWeight = panels.reduce((sum, panel) => sum + Math.max(1, panel.widthMm || 1), 0);
  let panelCursor = contentBounds.x - contentBounds.width / 2;
  const panelLayouts = panels.map((panel) => {
    const width = contentBounds.width * (Math.max(1, panel.widthMm || 1) / Math.max(1, panelWeight));
    const panelBounds = { x: panelCursor + width / 2, y: contentBounds.y, width, height: contentBounds.height };
    panelCursor += width;
    return { panel, bounds: panelBounds };
  });

  return (
    <group>
      {frameNodes.map((child) => (
        <TopologyNode3D
          key={child.id}
          node={child}
          bounds={bounds}
          frameThickness={frameThickness}
          frameDepth={frameDepth}
          configuration={configuration}
        />
      ))}
      {panelLayouts.map(({ panel, bounds: panelBounds }) => (
        <TopologyNode3D
          key={panel.id}
          node={panel}
          bounds={panelBounds}
          frameThickness={frameThickness}
          frameDepth={frameDepth}
          configuration={configuration}
        />
      ))}
      {mullions.map((child, index) => {
        const boundary = panelLayouts[index]?.bounds;
        const x = boundary ? boundary.x + boundary.width / 2 : contentBounds.x;
        return (
          <TopologyNode3D
            key={child.id}
            node={child}
            bounds={{ x, y: contentBounds.y, width: frameThickness * 0.78, height: contentBounds.height }}
            frameThickness={frameThickness}
            frameDepth={frameDepth}
            configuration={configuration}
          />
        );
      })}
      {transoms.map((child, index) => (
        <TopologyNode3D
          key={child.id}
          node={child}
          bounds={{
            x: contentBounds.x,
            y: contentBounds.y + (index - (transoms.length - 1) / 2) * frameThickness * 1.6,
            width: contentBounds.width,
            height: frameThickness * 0.78,
          }}
          frameThickness={frameThickness}
          frameDepth={frameDepth}
          configuration={configuration}
        />
      ))}
    </group>
  );
}

function TopologyNode3D({
  node,
  bounds,
  frameThickness,
  frameDepth,
  configuration,
}: {
  node: WindowTopologyNode;
  bounds: Bounds;
  frameThickness: number;
  frameDepth: number;
  configuration: WindowTopology["configuration"];
}) {
  if (node.kind === "window") {
    return (
      <WindowNode
        node={node}
        bounds={bounds}
        frameThickness={frameThickness}
        frameDepth={frameDepth}
        configuration={configuration}
      />
    );
  }
  if (node.kind === "frame") {
    return (
      <group position={[bounds.x, bounds.y, 0]}>
        <ProfileExtrusion
          width={bounds.width}
          height={bounds.height}
          thickness={frameThickness}
          depth={frameDepth}
          color={FRAME_COLOR}
        />
      </group>
    );
  }
  if (node.kind === "mullion" || node.kind === "transom") {
    return (
      <group position={[bounds.x, bounds.y, 0.004]}>
        <MemberExtrusion width={bounds.width} height={bounds.height} depth={frameDepth * 0.92} />
      </group>
    );
  }
  if (node.kind === "panel") {
    return (
      <PanelNode
        node={node}
        bounds={bounds}
        frameThickness={frameThickness}
        frameDepth={frameDepth}
        configuration={configuration}
      />
    );
  }
  if (node.kind === "glass") {
    return <GlassPane width={bounds.width} height={bounds.height} z={0.018} />;
  }
  if (node.kind === "hardware") {
    return <Gasket width={bounds.width} height={bounds.height} depth={frameDepth} z={0.031} />;
  }
  return null;
}

function CameraRig({ width, height }: { width: number; height: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const distance = Math.max(width, height) * 1.65 + 1.25;
    camera.position.set(width * 0.18, height * 0.12, distance);
    camera.near = 0.01;
    camera.far = 100;
    camera.lookAt(0, 0, 0);
    if (camera instanceof THREE.PerspectiveCamera) camera.updateProjectionMatrix();
  }, [camera, height, width]);
  return null;
}

function RealisticTopologyModel({ topology }: { topology: WindowTopology }) {
  const width = topology.widthMm * METRES_PER_MM;
  const height = topology.heightMm * METRES_PER_MM;
  const frameThickness = profileThickness(width, height);
  const frameDepth = Math.min(0.1, Math.max(0.06, frameThickness * 1.3));
  const bounds = { x: 0, y: 0, width, height };

  return (
    <>
      <CameraRig width={width} height={height} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#f8fbff", "#8a8176", 0.72]} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <directionalLight position={[-4, 2, 3]} intensity={0.55} color="#fff4df" />
      <TopologyNode3D
        node={topology.root}
        bounds={bounds}
        frameThickness={frameThickness}
        frameDepth={frameDepth}
        configuration={topology.configuration}
      />
      <mesh position={[0, -height / 2 - 0.12, -0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[Math.max(5, width * 3), Math.max(5, height * 2.2)]} />
        <meshStandardMaterial color="#162231" roughness={0.92} />
      </mesh>
    </>
  );
}

export default function ConfiguratorPage() {
  const [width, setWidth] = useState(1800);
  const [height, setHeight] = useState(1200);
  const [configuration, setConfiguration] = useState<WindowTopology["configuration"]>("sliding");
  const [activeTool, setActiveTool] = useState<"mullion" | "transom" | "sash" | "glass">("mullion");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const topology = useMemo(
    () => createWindowTopology({ widthMm: width, heightMm: height, configuration }),
    [width, height, configuration],
  );
  const nodes = useMemo(() => flattenWindowTopology(topology), [topology]);
  const panels = nodes.filter((node) => node.kind === "panel").length;
  const frameMembers = nodes.filter((node) => ["frame", "mullion", "transom"].includes(node.kind)).length;

  async function saveDesign() {
    setSaveState("saving");
    try {
      const response = await fetch("/api/console/3d/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${configuration} ${width}x${height}`,
          profile_type: "uPVC",
          dimensions: { width_mm: width, height_mm: height, configuration },
          design: {
            frames: topology.root.children,
            panels: topology.root.children.filter((node) => node.kind === "panel"),
            topology,
          },
          thumbnail_url: null,
          model_url: null,
        }),
      });
      setSaveState(response.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="configurator-page">
      <section className="configurator-workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <span className="workspace-mark" aria-hidden="true">
              <Box size={21} strokeWidth={1.8} />
            </span>
            <div>
              <p className="workspace-eyebrow">Design studio / Live model</p>
              <h1>3D Window Configurator</h1>
              <p>Shape production-ready uPVC windows in a precision workspace.</p>
            </div>
          </div>
          <button className="save-design" type="button" onClick={saveDesign} disabled={saveState === "saving"}>
            <Save size={17} aria-hidden="true" />
            {saveState === "saving" ? "Saving…" : "Save design"}
          </button>
        </header>

        <div className="studio-grid">
          <aside className="glass-panel toolbox-panel" aria-labelledby="toolbox-title">
            <div className="panel-heading">
              <span className="panel-heading-icon" aria-hidden="true">
                <Grid3X3 size={17} />
              </span>
              <div>
                <span>Elements</span>
                <h2 id="toolbox-title">Toolbox</h2>
              </div>
            </div>

            <div className="tool-list" role="toolbar" aria-label="Window element tools">
              <button
                type="button"
                className={`tool-button ${activeTool === "mullion" ? "is-active" : ""}`}
                aria-pressed={activeTool === "mullion"}
                onClick={() => setActiveTool("mullion")}
              >
                <span className="tool-icon"><Columns3 size={21} aria-hidden="true" /></span>
                <span className="tool-copy"><strong>Mullion</strong><small>Vertical divider</small></span>
                <span className="tool-key" aria-hidden="true">M</span>
              </button>
              <button
                type="button"
                className={`tool-button ${activeTool === "transom" ? "is-active" : ""}`}
                aria-pressed={activeTool === "transom"}
                onClick={() => setActiveTool("transom")}
              >
                <span className="tool-icon"><Rows3 size={21} aria-hidden="true" /></span>
                <span className="tool-copy"><strong>Transom</strong><small>Horizontal divider</small></span>
                <span className="tool-key" aria-hidden="true">T</span>
              </button>
              <button
                type="button"
                className={`tool-button ${activeTool === "sash" ? "is-active" : ""}`}
                aria-pressed={activeTool === "sash"}
                onClick={() => setActiveTool("sash")}
              >
                <span className="tool-icon"><PanelTop size={21} aria-hidden="true" /></span>
                <span className="tool-copy"><strong>Sash</strong><small>Opening panel</small></span>
                <span className="tool-key" aria-hidden="true">S</span>
              </button>
              <button
                type="button"
                className={`tool-button ${activeTool === "glass" ? "is-active" : ""}`}
                aria-pressed={activeTool === "glass"}
                onClick={() => setActiveTool("glass")}
              >
                <span className="tool-icon"><Square size={21} aria-hidden="true" /></span>
                <span className="tool-copy"><strong>Glass</strong><small>Glazing area</small></span>
                <span className="tool-key" aria-hidden="true">G</span>
              </button>
            </div>

            <div className="tool-selection" aria-live="polite">
              <MousePointer2 size={15} aria-hidden="true" />
              <span><strong>{activeTool}</strong> tool selected</span>
            </div>
            <p className="tool-note">Choose an element, then refine the window configuration from Properties.</p>
          </aside>

          <section className="viewport-panel" aria-label="Interactive realistic 3D window preview">
            <div className="viewport-toolbar" aria-hidden="true">
              <span className="live-chip"><i /> Live viewport</span>
              <span className="quality-chip">High quality</span>
            </div>
            <div className="viewport-canvas">
              <Canvas
                camera={{ position: [0, 0, 4], fov: 43 }}
                dpr={[1, 1.75]}
                gl={{ antialias: true, alpha: false }}
                shadows
                fallback={<div role="alert" className="webgl-fallback">3D preview needs WebGL support.</div>}
              >
                <color attach="background" args={["#0d1623"]} />
                <fog attach="fog" args={["#0d1623", 7, 18]} />
                <Suspense fallback={null}>
                  <RealisticTopologyModel topology={topology} />
                  <OrbitControls
                    enablePan
                    enableZoom
                    enableRotate
                    minDistance={0.6}
                    maxDistance={24}
                    target={[0, 0, 0]}
                  />
                </Suspense>
              </Canvas>
            </div>
            <div className="viewport-footer">
              <span><Move3d size={15} aria-hidden="true" /> Drag to orbit</span>
              <span className="viewport-measurement">
                <strong>{width} × {height}</strong> mm
              </span>
            </div>
          </section>

          <aside className="glass-panel properties-panel" aria-labelledby="properties-title">
            <div className="panel-heading">
              <span className="panel-heading-icon" aria-hidden="true">
                <Settings2 size={17} />
              </span>
              <div>
                <span>Selection</span>
                <h2 id="properties-title">Properties</h2>
              </div>
            </div>

            <div className="property-section">
              <div className="property-title"><Ruler size={14} aria-hidden="true" /> Dimensions</div>
              <label className="property-field">
                <span>Width</span>
                <span className="input-shell">
                  <input
                    type="number"
                    min={300}
                    max={12000}
                    value={width}
                    onChange={(event) => {
                      setSaveState("idle");
                      setWidth(Math.min(12000, Math.max(300, Number(event.target.value) || 300)));
                    }}
                  />
                  <i>mm</i>
                </span>
              </label>
              <label className="property-field">
                <span>Height</span>
                <span className="input-shell">
                  <input
                    type="number"
                    min={300}
                    max={12000}
                    value={height}
                    onChange={(event) => {
                      setSaveState("idle");
                      setHeight(Math.min(12000, Math.max(300, Number(event.target.value) || 300)));
                    }}
                  />
                  <i>mm</i>
                </span>
              </label>
            </div>

            <div className="property-section">
              <label className="property-field">
                <span>Configuration</span>
                <select
                  value={configuration}
                  onChange={(event) => {
                    setSaveState("idle");
                    setConfiguration(event.target.value as WindowTopology["configuration"]);
                  }}
                >
                  <option value="sliding">Sliding window</option>
                  <option value="casement">Casement window</option>
                  <option value="tilt_turn">Tilt &amp; turn</option>
                  <option value="fixed">Fixed window</option>
                </select>
              </label>
            </div>

            <div className="model-summary">
              <div><span>Panels</span><strong>{panels.toString().padStart(2, "0")}</strong></div>
              <div><span>Frame members</span><strong>{frameMembers.toString().padStart(2, "0")}</strong></div>
            </div>

            <div className="design-health">
              <span className="health-dot" aria-hidden="true" />
              <span><strong>Design ready</strong><small>Topology is valid for BOQ</small></span>
            </div>
            <div className="save-message" aria-live="polite">
              {saveState === "saved" && <div role="status" className="save-success">Design saved successfully.</div>}
              {saveState === "error" && <div role="alert" className="save-error">The design could not be saved. Please try again.</div>}
            </div>
          </aside>
        </div>
      </section>
      <style jsx>{`
        .configurator-page {
          --studio-orange: #f97316;
          --studio-orange-bright: #fb923c;
          --studio-ink: #07101d;
          box-sizing: border-box;
          max-width: 1600px;
          margin: 0 auto;
          padding: 18px;
          color: #e7edf5;
        }
        .configurator-workspace {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          min-height: calc(100vh - 72px);
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 24px;
          background:
            radial-gradient(circle at 48% -20%, rgba(51, 65, 85, 0.72), transparent 42%),
            radial-gradient(circle at 100% 100%, rgba(249, 115, 22, 0.08), transparent 32%),
            linear-gradient(145deg, #0b1421 0%, #07101b 58%, #060c16 100%);
          box-shadow: 0 28px 70px rgba(2, 6, 23, 0.32);
          padding: 24px;
        }
        .configurator-workspace::before {
          position: absolute;
          z-index: -1;
          inset: 0;
          background-image:
            linear-gradient(rgba(148, 163, 184, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.025) 1px, transparent 1px);
          background-size: 44px 44px;
          content: "";
          mask-image: linear-gradient(to bottom, black, transparent 86%);
        }
        .workspace-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          margin-bottom: 24px;
          padding: 0 2px;
        }
        .workspace-title {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }
        .workspace-mark {
          display: grid;
          flex: 0 0 44px;
          width: 44px;
          height: 44px;
          place-items: center;
          border: 1px solid rgba(249, 115, 22, 0.38);
          border-radius: 13px;
          background: linear-gradient(145deg, rgba(249, 115, 22, 0.2), rgba(249, 115, 22, 0.06));
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.08), 0 10px 30px rgba(249, 115, 22, 0.08);
          color: var(--studio-orange-bright);
        }
        .workspace-title h1 {
          margin: 2px 0 4px;
          color: #f8fafc;
          font-size: clamp(21px, 2vw, 28px);
          line-height: 1.12;
          letter-spacing: -0.035em;
        }
        .workspace-title p {
          margin: 0;
          color: #8190a5;
          font-size: 12px;
        }
        .workspace-title .workspace-eyebrow {
          color: var(--studio-orange-bright);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .save-design {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          min-height: 44px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 11px;
          background: linear-gradient(135deg, var(--studio-orange-bright), #ea580c);
          box-shadow: 0 10px 30px rgba(234, 88, 12, 0.24), inset 0 1px rgba(255, 255, 255, 0.26);
          padding: 0 18px;
          color: #2b1003;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        .save-design:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 14px 34px rgba(234, 88, 12, 0.32), inset 0 1px rgba(255, 255, 255, 0.26);
          filter: saturate(1.08);
        }
        .save-design:disabled {
          cursor: wait;
          opacity: 0.7;
        }
        .save-design:focus-visible,
        .tool-button:focus-visible,
        .property-field input:focus-visible,
        .property-field select:focus-visible {
          outline: 2px solid #fdba74;
          outline-offset: 3px;
        }
        .studio-grid {
          display: grid;
          grid-template-columns: clamp(190px, 16vw, 226px) minmax(0, 1fr) clamp(250px, 20vw, 300px);
          grid-template-areas: "toolbox viewport properties";
          gap: 14px;
          min-height: 0;
        }
        .glass-panel {
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 16px;
          background: linear-gradient(155deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.48));
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.045), 0 18px 44px rgba(2, 6, 23, 0.16);
          backdrop-filter: blur(18px);
        }
        @supports not (backdrop-filter: blur(1px)) {
          .glass-panel {
            background: #111c2c;
          }
        }
        .toolbox-panel {
          grid-area: toolbox;
          display: grid;
          align-content: start;
          min-width: 0;
          padding: 17px;
        }
        .properties-panel {
          grid-area: properties;
          min-width: 0;
          padding: 17px;
        }
        .panel-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 17px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.11);
        }
        .panel-heading-icon {
          display: grid;
          width: 32px;
          height: 32px;
          place-items: center;
          border: 1px solid rgba(249, 115, 22, 0.22);
          border-radius: 9px;
          background: rgba(249, 115, 22, 0.09);
          color: var(--studio-orange-bright);
        }
        .panel-heading span {
          color: #64748b;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .panel-heading h2 {
          margin: 2px 0 0;
          color: #e7edf5;
          font-size: 15px;
          letter-spacing: -0.01em;
        }
        .tool-list {
          display: grid;
          gap: 9px;
        }
        .tool-button {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          width: 100%;
          min-height: 58px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 11px;
          background: rgba(15, 23, 42, 0.54);
          padding: 8px 9px;
          color: #a8b3c3;
          text-align: left;
          cursor: pointer;
          transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
        }
        .tool-button:hover {
          transform: translateX(2px);
          border-color: rgba(249, 115, 22, 0.35);
          background: rgba(30, 41, 59, 0.72);
          color: #f8fafc;
        }
        .tool-button.is-active {
          border-color: rgba(249, 115, 22, 0.58);
          background: linear-gradient(100deg, rgba(249, 115, 22, 0.18), rgba(249, 115, 22, 0.055));
          box-shadow: inset 3px 0 var(--studio-orange), 0 10px 28px rgba(2, 6, 23, 0.14);
          color: #fff7ed;
        }
        .tool-icon {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 9px;
          background: rgba(2, 6, 23, 0.25);
          color: #8290a3;
        }
        .tool-button.is-active .tool-icon {
          border-color: rgba(249, 115, 22, 0.28);
          background: rgba(249, 115, 22, 0.13);
          color: var(--studio-orange-bright);
        }
        .tool-copy {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .tool-copy strong {
          overflow: hidden;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tool-copy small {
          overflow: hidden;
          color: #68778c;
          font-size: 9px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tool-key {
          display: grid;
          width: 21px;
          height: 21px;
          place-items: center;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 6px;
          color: #59677a;
          font-size: 8px;
          font-weight: 800;
        }
        .tool-selection {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 16px;
          color: #8190a5;
          font-size: 10px;
          text-transform: capitalize;
        }
        .tool-selection strong {
          color: var(--studio-orange-bright);
        }
        .tool-note {
          margin: 9px 0 0;
          color: #566579;
          font-size: 9px;
          line-height: 1.55;
        }
        .viewport-panel {
          position: relative;
          grid-area: viewport;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          min-width: 0;
          min-height: clamp(560px, calc(100vh - 190px), 720px);
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 17px;
          background: #0d1623;
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.055), 0 22px 48px rgba(2, 6, 23, 0.22);
        }
        .viewport-panel::after {
          position: absolute;
          inset: 44px 0 44px;
          background: radial-gradient(circle at 50% 44%, rgba(56, 189, 248, 0.07), transparent 48%);
          content: "";
          pointer-events: none;
        }
        .viewport-toolbar,
        .viewport-footer {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 44px;
          padding: 0 14px;
          background: rgba(7, 15, 27, 0.78);
          backdrop-filter: blur(14px);
        }
        .viewport-toolbar {
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }
        .viewport-footer {
          border-top: 1px solid rgba(148, 163, 184, 0.1);
          color: #64748b;
          font-size: 9px;
        }
        .viewport-footer > span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .live-chip,
        .quality-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 999px;
          background: rgba(30, 41, 59, 0.36);
          padding: 5px 9px;
          color: #8694a8;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }
        .live-chip i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12), 0 0 10px rgba(34, 197, 94, 0.65);
        }
        .quality-chip {
          color: #64748b;
        }
        .viewport-canvas {
          position: relative;
          z-index: 1;
          min-height: 470px;
        }
        .viewport-canvas :global(canvas) {
          width: 100% !important;
          height: 100% !important;
          min-height: 470px;
          touch-action: none;
          cursor: grab;
        }
        .viewport-canvas :global(canvas:active) {
          cursor: grabbing;
        }
        .viewport-measurement {
          color: #77869a;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .viewport-measurement strong {
          color: #d8e0ea;
          font-size: 10px;
        }
        .property-section {
          display: grid;
          gap: 12px;
          padding: 15px 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }
        .property-title {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #8795a8;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .property-field {
          display: grid;
          gap: 7px;
          color: #93a1b3;
          font-size: 10px;
          font-weight: 700;
        }
        .input-shell {
          position: relative;
          display: block;
        }
        .property-field input,
        .property-field select {
          box-sizing: border-box;
          width: 100%;
          min-height: 43px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 9px;
          background: rgba(2, 6, 23, 0.3);
          padding: 9px 11px;
          color: #eef2f7;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          color-scheme: dark;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .property-field input {
          padding-right: 43px;
          font-variant-numeric: tabular-nums;
        }
        .property-field input:hover,
        .property-field select:hover {
          border-color: rgba(249, 115, 22, 0.38);
        }
        .property-field input:focus,
        .property-field select:focus {
          border-color: var(--studio-orange);
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }
        .input-shell i {
          position: absolute;
          top: 50%;
          right: 11px;
          color: #59677a;
          font-size: 9px;
          font-style: normal;
          font-weight: 800;
          transform: translateY(-50%);
          pointer-events: none;
        }
        .model-summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 15px 0;
        }
        .model-summary div {
          display: grid;
          gap: 7px;
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 9px;
          background: rgba(2, 6, 23, 0.2);
          padding: 10px;
        }
        .model-summary span {
          color: #627085;
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .model-summary strong {
          color: #e7edf5;
          font-size: 16px;
          font-variant-numeric: tabular-nums;
        }
        .design-health {
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid rgba(34, 197, 94, 0.14);
          border-radius: 10px;
          background: rgba(34, 197, 94, 0.045);
          padding: 10px;
        }
        .health-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
        }
        .design-health > span:last-child {
          display: grid;
          gap: 2px;
        }
        .design-health strong {
          color: #bfe7cb;
          font-size: 10px;
        }
        .design-health small {
          color: #568068;
          font-size: 8px;
        }
        .save-message {
          min-height: 22px;
          margin-top: 10px;
        }
        .save-success {
          color: #86efac;
          font-size: 10px;
          font-weight: 700;
        }
        .save-error {
          color: #fca5a5;
          font-size: 10px;
          line-height: 1.45;
          font-weight: 700;
        }
        .webgl-fallback {
          display: grid;
          min-height: 470px;
          place-items: center;
          padding: 24px;
          color: #93a1b3;
          text-align: center;
        }
        @media (max-width: 1120px) {
          .studio-grid {
            grid-template-columns: minmax(210px, 0.75fr) minmax(250px, 1fr);
            grid-template-areas:
              "viewport viewport"
              "toolbox properties";
          }
          .viewport-panel {
            min-height: 590px;
          }
          .tool-list {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 700px) {
          .configurator-page {
            padding: 10px;
          }
          .configurator-workspace {
            min-height: auto;
            border-radius: 17px;
            padding: 15px;
          }
          .workspace-header {
            align-items: flex-start;
            flex-direction: column;
          }
          .save-design {
            width: 100%;
          }
          .studio-grid {
            grid-template-columns: 1fr;
            grid-template-areas:
              "viewport"
              "toolbox"
              "properties";
          }
          .viewport-panel {
            min-height: 450px;
          }
          .viewport-canvas,
          .viewport-canvas :global(canvas) {
            min-height: 362px;
          }
          .tool-list {
            grid-template-columns: 1fr 1fr;
          }
          .tool-button {
            grid-template-columns: 35px minmax(0, 1fr);
          }
          .tool-key {
            display: none;
          }
        }
        @media (max-width: 430px) {
          .workspace-mark {
            display: none;
          }
          .tool-list,
          .model-summary {
            grid-template-columns: 1fr;
          }
          .viewport-panel {
            min-height: 410px;
          }
          .viewport-canvas,
          .viewport-canvas :global(canvas) {
            min-height: 322px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .save-design,
          .tool-button {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
