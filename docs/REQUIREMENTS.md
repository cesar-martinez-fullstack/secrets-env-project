# Requisitos de herramientas y MCPs

Lo que hace falta (y lo que sería útil) para desarrollar y verificar el proyecto. Se actualiza cuando una
rebanada necesita algo nuevo.

Estados: **Instalado** · **Recomendado** (aporta valor claro, falta instalar) · **Opcional** · **No usar**.

## Herramientas de desarrollo

| Herramienta        | Para qué                                                    | Estado    | Notas                                                                  |
| ------------------ | ----------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| Bun 1.4.4          | Runtime, gestor de paquetes y tests (`bun:sqlite`)          | Instalado | Versión fijada en `package.json` y CI                                  |
| Docker Desktop     | Build y prueba de la imagen                                 | Instalado | El puerto se publica solo en loopback                                  |
| Git + `gh` en WSL  | Commits, push, PRs y Actions con las credenciales correctas | Instalado | La cuenta de Windows apunta a otro repo; token con `repo` y `workflow` |
| Playwright CLI     | Verificación en navegador de cada rebanada                  | Instalado | Se ejecuta desde una carpeta temporal para no ensuciar el repo         |
| Husky + commitlint | Hooks de commit y validación de Conventional Commits        | Instalado | Corren también dentro de WSL                                           |

## MCPs y conectores

| MCP                                                    | Utilidad para este proyecto                                                                         | Estado      | Notas                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Context7 (documentación)                               | Consultar la documentación **vigente** de Vue, Vite, Hono, Bun y Pinia, para no usar APIs obsoletas | Recomendado | Apoya directamente la regla de código vigente; verificar paquete y versión al instalar    |
| GitHub MCP                                             | PRs, issues y Actions desde el agente                                                               | Opcional    | `gh` en WSL ya lo cubre; solo si se quiere sin pasar por WSL                              |
| Playwright MCP                                         | Navegación interactiva más rica que el CLI                                                          | Opcional    | El CLI actual cubre los recorridos de cada rebanada                                       |
| MCP de SQLite o de sistema de archivos sin restricción | Inspeccionar datos                                                                                  | **No usar** | Podrían leer `data/`, `.env` o `secrets.db`; los datos reales no deben entrar al contexto |

## Reglas para añadir un MCP

1. Debe aportar algo que no cubra ya una herramienta instalada.
2. **Nunca** con acceso a `data/`, `*.db` ni `.env` (los permisos del proyecto ya los vedan).
3. Se registra aquí con su motivo y, si necesita configuración, en `.claude/settings.json` (permisos acotados).
4. Revisar quién lo mantiene y qué permisos pide antes de instalarlo.
