declare module "three" {
  export class WebGLRenderer {
    constructor(options?: unknown);
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: unknown, camera: unknown): void;
    dispose(): void;
  }
  export class Scene {
    background: unknown;
    add(object: unknown): void;
  }
  export class Color {
    constructor(hex: number);
  }
  export class PerspectiveCamera {
    constructor(fov: number, aspect: number, near: number, far: number);
    up: Vector3;
    aspect: number;
    position: Vector3;
    updateProjectionMatrix(): void;
  }
  export class HemisphereLight {
    constructor(sky: number, ground: number, intensity: number);
  }
  export class DirectionalLight {
    constructor(color: number, intensity: number);
    position: { set(x: number, y: number, z: number): void };
  }
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): Vector3;
    clone(): Vector3;
    sub(v: Vector3): Vector3;
    add(v: Vector3): Vector3;
    copy(v: Vector3): Vector3;
    setFromSpherical(s: Spherical): Vector3;
  }
  export class Spherical {
    radius: number;
    phi: number;
    theta: number;
    setFromVector3(v: Vector3): Spherical;
  }
  export class Mesh {
    constructor(geometry: unknown, material: unknown);
    geometry: { dispose(): void };
  }
  export class MeshStandardMaterial {
    constructor(options?: unknown);
  }
  export class GridHelper {
    constructor(size: number, divisions: number, colorCenterLine: number, colorGrid: number);
    rotation: { x: number };
    dispose(): void;
  }
}

declare module "three/addons/controls/OrbitControls.js" {
import type { Vector3 } from "three";
  export class OrbitControls {
    constructor(camera: unknown, element: HTMLElement);
    enableDamping: boolean;
    target: Vector3;
    update(): void;
    dispose(): void;
  }
}

declare module "three/addons/loaders/STLLoader.js" {
  export class STLLoader {
    loadAsync(url: string): Promise<{
      computeVertexNormals(): void;
      computeBoundingBox(): void;
      boundingBox: { min: { z: number }; getCenter(target: unknown): { x: number; y: number; z: number }; getSize(target: unknown): { x: number; y: number; z: number } } | null;
      translate(x: number, y: number, z: number): void;
      dispose(): void;
    }>;
  }
}
