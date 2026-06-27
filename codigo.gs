// ==========================================================================
//  PROMPTFLOW — Google Apps Script Backend
//  Hoja de cálculo como base de datos para la SPA de Administración de Prompts
//
//  Columnas esperadas (fila 1 como cabecera):
//    A: ID | B: Categoría | C: Nombre prompt | D: Prompt | E: Ejemplos
// ==========================================================================

/**
 * ─────────────────────────────────────────────
 *  INICIALIZAR HOJA
 *  Crea las columnas con sus nombres si la hoja está vacía.
 *  Ejecutar manualmente una sola vez desde el editor de Apps Script.
 * ─────────────────────────────────────────────
 */
function inicializarHoja() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  // Solo escribe cabeceras si la hoja está completamente vacía
  if (sheet.getLastRow() === 0) {
    const headers = ["ID", "Categoría", "Nombre prompt", "Prompt", "Ejemplos"];

    // Escribir cabeceras en la fila 1
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);

    // Estilo visual de las cabeceras
    headerRange
      .setFontWeight("bold")
      .setBackground("#6366f1")   // Indigo
      .setFontColor("#ffffff")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    sheet.setRowHeight(1, 36);

    // Anchos de columna sugeridos
    sheet.setColumnWidth(1, 200);  // ID
    sheet.setColumnWidth(2, 160);  // Categoría
    sheet.setColumnWidth(3, 220);  // Nombre prompt
    sheet.setColumnWidth(4, 400);  // Prompt
    sheet.setColumnWidth(5, 280);  // Ejemplos

    // Inmovilizar fila de cabecera
    sheet.setFrozenRows(1);

    SpreadsheetApp.getUi().alert("✅ Estructura de tabla creada con éxito.\n\nColumnas: " + headers.join(", "));
    return "OK: Estructura creada.";
  }

  // Si ya tiene datos, verificar que las cabeceras coincidan
  const existentes = sheet.getRange(1, 1, 1, 5).getValues()[0];
  const esperadas  = ["ID", "Categoría", "Nombre prompt", "Prompt", "Ejemplos"];
  const coincide   = esperadas.every((h, i) => existentes[i] === h);

  if (coincide) {
    return "OK: La estructura ya existe y es correcta.";
  } else {
    SpreadsheetApp.getUi().alert(
      "⚠️ La hoja ya tiene datos, pero las columnas no coinciden.\n\n" +
      "Columnas encontradas: " + existentes.join(", ") + "\n" +
      "Columnas requeridas:  " + esperadas.join(", ")
    );
    return "ERROR: Columnas no coinciden.";
  }
}


// ==========================================================================
//  HELPER — generar ID único
// ==========================================================================
function generarId_() {
  return "id_" + new Date().getTime() + "_" + Math.random().toString(36).substr(2, 6);
}


// ==========================================================================
//  HELPER — obtener hoja activa con validación
// ==========================================================================
function getSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
}


// ==========================================================================
//  HELPER — agregar cabeceras CORS a la respuesta
//  Apps Script no requiere headers CORS manuales en ContentService,
//  pero sí necesitamos responder siempre como JSON.
// ==========================================================================
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ==========================================================================
//  doGet — Leer todos los prompts (READ)
//  GET  https://script.google.com/macros/s/DEPLOYMENT_ID/exec
// ==========================================================================
function doGet(e) {
  try {
    const sheet   = getSheet_();
    const lastRow = sheet.getLastRow();

    // Sin registros (solo cabecera o hoja vacía)
    if (lastRow <= 1) {
      return jsonResponse_({ success: true, data: [] });
    }

    const numRows = lastRow - 1; // excluir fila de cabecera
    const values  = sheet.getRange(2, 1, numRows, 5).getValues();

    const data = values
      .filter(row => row[0] !== "")          // Filtrar filas sin ID
      .map(row => ({
        id       : row[0] ? String(row[0]) : "",
        categoria: row[1] ? String(row[1]) : "",
        nombre   : row[2] ? String(row[2]) : "",
        prompt   : row[3] ? String(row[3]) : "",
        ejemplos : row[4] ? String(row[4]) : ""
      }));

    return jsonResponse_({ success: true, data: data });

  } catch (err) {
    return jsonResponse_({ success: false, error: err.toString() });
  }
}


// ==========================================================================
//  doPost — Crear / Actualizar / Eliminar (CREATE · UPDATE · DELETE)
//  POST https://script.google.com/macros/s/DEPLOYMENT_ID/exec
//
//  Body esperado (JSON string):
//    { "action": "create" | "update" | "delete", "payload": { ... } }
// ==========================================================================
function doPost(e) {
  // Bloqueo para evitar escrituras concurrentes
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000); // esperar hasta 30 s

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No se recibieron datos en el cuerpo de la petición.");
    }

    const requestData = JSON.parse(e.postData.contents);
    const action      = (requestData.action  || "").toLowerCase();
    const payload     = requestData.payload  || {};
    const sheet       = getSheet_();
    const lastRow     = sheet.getLastRow();

    // ── CREATE ─────────────────────────────────────────────────────────────
    if (action === "create") {
      if (!payload.nombre || !payload.prompt) {
        throw new Error("Los campos 'nombre' y 'prompt' son obligatorios.");
      }

      const nuevoId = generarId_();
      sheet.appendRow([
        nuevoId,
        payload.categoria || "",
        payload.nombre    || "",
        payload.prompt    || "",
        payload.ejemplos  || ""
      ]);

      return jsonResponse_({ success: true, data: { id: nuevoId } });
    }

    // ── UPDATE ─────────────────────────────────────────────────────────────
    if (action === "update") {
      if (!payload.id) throw new Error("Se requiere 'id' para actualizar.");

      const rowIndex = encontrarFila_(sheet, lastRow, payload.id);
      if (rowIndex === -1) throw new Error("Registro no encontrado: " + payload.id);

      sheet.getRange(rowIndex, 2).setValue(payload.categoria || "");
      sheet.getRange(rowIndex, 3).setValue(payload.nombre    || "");
      sheet.getRange(rowIndex, 4).setValue(payload.prompt    || "");
      sheet.getRange(rowIndex, 5).setValue(payload.ejemplos  || "");

      return jsonResponse_({ success: true });
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (action === "delete") {
      if (!payload.id) throw new Error("Se requiere 'id' para eliminar.");

      const rowIndex = encontrarFila_(sheet, lastRow, payload.id);
      if (rowIndex === -1) throw new Error("Registro no encontrado: " + payload.id);

      sheet.deleteRow(rowIndex);

      return jsonResponse_({ success: true });
    }

    throw new Error("Acción no válida: '" + action + "'. Use create | update | delete.");

  } catch (err) {
    return jsonResponse_({ success: false, error: err.toString() });

  } finally {
    lock.releaseLock();
  }
}


// ==========================================================================
//  HELPER — buscar fila por ID (retorna índice base-1, o -1 si no existe)
// ==========================================================================
function encontrarFila_(sheet, lastRow, targetId) {
  if (lastRow <= 1) return -1;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(targetId)) {
      return i + 2; // +2: desplazamiento por la fila de cabecera (base-1)
    }
  }
  return -1;
}

// ==========================================================================
//  DATOS DE EJEMPLO
// ==========================================================================
/**
 * ─────────────────────────────────────────────
 *  LLENAR DATOS DE EJEMPLO
 *  Agrega prompts de prueba a la hoja.
 *  Ejecutar manualmente desde el editor de Apps Script.
 * ─────────────────────────────────────────────
 */
function llenarDatosEjemplo() {
  const sheet = getSheet_();
  
  const ejemplos = [
    [generarId_(), "Programación", "Explicar código", "Explica el siguiente código paso a paso, de forma clara y concisa para un principiante:\n\n[INSERTA TU CÓDIGO AQUÍ]", "Entrada: def saludo(): print('hola')\nSalida: Explicación de la función saludo en Python."],
    [generarId_(), "Redacción", "Mejorar correo", "Reescribe el siguiente correo para que suene más profesional y asertivo, manteniendo el mensaje principal:\n\n[INSERTA TU CORREO AQUÍ]", "Entrada: correo informal\nSalida: correo formal y estructurado"],
    [generarId_(), "Análisis", "Resumir artículo", "Resume los puntos clave del siguiente artículo en formato de viñetas, destacando las conclusiones principales:\n\n[INSERTA TEXTO AQUÍ]", "Entrada: texto de 1000 palabras\nSalida: 5 viñetas principales"],
    [generarId_(), "Marketing", "Ideas para Redes", "Genera 5 ideas de contenido para una red social enfocada en [TEMA], dirigidas a [PÚBLICO].", "Entrada: Tema: fitness, Público: principiantes\nSalida: 5 ideas de posts"],
    [generarId_(), "Educación", "Crear Quiz", "Crea un cuestionario de opción múltiple de 3 preguntas sobre [TEMA]. Incluye las respuestas correctas al final.", "Entrada: Revolución Industrial\nSalida: 3 preguntas con 4 opciones y respuestas"]
  ];

  // Agregar a partir de la última fila
  sheet.getRange(sheet.getLastRow() + 1, 1, ejemplos.length, 5).setValues(ejemplos);
  
  SpreadsheetApp.getUi().alert("✅ Se agregaron " + ejemplos.length + " prompts de ejemplo.");
}
