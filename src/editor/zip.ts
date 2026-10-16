// Leitor mínimo de ZIP: só o necessário para abrir as máscaras que o SAM 3
// devolve (uma PNG por objeto encontrado). Usa o descompressor do navegador.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export async function readZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // Fim do diretório central: assinatura 0x06054b50, procurada de trás pra frente.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("ZIP inválido");
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const out: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const localName = view.getUint16(local + 26, true);
    const localExtra = view.getUint16(local + 28, true);
    const start = local + 30 + localName + localExtra;
    const raw = bytes.subarray(start, start + size);
    if (name.endsWith("/")) continue;
    if (method === 0) out.push({ name, data: raw.slice() });
    else if (method === 8) {
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      out.push({ name, data: new Uint8Array(await new Response(stream).arrayBuffer()) });
    }
  }
  return out;
}
