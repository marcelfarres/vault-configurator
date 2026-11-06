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
    up: { set(x: number, y: number, z: number): void };
    aspect: number;
    position: { set(x: number, y: number, z: number): void };
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
    x: number;
    y: number;
    z: number;
  }
  export class Mesh {
    constructor(geometry: unknown, material: unknown);
    geometry: { dispose(): void };
  }
  export class MeshStandardMaterial {
    constructor(options?: unknown);
  }
}

declare module "three/addons/controls/OrbitControls.js" {
  export class OrbitControls {
    constructor(camera: unknown, element: HTMLElement);
    enableDamping: boolean;
    target: { set(x: number, y: number, z: number): void };
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
