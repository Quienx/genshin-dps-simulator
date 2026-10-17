'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  ShaderMaterial,
  Vector3,
} from 'three';

type PlanetProps = {
  position?: [number, number, number];
  radius?: number;
  oceanColor?: string;
  landColor?: string;
  atmosphereColor?: string;
  rotationSpeed?: number;
  starPosition?: [number, number, number];
};

// Shared GLSL noise functions
const noiseGLSL = `
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

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.0 + vec3(0.11, 0.23, 0.07);
      a *= 0.5;
    }
    return v;
  }
`;

export default function Planet({
  position = [20, 0, 0],
  radius = 3,
  oceanColor = '#0a3d6f',
  landColor = '#3d6b4a',
  atmosphereColor = '#5fbfff',
  rotationSpeed = 0.05,
  starPosition = [0, 0, 0],
}: PlanetProps) {
  const rotationRef = useRef<Group>(null);
  const surfaceRef = useRef<ShaderMaterial>(null);
  const cloudsRef = useRef<ShaderMaterial>(null);

  const uStarPos = useMemo(() => new Vector3(...starPosition), [starPosition]);

  useFrame(({ clock }) => {
    if (rotationRef.current) {
      rotationRef.current.rotation.y = clock.elapsedTime * rotationSpeed;
    }
    if (surfaceRef.current) {
      surfaceRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
    if (cloudsRef.current) {
      cloudsRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <group position={position}>
      {/* Rotating surface + clouds */}
      <group ref={rotationRef}>
        {/* Surface */}
        <mesh>
          <sphereGeometry args={[radius, 96, 96]} />
          <shaderMaterial
            ref={surfaceRef}
            uniforms={{
              uTime: { value: 0 },
              uStarPos: { value: uStarPos },
              uOcean: { value: new Color(oceanColor) },
              uLand: { value: new Color(landColor) },
              uAtmo: { value: new Color(atmosphereColor) },
            }}
            vertexShader={`
              varying vec3 vWorldPos;
              varying vec3 vWorldNormal;
              varying vec3 vLocalPos;
              void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                vLocalPos = position;
                gl_Position = projectionMatrix * viewMatrix * wp;
              }
            `}
            fragmentShader={`
              uniform float uTime;
              uniform vec3 uStarPos;
              uniform vec3 uOcean;
              uniform vec3 uLand;
              uniform vec3 uAtmo;
              varying vec3 vWorldPos;
              varying vec3 vWorldNormal;
              varying vec3 vLocalPos;
              ${noiseGLSL}
              void main() {
                vec3 p = normalize(vLocalPos);

                // Continents (low-frequency)
                float continents = fbm(p * 1.8);
                float landMask = smoothstep(0.48, 0.56, continents);

                // Terrain detail
                float detail = fbm(p * 6.0) * 0.15;
                float ridge = abs(noise(p * 12.0) - 0.5) * 0.2;

                vec3 ocean = uOcean + vec3(0.0, 0.02, 0.05) * fbm(p * 4.0) * 0.3;
                vec3 land = uLand * (1.0 + detail) + vec3(ridge) * landMask;
                vec3 surface = mix(ocean, land, landMask);

                // Polar caps
                float pole = smoothstep(0.72, 0.92, abs(p.y));
                surface = mix(surface, vec3(0.92, 0.95, 0.98), pole);

                // Lighting from star
                vec3 lightDir = normalize(uStarPos - vWorldPos);
                float NdotL = dot(vWorldNormal, lightDir);
                // Soft terminator — wraps light slightly past 90°
                float wrap = clamp((NdotL + 0.1) / 1.1, 0.0, 1.0);
                float lit = pow(wrap, 0.85);
                float ambient = 0.03;

                vec3 col = surface * (lit + ambient);

                // Atmospheric scattering on the lit side (Rayleigh-like)
                vec3 viewDir = normalize(cameraPosition - vWorldPos);
                float fres = pow(1.0 - max(0.0, dot(vWorldNormal, viewDir)), 4.0);
                col += uAtmo * fres * max(0.0, NdotL) * 0.55;

                gl_FragColor = vec4(col, 1.0);
              }
            `}
          />
        </mesh>

        {/* Clouds */}
        <mesh>
          <sphereGeometry args={[radius * 1.015, 64, 64]} />
          <shaderMaterial
            ref={cloudsRef}
            transparent
            depthWrite={false}
            uniforms={{
              uTime: { value: 0 },
              uStarPos: { value: uStarPos },
            }}
            vertexShader={`
              varying vec3 vWorldPos;
              varying vec3 vWorldNormal;
              varying vec3 vLocalPos;
              void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                vLocalPos = position;
                gl_Position = projectionMatrix * viewMatrix * wp;
              }
            `}
            fragmentShader={`
              uniform float uTime;
              uniform vec3 uStarPos;
              varying vec3 vWorldPos;
              varying vec3 vWorldNormal;
              varying vec3 vLocalPos;
              ${noiseGLSL}
              void main() {
                vec3 p = normalize(vLocalPos);
                float t = uTime * 0.015;
                // Layered cloud noise drifting
                float c1 = fbm(p * 2.5 + vec3(t, 0.0, 0.0));
                float c2 = fbm(p * 5.0 - vec3(t * 0.6, 0.0, t * 0.4));
                float clouds = c1 * 0.65 + c2 * 0.35;
                float alpha = smoothstep(0.52, 0.72, clouds);

                vec3 lightDir = normalize(uStarPos - vWorldPos);
                float NdotL = max(0.0, dot(vWorldNormal, lightDir));
                float lit = pow(NdotL, 0.7) + 0.12;

                gl_FragColor = vec4(vec3(1.0) * lit, alpha * lit);
              }
            `}
          />
        </mesh>
      </group>

      {/* Atmosphere halo (does not rotate) */}
      <mesh>
        <sphereGeometry args={[radius * 1.1, 64, 64]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          side={BackSide}
          uniforms={{
            uStarPos: { value: uStarPos },
            uAtmo: { value: new Color(atmosphereColor) },
          }}
          vertexShader={`
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            void main() {
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              vWorldNormal = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `}
          fragmentShader={`
            uniform vec3 uStarPos;
            uniform vec3 uAtmo;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            void main() {
              // Flip normal for backside rendering
              vec3 n = -vWorldNormal;
              vec3 viewDir = normalize(cameraPosition - vWorldPos);
              float fres = pow(1.0 - max(0.0, dot(n, viewDir)), 3.0);

              // Brighter on the lit side
              vec3 lightDir = normalize(uStarPos - vWorldPos);
              float NdotL = max(0.0, dot(n, lightDir));
              float glow = fres * (NdotL * 0.85 + 0.18);

              gl_FragColor = vec4(uAtmo, 1.0) * glow;
            }
          `}
        />
      </mesh>
    </group>
  );
}
