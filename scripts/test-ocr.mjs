const url = "https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_02192026-4425";
const resp = await fetch(url);
const pdfBytes = new Uint8Array(await resp.arrayBuffer());
const text = new TextDecoder("latin1").decode(pdfBytes);

// Step 1: Resolve indirect object values
const objectValues = {};
const simpleObjRegex = /(\d+)\s+0\s+obj\s*\n?(\d+)\s*\n?endobj/g;
let m;
while ((m = simpleObjRegex.exec(text)) !== null) {
  objectValues[m[1]] = m[2];
}
console.log("Object values:", objectValues);

// Step 2: Find obj markers
const objRegex = /(\d+)\s+\d+\s+obj\b/g;
let objMatch;
while ((objMatch = objRegex.exec(text)) !== null) {
  const objNum = objMatch[1];
  const afterObj = objMatch.index + objMatch[0].length;

  // Find <<
  const dictStart = text.indexOf("<<", afterObj);
  if (dictStart === -1 || dictStart > afterObj + 10) {
    console.log(`Obj ${objNum}: no << within 10 chars (gap=${dictStart - afterObj})`);
    continue;
  }

  // Parse nested dict
  let depth = 0, dictEnd = -1;
  for (let i = dictStart; i < text.length - 1; i++) {
    if (text[i] === "<" && text[i+1] === "<") { depth++; i++; }
    else if (text[i] === ">" && text[i+1] === ">") { depth--; i++; if (depth === 0) { dictEnd = i + 1; break; } }
  }
  if (dictEnd === -1) { console.log(`Obj ${objNum}: dict parse failed`); continue; }

  const dict = text.slice(dictStart + 2, dictEnd - 2);
  const isImage = dict.includes("/Image") && dict.includes("/Subtype");

  if (!isImage) continue;

  console.log(`\nObj ${objNum}: IMAGE found!`);
  console.log(`  Dict (first 200): ${dict.replace(/\s+/g, " ").trim().slice(0, 200)}`);

  // Find stream
  const streamPos = text.indexOf("stream", dictEnd);
  const gap = streamPos - dictEnd;
  console.log(`  stream keyword at ${streamPos}, gap from dictEnd: ${gap}`);

  if (streamPos === -1 || gap > 20) {
    console.log(`  SKIP: stream too far or not found`);
    continue;
  }

  let dataStart = streamPos + 6;
  if (pdfBytes[dataStart] === 0x0d) dataStart++;
  if (pdfBytes[dataStart] === 0x0a) dataStart++;

  // Resolve length
  const indirectRef = dict.match(/\/Length\s+(\d+)\s+0\s+R/);
  const directLen = dict.match(/\/Length\s+(\d+)(?!\s+0\s+R)/);
  const lengthStr = indirectRef ? objectValues[indirectRef[1]] : directLen?.[1];
  console.log(`  indirectRef: ${indirectRef?.[0]}, directLen: ${directLen?.[0]}`);
  console.log(`  resolved length: ${lengthStr}`);

  if (!lengthStr) {
    console.log(`  SKIP: no length`);
    continue;
  }

  const streamLength = parseInt(lengthStr);
  console.log(`  Stream: ${streamLength} bytes at offset ${dataStart}`);

  const hasCCITT = dict.includes("/CCITTFaxDecode");
  const hasJPEG = dict.includes("/DCTDecode");
  console.log(`  CCITT: ${hasCCITT}, JPEG: ${hasJPEG}`);

  if (hasCCITT) {
    const w = dict.match(/\/Width\s+(\d+)/)?.[1] ?? dict.match(/\/Columns\s+(\d+)/)?.[1];
    const h = dict.match(/\/Height\s+(\d+)/)?.[1] ?? dict.match(/\/Rows\s+(\d+)/)?.[1];
    console.log(`  Dimensions: ${w}x${h}`);
  }
}
