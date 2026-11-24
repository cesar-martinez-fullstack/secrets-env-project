# SecretVault en Mac

Guía paso a paso. Funciona en Macs con Apple Silicon (M1 a M4) e Intel. Hay dos caminos:

- **Docker (recomendado):** lo mismo que en Windows; los secretos viven en un volumen aparte.
- **Ejecutable sin Docker:** un único archivo que se compila en tu Mac.

La aplicación solo es accesible desde tu propio equipo (`localhost`); nada queda expuesto a la red.

## 1. Requisitos

1. **Git.** En la Terminal: `git --version`. Si no está instalado, macOS ofrece instalarlo (o `xcode-select --install`).
2. **Docker** (solo para el camino recomendado). Elige uno:
   - Docker Desktop: <https://www.docker.com/products/docker-desktop/> (o `brew install --cask docker`).
   - OrbStack (más ligero): `brew install --cask orbstack`.

   Ábrelo una vez y espera a que diga que está en marcha. Comprueba con `docker --version` y `docker compose version`.

## 2. Descargar e iniciar (Docker)

```bash
git clone https://github.com/cesar-martinez-fullstack/secrets-env-project.git
cd secrets-env-project
docker compose up -d --build
```

La primera vez tarda unos minutos (descarga y compila). Después abre <http://localhost:3000>:

1. Elige idioma, nombre y aspecto (o pulsa «Omitir»).
2. Crea la **contraseña maestra** (mínimo 10 caracteres).
3. Guarda la **clave de recuperación** fuera de tu Mac (papel o un gestor de confianza). Se muestra una sola vez.

Si el puerto 3000 está ocupado: `SV_PORT=3001 docker compose up -d` y abre <http://localhost:3001>.

### Uso diario

| Qué                    | Comando                        |
| ---------------------- | ------------------------------ |
| Ver si está en marcha  | `docker compose ps`            |
| Ver el registro        | `docker compose logs -f`       |
| Detener                | `docker compose stop`          |
| Volver a iniciar       | `docker compose start`         |
| Reiniciar tras cambios | `docker compose up -d --build` |

> **Nunca** uses `docker compose down -v` ni borres el volumen `secretvault-data` desde Docker Desktop:
> ahí están tus secretos cifrados y no se pueden recuperar.

## 3. Actualizar (conserva tus secretos)

Para saber si hay una versión nueva: **Ajustes > Actualizaciones > Comprobar actualizaciones**. La aplicación solo
se conecta a GitHub cuando pulsas el botón, no envía ningún dato de tu bóveda y te muestra el comando para
instalarla. Si prefieres que no salga nunca a internet, pon `SV_UPDATE_CHECK=false`.

```bash
cd secrets-env-project
./scripts/update.sh --check   # solo informa si hay versión nueva
./scripts/update.sh           # descarga, reconstruye y arranca
```

El script, en este orden: busca cambios en la rama `main`, detiene la aplicación (cierre ordenado de la base
de datos), guarda una copia comprimida en `backups/` (sigue cifrada), descarga la versión nueva,
reconstruye la imagen y espera a que responda. Los secretos no se tocan: están en el volumen, no en la imagen.
Si algo falla, no avanza y te dice dónde está la copia.

Se actualiza solo desde `main`, que recibe únicamente versiones publicadas. Si hay cambios locales sin guardar
o estás en otra rama, el script se detiene y lo explica.

### Restaurar una copia

Solo si hiciera falta volver a un estado anterior (con la aplicación detenida):

```bash
docker compose stop
docker compose run --rm --no-deps -T --entrypoint sh secretvault -c 'rm -rf /app/data/* && tar xzf - -C /app/data' < backups/ARCHIVO.tar.gz
docker compose start
```

## 4. Camino alternativo: ejecutable sin Docker

Compila un único archivo en tu Mac. Necesita [Bun](https://bun.sh):

```bash
brew install oven-sh/bun/bun       # o: curl -fsSL https://bun.sh/install | bash
git clone https://github.com/cesar-martinez-fullstack/secrets-env-project.git
cd secrets-env-project
bun install
bun run build:web
```

Compila para tu Mac (elige una línea):

```bash
# Apple Silicon (M1 a M4)
bun build --compile --minify --sourcemap=none --target bun-darwin-arm64 ./apps/api/src/index.ts --outfile ./dist/secretvault
# Intel
bun build --compile --minify --sourcemap=none --target bun-darwin-x64 ./apps/api/src/index.ts --outfile ./dist/secretvault
```

Instala y ejecuta (el ejecutable necesita la carpeta `public` a su lado):

```bash
mkdir -p ~/SecretVault
cp dist/secretvault ~/SecretVault/
cp -r apps/api/public ~/SecretVault/public
cd ~/SecretVault
SV_DATA_DIR=$HOME/SecretVault/data ./secretvault
```

Abre <http://localhost:3000>. Cierra con `Ctrl+C`. Los datos quedan en `~/SecretVault/data`; haz copia de esa
carpeta para respaldarlos. Para actualizar: `git pull`, repite `bun install`, `bun run build:web` y la compilación,
y reemplaza `secretvault` y `public` (no toques `data`).

Un ejecutable compilado en tu propio Mac no muestra el aviso de Gatekeeper. Si descargas uno ya compilado
(página _Releases_), macOS lo bloquea la primera vez: usa clic derecho > Abrir, o
`xattr -d com.apple.quarantine ./secretvault`.

## 5. Compartir secretos con otra persona (frase de paso)

1. Quien comparte: en la barra lateral, pasa el cursor sobre un proyecto o un ambiente y pulsa el icono de
   compartir (**Compartir proyecto** / **Compartir ambiente**). Elige una **frase de paso** (mínimo 12
   caracteres) y descarga el archivo cifrado.
2. Envía el archivo por un canal y **la frase por otro distinto** (por ejemplo, el archivo por correo y la frase
   en persona o por mensajería).
3. Quien recibe: en la barra lateral, el botón **Importar un archivo compartido**; elige el archivo, escribe la
   frase y decide si crea un proyecto nuevo o se mezcla con uno existente.

Sin la frase el archivo no se puede abrir. Cámbiala para cada intercambio.

## 6. Problemas frecuentes

- **`Cannot connect to the Docker daemon`:** Docker no está abierto. Ábrelo y espera a que arranque.
- **`port is already allocated`:** otro programa usa el 3000. Usa `SV_PORT=3001 docker compose up -d`.
- **`container name "/secretvault" is already in use`:** ya tienes otra instalación; usa
  `SV_CONTAINER_NAME=otro SV_PORT=3001 docker compose up -d`.
- **La página no carga:** `docker compose logs --tail 50`.
- **Olvidé la contraseña maestra:** en la pantalla de entrada pulsa «¿Olvidaste tu contraseña? Usa tu clave de
  recuperación».
