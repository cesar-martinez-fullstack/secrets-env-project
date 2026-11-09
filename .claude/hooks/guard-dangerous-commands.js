// PreToolUse (Bash): bloquea comandos destructivos o que saltan las barreras del proyecto.
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  const cmd = input.tool_input?.command ?? '';

  const rules = [
    [/--no-verify/, '--no-verify salta los hooks de Husky (pre-commit/commit-msg/pre-push)'],
    [
      (c) => /\bgit\s+push\b/.test(c) && /(--force(-with-lease)?\b|(^|\s)-f\b)/.test(c),
      'git push --force puede sobrescribir el remoto',
    ],
    [/git\s+reset\s+--hard/, 'git reset --hard descarta cambios sin posibilidad de recuperarlos'],
    [/git\s+clean\s+-[a-z]*f/, 'git clean -f borra archivos sin confirmar'],
    [/rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r/, 'rm -rf es destructivo e irreversible'],
    [
      /docker\s+compose\s+down\s+(-\w*\s+)*-v|docker\s+volume\s+(rm|prune)/,
      'esto borra el volumen Docker con la bóveda de secretos (irrecuperable)',
    ],
    [
      (c) =>
        !/\bwsl(\.exe)?\b/.test(c) &&
        /(^|[;&|]\s*)(git\s+(push|remote\s+(add|set-url))|gh\s+(repo|pr|release|api|auth|workflow|run|secret))\b/.test(
          c,
        ),
      'push/remoto/gh deben ejecutarse en WSL (la cuenta de Git de Windows apunta a otro repositorio): wsl.exe bash -lc "cd /mnt/c/... && git ..."',
    ],
    [
      /(cat|type|less|more|head|tail|Get-Content|sqlite3|strings|xxd|bun\s+--print)\b[^\n|;&]*(secrets\.db|\.env(\s|$|\.local))/i,
      'leer la base de datos o el .env expone secretos reales en el contexto',
    ],
  ];

  for (const [pattern, reason] of rules) {
    const matches = typeof pattern === 'function' ? pattern(cmd) : pattern.test(cmd);
    if (matches) {
      console.error(
        `BLOQUEADO: ${reason}. Si el usuario lo pidió explícitamente, informar y pedir confirmación antes de reintentar.`,
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
