/**
 * Architecture boundary tests — estilo ArchUnit, adaptado al monorepo SecretVault
 * (boundary tests en memoria, sin dependencias).
 *
 * Protegen contra:
 * 1. Violaciones de la regla de dependencia de Clean Architecture
 *    (core importa infra, shared importa core, api importa DB fuera del container…)
 * 2. Dependencias de framework en capas puras (hono/bun:sqlite/vue en core o shared)
 * 3. Imports relativos que cruzan la frontera de un paquete
 * 4. Referencias circulares dentro de cada paquete
 * 5. Convenciones de nombrado de archivos por capa
 */
import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(import.meta.dir, '..');
const SRC_DIRS: Record<string, string> = {
  '@secretvault/shared': path.join(ROOT, 'packages', 'shared', 'src'),
  '@secretvault/core': path.join(ROOT, 'packages', 'core', 'src'),
  '@secretvault/crypto': path.join(ROOT, 'packages', 'crypto', 'src'),
  '@secretvault/database': path.join(ROOT, 'packages', 'database', 'src'),
  '@secretvault/api': path.join(ROOT, 'apps', 'api', 'src'),
  '@secretvault/web': path.join(ROOT, 'apps', 'web', 'src'),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return getFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

function readImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /(?:from|import)\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) imports.push(match[1]!);
  return imports;
}

function posix(p: string): string {
  return p.split(path.sep).join('/');
}

function rel(file: string): string {
  return posix(path.relative(ROOT, file));
}

function violationsFor(files: string[], isViolation: (specifier: string) => boolean): string[] {
  return files.flatMap((file) =>
    readImports(file)
      .filter(isViolation)
      .map((specifier) => `${rel(file)} → ${specifier}`),
  );
}

// ─── Reglas por paquete ─────────────────────────────────────────────────────

describe('Layer boundaries — regla de dependencia de Clean Architecture', () => {
  describe('@secretvault/shared (shared kernel: no depende de nada)', () => {
    const files = getFiles(SRC_DIRS['@secretvault/shared']!);

    it('no importa paquetes externos ni de workspace', () => {
      const violations = violationsFor(files, (specifier) => !specifier.startsWith('.'));
      expect(violations).toEqual([]);
    });
  });

  describe('@secretvault/core (dominio puro: cero frameworks)', () => {
    const files = getFiles(SRC_DIRS['@secretvault/core']!);

    it('solo depende de @secretvault/shared e imports relativos', () => {
      const violations = violationsFor(
        files,
        (specifier) => !specifier.startsWith('.') && specifier !== '@secretvault/shared',
      );
      expect(violations).toEqual([]);
    });

    it('no importa implementaciones (crypto, database) ni frameworks (hono, bun, vue)', () => {
      const violations = violationsFor(files, (specifier) =>
        /^(@secretvault\/(crypto|database)|hono|bun:|vue|node:)/.test(specifier),
      );
      expect(violations).toEqual([]);
    });
  });

  describe('@secretvault/crypto (implementa el puerto de core)', () => {
    const files = getFiles(SRC_DIRS['@secretvault/crypto']!);

    it('solo depende de core, shared y node:crypto', () => {
      const violations = violationsFor(
        files,
        (specifier) =>
          !specifier.startsWith('.') &&
          !['@secretvault/core', '@secretvault/shared', 'node:crypto'].includes(specifier),
      );
      expect(violations).toEqual([]);
    });

    it('no conoce la persistencia ni el HTTP', () => {
      const violations = violationsFor(files, (specifier) =>
        /^(bun:|hono|@secretvault\/database)/.test(specifier),
      );
      expect(violations).toEqual([]);
    });
  });

  describe('@secretvault/database (implementa los puertos de persistencia)', () => {
    const files = getFiles(SRC_DIRS['@secretvault/database']!);

    it('no conoce el HTTP ni el paquete de criptografía', () => {
      const violations = violationsFor(files, (specifier) =>
        /^(hono|@secretvault\/crypto)/.test(specifier),
      );
      expect(violations).toEqual([]);
    });
  });

  describe('@secretvault/api (raíz de composición)', () => {
    const files = getFiles(SRC_DIRS['@secretvault/api']!);
    const containerPath = posix(path.join(SRC_DIRS['@secretvault/api']!, 'container.ts')).split(
      'apps/api/src/',
    )[1]!;

    it('solo container.ts importa las implementaciones concretas (@secretvault/database)', () => {
      const violations = files
        .filter((file) => posix(file).split('apps/api/src/')[1] !== containerPath)
        .flatMap((file) =>
          readImports(file)
            .filter((specifier) => specifier === '@secretvault/database')
            .map((specifier) => `${rel(file)} → ${specifier}`),
        );
      expect(violations).toEqual([]);
    });

    it('las rutas HTTP no importan implementaciones concretas (solo core + shared)', () => {
      const routeFiles = files.filter((file) => file.includes(`${path.sep}routes${path.sep}`));
      const violations = violationsFor(routeFiles, (specifier) =>
        /^@secretvault\/(crypto|database)$/.test(specifier),
      );
      expect(violations).toEqual([]);
    });
  });

  describe('@secretvault/web (SPA: solo HTTP + shared)', () => {
    const files = getFiles(SRC_DIRS['@secretvault/web']!);

    it('no importa el backend ni implementaciones de paquetes', () => {
      const violations = violationsFor(files, (specifier) =>
        /^(hono|bun:|node:|@secretvault\/(core|crypto|database))/.test(specifier),
      );
      expect(violations).toEqual([]);
    });
  });
});

describe('Package boundaries — sin imports relativos que crucen paquetes', () => {
  it('ningún src/ escapa de su propio paquete con ../..', () => {
    const violations: string[] = [];
    for (const [, srcDir] of Object.entries(SRC_DIRS)) {
      for (const file of getFiles(srcDir)) {
        const outOfPackage = readImports(file).filter(
          (specifier) =>
            specifier.startsWith('.') &&
            posix(path.resolve(path.dirname(file), specifier)).length < posix(srcDir).length - 1,
        );
        violations.push(...outOfPackage.map((specifier) => `${rel(file)} → ${specifier}`));
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('No circular imports', () => {
  for (const [pkg, srcDir] of Object.entries(SRC_DIRS)) {
    it(`${pkg} no tiene referencias circulares`, () => {
      const files = getFiles(srcDir);
      const graph = new Map<string, string[]>();
      for (const file of files) {
        const localKey = posix(path.relative(srcDir, file));
        const deps = readImports(file)
          .filter((specifier) => specifier.startsWith('.'))
          .map((specifier) =>
            posix(path.relative(srcDir, path.resolve(path.dirname(file), specifier))),
          );
        graph.set(localKey, deps);
      }
      const cycles: string[] = [];
      const visit = (node: string, stack: Set<string>): void => {
        if (stack.has(node)) {
          cycles.push([...stack, node].join(' → '));
          return;
        }
        if (cycles.length > 0) return;
        const nextStack = new Set(stack).add(node);
        for (const dep of graph.get(node) ?? []) {
          if (graph.has(dep)) visit(dep, nextStack);
        }
      };
      for (const node of graph.keys()) {
        if (cycles.length > 0) break;
        visit(node, new Set());
      }
      expect(cycles).toEqual([]);
    });
  }
});

describe('Naming conventions por capa', () => {
  it('los casos de uso de core terminan en -service.ts', () => {
    const files = getFiles(path.join(SRC_DIRS['@secretvault/core']!, 'usecases'));
    const bad = files.filter((f) => !f.endsWith('-service.ts')).map(rel);
    expect(bad).toEqual([]);
  });

  it('los repositorios de database terminan en -repository.ts', () => {
    const files = getFiles(path.join(SRC_DIRS['@secretvault/database']!, 'repositories'));
    const bad = files.filter((f) => !f.endsWith('-repository.ts')).map(rel);
    expect(bad).toEqual([]);
  });

  it('las rutas del api terminan en .routes.ts', () => {
    const files = getFiles(path.join(SRC_DIRS['@secretvault/api']!, 'routes'));
    const bad = files.filter((f) => !f.endsWith('.routes.ts')).map(rel);
    expect(bad).toEqual([]);
  });

  it('core exporta sus puertos desde ports/ (sin lógica de negocio ahí)', () => {
    const ports = getFiles(path.join(SRC_DIRS['@secretvault/core']!, 'ports'));
    expect(ports.length).toBeGreaterThanOrEqual(3); // crypto, repositories, session
    for (const file of ports) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).toMatch(/export (interface|const|class)/); // son contratos, no implementaciones
    }
  });
});
