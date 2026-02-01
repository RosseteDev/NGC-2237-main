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
  
  background: {
    // Usa imagen si existe, sino color sólido
    imagePath: path.join(__dirname, '../../../assets/backgrounds/welcome.jpg'),
    fallbackColor: '#36393f',
    // Opcional: overlay oscuro sobre la imagen
    overlay: {
      enabled: true,
      color: 'rgba(0, 0, 0, 0.3)'
    }
  },
  
  avatar: {
    size: 180,
    position: 'center', // 'center', 'left', 'right', o { x: number, y: number }
    customPosition: { x: 400, y: 200 }, // { x: 100, y: 110 } para posición manual
    border: {
      enabled: true,
      width: 6,
      color: '#ffffff'
    }
  },
  
  title: {
    text: '¡BIENVENIDO!',
    font: {
      family: 'Roboto',
      size: 50,
      weight: 'bold'
    },
    color: '#ffffff',
    position: { x: 'center', y: 70}, 
    shadow: {
      enabled: true,
      blur: 10,
      color: 'rgba(0, 0, 0, 0.7)',
      offsetX: 0,
      offsetY: 4
    }
  },
  
  username: {
    font: {
      family: 'Roboto',
      size: 28,
      weight: 'bold'
    },
    color: '#ffffff',
    position: { x: 'center', y: -75 }, // Negativo = desde abajo
    maxWidth: 600, 
    shadow: {
      enabled: true,
      blur: 8,
      color: 'rgba(0, 0, 0, 0.7)',
      offsetX: 0,
      offsetY: 3
    }
  },
  
  welcomeText: {
    font: {
      family: 'Roboto',
      size: 24,
      weight: 'normal'
    },
    color: '#cccccc',
    position: { x: 'center', y: -35 }, // Negativo = desde abajo
    maxWidth: 650,
    lineHeight: 1.3,
    shadow: {
      enabled: false,
      blur: 5,
      color: 'rgba(0, 0, 0, 0.5)',
      offsetX: 0,
      offsetY: 2
    }
  },
  
  fonts: {
    // Agregar más fuentes aquí
    roboto: {
      path: path.join(__dirname, '../../../assets/fonts/Roboto-Bold.ttf'),
      family: 'Roboto'
    }
    // custom: {
    //   path: path.join(__dirname, '../../../assets/fonts/Custom.ttf'),
    //   family: 'CustomFont'
    // }
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
 * @param {string} welcomeText - Mensaje personalizado
 * @param {object} overrides - Sobrescribe CONFIG temporalmente
 * @returns {Promise<Buffer>}
 */
export async function generateWelcomeImage(username, avatarUrl, welcomeText, overrides = {}) {
  // Merge config con overrides
  const config = mergeConfig(CONFIG, overrides);
  
  const { width, height } = config.canvas;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  try {
    // 1. Fondo
    await drawBackground(ctx, config, width, height);
    
    // 2. Avatar
    await drawAvatar(ctx, config, avatarUrl, width, height);
    
    // 3. Título
    drawTitle(ctx, config, width, height);
    
    // 4. Username
    drawUsername(ctx, config, username, width, height);
    
    // 5. Mensaje de bienvenida
    drawWelcomeText(ctx, config, welcomeText, width, height);

    return canvas.toBuffer('image/png');
    
  } catch (error) {
    console.error('[ERROR] generateWelcomeImage:', error);
    throw error;
  }
}

/**
 * Dibuja el fondo (imagen o color)
 */
async function drawBackground(ctx, config, width, height) {
  const { imagePath, fallbackColor, overlay } = config.background;
  
  // Intentar cargar imagen
  if (fs.existsSync(imagePath)) {
    try {
      const bg = await loadImage(imagePath);
      ctx.drawImage(bg, 0, 0, width, height);
      
      // Overlay oscuro opcional
      if (overlay.enabled) {
        ctx.fillStyle = overlay.color;
        ctx.fillRect(0, 0, width, height);
      }
      return;
    } catch (err) {
      console.warn('[WARN] Error loading background image:', err.message);
    }
  }
  
  // Fallback a color sólido
  ctx.fillStyle = fallbackColor;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Dibuja el avatar circular con borde opcional
 */
async function drawAvatar(ctx, config, avatarUrl, width, height) {
  const { size, position, customPosition, border } = config.avatar;
  
  // Calcular posición
  let x, y;
  if (customPosition) {
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
    // Fallback: círculo azul Discord
    ctx.fillStyle = '#7289da';
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Dibuja el título
 */
function drawTitle(ctx, config, width, height) {
  const { text, font, color, position, shadow } = config.title;
  
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

  ctx.fillText(text, x, y);
  
  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Dibuja el username con truncamiento
 */
function drawUsername(ctx, config, username, width, height) {
  const { font, color, position, maxWidth, shadow } = config.username;
  
  ctx.font = `${font.weight} ${font.size}px ${font.family}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const x = position.x === 'center' ? width / 2 : position.x;
  const y = position.y < 0 ? height + position.y : position.y;

  // Truncar si es muy largo
  let displayName = username;
  let textWidth = ctx.measureText(displayName).width;
  
  if (textWidth > maxWidth) {
    while (textWidth > maxWidth - 30 && displayName.length > 0) {
      displayName = displayName.slice(0, -1);
      textWidth = ctx.measureText(displayName + '...').width;
    }
    displayName += '...';
  }

  // Sombra
  if (shadow.enabled) {
    ctx.shadowBlur = shadow.blur;
    ctx.shadowColor = shadow.color;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }

  ctx.fillText(displayName, x, y);
  
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