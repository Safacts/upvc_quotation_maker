"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
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
        <meshStandardMaterial color="#cfd6dc" roughness={0.92} />
      </mesh>
    </>
  );
}

export default function ConfiguratorPage() {
  const [width, setWidth] = useState(1800);
  const [height, setHeight] = useState(1200);
  const [configuration, setConfiguration] = useState<WindowTopology["configuration"]>("sliding");
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
    <main className="vc-console-page" style={{ padding: 24, maxWidth: 1240, margin: "0 auto" }}>
      <div className="configurator-heading">
        <div>
          <p className="vc-eyebrow">Factory tools</p>
          <h1 style={{ margin: 0 }}>3D Window Configurator</h1>
          <p style={{ color: "#64748b" }}>Build a realistic window topology that can be reused by the BOQ engine.</p>
        </div>
        <button className="vc-primary-btn" onClick={saveDesign} disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : "Save design"}
        </button>
      </div>
      <div className="configurator-split">
        <section className="vc-card configurator-controls">
          <label>
            Width (mm)
            <input
              type="number"
              min={100}
              max={12000}
              value={width}
              onChange={(event) => {
                setSaveState("idle");
                setWidth(Math.min(12000, Math.max(100, Number(event.target.value) || 100)));
              }}
            />
          </label>
          <label>
            Height (mm)
            <input
              type="number"
              min={100}
              max={12000}
              value={height}
              onChange={(event) => {
                setSaveState("idle");
                setHeight(Math.min(12000, Math.max(100, Number(event.target.value) || 100)));
              }}
            />
          </label>
          <label>
            Configuration
            <select
              value={configuration}
              onChange={(event) => {
                setSaveState("idle");
                setConfiguration(event.target.value as WindowTopology["configuration"]);
              }}
            >
              <option value="sliding">Sliding</option>
              <option value="casement">Casement</option>
              <option value="tilt_turn">Tilt &amp; turn</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>
          <div className="configurator-summary">
            <strong>{panels}</strong> panels · <strong>{frameMembers}</strong> extruded frame members
          </div>
          <div className="configurator-hint">Drag to rotate · Scroll to zoom · Right-drag to pan</div>
          {saveState === "saved" && <div role="status" className="save-success">Design saved.</div>}
          {saveState === "error" && <div role="alert" className="save-error">The design could not be saved. Please try again.</div>}
        </section>
        <section className="vc-card configurator-preview" aria-label="Interactive realistic 3D window preview">
          <Canvas
            camera={{ position: [0, 0, 4], fov: 43 }}
            dpr={[1, 1.75]}
            gl={{ antialias: true, alpha: false }}
            shadows
            fallback={<div role="alert" className="webgl-fallback">3D preview needs WebGL support.</div>}
          >
            <color attach="background" args={["#dfe7ee"]} />
            <fog attach="fog" args={["#dfe7ee", 7, 18]} />
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
          <div className="preview-badge" aria-hidden="true">
            <strong>{width} × {height} mm</strong>
            <span>{configuration.replace(/_/g, " ")} · realistic profile preview</span>
          </div>
        </section>
      </div>
      <style jsx>{`
        .configurator-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 18px;
        }
        .configurator-split {
          display: grid;
          grid-template-columns: minmax(250px, 300px) minmax(0, 1fr);
          gap: 18px;
        }
        .configurator-controls {
          padding: 18px;
          display: grid;
          align-content: start;
          gap: 14px;
        }
        .configurator-controls label {
          display: grid;
          gap: 6px;
          color: #334155;
          font-size: 13px;
          font-weight: 700;
        }
        .configurator-controls input,
        .configurator-controls select {
          box-sizing: border-box;
          width: 100%;
          min-height: 42px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #ffffff;
          color: #0f172a;
          padding: 9px 11px;
          font: inherit;
          font-weight: 500;
        }
        .configurator-summary {
          color: #475569;
          font-size: 14px;
          line-height: 1.6;
        }
        .configurator-hint {
          padding-top: 4px;
          color: #64748b;
          font-size: 12px;
        }
        .save-success {
          color: #15803d;
          font-size: 14px;
          font-weight: 700;
        }
        .save-error {
          color: #b91c1c;
          font-size: 14px;
          font-weight: 700;
        }
        .configurator-preview {
          position: relative;
          min-height: 560px;
          overflow: hidden;
          background: #dfe7ee;
        }
        .configurator-preview :global(canvas) {
          width: 100% !important;
          height: 560px !important;
          touch-action: none;
          cursor: grab;
        }
        .configurator-preview :global(canvas:active) {
          cursor: grabbing;
        }
        .preview-badge {
          position: absolute;
          right: 18px;
          bottom: 18px;
          display: grid;
          gap: 3px;
          max-width: calc(100% - 36px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 8px 28px rgba(15, 23, 42, 0.14);
          padding: 10px 14px;
          color: #0f172a;
          pointer-events: none;
          backdrop-filter: blur(10px);
        }
        .preview-badge span {
          color: #64748b;
          font-size: 11px;
          text-transform: capitalize;
        }
        .webgl-fallback {
          display: grid;
          min-height: 560px;
          place-items: center;
          padding: 24px;
          color: #334155;
          text-align: center;
        }
        @media (max-width: 820px) {
          .configurator-heading {
            align-items: flex-start;
            flex-direction: column;
          }
          .configurator-split {
            grid-template-columns: 1fr;
          }
          .configurator-preview,
          .configurator-preview :global(canvas) {
            min-height: 440px;
            height: 440px !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .configurator-preview :global(canvas) {
            scroll-behavior: auto;
          }
        }
      `}</style>
    </main>
  );
}
