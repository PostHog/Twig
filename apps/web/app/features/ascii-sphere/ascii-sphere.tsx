"use client";

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { AsciiEffect } from "three/examples/jsm/effects/AsciiEffect.js";

const CHAR_SET = " .:-+*=%@#";
const RESOLUTION = 0.2;
const MAX_PARTICLES = 1000;
const PARTICLE_COUNT = 500;
const BOUNDS = 800;
const BOUNDS_HALF = BOUNDS / 2;
const MIN_DISTANCE = 150;
const MAX_CONNECTIONS = 20;

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const bg = styles.getPropertyValue("--bg").trim();
  const fg = styles.getPropertyValue("--fg").trim();
  const isDark = document.documentElement.classList.contains("dark");
  return { bg, fg, isDark };
}

interface ParticleData {
  velocity: THREE.Vector3;
  numConnections: number;
}

export function AsciiSphere() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const init = useCallback((container: HTMLDivElement) => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const { bg, fg, isDark } = getThemeColors();

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 4000);
    camera.position.z = 1750;

    const scene = new THREE.Scene();

    const group = new THREE.Group();
    scene.add(group);

    const helper = new THREE.BoxHelper(
      new THREE.Mesh(new THREE.BoxGeometry(BOUNDS, BOUNDS, BOUNDS)),
    );
    (helper.material as THREE.LineBasicMaterial).color.setHex(0x474747);
    (helper.material as THREE.LineBasicMaterial).blending =
      THREE.AdditiveBlending;
    (helper.material as THREE.LineBasicMaterial).transparent = true;
    group.add(helper);

    const segments = MAX_PARTICLES * MAX_PARTICLES;
    const linePositions = new Float32Array(segments * 3);
    const lineColors = new Float32Array(segments * 3);

    const particlePositions = new Float32Array(MAX_PARTICLES * 3);
    const particlesData: ParticleData[] = [];

    for (let i = 0; i < MAX_PARTICLES; i++) {
      particlePositions[i * 3] = Math.random() * BOUNDS - BOUNDS_HALF;
      particlePositions[i * 3 + 1] = Math.random() * BOUNDS - BOUNDS_HALF;
      particlePositions[i * 3 + 2] = Math.random() * BOUNDS - BOUNDS_HALF;
      particlesData.push({
        velocity: new THREE.Vector3(
          -1 + Math.random() * 2,
          -1 + Math.random() * 2,
          -1 + Math.random() * 2,
        ),
        numConnections: 0,
      });
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setDrawRange(0, PARTICLE_COUNT);
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );

    const pointCloud = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 3,
        blending: THREE.AdditiveBlending,
        transparent: true,
        sizeAttenuation: false,
      }),
    );
    group.add(pointCloud);

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(linePositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    lineGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage),
    );
    lineGeometry.computeBoundingSphere();
    lineGeometry.setDrawRange(0, 0);

    const linesMesh = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
      }),
    );
    group.add(linesMesh);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);

    const effect = new AsciiEffect(renderer, CHAR_SET, {
      invert: !isDark,
      resolution: RESOLUTION,
    });
    effect.setSize(width, height);
    effect.domElement.style.color = fg;
    effect.domElement.style.backgroundColor = bg;

    container.appendChild(effect.domElement);

    let frameId: number;

    function animate() {
      let vertexPos = 0;
      let colorPos = 0;
      let numConnected = 0;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particlesData[i].numConnections = 0;
      }

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const pd = particlesData[i];

        particlePositions[i * 3] += pd.velocity.x;
        particlePositions[i * 3 + 1] += pd.velocity.y;
        particlePositions[i * 3 + 2] += pd.velocity.z;

        if (
          particlePositions[i * 3] < -BOUNDS_HALF ||
          particlePositions[i * 3] > BOUNDS_HALF
        )
          pd.velocity.x = -pd.velocity.x;
        if (
          particlePositions[i * 3 + 1] < -BOUNDS_HALF ||
          particlePositions[i * 3 + 1] > BOUNDS_HALF
        )
          pd.velocity.y = -pd.velocity.y;
        if (
          particlePositions[i * 3 + 2] < -BOUNDS_HALF ||
          particlePositions[i * 3 + 2] > BOUNDS_HALF
        )
          pd.velocity.z = -pd.velocity.z;

        if (pd.numConnections >= MAX_CONNECTIONS) continue;

        for (let j = i + 1; j < PARTICLE_COUNT; j++) {
          const pdB = particlesData[j];
          if (pdB.numConnections >= MAX_CONNECTIONS) continue;

          const dx = particlePositions[i * 3] - particlePositions[j * 3];
          const dy =
            particlePositions[i * 3 + 1] - particlePositions[j * 3 + 1];
          const dz =
            particlePositions[i * 3 + 2] - particlePositions[j * 3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < MIN_DISTANCE) {
            pd.numConnections++;
            pdB.numConnections++;

            const alpha = 1.0 - dist / MIN_DISTANCE;

            linePositions[vertexPos++] = particlePositions[i * 3];
            linePositions[vertexPos++] = particlePositions[i * 3 + 1];
            linePositions[vertexPos++] = particlePositions[i * 3 + 2];
            linePositions[vertexPos++] = particlePositions[j * 3];
            linePositions[vertexPos++] = particlePositions[j * 3 + 1];
            linePositions[vertexPos++] = particlePositions[j * 3 + 2];

            lineColors[colorPos++] = alpha;
            lineColors[colorPos++] = alpha;
            lineColors[colorPos++] = alpha;
            lineColors[colorPos++] = alpha;
            lineColors[colorPos++] = alpha;
            lineColors[colorPos++] = alpha;

            numConnected++;
          }
        }
      }

      lineGeometry.setDrawRange(0, numConnected * 2);
      lineGeometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.color.needsUpdate = true;
      particleGeometry.attributes.position.needsUpdate = true;

      const time = Date.now() * 0.001;
      group.rotation.y = time * 0.1;

      effect.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      effect.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.clear();
      if (effect.domElement.parentNode) {
        effect.domElement.parentNode.removeChild(effect.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reinit = () => {
      cleanupRef.current?.();
      cleanupRef.current = init(container);
    };

    reinit();

    const observer = new MutationObserver(reinit);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [init]);

  return <div ref={containerRef} className="h-full w-full" />;
}
