/* Generador mínimo de archivos .xlsx (sin dependencias).
   Uso: crearXlsx([{ nombre, anchos:[..], filas:[[celda,..],..] }]) -> Uint8Array
   Celda: string | number | null | { v, s, f }
     s = estilo (ver ESTILO), f = fórmula de Excel (v es el valor ya calculado) */
(function (global) {
  'use strict';

  const ESTILO = { normal: 0, encabezado: 1, dinero: 2, fecha: 3, negrita: 4, dineroNegrita: 5, porcentaje: 6 };
  const enc = new TextEncoder();

  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ZIP sin compresión (método "store")
  function zip(archivos) {
    const partes = [];
    const central = [];
    let offset = 0;
    for (const a of archivos) {
      const nombre = enc.encode(a.nombre);
      const datos = enc.encode(a.texto);
      const crc = crc32(datos);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // nombres en UTF-8
      local.setUint16(8, 0, true);
      local.setUint16(10, 0, true);
      local.setUint16(12, 0x21, true); // 1980-01-01
      local.setUint32(14, crc, true);
      local.setUint32(18, datos.length, true);
      local.setUint32(22, datos.length, true);
      local.setUint16(26, nombre.length, true);
      local.setUint16(28, 0, true);
      partes.push(new Uint8Array(local.buffer), nombre, datos);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, 0, true);
      cd.setUint16(14, 0x21, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, datos.length, true);
      cd.setUint32(24, datos.length, true);
      cd.setUint16(28, nombre.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nombre);

      offset += 30 + nombre.length + datos.length;
    }
    const tamCentral = central.reduce((n, p) => n + p.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, offset, true);

    const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
    const salida = new Uint8Array(todo.reduce((n, p) => n + p.length, 0));
    let pos = 0;
    for (const p of todo) { salida.set(p, pos); pos += p.length; }
    return salida;
  }

  function xml(s) {
    return String(s)
      .replace(/[^\x09\x0A\x0D\x20-퟿-�]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function letraCol(i) {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  function celdaXml(celda, ref) {
    if (celda === null || celda === undefined || celda === '') return '';
    const o = typeof celda === 'object' ? celda : { v: celda };
    const s = o.s ? ` s="${o.s}"` : '';
    if (o.f) {
      const v = typeof o.v === 'number' && isFinite(o.v) ? `<v>${o.v}</v>` : '';
      return `<c r="${ref}"${s}><f>${xml(o.f)}</f>${v}</c>`;
    }
    if (typeof o.v === 'number' && isFinite(o.v)) return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
    if (o.v === null || o.v === undefined || o.v === '') return s ? `<c r="${ref}"${s}/>` : '';
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(o.v)}</t></is></c>`;
  }

  function hojaXml(hoja) {
    const cols = (hoja.anchos || [])
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const filas = hoja.filas
      .map((fila, r) => `<row r="${r + 1}">${fila.map((c, i) => celdaXml(c, letraCol(i) + (r + 1))).join('')}</row>`)
      .join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      (cols ? `<cols>${cols}</cols>` : '') +
      `<sheetData>${filas}</sheetData></worksheet>`;
  }

  const ESTILOS_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F6F54"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function nombreHoja(n) {
    return xml(String(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31));
  }

  function crearXlsx(hojas) {
    const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const archivos = [
      {
        nombre: '[Content_Types].xml',
        texto: cab + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
          '</Types>',
      },
      {
        nombre: '_rels/.rels',
        texto: cab + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      },
      {
        nombre: 'xl/workbook.xml',
        texto: cab + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets>' + hojas.map((h, i) => `<sheet name="${nombreHoja(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
          '</workbook>',
      },
      {
        nombre: 'xl/_rels/workbook.xml.rels',
        texto: cab + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
          `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          '</Relationships>',
      },
      { nombre: 'xl/styles.xml', texto: ESTILOS_XML },
      ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hojaXml(h) })),
    ];
    return zip(archivos);
  }

  // Convierte 'AAAA-MM-DD' al número de serie de fecha de Excel
  function fechaExcel(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return Date.UTC(a, m - 1, d) / 86400000 + 25569;
  }

  const api = { crearXlsx, fechaExcel, letraCol, ESTILO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Xlsx = api;
})(typeof window !== 'undefined' ? window : globalThis);
