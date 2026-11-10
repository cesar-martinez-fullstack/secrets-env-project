# ADR-0009 · Paquete cifrado para compartir proyectos y ambientes

- Estado: Aceptado
- Fecha: 2026-11-10

## Contexto

Dos personas con SecretVault quieren pasarse un proyecto o un ambiente. Los exportes actuales (`.env`, CSV, JSON)
llevan los valores en texto claro: mandarlos por chat o correo los expone. La clave de datos de cada bóveda es
distinta, así que un blob de la base no se puede copiar de una a otra.

## Decisión

Un archivo `.svshare` cifrado con una **frase de paso** que la persona acuerda con quien recibe, por otro canal.
Reutiliza solo las primitivas del puerto `VaultCryptoService`, sin dependencias nuevas.

```json
{
  "format": "secretvault-share",
  "version": 1,
  "iterations": 600000,
  "salt": "<base64>",
  "data": "<base64>"
}
```

- La clave sale de `PBKDF2(frase, salt aleatoria, iterations)`; `data` es el JSON del contenido cifrado con
  AES-256-GCM y un AAD fijo que incluye la versión y las iteraciones (`secretvault:aad:share:v1:<iteraciones>`).
- El contenido (proyecto, ambientes, nombres, valores y notas) va **entero** dentro de `data`; en claro solo quedan
  el formato, la versión, las iteraciones y la sal.
- Al importar, las iteraciones del archivo se acotan (100 000 a 2 000 000) para que un archivo hostil no ocupe el
  servidor; frase incorrecta y archivo alterado dan el mismo error genérico.
- La frase exige 12 caracteres como mínimo. Es el único control de confidencialidad del archivo: su fuerza es la
  de la frase que se elija.
- Importar crea un proyecto nuevo (si el nombre existe, se añade un sufijo) dentro de una `UnitOfWork`.

## Alternativas consideradas

- **Clave pública por instalación** — más elegante, pero exige gestionar pares de claves y su intercambio; se
  puede añadir después como otra `version` del paquete.
- **Compartir el JSON plano** — descartado: es justo el riesgo que se quiere evitar.

## Consecuencias

- Quien recibe el archivo y la frase conserva acceso a esos secretos; no hay revocación.
- Cambiar el formato exige una `version` nueva y mantener la lectura de la anterior.
