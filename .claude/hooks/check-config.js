// PostToolUse (Write|Edit): tras editar tsconfig/package.json/bunfig/eslint, valida con typecheck.
const { execSync } = require('child_process');

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  const filePath = (input.tool_input?.file_path ?? '').replace(/\\/g, '/');
  if (!/(tsconfig(\.base)?\.json|package\.json|bunfig\.toml|eslint\.config\.mjs)$/.test(filePath)) {
    process.exit(0);
  }

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let message;
  try {
    execSync('bun run typecheck', { cwd: root, encoding: 'utf-8', stdio: 'pipe' });
    message = `✅ typecheck OK tras editar ${filePath}`;
  } catch (e) {
    message = `❌ typecheck FALLÓ tras editar ${filePath}:\n${e.stdout ?? ''}${e.stderr ?? e.message}`;
  }
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
    }),
  );
});
