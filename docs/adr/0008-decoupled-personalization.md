# ADR-0008 · Personalización desacoplada: ajustes por instancia, tokens de diseño y textos externalizados

- Estado: Propuesto
- Fecha: 2026-11-10

## Contexto

Se quiere poder cambiar el nombre, el logo, el tema de colores y el idioma, y ofrecer un asistente de primer
arranque y un tour guiado. Hoy los colores (`indigo-*`) y los textos en español están escritos dentro de cada
componente: cualquier cambio de aspecto o de idioma obligaría a tocar toda la interfaz.

## Decisión

Cuatro piezas independientes, para que cada una cambie sin arrastrar a las demás:

1. **Ajustes por instancia, fuera de la bóveda.** Un documento versionado con valores por defecto y
   validación (nombre, logo, tema, idioma, seguridad), guardado en la carpeta de datos con escritura atómica.
   El núcleo lo ve a través de un puerto; el adaptador de archivos vive en infraestructura. Se lee antes de
   desbloquear y solo se escribe con la bóveda abierta (salvo el asistente, mientras la bóveda no existe).
2. **Tokens de diseño.** Los colores son variables CSS semánticas (acento, superficie, borde, texto) y cada
   tema es un conjunto de valores aplicado con un atributo en `<html>`. Los componentes usan clases
   semánticas y **nunca** colores concretos. Las paletas son datos, y un test falla si el contraste de texto
   sobre el acento baja de 4,5:1.
3. **Textos externalizados.** Los textos viven en catálogos por idioma con claves tipadas; el español es el
   idioma base y el resto cae a él si falta una clave. Las plantillas no llevan cadenas literales. Fechas y
   números salen de `Intl`. La biblioteca (o una capa mínima propia) se decide al implementar.
4. **Contenido guiado como datos.** El tour es una lista declarativa de pasos (clave de texto y ancla
   `data-tour`), traducible y editable sin tocar la lógica del componente.

## Alternativas consideradas

- **Tema en tiempo de compilación (configuración de Tailwind):** no permite cambiarlo desde la interfaz.
- **Textos en los componentes con una traducción puntual:** barato hoy, caro con cada idioma nuevo.
- **Ajustes dentro de la bóveda:** no se leerían antes de desbloquear y atarían la marca a cada bóveda.
- **Un tour con una biblioteca externa:** una dependencia más para algo que son pasos y un foco resaltado.

## Consecuencias

- Positivas: añadir un tema, un idioma o un paso del tour es añadir datos, no tocar componentes; el nombre y el
  logo se ven ya en la pantalla de entrada.
- Negativas: refactor inicial de las clases de color y de las cadenas existentes (la mayor parte del coste); una
  regla nueva de revisión (nada de cadenas ni colores fijos en los componentes).
- Por decidir al implementar cada rebanada: el formato exacto del archivo de ajustes, la biblioteca de i18n y el
  mecanismo de resaltado del tour.
