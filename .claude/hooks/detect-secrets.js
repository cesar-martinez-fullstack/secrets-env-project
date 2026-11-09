// PreToolUse (Write|Edit): bloquea credenciales hardcodeadas y la escritura de datos de la bóveda.
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  const filePath = (input.tool_input?.file_path ?? '').replace(/\\/g, '/');
  const content = input.tool_input?.content ?? input.tool_input?.new_string ?? '';

  // Los datos reales de la bóveda y el .env jamás deben tocarse con herramientas de edición.
  if (/(^|\/)data\/|\.db(-wal|-shm)?$|(^|\/)\.env(\.local)?$/.test(filePath)) {
    console.error(
      `BLOQUEADO: ${filePath} contiene datos/secretos reales de la bóveda. No se edita con herramientas del agente.`,
    );
    process.exit(2);
  }

  if (!content) process.exit(0);
  if (/\.claude\/hooks\//.test(filePath)) process.exit(0);
  if (/\.(spec|test)\.ts$|\/tests\/|\.env\.example$|\.md$/.test(filePath)) process.exit(0);

  const patterns = [
    [/AKIA[0-9A-Z]{16}/, 'posible AWS access key'],
    [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'posible JWT hardcodeado'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'posible clave privada'],
    [
      /(api[_-]?key|secret|password|token|masterPassword)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
      'posible credencial hardcodeada',
    ],
    [
      /(postgres|mysql|mongodb)(\+srv)?:\/\/[^:\s]+:[^@\s]+@/i,
      'connection string con credenciales',
    ],
  ];

  for (const [pattern, reason] of patterns) {
    if (pattern.test(content)) {
      console.error(
        `BLOQUEADO en ${filePath}: ${reason}. Usa variables de entorno (.env) en vez de hardcodear.`,
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
