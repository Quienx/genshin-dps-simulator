'use client';

import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { AdditiveBlending, Color, ShaderMaterial } from 'three';

type StarProps = {
  position?: [number, number, number];
  radius?: number;
  color?: string;
  intensity?: number;
};

export default function Star({
  position = [0, 0, 0],
  radius = 5,
  color = '#4dd9ff',
  intensity = 3,
}: StarProps) {
  const surfaceRef = useRef<ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (surfaceRef.current) {
      surfaceRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <group position={position}>
      {/* Turbulent plasma surface */}
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        <shaderMaterial
          ref={surfaceRef}
          toneMapped={false}
          uniforms={{
            uTime: { value: 0 },
            uColor: { value: new Color(color) },
          }}
          vertexShader={`
            varying vec3 vPos;
            varying vec3 vNormal;
            void main() {
              vPos = position;
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uTime;
            uniform vec3 uColor;
            varying vec3 vPos;
            varying vec3 vNormal;

            float hash(vec3 p) {
              return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
            }

            float noise(vec3 x) {
              vec3 p = floor(x);
              vec3 f = fract(x);
              f = f * f * (3.0 - 2.0 * f);
              float n000 = hash(p);
              float n100 = hash(p + vec3(1, 0, 0));
              float n010 = hash(p + vec3(0, 1, 0));
              float n110 = hash(p + vec3(1, 1, 0));
              float n001 = hash(p + vec3(0, 0, 1));
              float n101 = hash(p + vec3(1, 0, 1));
              float n011 = hash(p + vec3(0, 1, 1));
              float n111 = hash(p + vec3(1, 1, 1));
              return mix(
                mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
                f.z
              );
            }

            // Turbulent fbm — folded noise gives the "flowing plasma energy" look
            float turbulence(vec3 p) {
              float v = 0.0;
              float a = 0.5;
              for (int i = 0; i < 5; i++) {
                v += a * abs(noise(p) - 0.5) * 2.0;
                p = p * 2.0 + vec3(0.13, 0.21, 0.07);
                a *= 0.55;
              }
              return v;
            }

            void main() {
              vec3 p = normalize(vPos) * 2.2;
              float t = uTime * 0.22;
              float energy = turbulence(p + vec3(t, t * 0.5, -t * 0.7));
              float swirl = turbulence(p * 1.8 - vec3(t * 0.3, t * 0.6, t * 0.2));
              float heat = clamp(1.0 - (energy * 0.7 + swirl * 0.4), 0.0, 1.0);

              // Cyan plasma palette
              vec3 deep = uColor * 0.25;
              vec3 mid = uColor;
              vec3 hot = mix(uColor, vec3(1.0), 0.9);

              vec3 col = mix(deep, mid, smoothstep(0.15, 0.55, heat));
              col = mix(col, hot, smoothstep(0.55, 0.95, heat));

              // Edge fresnel — use the star color, NOT white
              float fres = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.5);
              col += uColor * fres * 0.7;

              gl_FragColor = vec4(col, 1.0);
            }
          `}
        />
      </mesh>

      {/* Volumetric glow — multi-layer billboard */}
      <Billboard>
        <mesh>
          <planeGeometry args={[radius * 12, radius * 12]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
            uniforms={{ uColor: { value: new Color(color) } }}
            vertexShader={`
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              uniform vec3 uColor;
              varying vec2 vUv;
              void main() {
                vec2 c = vUv - 0.5;
                float d = length(c);

                // Four-layer volumetric bloom
                float core  = exp(-d * 28.0) * 1.6;   // tight white-hot
                float inner = exp(-d * 10.0) * 0.55;  // mid halo
                float outer = exp(-d * 3.5)  * 0.22;  // wide atmospheric
                float far   = exp(-d * 1.2)  * 0.07;  // very wide ambient
                float total = core + inner + outer + far;

                if (total < 0.003) discard;

                // Color: white at center → star color outward
                vec3 col = mix(vec3(1.0), uColor, smoothstep(0.0, 0.18, d));
                gl_FragColor = vec4(col, 1.0) * total;
              }
            `}
          />
        </mesh>
      </Billboard>

      <pointLight
        color={color}
        intensity={intensity * radius * radius}
        distance={600}
        decay={2}
      />
    </group>
  );
}
