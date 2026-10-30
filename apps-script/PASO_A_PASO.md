# Turnos de RQ's en Apps Script — paso a paso

Todo se hace con el **correo de la empresa**. La app queda dentro del Google Workspace corporativo: la hoja vive en el Drive de la empresa, solo entran cuentas del dominio y cada RQ queda firmada con el correo de quien la registró.

Tiempo estimado: 30–40 minutos la primera vez.

**Archivos del paquete**

| Archivo | Qué es |
|---|---|
| `Code.gs` | Servidor: lee y escribe la hoja, turnos, equipo, permisos |
| `Migracion.gs` | Trae los turnos de la app de Streamlit (con respaldo) |
| `Index.html` | La interfaz (todo en un archivo: estilos + lógica) |
| `appsscript.json` | Manifiesto: zona horaria Bogotá, app web solo para el dominio |

---

## Parte 1 · Sacar los turnos de Streamlit (respaldo)

La app de Streamlit no guarda nada en su servidor: todo está en una Google Sheet con dos pestañas, `historial` y `estado`. Hay que ubicar esa hoja.

1. Entra a <https://share.streamlit.io> con la cuenta con la que publicaste la app.
2. En la app → **⋮ → Settings → Secrets**. Copia el valor de `spreadsheet = "..."`: esa es la URL de la hoja.
3. Abre esa URL con tu cuenta **personal** (la dueña de la hoja).
4. **Respaldo fijo:** Archivo → Descargar → **Microsoft Excel (.xlsx)**. Guarda ese archivo; es la foto exacta de todos los turnos tomados hasta hoy.
5. Lleva los datos al Drive de la empresa (elige una):
   - **A (recomendada):** con el correo de la empresa, en Google Drive → Nuevo → Subir archivo → sube el `.xlsx`. Ábrelo y haz Archivo → **Guardar como Hojas de cálculo de Google**. Copia la URL de esa hoja nueva.
   - **B:** comparte la hoja original con tu correo de la empresa como *Lector*. Solo funciona si la empresa permite abrir archivos de cuentas externas.

> Hazlo justo después de la última RQ tomada en Streamlit y avisa al equipo que no registren nada mientras migras (son 10 minutos).

## Parte 2 · Crear la app en la cuenta de la empresa

1. Con el correo de la empresa: Google Drive → Nuevo → **Hojas de cálculo de Google**. Nómbrala, por ejemplo, `Turnos RQ's – <equipo>`.
2. En la hoja: **Extensiones → Apps Script**. Se abre el editor. Ponle nombre al proyecto arriba a la izquierda (ej. `Turnos RQs`).
3. Archivo `Código.gs` que ya existe: bórralo todo y pega el contenido de **`Code.gs`**.
4. **+ → Secuencia de comandos** → nómbralo `Migracion` → pega **`Migracion.gs`**.
5. **+ → HTML** → nómbralo exactamente `Index` → pega **`Index.html`**.
6. ⚙️ **Configuración del proyecto** → activa *Mostrar el archivo de manifiesto "appsscript.json"*. Vuelve al editor, abre `appsscript.json` y reemplázalo con el del paquete.
7. Guarda (Ctrl+S). Arriba, en el selector de funciones, elige **`setup`** → **Ejecutar**. Acepta los permisos que pide (hoja, Drive para el respaldo, tu correo).
8. Vuelve a la hoja: ya tiene tres pestañas nuevas, `RQs`, `Estado` y `Config`.

## Parte 3 · Migrar los turnos

1. Recarga la hoja. Aparece el menú **Turnos RQ's**.
2. **Turnos RQ's → Migrar desde la app de Streamlit…** → pega la URL de la Parte 1 (paso 5).
3. Sale una **vista previa**: cuántas RQs, rango de fechas, orden de rotación y a quién le toca. Si todo cuadra → **Sí**.
4. Al terminar te da el enlace a una copia de respaldo en tu Drive.
5. Revisa la pestaña `RQs`: cada fila tiene fecha completa, `registrado_por = migrado` y `origen = streamlit`.

**Sobre las fechas:** Streamlit guardaba "29 oct 10:15", sin año. La migración lo deduce recorriendo de la más reciente a la más vieja y restando un año cuando el mes "sube" (ej. ene → dic). Si la app se usó más de 12 meses seguidos sin RQs en algún mes intermedio, revisa las fechas más viejas.

Si un cliente del historial no estaba en la lista, se agrega solo a `Config`. Si algo sale mal, borra las filas de `RQs` y repite; la hoja vieja nunca se modifica.

## Parte 4 · Ajustar y publicar

1. Pestaña **`Config`** (columna `clave` / `valor`):
   - `equipo`, `subtitulo`: lo que se ve arriba en la app.
   - `color`: color principal en hex (ej. `#1f3a93`).
   - `dominio_permitido`: el dominio de la empresa, ej. `empresa.com`. Bloquea cualquier cuenta de afuera.
   - Filas `cliente` y `prioridad`: una por fila. Agregar un cliente = agregar una fila.
2. En el editor de Apps Script: **Implementar → Nueva implementación** → tipo **App web**.
   - Descripción: `v1`
   - Ejecutar como: **Yo** (tu correo de empresa)
   - Quién tiene acceso: **Cualquier usuario de <tu dominio>**
3. **Implementar** → copia la **URL de la app web**. Esa es la nueva app; compártela con el equipo.
4. El equipo **no** necesita acceso a la hoja: la app escribe con tus permisos. Deja como editores de la hoja solo a quien vaya a mantenerla.

## Parte 5 · Apagar Streamlit

1. Cuando el equipo ya esté usando la URL nueva: en share.streamlit.io → la app → **⋮ → Delete** (o al menos quita los *Secrets* para que no pueda escribir más en la hoja vieja).
2. Guarda el `.xlsx` de respaldo en el Drive de la empresa junto a la hoja nueva.

## Cambios futuros al código

Edita en el editor → Guardar → **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. La URL se mantiene. (Para probar sin publicar: *Implementar → Probar implementaciones*.)

## Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| "Esta app es solo para cuentas @…" | Entraste con otra cuenta. Abre la URL en un perfil de Chrome con el correo de la empresa. |
| No aparece la opción "Cualquier usuario de <dominio>" | El administrador de Workspace restringe apps web. Pide a TI que permita Apps Script para tu usuario. |
| "No pude leer la fecha …" al migrar | Alguien editó a mano una celda de `time` en la hoja vieja. Corrígela con el formato `05 oct 14:30` y repite. |
| La migración dice "Ya hay RQs migradas" | Ya se corrió una vez. Borra esas filas de `RQs` para repetirla. |
| Cambié `Config` y no se ve | La configuración se guarda en caché 1 minuto. Espera y pulsa ↻ Actualizar. |

---

# Para otros equipos (plantilla)

La app entera vive dentro de la hoja: al copiar la hoja se copia el código. Así se reparte a otros equipos.

**Una vez (tú):**
1. Con tu hoja funcionando: Archivo → **Hacer una copia** → nómbrala `PLANTILLA – Turnos RQ's`.
2. En la copia: borra las filas de datos de `RQs` (deja el encabezado), pon nombres de ejemplo en `Estado` → `orden` y deja `Config` con valores genéricos.
3. Comparte la plantilla como *Lector* con la empresa. Para repartirla, usa el enlace de copia directa: cambia el final de la URL de `/edit…` por **`/copy`**. Quien lo abra ve un botón "Hacer una copia".

**Cada equipo nuevo:**
1. Abre el enlace `/copy` con su correo de empresa → **Hacer una copia**.
2. Edita `Config` (nombre del equipo, color, clientes, prioridades, dominio) y `Estado` → `orden` con su gente separada por comas (también lo pueden hacer desde la app con "Gestionar equipo").
3. Extensiones → Apps Script → ejecutar `setup` una vez y aceptar permisos.
4. Hacer la Parte 4, paso 2 (implementar como app web) y compartir su URL.

Cada equipo queda con su propia hoja, sus datos y su URL. Nadie ve los datos de otro equipo. Las mejoras al código se pegan en cada copia (o se les pasa la versión nueva de los archivos).

---

## Mapa del código (dónde editar cada cosa)

| Quiero cambiar… | Dónde |
|---|---|
| Clientes, prioridades, color, nombre | Pestaña `Config` (sin tocar código) |
| Valores por defecto de equipos nuevos | `Code.gs` → `DEFAULT_CONFIG` |
| Columnas que se guardan por RQ | `Code.gs` → `RQ_HEADERS` y `COL` |
| Qué pasa al tomar una RQ | `Code.gs` → `tomarRq` |
| Reglas del turno al quitar/reordenar gente | `Code.gs` → `quitarMiembro`, `guardarOrden` |
| Quién puede entrar | `Code.gs` → `checkAccess_` + `dominio_permitido` en `Config` |
| Columnas del CSV exportado | `Code.gs` → `exportarCsv` |
| Colores, tipografía, espaciado | `Index.html` → bloque `<style>`, variables en `:root` |
| Colores de cada prioridad | `Index.html` → `:root` (`--low`, `--med`, `--high`) y `PRIO_STYLE` |
| Tarjetas, tabla, indicadores | `Index.html` → `render`, `historyHtml`, `statsHtml` |
| Filas por página / refresco automático | `Index.html` → `PAGE` y el `setInterval` al final |
| Formato de la hoja vieja de Streamlit | `Migracion.gs` → `leerStreamlit_` |
