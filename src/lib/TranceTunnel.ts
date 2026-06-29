import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

interface TunnelOpts {
  rings: number;
  tubes: number;
  speed: number;
  dieSpeed: number;
}

interface RingData {
  mesh: THREE.InstancedMesh;
  vertices: THREE.Vector3[];
  r: number;
  zStep: number;
  movement: number;
}

export class TranceTunnel {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private time: number;
  private items: RingData[];
  private opts: TunnelOpts;
  private angle: number;
  private y: number;
  private rafId: number | null;
  private boundUpdate: () => void;
  private boundResize: () => void;

  constructor(container: HTMLElement, opts: Partial<TunnelOpts> = {}) {
    this.time = 0;
    this.items = [];
    this.rafId = null;
    this.opts = Object.assign({ rings: 5, tubes: 14, speed: 1.0, dieSpeed: 0.02 }, opts);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 400);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.9,
      0.1,
      0.1
    );
    this.composer.addPass(bloom);

    this.angle = 0;
    this.y = 0;

    container.style.overflow = "hidden";

    this._createMesh();

    this.boundUpdate = this._update.bind(this);
    this.boundResize = this._resize.bind(this);
    window.addEventListener("resize", this.boundResize);
    this.rafId = requestAnimationFrame(this.boundUpdate);
  }

  private _createMesh(): void {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (let r = 0; r < this.opts.rings; r++) {
      const color = new THREE.Color(0xcc9258);
      color.offsetHSL(0, -Math.random() * 0.1, Math.random() * 0.2 - 0.1);

      const mesh = new THREE.InstancedMesh(geom, mat, this.opts.tubes);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);

      const data: RingData = {
        mesh,
        vertices: [],
        r,
        zStep: Math.random() * 0.005 + 0.005,
        movement: Math.random() * 0.01 + 0.01,
      };

      for (let i = 0; i < this.opts.tubes; i++) {
        const radius = Math.sqrt(320 - r * r * 8);
        const angle = (Math.PI * 2) / this.opts.tubes * i;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const z = r * 4 - 40;

        data.vertices.push(new THREE.Vector3(x, y, z));
        data.vertices.push(new THREE.Vector3(0, (Math.PI * 2) / this.opts.tubes * i, 0));

        mesh.setColorAt(i, color);
      }

      mesh.userData = data;
      this.items.push(data);
    }
  }

  private _updateMesh(): void {
    const dummy = new THREE.Object3D();
    const matrix = new THREE.Matrix4();

    this.items.forEach((item, j) => {
      const mesh = item.mesh;
      const { vertices, r } = mesh.userData as RingData;

      const theta = Math.atan2(vertices[0].x, vertices[0].y);

      for (let i = 0; i < this.opts.tubes; i++) {
        const v = vertices[i * 2].clone();

        v.applyAxisAngle(
          new THREE.Vector3(0, 0, 1),
          (Math.PI / 180) * (this.time * 50 * this.opts.speed + r * 10)
        );

        v.z += ((this.time * this.opts.speed * 60) % 12) - 6;

        const offset = 2;
        const glitchFreq = 0.04;
        const ditherAmt = 0.015;

        const ringOffset = j * offset;
        const ditherX = Math.abs(v.x + ringOffset);
        const ditherY = Math.abs(v.y + ringOffset);
        const ditherZ = Math.abs(v.z + ringOffset);
        const dither =
          Math.sin(ditherX * glitchFreq) *
          Math.cos(ditherY * glitchFreq) *
          Math.sin(ditherZ * glitchFreq);

        if (dither > ditherAmt) {
          matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, matrix);
          continue;
        }

        const scale = Math.pow(
          Math.sin(
            ((this.time * this.opts.speed * this.opts.dieSpeed + r / 5 + i / 10000) *
              Math.PI *
              2) %
              Math.PI
          ),
          2
        );

        if (scale <= 0.001) {
          matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, matrix);
          continue;
        }

        dummy.position.copy(v);
        dummy.rotation.set(
          vertices[i * 2 + 1].x,
          vertices[i * 2 + 1].y,
          theta + this.time * 10 + i
        );
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  private _updateCamera(): void {
    this.angle = Math.sin(this.time * 0.5 * this.opts.speed) * 0.6;
    this.camera.position.set(
      Math.cos(this.angle) * 60,
      this.y,
      Math.sin(this.angle) * 60
    );
    this.camera.position.applyAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.sin(this.time * 0.2 * this.opts.speed) * 0.3
    );
    this.camera.rotation.z = Math.PI / 2 + Math.cos(this.time * 0.4 * this.opts.speed) * 0.2;
  }

  private _update(): void {
    this.time += 0.01;
    this._updateMesh();
    this._updateCamera();
    this.composer.render();
    this.rafId = requestAnimationFrame(this.boundUpdate);
  }

  private _resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    window.removeEventListener("resize", this.boundResize);
    this.renderer.dispose();
    this.composer.dispose();
    this.scene.clear();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
