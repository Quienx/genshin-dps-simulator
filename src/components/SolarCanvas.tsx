'use client';

import { Grid, MapControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { ShaderMaterial, Vector2 } from 'three';

import Planet from './Planet';
import Star from './Star';

function StarsBackdrop() {
  const matRef = useRef<ShaderMaterial>(null);

  useFrame(({ camera, size }) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uCameraXZ.value.set(
      camera.position.x,
      camera.position.z
    );
    matRef.current.uniforms.uAspect.value = size.width / size.height;
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1000}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthTest={false}
        depthWrite={false}
        uniforms={{
          uCameraXZ: { value: new Vector2() },
          uAspect: { value: 1 },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            // bypass camera matrices — render full-screen quad in NDC
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec2 uCameraXZ;
          uniform float uAspect;
          varying vec2 vUv;

          // hash that keeps inputs bounded → stable at large camera offsets
          float hash(vec2 p) {
            p = mod(p, 256.0);
            p = fract(p * vec2(443.8975, 397.2973));
            p += dot(p, p + 19.19);
            return fract(p.x * p.y);
          }

          float starLayer(vec2 uv, float scale, float density, float brightness) {
            vec2 p = uv * scale;
            vec2 cell = floor(p);
            vec2 f = fract(p);
            float h = hash(cell);
            if (h > density) return 0.0;
            vec2 starPos = vec2(hash(cell + 11.7), hash(cell + 37.3)) * 0.6 + 0.2;
            float d = length(f - starPos);
            float sizeJitter = 0.025 + h * 0.02;
            return smoothstep(sizeJitter, 0.0, d) * brightness;
          }

          void main() {
            vec2 uv = vUv;
            uv.x *= uAspect;

            // parallax: world units → uv-space shift, tiny factor = distant feel
            vec2 parallax = uCameraXZ * 0.002;

            float stars = 0.0;
            // three layers at different scales and parallax strengths → depth feel
            stars += starLayer(uv + parallax * 1.0, 120.0, 0.06, 1.0);
            stars += starLayer(uv + parallax * 0.6 + vec2(0.31, 0.77), 70.0, 0.04, 0.7);
            stars += starLayer(uv + parallax * 0.3 + vec2(0.83, 0.19), 40.0, 0.025, 0.45);

            gl_FragColor = vec4(vec3(stars), stars);
          }
        `}
      />
    </mesh>
  );
}

export default function SolarCanvas() {
  return (
    <div className='fixed inset-0'>
      <Canvas
        camera={{
          position: [0, 40, 30],
          fov: 50,
          near: 0.1,
          far: 5000,
        }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 5]} intensity={0.6} />

        <StarsBackdrop />

        <Grid
          args={[1, 1]}
          infiniteGrid
          followCamera
          cellSize={5}
          cellThickness={0.6}
          cellColor='#1f2937'
          sectionSize={50}
          sectionThickness={1.2}
          sectionColor='#374151'
          fadeDistance={800}
          fadeFrom={1}
          fadeStrength={2}
        />

        <MapControls
          enableRotate={false}
          enableDamping={false}
          minDistance={15}
          maxDistance={200}
          makeDefault
        />

        <group name='world'>
          <Star position={[0, 0, 0]} radius={5} color='#4dd9ff' intensity={3} />
          <Planet position={[25, 0, 0]} radius={3} starPosition={[0, 0, 0]} />
        </group>
      </Canvas>
    </div>
  );
}
