// ============================================================================
// chalk-docx.js — builds Word (.docx) lesson plans that match, cell for cell,
// the blank plans GymOrgPro exports — except Chalk fills in the skills.
//
// GymOrgPro's export is a minimal OOXML package:
//   [Content_Types].xml, _rels/.rels, word/document.xml,
//   word/_rels/document.xml.rels, word/media/banner.<ext>
// and its body is: banner image -> meta lines (TERM/WEEK/DAY/DATE/TIME,
// SQUAD/LENGTH/COACH/ASSISTANT, Lesson Aim) -> "Warm-up" grey bar + an
// Activity/Duration table -> for each circuit a grey bar
// ("Circuit N — Station — X mins") + an Equipment/Skill/KCP/Safety table ->
// "Warm-down" bar + Activity/Duration table -> Notes -> a green "Key" bar.
// Chalk reproduces that exactly, writing the chosen skills into the circuit
// rows (Skill + its coaching points as KCP) instead of leaving them blank.
//
// No libraries. The ZIP is written by hand using STORED (uncompressed) entries,
// which Word accepts — so this works offline from a double-clicked file:// page
// with nothing to install and nothing to fetch.
//
// Skill diagrams are intentionally NOT embedded: the images live as local .gif
// files and a file:// page is not allowed to read their bytes (the same browser
// restriction that broke Babel earlier). GymOrgPro's own template has no
// diagrams either, so the Word output stays faithful; use Print/PDF from Chalk
// if you want the diagrams.
// ============================================================================
(function (global) {
  "use strict";

  // ---- tiny ZIP writer (STORED / no compression) ---------------------------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    if (global.TextEncoder) return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  function b64ToBytes(b64) {
    var bin = global.atob(String(b64 || "").replace(/^data:[^,]*,/, ""));
    var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  // files: [{ name, data: Uint8Array }] -> Uint8Array of a valid .zip
  function zipStore(files) {
    var chunks = [], central = [], offset = 0;

    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

    files.forEach(function (f) {
      var nameBytes = utf8(f.name);
      var data = f.data;
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, data);
      central.push({ name: nameBytes, crc: crc, size: data.length, offset: offset });
      offset += local.length + nameBytes.length + data.length;
    });

    var cdStart = offset, cdChunks = [];
    central.forEach(function (e) {
      var hdr = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(e.crc), u32(e.size), u32(e.size),
        u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset)
      );
      cdChunks.push(new Uint8Array(hdr), e.name);
      offset += hdr.length + e.name.length;
    });

    var end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(offset - cdStart), u32(cdStart), u16(0)
    ));

    var all = chunks.concat(cdChunks, [end]);
    var total = all.reduce(function (n, c) { return n + c.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  // ---- OOXML helpers --------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  var BORDERS = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map(function (s) { return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>'; }).join("");

  function tblPr(width) {
    return '<w:tblPr><w:tblW w:w="' + width + '" w:type="dxa"/><w:tblBorders>' + BORDERS + '</w:tblBorders></w:tblPr>';
  }

  function run(text, opts) {
    opts = opts || {};
    var rPr = "";
    if (opts.b || opts.color || opts.sz || opts.i) {
      rPr = "<w:rPr>" + (opts.b ? "<w:b/>" : "") + (opts.i ? "<w:i/>" : "") +
        (opts.color ? '<w:color w:val="' + opts.color + '"/>' : "") +
        (opts.sz ? '<w:sz w:val="' + opts.sz + '"/>' : "") + "</w:rPr>";
    }
    return "<w:r>" + rPr + '<w:t xml:space="preserve">' + esc(text) + "</w:t></w:r>";
  }

  function para(runsXml, opts) {
    opts = opts || {};
    var pPr = opts.spacing === false ? '<w:pPr><w:spacing w:after="0"/></w:pPr>' : "";
    return "<w:p>" + pPr + (runsXml || "") + "</w:p>";
  }

  function cell(width, xml, fill, valign) {
    return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' +
      (fill ? '<w:shd w:val="clear" w:fill="' + fill + '"/>' : "") +
      (valign ? '<w:vAlign w:val="' + valign + '"/>' : "") +
      "</w:tcPr>" + xml + "</w:tc>";
  }

  // A full-width section bar, e.g. "Circuit 1 — Floor 1 — 15 mins".
  function sectionBar(text, fill, textColor) {
    return "<w:tbl>" + tblPr(9639) + '<w:tblGrid><w:gridCol w:w="9639"/></w:tblGrid>' +
      "<w:tr>" + cell(9639, para(run(text, { b: true, color: textColor || "FFFFFF" })), fill || "808080", "center") + "</w:tr>" +
      "</w:tbl>";
  }

  // The Notes box at the bottom of the plan. One paragraph per line, so a
  // multi-line note (GymOrgPro's standing notes, then anything the coach added
  // for this lesson) keeps its shape in Word. Empty = one blank line to write on.
  function notesXml(text) {
    var lines = String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); });
    var kept = lines.filter(function (l) { return !!l; });
    if (!kept.length) return para("");
    return kept.map(function (l) { return para(run(l)); }).join("");
  }

  // Activity / Duration table (warm-up and warm-down).
  function activityTable(items) {
    var head = "<w:tr>" +
      cell(7639, para(run("Activity", { b: true })), "BFBFBF") +
      cell(2000, para(run("Duration", { b: true })), "BFBFBF") + "</w:tr>";
    var rows = (items || []).map(function (it) {
      var d = it.duration ? it.duration + " min" : "";
      return "<w:tr>" + cell(7639, para(run(it.name || ""))) + cell(2000, para(run(d))) + "</w:tr>";
    }).join("");
    if (!rows) rows = "<w:tr>" + cell(7639, para("")) + cell(2000, para("")) + "</w:tr>";
    return "<w:tbl>" + tblPr(9639) + '<w:tblGrid><w:gridCol w:w="7639"/><w:gridCol w:w="2000"/></w:tblGrid>' + head + rows + "</w:tbl>";
  }

  // Equipment | Skill | KCP | Safety table for one circuit. Skills fill the rows;
  // blank rows pad it out so a coach can still write on the printed page.
  // An inline picture (used for the banner and for skill diagrams).
  function pic(rid, cx, cy, id) {
    return "<w:r><w:drawing>" +
      '<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="Picture' + id + '"/><wp:cNvGraphicFramePr>' +
      '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="Picture' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>' +
      "<a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>";
  }

  // Collects the diagrams a plan actually uses, giving each a relationship id and
  // a media filename, scaled to fit the Skill column. The bytes come from
  // window.CHALK_IMG (images-b64.js) because a file:// page can't read image files.
  function imageCollector() {
    var lib = global.CHALK_IMG || {};
    var used = {}, order = [], nextId = 2; // rId1 is reserved for the banner
    var MAX_CX = 1150000, MAX_CY = 800000; // EMU (~1.2in x 0.83in)
    return {
      lookup: function (fname) {
        if (!fname) return null;
        if (used[fname]) return used[fname];
        var rec = lib[fname];
        if (!rec || !rec.d) return null;
        var w = rec.w || 120, h = rec.h || 90;
        var scale = Math.min(MAX_CX / (w * 9525), MAX_CY / (h * 9525), 1);
        var e = {
          rid: "rId" + nextId, id: nextId, ext: rec.e || "gif", data: rec.d,
          file: "media/img" + nextId + "." + (rec.e || "gif"),
          cx: Math.round(w * 9525 * scale), cy: Math.round(h * 9525 * scale),
        };
        nextId++; used[fname] = e; order.push(e);
        return e;
      },
      all: function () { return order; },
    };
  }

  function circuitTable(rows, minBlank, imgs) {
    var W = 2410;
    var head = "<w:tr>" + ["Equipment", "Skill", "KCP", "Safety"].map(function (h) {
      return cell(W, para(run(h, { b: true })), "BFBFBF");
    }).join("") + "</w:tr>";

    var body = (rows || []).map(function (r) {
      // Skill cell: the diagram (when the skill has one), then the name in bold
      // with its family underneath in small grey — matching the on-screen plan.
      var picXml = "";
      (r.img || []).slice(0, 2).forEach(function (fname) {
        var rec = imgs && imgs.lookup(fname);
        if (rec) picXml += para(pic(rec.rid, rec.cx, rec.cy, rec.id), { spacing: false });
      });
      var skillXml = picXml + para(run(r.skill || "", { b: true }), { spacing: false }) +
        (r.sub ? para(run(r.sub, { color: "8A8A8A", sz: "16" })) : "");
      // KCP cell: one paragraph per coaching point.
      var cues = (r.kcp || []).filter(Boolean);
      var kcpXml = cues.length
        ? cues.map(function (c, i) { return para(run("• " + c, { sz: "18" }), { spacing: i < cues.length - 1 ? false : true }); }).join("")
        : para("");
      return "<w:tr>" +
        cell(W, para(run(r.equipment || ""))) +
        cell(W, skillXml) +
        cell(W, kcpXml) +
        cell(W, para(run(r.safety || "")), "FBFBFB") +
        "</w:tr>";
    }).join("");

    var blanks = Math.max(0, (minBlank == null ? 2 : minBlank) - 0);
    var pad = "";
    for (var i = 0; i < blanks; i++) {
      pad += "<w:tr>" + cell(W, para("")) + cell(W, para("")) + cell(W, para("")) + cell(W, para("", ""), "FBFBFB") + "</w:tr>";
    }

    return "<w:tbl>" + tblPr(9639) +
      '<w:tblGrid><w:gridCol w:w="' + W + '"/><w:gridCol w:w="' + W + '"/><w:gridCol w:w="' + W + '"/><w:gridCol w:w="' + W + '"/></w:tblGrid>' +
      head + body + pad + "</w:tbl>";
  }

  function labelled(pairs) {
    return pairs.filter(function (p) { return p[1]; }).map(function (p) {
      return run(p[0] + ": ", { b: true }) + run(p[1] + "   ");
    }).join("");
  }

  var SPACER = para("");

  // ---- the document ---------------------------------------------------------
  // spec = {
  //   banner: {base64, ext, width, height},   // optional
  //   term, week, day, date, time, squad, length, coach, assistant, aim,
  //   warmup:   [{name, duration}],
  //   warmdown: [{name, duration}],
  //   circuits: [{ title, rows: [{equipment, skill, sub, kcp:[], safety}] }],
  //   notes: "free text for the Notes box at the bottom (GymOrgPro's standing
  //           lesson-plan notes, plus anything the coach added in Chalk)",
  // }
  function buildDocx(spec) {
    spec = spec || {};
    var imgs = imageCollector();
    var hasBanner = !!(spec.banner && spec.banner.base64);
    var ext = hasBanner ? String(spec.banner.ext || "png").toLowerCase() : "png";
    if (ext === "jpg") ext = "jpeg";

    var bannerXml = "";
    if (hasBanner) {
      // Fit the banner to the text width (9639 dxa ≈ 6.12M EMU), keeping aspect.
      var cx = 6120130;
      var w = Number(spec.banner.width) || 1000;
      var h = Number(spec.banner.height) || 260;
      var cy = Math.round(cx * (h / w));
      bannerXml = "<w:p><w:r><w:drawing>" +
        '<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
        '<wp:docPr id="1" name="Banner"/><wp:cNvGraphicFramePr>' +
        '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:nvPicPr><pic:cNvPr id="0" name="Banner"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>' +
        "<a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
        "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>";
    }

    var metaLine1 = para(labelled([
      ["TERM", spec.term], ["WEEK", spec.week], ["DAY", spec.day], ["DATE", spec.date], ["TIME", spec.time],
    ]));
    var metaLine2 = para(labelled([
      ["SQUAD", spec.squad], ["LESSON LENGTH", spec.length], ["COACH", spec.coach], ["ASSISTANT COACH", spec.assistant],
    ]));
    var aimLine = para(run("Lesson Aim/Theme: ", { b: true }) + run(spec.aim || "_______________________________________________________"));

    var circuitsXml = (spec.circuits || []).map(function (c) {
      return sectionBar(c.title) + circuitTable(c.rows, c.rows && c.rows.length ? 1 : 5, imgs) + SPACER;
    }).join("");

    // Warm-up / warm-down: GymOrgPro's standard activity list, plus (when Chalk
    // has added skills to those blocks) a full Skill/KCP table like a circuit.
    var warmRows = spec.warmupRows || [];
    var coolRows = spec.warmdownRows || [];
    var warmSkillsXml = warmRows.length ? circuitTable(warmRows, 0, imgs) : "";
    var coolSkillsXml = coolRows.length ? circuitTable(coolRows, 0, imgs) : "";

    var body =
      bannerXml + metaLine1 + metaLine2 + aimLine + SPACER +
      sectionBar("Warm-up") + activityTable(spec.warmup) + warmSkillsXml + SPACER +
      circuitsXml +
      sectionBar("Warm-down") + activityTable(spec.warmdown && spec.warmdown.length ? spec.warmdown : [{ name: "Gymnasts stand on line. Coach dismisses gymnasts.", duration: "" }]) + coolSkillsXml + SPACER +
      "<w:tbl>" + tblPr(9639) + '<w:tblGrid><w:gridCol w:w="9639"/></w:tblGrid>' +
        "<w:tr>" + cell(9639, para(run("Notes", { b: true })), "BFBFBF") + "</w:tr>" +
        "<w:tr>" + cell(9639, notesXml(spec.notes)) + "</w:tr>" +
      "</w:tbl>" + SPACER +
      sectionBar("Key: Coach position", "C2D69B", "26331A") +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';

    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      body + "</w:body></w:document>";

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="gif" ContentType="image/gif"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>";

    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>";

    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      (hasBanner ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/banner.' + ext + '"/>' : "") +
      imgs.all().map(function (e) {
        return '<Relationship Id="' + e.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + e.file + '"/>';
      }).join("") +
      "</Relationships>";

    var files = [
      { name: "[Content_Types].xml", data: utf8(contentTypes) },
      { name: "_rels/.rels", data: utf8(rootRels) },
      { name: "word/document.xml", data: utf8(documentXml) },
      { name: "word/_rels/document.xml.rels", data: utf8(docRels) },
    ];
    if (hasBanner) files.push({ name: "word/media/banner." + ext, data: b64ToBytes(spec.banner.base64) });
    imgs.all().forEach(function (e) {
      files.push({ name: "word/" + e.file, data: b64ToBytes(e.data) });
    });

    return zipStore(files);
  }

  // ---- download helpers -----------------------------------------------------
  function safeName(s) {
    return String(s || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 90);
  }

  function saveBytes(bytes, filename, mime) {
    var blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function saveDocx(spec, filename) {
    saveBytes(buildDocx(spec), filename,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }

  // Bundle many lesson plans into one .zip of .docx files.
  function saveDocxZip(items, zipName) {
    var files = items.map(function (it) {
      return { name: it.filename, data: buildDocx(it.spec) };
    });
    saveBytes(zipStore(files), zipName, "application/zip");
  }

  global.ChalkDocx = {
    buildDocx: buildDocx,
    saveDocx: saveDocx,
    saveDocxZip: saveDocxZip,
    zipStore: zipStore,
    safeName: safeName,
  };
})(typeof window !== "undefined" ? window : this);
