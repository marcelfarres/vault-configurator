import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { usePlanner } from "../store";

export function Viewer() {
  const { viewer, closeViewer, state } = usePlanner();
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = viewer?.file || "";
  useEffect(() => {
    const node = canvas.current;
    if (!node || !file) return;
    const renderer = new THREE.WebGLRenderer({ canvas: node, antialias: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1c1e);
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, node);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(1, 2, 3);
    scene.add(key);
    let frame = 0;
    let stop = false;
    const draw = () => {
      if (stop) return;
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (node.width !== width || node.height !== height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(1, height);
        camera.updateProjectionMatrix();
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    const loader = new STLLoader();
    let mesh: THREE.Mesh | null = null;
    void loader.loadAsync(`/stl/${encodeURIComponent(file)}`).then((geometry) => {
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -box.min.z);
      mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: viewer?.color || "#c9ccd0", metalness: 0.05, roughness: 0.6 }));
      scene.add(mesh);
      const radius = Math.max(size.x, size.y, size.z);
      camera.position.set(radius * 1.2, -radius * 1.4, radius);
      controls.target.set(0, 0, size.z / 2);
      controls.update();
    }).catch(() => undefined);
    draw();
    return () => {
      stop = true;
      cancelAnimationFrame(frame);
      controls.dispose();
      renderer.dispose();
      mesh?.geometry.dispose();
    };
  }, [file, viewer?.color]);
  if (!viewer) return null;
  const download = () => {
    const link = document.createElement("a");
    link.href = `/stl/${encodeURIComponent(viewer.file)}`;
    link.download = viewer.file.split(/[/\\]/).pop() || "part.stl";
    link.click();
  };
  return (
    <div className="viewer" role="dialog" aria-label={viewer.label}>
      <div className="bar">
        <strong>{viewer.label}</strong>
        <span className="note">drag to orbit · wheel to zoom</span>
        <button type="button" className="btn" onClick={download}>Download STL</button>
        <button type="button" className="btn" onClick={() => void exportPart(viewer.file, viewer.label, state.settings)}>Export this part</button>
        <button type="button" className="btn" onClick={closeViewer}>Close</button>
      </div>
      <canvas ref={canvas} />
    </div>
  );
}

async function exportPart(file: string, name: string, settings: unknown) {
  const response = await fetch("/api/export_part", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, name, settings, role: "main" }),
  });
  const payload = await response.json() as { download?: string; error?: string };
  if (payload.download) {
    const link = document.createElement("a");
    link.href = payload.download;
    link.download = payload.download;
    link.click();
  }
}
