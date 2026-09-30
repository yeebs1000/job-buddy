/** A small, readable synthetic resume; never uses a real applicant's file. */
export function pdf(lines: string[], columns = false) {
  const escape = (value: string) => value.replace(/[\\()]/g, "\\$&");
  const stream = columns ? `BT /F1 10 Tf\n${lines.map((line, index) => line.split("\t").map((part, column) => `1 0 0 1 ${column ? 420 : 50} ${750 - index * 14} Tm (${escape(part)}) Tj`).join("\n")).join("\n")}\nET`
    : `BT /F1 12 Tf 50 750 Td 18 TL\n${lines.map((line, index) => `${index ? "T* " : ""}(${escape(line)}) Tj`).join("\n")}\nET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(value);
}
