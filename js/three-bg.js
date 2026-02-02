/**
 * Three.js 3D Particle Background Effect
 * A stunning, interactive particle system with wave animations
 * and mouse-reactive camera movement.
 */

// Import Three.js from CDN (use ES modules)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Configuration
const CONFIG = {
  particleCount: 5000,
  particleSize: 2.5,
  fieldWidth: 200,
  fieldHeight: 200,
  fieldDepth: 150,
  waveAmplitude: 15,
  waveFrequency: 0.02,
  waveSpeed: 0.0008,
  mouseInfluence: 0.00008,
  cameraSmoothness: 0.05,
  cameraDistance: 100,
  cameraMovementRange: 30,
  colorStart: new THREE.Color(0x8b5cf6), // Purple
  colorEnd: new THREE.Color(0x3b82f6),   // Blue
  colorMid: new THREE.Color(0x06b6d4),   // Cyan accent
};

let scene, camera, renderer, particles;
let mouseX = 0, mouseY = 0;
let targetCameraX = 0, targetCameraY = 0;
let time = 0;
let animationId = null;
let isInitialized = false;

/**
 * Initialize the Three.js background
 * @param {string} containerId - Optional container element ID (defaults to body)
 */
function initThreeBackground(containerId = null) {
  if (isInitialized) {
    console.warn('Three.js background already initialized');
    return;
  }

  // Setup scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a1a, 0.003);

  // Setup camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = CONFIG.cameraDistance;

  // Setup renderer
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a0a1a, 1);

  // Style the canvas
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.zIndex = '-1';
  renderer.domElement.style.pointerEvents = 'none';

  // Add to container or body
  const container = containerId ? document.getElementById(containerId) : document.body;
  if (container) {
    container.insertBefore(renderer.domElement, container.firstChild);
  }

  // Create particles
  createParticles();

  // Add ambient lighting effect (subtle glow)
  addAmbientEffects();

  // Event listeners
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('resize', onWindowResize, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });

  isInitialized = true;

  // Start animation
  animate();

  console.log('✨ Three.js particle background initialized');
}

/**
 * Create the particle system using BufferGeometry for performance
 */
function createParticles() {
  const geometry = new THREE.BufferGeometry();
  
  // Arrays for particle attributes
  const positions = new Float32Array(CONFIG.particleCount * 3);
  const colors = new Float32Array(CONFIG.particleCount * 3);
  const sizes = new Float32Array(CONFIG.particleCount);
  const randomness = new Float32Array(CONFIG.particleCount * 3);

  for (let i = 0; i < CONFIG.particleCount; i++) {
    const i3 = i * 3;

    // Position - spread across the field
    positions[i3] = (Math.random() - 0.5) * CONFIG.fieldWidth;
    positions[i3 + 1] = (Math.random() - 0.5) * CONFIG.fieldHeight;
    positions[i3 + 2] = (Math.random() - 0.5) * CONFIG.fieldDepth;

    // Store randomness for wave animation
    randomness[i3] = Math.random() * Math.PI * 2;     // Phase offset
    randomness[i3 + 1] = Math.random() * 0.5 + 0.5;   // Speed multiplier
    randomness[i3 + 2] = Math.random() * 0.5 + 0.5;   // Amplitude multiplier

    // Color gradient based on position
    const t = (positions[i3 + 1] + CONFIG.fieldHeight / 2) / CONFIG.fieldHeight;
    const color = new THREE.Color();
    
    if (t < 0.5) {
      color.lerpColors(CONFIG.colorStart, CONFIG.colorMid, t * 2);
    } else {
      color.lerpColors(CONFIG.colorMid, CONFIG.colorEnd, (t - 0.5) * 2);
    }

    // Add some variation
    const variation = Math.random() * 0.2 - 0.1;
    colors[i3] = Math.min(1, Math.max(0, color.r + variation));
    colors[i3 + 1] = Math.min(1, Math.max(0, color.g + variation));
    colors[i3 + 2] = Math.min(1, Math.max(0, color.b + variation));

    // Size variation
    sizes[i] = CONFIG.particleSize * (Math.random() * 0.5 + 0.5);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('randomness', new THREE.BufferAttribute(randomness, 3));

  // Custom shader material for better visuals
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: renderer.getPixelRatio() },
      mousePos: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: `
      attribute float size;
      attribute vec3 randomness;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float time;
      uniform vec2 mousePos;
      
      void main() {
        vColor = color;
        
        vec3 pos = position;
        
        // Wave animation
        float waveX = sin(pos.x * ${CONFIG.waveFrequency} + time * randomness.y + randomness.x) * ${CONFIG.waveAmplitude} * randomness.z;
        float waveZ = cos(pos.z * ${CONFIG.waveFrequency} + time * randomness.y * 0.7 + randomness.x) * ${CONFIG.waveAmplitude} * 0.5;
        
        pos.y += waveX;
        pos.z += waveZ;
        
        // Mouse influence
        float mouseInfluence = 1.0 - smoothstep(0.0, 100.0, length(pos.xy - mousePos * 50.0));
        pos.z += mouseInfluence * 20.0;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        
        // Size attenuation
        gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
        gl_PointSize = max(gl_PointSize, 1.0);
        
        // Alpha based on depth
        vAlpha = smoothstep(200.0, 50.0, -mvPosition.z);
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      
      void main() {
        // Soft circular particle
        vec2 center = gl_PointCoord - 0.5;
        float dist = length(center);
        
        if (dist > 0.5) discard;
        
        // Soft glow effect
        float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
        
        // Add subtle bloom/glow
        vec3 glowColor = vColor * 1.5;
        vec3 finalColor = mix(vColor, glowColor, smoothstep(0.3, 0.0, dist));
        
        gl_FragColor = vec4(finalColor, alpha * 0.8);
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

/**
 * Add ambient effects (optional secondary particle layer)
 */
function addAmbientEffects() {
  // Add a subtle dust layer
  const dustGeometry = new THREE.BufferGeometry();
  const dustCount = 1000;
  const dustPositions = new Float32Array(dustCount * 3);

  for (let i = 0; i < dustCount; i++) {
    const i3 = i * 3;
    dustPositions[i3] = (Math.random() - 0.5) * CONFIG.fieldWidth * 1.5;
    dustPositions[i3 + 1] = (Math.random() - 0.5) * CONFIG.fieldHeight * 1.5;
    dustPositions[i3 + 2] = (Math.random() - 0.5) * CONFIG.fieldDepth * 1.5;
  }

  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

  const dustMaterial = new THREE.PointsMaterial({
    color: 0x4a5568,
    size: 1,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);
}

/**
 * Handle mouse movement
 */
function onMouseMove(event) {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
}

/**
 * Handle touch movement for mobile
 */
function onTouchMove(event) {
  if (event.touches.length > 0) {
    mouseX = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
  }
}

/**
 * Handle window resize
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  if (particles && particles.material.uniforms) {
    particles.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
  }
}

/**
 * Animation loop
 */
function animate() {
  animationId = requestAnimationFrame(animate);
  
  time += CONFIG.waveSpeed * 1000;

  // Update shader uniforms
  if (particles && particles.material.uniforms) {
    particles.material.uniforms.time.value = time;
    particles.material.uniforms.mousePos.value.set(mouseX, mouseY);
  }

  // Smooth camera movement following mouse
  targetCameraX = mouseX * CONFIG.cameraMovementRange;
  targetCameraY = mouseY * CONFIG.cameraMovementRange * 0.5;

  camera.position.x += (targetCameraX - camera.position.x) * CONFIG.cameraSmoothness;
  camera.position.y += (targetCameraY - camera.position.y) * CONFIG.cameraSmoothness;
  
  // Subtle camera rotation
  camera.rotation.x = -mouseY * 0.05;
  camera.rotation.y = -mouseX * 0.05;

  // Gentle particle system rotation
  if (particles) {
    particles.rotation.y += 0.0001;
    particles.rotation.x = Math.sin(time * 0.1) * 0.02;
  }

  renderer.render(scene, camera);
}

/**
 * Cleanup function
 */
function destroyThreeBackground() {
  if (!isInitialized) return;

  // Stop animation
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Remove event listeners
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('resize', onWindowResize);
  window.removeEventListener('touchmove', onTouchMove);

  // Dispose of Three.js objects
  if (particles) {
    particles.geometry.dispose();
    particles.material.dispose();
    scene.remove(particles);
  }

  // Remove canvas
  if (renderer && renderer.domElement && renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  if (renderer) {
    renderer.dispose();
  }

  scene = null;
  camera = null;
  renderer = null;
  particles = null;
  isInitialized = false;

  console.log('Three.js particle background destroyed');
}

/**
 * Pause animation (for performance when tab is not visible)
 */
function pauseThreeBackground() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

/**
 * Resume animation
 */
function resumeThreeBackground() {
  if (isInitialized && !animationId) {
    animate();
  }
}

// Auto-pause when tab is not visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseThreeBackground();
  } else {
    resumeThreeBackground();
  }
});

// Export functions
export {
  initThreeBackground,
  destroyThreeBackground,
  pauseThreeBackground,
  resumeThreeBackground,
  CONFIG as ThreeBackgroundConfig
};

// Also make available globally for non-module usage
if (typeof window !== 'undefined') {
  window.initThreeBackground = initThreeBackground;
  window.destroyThreeBackground = destroyThreeBackground;
  window.pauseThreeBackground = pauseThreeBackground;
  window.resumeThreeBackground = resumeThreeBackground;
}
