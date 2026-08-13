"use client";

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useRef, useState, useEffect } from 'react';

function WindowFrame({ width, height, depth }) {
  const group = useRef(null);

  useFrame(() => {
    if (group.current) {
      group.current.rotation.y += 0.001;
    }
  });

  return (
    <group ref={group}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#CD4A12" />
      </mesh>
      <mesh position={[0, height / 2, depth / 2 - 2]}>
        <boxGeometry args={[width, height, 4]} />
        <meshStandardMaterial color="#EA580C" />
      </mesh>
    </group>
  );
}

function GlassPanel({ width, height }) {
  return (
    <mesh position={[0, height / 2, 0.5]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color="#87CEEB" transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Window3D({ design }) {
  const dimensions = design.dimensions;
  const w = dimensions.width_mm / 100;
  const h = dimensions.height_mm / 100;
  const fd = 6;

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <WindowFrame width={w} height={h} depth={fd} />
      <GlassPanel width={w - fd * 2} height={h - fd * 2 - 2} />
      <Html position={[0, -5, 0]}>
        <div style={{ background: 'rgba(255,255,255,0.9)', padding: '8px 16px', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
            {dimensions.width_mm} × {dimensions.height_mm} mm
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>{dimensions.configuration}</div>
        </div>
      </Html>
    </>
  );
}

function LoadingFallback() {
  return (
    <Html>
      <div style={{ color: '#EA580C', fontSize: '16px' }}>Loading 3D model...</div>
    </Html>
  );
}

export default function Page({ searchParams }) {
  const [design, setDesign] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  useEffect(() => {
    const id = searchParams && searchParams.designId;
    if (!id) {
      setLoading(false);
      return;
    }

    fetch(`/api/console/3d/designs/${id}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setDesign(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [searchParams && searchParams.designId]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Loading 3D design...</div>
      </div>
    );
  }

  if (!design) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>No design found. Pass ?designId=XXX to view.</div>
      </div>
    );
  }

  const cameraZ = Math.max(design.dimensions.width_mm, design.dimensions.height_mm) / 30 + 100;

  return (
    <Canvas
      ref={canvasRef}
      camera={{ position: [0, 0, cameraZ] }}
      style={{ height: '100vh', width: '100vw', background: '#f8f4f0' }}
    >
      <Suspense fallback={<LoadingFallback />}>
        <Window3D design={design} />
        <OrbitControls enablePan enableZoom enableRotate maxDistance={500} minDistance={50} />
      </Suspense>
    </Canvas>
  );
}
