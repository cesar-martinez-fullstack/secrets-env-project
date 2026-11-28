# ADR-0014 · Registros estructurados propios, por lista de campos permitidos

- Estado: Aceptado
- Fecha: 2026-11-26

## Contexto

El API apenas registraba nada y ante un error inesperado imprimía el objeto completo, cuyo mensaje puede citar
datos recibidos. En una aplicación de secretos, un registro es un posible lugar de fuga.

## Decisión

Un registrador propio y pequeño escribe una línea JSON por evento en la salida estándar. Cada petición registra solo
campos elegidos: identificador generado por el servidor, método, **patrón** de la ruta, estado, código de error y
duración. Nunca cuerpo, cabeceras, búsqueda, dirección literal ni IP. De un error inesperado se guardan su tipo y la
traza, sin el mensaje. Como segunda barrera se censuran los campos con nombres sensibles.

El nivel se fija con `SV_LOG_LEVEL` y se puede cambiar desde Ajustes con la contraseña maestra (migración 8,
auditado). En Docker los registros rotan (3 archivos de 10 MB).

## Alternativas descartadas

- `pino` (se había propuesto): añade una dependencia al servidor para escribir líneas JSON con niveles. El
  registrador va tras la interfaz `Logger`, así que se puede adoptar si hicieran falta destinos o más volumen.
- Registrar la petición completa y censurar después: un campo nuevo se filtraría hasta que alguien lo añadiera.
- Aceptar el identificador de petición del cliente: permitiría inyectar texto en los registros.

## Consecuencias

- Positivas: sin dependencias nuevas; una prueba recorre una sesión en nivel de depuración y busca fugas.
- Negativas / deuda aceptada: sin el mensaje, algunos errores serán más difíciles de diagnosticar; el aviso de
  arranque sigue siendo texto para personas; no hay rotación fuera de Docker.
- Qué habría que cambiar para revertirla: el registrador y su documentación; la columna puede quedar.
