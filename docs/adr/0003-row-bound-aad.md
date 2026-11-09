# ADR-0003 · Cifrado AES-GCM con AAD ligado a la fila

- Estado: Aceptado
- Fecha: 2026-11-09

## Contexto

GCM autentica el contenido, pero con un AAD constante por tipo de campo un atacante con acceso de escritura
al disco podía copiar el blob cifrado de un secreto a otro (por ejemplo, el valor de `DEV_DB` sobre
`PROD_DB`) sin que el descifrado fallara.

## Decisión

El AAD de valores y notas incluye el identificador del ambiente y el nombre del secreto:
`secretvault:aad:secret-value:v2:<environmentId>:<name>` (y análogo para notas). Renombrar un secreto
re-cifra su valor y su nota con el AAD nuevo. El verificador de contraseña conserva su AAD propio.

## Alternativas consideradas

- **AAD con el `id` autoincremental** — exige insertar antes de cifrar y no protege la relación nombre↔valor.
- **MAC adicional sobre toda la fila** — más piezas para el mismo resultado.
- **Mantener el AAD por tipo** — deja abierto el intercambio entre filas.

## Consecuencias

- Positivas: un blob solo descifra en su ambiente y nombre; probado en `perimeter.spec.ts`.
- Negativas: renombrar cuesta un re-cifrado; **cambia el formato** (bóvedas creadas antes no se descifran).
- Reversión/evolución: cualquier cambio futuro del AAD es una migración de datos (skill `db-migration`)
  y, antes de 1.0.0, un incremento menor del proyecto.
