#!/usr/bin/env node
// scripts/test-db-connection.js
// ============================================
// SCRIPT DE DIAGNÓSTICO DE POSTGRESQL
// Ejecutar: node scripts/test-db-connection.js
// ============================================

import 'dotenv/config';
import pg from 'pg';
import { createLogger } from '../src/utils/Logger.js';

const { Pool } = pg;
const logger = createLogger('db-test');

// Colores para output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function printHeader(text) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}${text}${colors.reset}`);
  console.log('='.repeat(60) + '\n');
}

function printSuccess(text) {
  console.log(`${colors.green}✅ ${text}${colors.reset}`);
}

function printError(text) {
  console.log(`${colors.red}❌ ${text}${colors.reset}`);
}

function printWarning(text) {
  console.log(`${colors.yellow}⚠️  ${text}${colors.reset}`);
}

function printInfo(text) {
  console.log(`${colors.blue}ℹ️  ${text}${colors.reset}`);
}

async function testConnection() {
  printHeader('🔍 DIAGNÓSTICO DE POSTGRESQL');
  
  // ========================================
  // PASO 1: VERIFICAR VARIABLES DE ENTORNO
  // ========================================
  
  console.log('📋 Verificando configuración de variables de entorno:\n');
  
  const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 5432,
    ssl: process.env.DB_SSL === 'true'
  };
  
  let hasErrors = false;
  
  if (!config.host) {
    printError('DB_HOST no está configurado');
    hasErrors = true;
  } else {
    printSuccess(`DB_HOST: ${config.host}`);
  }
  
  if (!config.user) {
    printError('DB_USER no está configurado');
    hasErrors = true;
  } else {
    printSuccess(`DB_USER: ${config.user}`);
  }
  
  if (!config.password) {
    printError('DB_PASSWORD no está configurado');
    hasErrors = true;
  } else {
    printSuccess(`DB_PASSWORD: ${'*'.repeat(config.password.length)} (${config.password.length} caracteres)`);
  }
  
  if (!config.database) {
    printError('DB_NAME no está configurado');
    hasErrors = true;
  } else {
    printSuccess(`DB_NAME: ${config.database}`);
  }
  
  printSuccess(`DB_PORT: ${config.port}`);
  printSuccess(`DB_SSL: ${config.ssl ? 'Habilitado' : 'Deshabilitado'}`);
  
  if (hasErrors) {
    console.log('\n');
    printError('Hay errores en la configuración. Por favor, verifica tu archivo .env');
    printInfo('Formato correcto:');
    console.log('  DB_HOST=tu-host.com');
    console.log('  DB_USER=tu_usuario');
    console.log('  DB_PASSWORD=tu_password');
    console.log('  DB_NAME=tu_database');
    console.log('  DB_PORT=5432');
    console.log('  DB_SSL=true');
    process.exit(1);
  }
  
  // ========================================
  // PASO 2: PROBAR CONEXIÓN BÁSICA
  // ========================================
  
  printHeader('🔌 PROBANDO CONEXIÓN A POSTGRESQL');
  
  const pool = new Pool({
    ...config,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    max: 1 // Solo una conexión para el test
  });
  
  pool.on('error', (err) => {
    logger.error('Pool error:', err);
  });
  
  try {
    console.log(`Intentando conectar a ${config.host}:${config.port}...`);
    const startTime = Date.now();
    
    const client = await pool.connect();
    const elapsed = Date.now() - startTime;
    
    printSuccess(`Conexión establecida en ${elapsed}ms\n`);
    
    // ========================================
    // PASO 3: EJECUTAR QUERIES DE PRUEBA
    // ========================================
    
    printHeader('🧪 EJECUTANDO QUERIES DE PRUEBA');
    
    try {
      // Query 1: Version
      console.log('1️⃣  Obteniendo versión de PostgreSQL...');
      const versionResult = await client.query('SELECT version()');
      const version = versionResult.rows[0].version;
      printSuccess(`Versión: ${version.split(',')[0]}\n`);
      
      // Query 2: Current time
      console.log('2️⃣  Verificando hora del servidor...');
      const timeResult = await client.query('SELECT NOW() as current_time');
      const serverTime = new Date(timeResult.rows[0].current_time);
      printSuccess(`Hora del servidor: ${serverTime.toISOString()}\n`);
      
      // Query 3: Database size
      console.log('3️⃣  Obteniendo tamaño de la base de datos...');
      const sizeResult = await client.query(
        `SELECT pg_size_pretty(pg_database_size($1)) as size`,
        [config.database]
      );
      printSuccess(`Tamaño de ${config.database}: ${sizeResult.rows[0].size}\n`);
      
      // Query 4: Active connections
      console.log('4️⃣  Verificando conexiones activas...');
      const connectionsResult = await client.query(
        `SELECT count(*) as active_connections 
         FROM pg_stat_activity 
         WHERE datname = $1`,
        [config.database]
      );
      printSuccess(`Conexiones activas: ${connectionsResult.rows[0].active_connections}\n`);
      
      // Query 5: Verificar tablas del bot
      console.log('5️⃣  Buscando tablas del bot...');
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      if (tablesResult.rows.length === 0) {
        printWarning('No se encontraron tablas. ¿Es una base de datos nueva?');
        printInfo('Ejecuta las migraciones: npm run migrate');
      } else {
        printSuccess(`${tablesResult.rows.length} tablas encontradas:`);
        tablesResult.rows.forEach(row => {
          console.log(`   - ${row.table_name}`);
        });
      }
      
      console.log('');
      
    } catch (queryError) {
      printError(`Error ejecutando queries: ${queryError.message}`);
      console.log(queryError);
    } finally {
      client.release();
    }
    
    // ========================================
    // PASO 4: TEST DE PERFORMANCE
    // ========================================
    
    printHeader('⚡ TEST DE PERFORMANCE');
    
    console.log('Ejecutando 10 queries simples...');
    const perfStart = Date.now();
    
    for (let i = 0; i < 10; i++) {
      await pool.query('SELECT 1');
    }
    
    const perfElapsed = Date.now() - perfStart;
    const avgTime = perfElapsed / 10;
    
    printSuccess(`Total: ${perfElapsed}ms`);
    printSuccess(`Promedio: ${avgTime.toFixed(2)}ms por query\n`);
    
    if (avgTime > 100) {
      printWarning('Latencia alta detectada (>100ms). Posibles causas:');
      console.log('  - Red lenta');
      console.log('  - Servidor sobrecargado');
      console.log('  - Base de datos en región lejana');
    } else if (avgTime > 50) {
      printInfo('Latencia aceptable pero no óptima (50-100ms)');
    } else {
      printSuccess('Latencia excelente (<50ms)');
    }
    
    // ========================================
    // RESULTADO FINAL
    // ========================================
    
    printHeader('✅ DIAGNÓSTICO COMPLETADO');
    
    printSuccess('PostgreSQL está funcionando correctamente');
    console.log('');
    printInfo('Resumen de conexión:');
    console.log(`  Host: ${config.host}:${config.port}`);
    console.log(`  Database: ${config.database}`);
    console.log(`  User: ${config.user}`);
    console.log(`  SSL: ${config.ssl ? 'Sí' : 'No'}`);
    console.log(`  Latencia promedio: ${avgTime.toFixed(2)}ms`);
    console.log('');
    
    printSuccess('El bot debería poder conectarse sin problemas');
    console.log('');
    
    process.exit(0);
    
  } catch (error) {
    console.log('');
    printError('NO SE PUDO CONECTAR A POSTGRESQL\n');
    
    console.log(`${colors.red}Error Details:${colors.reset}`);
    console.log(`  Type: ${error.code || 'Unknown'}`);
    console.log(`  Message: ${error.message}\n`);
    
    // Diagnóstico específico por tipo de error
    printHeader('💡 DIAGNÓSTICO Y SOLUCIONES');
    
    switch (error.code) {
      case 'ECONNREFUSED':
        printError('Conexión rechazada');
        console.log('\nPosibles causas:');
        console.log('  1️⃣  PostgreSQL no está corriendo en el servidor');
        console.log('  2️⃣  Firewall bloqueando el puerto 5432');
        console.log('  3️⃣  PostgreSQL no está escuchando en la IP correcta\n');
        
        console.log('Soluciones sugeridas:');
        console.log('  ✅ Verificar que PostgreSQL esté corriendo:');
        console.log('     $ sudo systemctl status postgresql');
        console.log('');
        console.log('  ✅ Verificar configuración de listen_addresses:');
        console.log('     $ sudo nano /etc/postgresql/XX/main/postgresql.conf');
        console.log('     listen_addresses = \'*\'');
        console.log('');
        console.log('  ✅ Verificar firewall:');
        console.log('     $ sudo ufw allow 5432/tcp');
        break;
      
      case 'ETIMEDOUT':
        printError('Timeout de conexión');
        console.log('\nPosibles causas:');
        console.log('  1️⃣  Latencia de red muy alta');
        console.log('  2️⃣  Firewall filtrando paquetes');
        console.log('  3️⃣  Host incorrecto o inalcanzable\n');
        
        console.log('Soluciones sugeridas:');
        console.log('  ✅ Verificar latencia:');
        console.log(`     $ ping ${config.host}`);
        console.log('');
        console.log('  ✅ Verificar conectividad:');
        console.log(`     $ telnet ${config.host} ${config.port}`);
        console.log('');
        console.log('  ✅ Aumentar timeout en el código:');
        console.log('     connectionTimeoutMillis: 10000  // 10 segundos');
        break;
      
      case 'ENOTFOUND':
        printError('Host no encontrado');
        console.log('\nPosibles causas:');
        console.log('  1️⃣  DB_HOST incorrecto en .env');
        console.log('  2️⃣  Problema de DNS\n');
        
        console.log('Soluciones sugeridas:');
        console.log('  ✅ Verificar DB_HOST en .env:');
        console.log(`     Actual: ${config.host}`);
        console.log('');
        console.log('  ✅ Verificar DNS:');
        console.log(`     $ nslookup ${config.host}`);
        console.log('');
        console.log('  ✅ Intentar con IP directa:');
        console.log('     DB_HOST=192.168.1.100');
        break;
      
      case 'EAUTH':
      case '28P01':
        printError('Autenticación fallida');
        console.log('\nPosibles causas:');
        console.log('  1️⃣  Usuario o contraseña incorrectos');
        console.log('  2️⃣  Usuario sin permisos en la base de datos\n');
        
        console.log('Soluciones sugeridas:');
        console.log('  ✅ Verificar credenciales:');
        console.log(`     $ psql -h ${config.host} -U ${config.user} -d ${config.database}`);
        console.log('');
        console.log('  ✅ Resetear contraseña (como postgres):');
        console.log(`     ALTER USER ${config.user} WITH PASSWORD 'nueva_password';`);
        console.log('');
        console.log('  ✅ Dar permisos:');
        console.log(`     GRANT ALL PRIVILEGES ON DATABASE ${config.database} TO ${config.user};`);
        break;
      
      default:
        printWarning('Error desconocido');
        console.log('\nInformación del error:');
        console.log(error);
        console.log('\nIntenta:');
        console.log('  1️⃣  Verificar todas las variables en .env');
        console.log('  2️⃣  Probar conexión manual con psql');
        console.log('  3️⃣  Revisar logs de PostgreSQL en el servidor');
    }
    
    console.log('\n');
    printHeader('🔄 MODO DE EMERGENCIA');
    
    console.log('Si necesitas que el bot funcione mientras arreglas PostgreSQL:\n');
    console.log('1. Edita .env y agrega:');
    console.log(`   ${colors.yellow}DB_DISABLED=true${colors.reset}`);
    console.log('');
    console.log('2. Reinicia el bot:');
    console.log('   $ npm start');
    console.log('');
    console.log('El bot funcionará en modo LOCAL (solo SQLite).');
    console.log('Cuando PostgreSQL esté listo, cambia DB_DISABLED=false');
    console.log('');
    
    process.exit(1);
    
  } finally {
    await pool.end();
  }
}

// Ejecutar
testConnection().catch(error => {
  console.error('Error inesperado:', error);
  process.exit(1);
});