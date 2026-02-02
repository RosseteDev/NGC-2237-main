// src/bot/utils/welcomeImage.js
import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIG - Toda la personalización en un solo lugar
const CONFIG = {
  canvas: {
    width: 800,
    height: 400
  },
  
  // Gradientes según género (reemplaza background con imagen)
  gradients: {
    male: {
      type: 'linear', // 'linear' o 'radial'
      colors: ['#4A90E2', '#2E5F8D', '#1A3A5C'], // Azul degradado
      angle: 135, // Diagonal en grados
      overlay: { enabled: true, color: 'rgba(0, 0, 0, 0.2)' }
    },
    female: {
      type: 'linear',
      colors: ['#E91E63', '#C2185B', '#880E4F'], // Rosa/magenta degradado
      angle: 135,
      overlay: { enabled: true, color: 'rgba(0, 0, 0, 0.2)' }
    },
    nonbinary: {
      type: 'linear',
      colors: ['#9C27B0', '#7B1FA2', '#4A148C'], // Púrpura degradado
      angle: 135,
      overlay: { enabled: true, color: 'rgba(0, 0, 0, 0.2)' }
    },
    neutral: {
      type: 'granular', // Tipo especial para fondo granulado
      baseColor: '#4A4A4A',
      grainSize: 2,
      grainDensity: 0.3,
      noiseIntensity: 0.1,
      overlay: { enabled: false }
    }
  },
  
  avatar: {
    size: 180,
    position: 'center', // 'center', 'left', 'right'
    customPosition: { x: 400, y: 200 },
    border: {
      enabled: true,
      width: 6,
      color: '#ffffff'
    }
  },
  
  title: {
    font: {
      family: 'Libre Baskerville',
      size: 50,
      weight: 'bold'
    },
    color: '#ffffff',
    position: { x: 'center', y: 70 }, 
    shadow: {
      enabled: true,
      blur: 10,
      color: 'rgba(0, 0, 0, 0.7)',
      offsetX: 0,
      offsetY: 4
    }
  },
  
  welcomeText: {
    font: {
      family: 'Libre Baskerville',
      size: 24,
      weight: 'normal'
    },
    color: '#cccccc',
    position: { x: 'center', y: -70 },
    maxWidth: 650,
    lineHeight: 1.3,
    shadow: {
      enabled: true,
      blur: 5,
      color: 'rgba(0, 0, 0, 0.5)',
      offsetX: 0,
      offsetY: 2
    }
  },
  
  fonts: {
    roboto: {
      path: path.join(__dirname, '../../../assets/fonts/Roboto-Bold.ttf'),
      family: 'Roboto'
    },
    baskerville: {
      path: path.join(__dirname, '../../../assets/fonts/LibreBaskerville-Bold.ttf'),
      family: 'Libre Baskerville'
    }
  }
};

// Registrar fuentes
try {
  Object.values(CONFIG.fonts).forEach(font => {
    if (fs.existsSync(font.path)) {
      registerFont(font.path, { family: font.family });
    } else {
      console.warn(`[WARN] Font not found: ${font.path}`);
    }
  });
} catch (err) {
  console.error('[ERROR] Font registration failed:', err);
}

/**
 * Genera imagen de bienvenida personalizada
 * @param {string} username - Nombre del usuario
 * @param {string} avatarUrl - URL del avatar
 * @param {string} welcomeText - Mensaje personalizado (ya interpolado)
 * @param {string} title - Título de bienvenida (viene de i18n)
 * @param {object} options - Opciones adicionales
 * @param {string} options.imageVariant - 'male', 'female', 'nonbinary', 'neutral'
 * @returns {Promise<Buffer>}
 */
export async function generateWelcomeImage(username, avatarUrl, welcomeText, title, options = {}) {
  // Extraer variante de género
  const { imageVariant = 'neutral' } = options;
  
  // Validar variante
  const validVariants = ['male', 'female', 'nonbinary', 'neutral'];
  const variant = validVariants.includes(imageVariant) ? imageVariant : 'neutral';
  
  // Merge config con overrides si existen
  const overrides = options.overrides || {};
  const config = mergeConfig(CONFIG, overrides);
  
  const { width, height } = config.canvas;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  try {
    // 1. Fondo con gradiente o granulado según variante
    drawGradientBackground(ctx, config, variant, width, height);
    
    // 2. Avatar
    await drawAvatar(ctx, config, avatarUrl, width, height);
    
    // 3. Título
    drawTitle(ctx, config, title, width, height);
    
    // 4. Mensaje de bienvenida
    drawWelcomeText(ctx, config, welcomeText, width, height);

    return canvas.toBuffer('image/png');
    
  } catch (error) {
    console.error('[ERROR] generateWelcomeImage:', error);
    throw error;
  }
}

/**
 * Dibuja el fondo con gradiente o textura granulada
 */
function drawGradientBackground(ctx, config, variant, width, height) {
  const gradientConfig = config.gradients[variant] || config.gradients.neutral;
  
  if (gradientConfig.type === 'granular') {
    // Fondo granulado grisáceo para neutral
    drawGranularBackground(ctx, gradientConfig, width, height);
  } else {
    // Gradiente de colores
    drawColorGradient(ctx, gradientConfig, width, height);
  }
}

/**
 * Dibuja un gradiente de colores
 */
function drawColorGradient(ctx, gradientConfig, width, height) {
  const { colors, angle, overlay, type } = gradientConfig;
  
  let gradient;
  
  if (type === 'radial') {
    // Gradiente radial desde el centro
    gradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.max(width, height) / 2
    );
  } else {
    // Gradiente lineal con ángulo
    const angleRad = (angle * Math.PI) / 180;
    const x1 = width / 2 - Math.cos(angleRad) * width / 2;
    const y1 = height / 2 - Math.sin(angleRad) * height / 2;
    const x2 = width / 2 + Math.cos(angleRad) * width / 2;
    const y2 = height / 2 + Math.sin(angleRad) * height / 2;
    
    gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  }
  
  // Agregar colores al gradiente
  const step = 1 / (colors.length - 1);
  colors.forEach((color, index) => {
    gradient.addColorStop(index * step, color);
  });
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Overlay oscuro opcional
  if (overlay.enabled) {
    ctx.fillStyle = overlay.color;
    ctx.fillRect(0, 0, width, height);
  }
}

/**
 * Dibuja un fondo granulado grisáceo
 */
function drawGranularBackground(ctx, config, width, height) {
  const { baseColor, grainSize, grainDensity, noiseIntensity } = config;
  
  // 1. Base grisácea
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);
  
  // 2. Gradiente sutil para profundidad
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(60, 60, 60, 0.3)');
  gradient.addColorStop(0.5, 'rgba(74, 74, 74, 0.1)');
  gradient.addColorStop(1, 'rgba(50, 50, 50, 0.3)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // 3. Textura granulada (partículas)
  const grainCount = Math.floor((width * height * grainDensity) / (grainSize * grainSize));
  
  for (let i = 0; i < grainCount; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const brightness = Math.random() * 60 - 30; // -30 a +30
    const alpha = Math.random() * 0.15 + 0.05; // 0.05 a 0.2
    
    ctx.fillStyle = `rgba(${128 + brightness}, ${128 + brightness}, ${128 + brightness}, ${alpha})`;
    ctx.fillRect(x, y, grainSize, grainSize);
  }
  
  // 4. Ruido fino adicional (píxel por píxel)
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.random() < noiseIntensity) {
      const noise = Math.random() * 20 - 10;
      pixels[i] = Math.max(0, Math.min(255, pixels[i] + noise));     // R
      pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + noise)); // G
      pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + noise)); // B
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Dibuja el avatar circular con borde opcional
 */
async function drawAvatar(ctx, config, avatarUrl, width, height) {
  const { size, position, customPosition, border } = config.avatar;
  
  // Calcular posición
  let x, y;
  if (customPosition && position === 'custom') {
    x = customPosition.x;
    y = customPosition.y;
  } else {
    switch (position) {
      case 'left':
        x = size / 2 + 50;
        y = height / 2;
        break;
      case 'right':
        x = width - size / 2 - 50;
        y = height / 2;
        break;
      case 'center':
      default:
        x = width / 2;
        y = height / 2;
    }
  }

  try {
    const avatar = await loadImage(avatarUrl);
    const radius = size / 2;

    // Borde
    if (border.enabled) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius + border.width, 0, Math.PI * 2);
      ctx.fillStyle = border.color;
      ctx.fill();
      ctx.restore();
    }

    // Avatar circular
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, x - radius, y - radius, size, size);
    ctx.restore();
    
  } catch (err) {
    console.error('[ERROR] Error loading avatar:', err.message);
    // Fallback: círculo azul Discord con inicial
    const radius = size / 2;
    ctx.fillStyle = '#7289da';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Añadir inicial del nombre
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size / 2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatarUrl.charAt(0).toUpperCase(), x, y);
  }
}

/**
 * Dibuja el título
 */
function drawTitle(ctx, config, titleText, width, height) {
  const { font, color, position, shadow } = config.title;
  
  ctx.font = `${font.weight} ${font.size}px ${font.family}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const x = position.x === 'center' ? width / 2 : position.x;
  const y = position.y < 0 ? height + position.y : position.y;

  // Sombra
  if (shadow.enabled) {
    ctx.shadowBlur = shadow.blur;
    ctx.shadowColor = shadow.color;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }

  ctx.fillText(titleText, x, y);
  
  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Dibuja el texto de bienvenida con word wrap
 */
function drawWelcomeText(ctx, config, text, width, height) {
  const { font, color, position, maxWidth, lineHeight, shadow } = config.welcomeText;
  
  ctx.font = `${font.weight} ${font.size}px ${font.family}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const x = position.x === 'center' ? width / 2 : position.x;
  const y = position.y < 0 ? height + position.y : position.y;

  // Word wrap
  const lines = wrapText(ctx, text, maxWidth);

  // Sombra
  if (shadow.enabled) {
    ctx.shadowBlur = shadow.blur;
    ctx.shadowColor = shadow.color;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }

  lines.forEach((line, index) => {
    const offsetY = index * font.size * lineHeight;
    ctx.fillText(line, x, y + offsetY);
  });
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Divide texto en líneas
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  
  lines.push(currentLine);
  return lines;
}

/**
 * Merge recursivo de configuración
 */
function mergeConfig(base, overrides) {
  const result = JSON.parse(JSON.stringify(base));
  
  Object.keys(overrides).forEach(key => {
    if (typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
      result[key] = { ...result[key], ...overrides[key] };
    } else {
      result[key] = overrides[key];
    }
  });
  
  return result;
}

/**
 * Exporta config actual (útil para debugging)
 */
export function getConfig() {
  return JSON.parse(JSON.stringify(CONFIG));
}

/**
 * Permite modificar CONFIG en runtime
 */
export function updateConfig(newConfig) {
  Object.keys(newConfig).forEach(key => {
    if (typeof newConfig[key] === 'object' && !Array.isArray(newConfig[key])) {
      CONFIG[key] = { ...CONFIG[key], ...newConfig[key] };
    } else {
      CONFIG[key] = newConfig[key];
    }
  });
}