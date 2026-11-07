import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { settingsForApi } from "../../../planner.mjs";
import { usePlanner } from "../store";

export function Viewer() {
  const { viewer, closeViewer, state } = usePlanner();
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [loadError, setLoadError] = useState("");
  const [exportNote, setExportNote] = useState<{ text: string; bad?: boolean }>({ text: "" });
  const file = viewer?.file || "";
  const open = !!viewer;

  // Focus the dialog on open, hand focus back on close, and let Escape dismiss it.
  useEffect(() => {
    if (open) {
      if (!restoreFocus.current) restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeButton.current?.focus();
      const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeViewer(); };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
    if (restoreFocus.current) {
      restoreFocus.current.focus();
      restoreFocus.current = null;
    }
    return undefined;
  }, [open, closeViewer]);
  useEffect(() => {
    const node = canvas.current;
    if (!node || !file) return;
    const renderer = new THREE.WebGLRenderer({ canvas: node, antialias: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1c1e);
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, node);
    cameraRef.current = camera;
    controlsRef.current = controls;
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
    }).catch(() => { if (!stop) setLoadError("Could not load this part's STL. The file may be missing from the archive."); });
    draw();
    return () => {
      stop = true;
      cancelAnimationFrame(frame);
      controls.dispose();
      renderer.dispose();
      mesh?.geometry.dispose();
    };
  }, [file, viewer?.color]);
  useEffect(() => { setLoadError(""); setExportNote({ text: "" }); }, [file]);
  const orbitBy = (dAzimuth: number, dPolar: number, zoom = 1) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    // Spherical assumes Y-up; this scene is Z-up, so swap Y/Z around the conversion.
    const swapped = new THREE.Vector3(offset.x, offset.z, offset.y);
    const spherical = new THREE.Spherical().setFromVector3(swapped);
    spherical.theta += dAzimuth;
    spherical.phi = Math.min(Math.PI * 0.95, Math.max(0.05, spherical.phi + dPolar));
    spherical.radius = Math.max(1, spherical.radius * zoom);
    const next = new THREE.Vector3().setFromSpherical(spherical);
    camera.position.copy(controls.target).add(new THREE.Vector3(next.x, next.z, next.y));
    controls.update();
  };
  const trapTab = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab" || !dialog.current) return;
    const focusables = [...dialog.current.querySelectorAll<HTMLElement>("button, canvas[tabindex]")].filter((node) => !node.hasAttribute("disabled"));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  if (!viewer) return null;
  const download = () => {
    const link = document.createElement("a");
    link.href = `/stl/${encodeURIComponent(viewer.file)}`;
    link.download = viewer.file.split(/[/\\]/).pop() || "part.stl";
    link.click();
  };
  const runExportPart = async () => {
    setExportNote({ text: "Exporting this part…" });
    try {
      const payload = await exportPart(viewer.file, viewer.label, state.settings);
      setExportNote({ text: payload.warning || "One-part 3MF downloaded.", bad: !!payload.warning });
    } catch (error) {
      setExportNote({ text: error instanceof Error ? error.message : "Export failed.", bad: true });
    }
  };
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={viewer.label} ref={dialog} onKeyDown={trapTab}>
      <div className="bar">
        <strong>{viewer.label}</strong>
        <span className="note">drag to orbit · wheel to zoom · arrow keys orbit when the view is focused</span>
        {exportNote.text ? <span className={exportNote.bad ? "bad" : "note"} role={exportNote.bad ? "alert" : "status"}>{exportNote.text}</span> : null}
        <button type="button" className="btn" onClick={download}>Download STL</button>
        <button type="button" className="btn" onClick={() => { void runExportPart(); }}>Export this part</button>
        <button type="button" className="btn" ref={closeButton} onClick={closeViewer}>Close</button>
      </div>
      {loadError ? <p className="bad" role="alert">{loadError}</p> : null}
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label={`3D view of ${viewer.label}. Arrow keys orbit, plus and minus zoom.`}
        onKeyDown={(event) => {
          const step = Math.PI / 12;
          if (event.key === "ArrowLeft") { event.preventDefault(); orbitBy(step, 0); }
          else if (event.key === "ArrowRight") { event.preventDefault(); orbitBy(-step, 0); }
          else if (event.key === "ArrowUp") { event.preventDefault(); orbitBy(0, -step); }
          else if (event.key === "ArrowDown") { event.preventDefault(); orbitBy(0, step); }
          else if (event.key === "+" || event.key === "=") { event.preventDefault(); orbitBy(0, 0, 0.85); }
          else if (event.key === "-") { event.preventDefault(); orbitBy(0, 0, 1.18); }
        }}
      />
    </div>
  );
}

async function exportPart(file: string, name: string, settings: unknown): Promise<{ download?: string; warning?: string }> {
  const response = await fetch("/api/export_part", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, name, settings: settingsForApi(settings), role: "main" }),
  });
  const payload = await response.json() as { download?: string; warning?: string; error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!payload.download) throw new Error("Export returned no file.");
  const link = document.createElement("a");
  link.href = payload.download;
  link.download = payload.download;
  link.click();
  return payload;
}
