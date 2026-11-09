// PostToolUse (Write|Edit): corre los tests de arquitectura tras tocar código fuente y avisa
// cuando el archivo editado es sensible (auth/cripto/rutas) para exigir la revisión OWASP.
const { execSync } = require('child_process');

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  const filePath = (input.tool_input?.file_path ?? '').replace(/\\/g, '/');
  const isSource = /\/(apps|packages)\/[^/]+\/src\/.*\.(ts|vue)$/.test(filePath);
  if (!isSource) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let message;
  try {
    execSync('bun test tests/architecture.spec.ts', {
      cwd: root,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    message = '✅ Architecture OK (tests/architecture.spec.ts)';
  } catch (e) {
    message = `❌ ARQUITECTURA VIOLADA — corregir antes de continuar:\n${e.stdout ?? ''}${e.stderr ?? e.message}`;
  }

  const sensitive =
    /(\/routes\/|\/middleware\/|session-store|rate-limiter|\/crypto\/|crypto-service|vault-service|secret-service|migrations|unit-of-work|config\.ts)/;
  if (sensitive.test(filePath)) {
    message +=
      '\n⚠️ Archivo sensible (auth/cripto/rutas/datos): correr la skill owasp-security-review antes de dar la tarea por terminada.';
  }

  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
    }),
  );
});
