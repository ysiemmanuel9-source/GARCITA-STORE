import * as THREE from "./vendor/three.module.js";

const canvas = document.getElementById("garcitaHero3d");
const shell = document.querySelector(".hero-logo");

if (canvas && shell) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.15, 8.2);

  scene.add(new THREE.AmbientLight(0xffe8d0, 0.62));

  const key = new THREE.PointLight(0xff2638, 4.6, 15);
  key.position.set(-3.8, 3.5, 4.5);
  scene.add(key);

  const rim = new THREE.PointLight(0xffd36a, 3.2, 14);
  rim.position.set(4, -2.4, 3.5);
  scene.add(rim);

  const blueFill = new THREE.PointLight(0x9dd7ff, 0.8, 11);
  blueFill.position.set(0, 3, -4);
  scene.add(blueFill);

  const logoGroup = new THREE.Group();
  scene.add(logoGroup);

  function makeLogoTexture() {
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 1600;
    textureCanvas.height = 1000;
    const ctx = textureCanvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, 1600, 1000);
    bg.addColorStop(0, "#350006");
    bg.addColorStop(0.42, "#070707");
    bg.addColorStop(1, "#52000b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1600, 1000);

    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 26; i += 1) {
      const x = (i * 137) % 1700 - 70;
      const y = (i * 89) % 1000;
      const len = 380 + (i % 6) * 42;
      ctx.strokeStyle = i % 3 === 0 ? "#ffd777" : "#ff2337";
      ctx.lineWidth = i % 3 === 0 ? 3 : 9;
      ctx.beginPath();
      ctx.moveTo(x, y + 250);
      ctx.lineTo(x + len, y - 70);
      ctx.stroke();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(800, 470, 60, 800, 470, 720);
    glow.addColorStop(0, "rgba(255, 52, 52, 0.95)");
    glow.addColorStop(0.34, "rgba(255, 0, 24, 0.32)");
    glow.addColorStop(1, "rgba(255, 0, 24, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1600, 1000);

    const frame = new Path2D("M135 210 L245 95 H1355 L1465 210 V790 L1355 905 H245 L135 790 Z");
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(5, 3, 4, 0.72)";
    ctx.fill(frame);
    ctx.lineWidth = 18;
    ctx.strokeStyle = "#ff2638";
    ctx.shadowColor = "#ff2638";
    ctx.shadowBlur = 28;
    ctx.stroke(frame);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#ffe29b";
    ctx.stroke(frame);

    function drawText(text, x, y, size, spacing, fill, strokeWidth = 8) {
      ctx.save();
      ctx.font = `900 ${size}px Impact, Arial Black, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = `${spacing}px`;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#120004";
      ctx.lineWidth = strokeWidth + 18;
      ctx.strokeText(text, x, y);
      ctx.strokeStyle = "#ffe8a6";
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = fill;
      ctx.shadowColor = "#ff2436";
      ctx.shadowBlur = 22;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    const redText = ctx.createLinearGradient(0, 180, 0, 760);
    redText.addColorStop(0, "#fff1ca");
    redText.addColorStop(0.16, "#ff4a4a");
    redText.addColorStop(0.48, "#bf0013");
    redText.addColorStop(0.82, "#ff3737");
    redText.addColorStop(1, "#690009");

    drawText("GS", 800, 410, 360, 0, redText, 9);
    drawText("GARCITA", 800, 660, 164, 4, redText, 7);

    const gold = ctx.createLinearGradient(0, 700, 1600, 850);
    gold.addColorStop(0, "#fff7bb");
    gold.addColorStop(0.5, "#d49a22");
    gold.addColorStop(1, "#fff2a1");
    drawText("STORE", 800, 790, 88, 14, gold, 5);

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffffff";
    for (const [x, y, r] of [[262, 168, 18], [1335, 185, 14], [291, 832, 12], [1275, 833, 20], [998, 188, 9]]) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }

  const logoTexture = makeLogoTexture();
  const frontMaterial = new THREE.MeshStandardMaterial({
    map: logoTexture,
    roughness: 0.35,
    metalness: 0.32
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: 0x3c0208,
    roughness: 0.28,
    metalness: 0.82,
    emissive: 0x160004,
    emissiveIntensity: 0.65
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xffd477,
    transparent: true,
    opacity: 0.8
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(5.45, 3.38, 0.42),
    [sideMaterial, sideMaterial, sideMaterial, sideMaterial, frontMaterial, sideMaterial]
  );
  logoGroup.add(body);

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(5.45, 3.38),
    new THREE.MeshStandardMaterial({
      color: 0x130104,
      roughness: 0.2,
      metalness: 0.75,
      emissive: 0x3c0008,
      emissiveIntensity: 0.8
    })
  );
  back.position.z = -0.218;
  back.rotation.y = Math.PI;
  logoGroup.add(back);

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), edgeMaterial);
  body.add(edges);

  const diamondMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.12,
    metalness: 0.2,
    emissive: 0xff2638,
    emissiveIntensity: 0.45
  });
  const diamondPositions = [
    [-3.25, 1.95, -0.45, 0.28],
    [3.2, 1.65, -0.15, 0.22],
    [-2.9, -1.7, 0.15, 0.18],
    [3.08, -1.78, -0.1, 0.32]
  ];
  const diamonds = diamondPositions.map(([x, y, z, scale]) => {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(scale, 1), diamondMaterial);
    gem.position.set(x, y, z);
    gem.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(gem);
    return gem;
  });

  const particleCount = 120;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 8.2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 5.3;
    positions[i * 3 + 2] = -2.6 - Math.random() * 2.2;
  }
  const particles = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
    new THREE.PointsMaterial({
      color: 0xff3044,
      size: 0.026,
      transparent: true,
      opacity: 0.75
    })
  );
  scene.add(particles);

  function resize() {
    const rect = shell.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();

  const clock = new THREE.Clock();
  function animate() {
    const t = clock.getElapsedTime();
    logoGroup.rotation.y = t * 0.62;
    logoGroup.rotation.x = Math.sin(t * 0.75) * 0.07;
    logoGroup.position.y = Math.sin(t * 1.4) * 0.08;
    particles.rotation.z = t * 0.025;
    for (const gem of diamonds) {
      gem.rotation.x += 0.012;
      gem.rotation.y += 0.018;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}
