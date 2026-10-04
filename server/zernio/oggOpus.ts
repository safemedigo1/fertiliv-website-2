/**
 * Remux a Chrome/Edge MediaRecorder WebM Opus recording into the Ogg Opus
 * container WhatsApp requires for a voice note. The Opus packets are copied;
 * nothing is re-encoded.
 */

const CONTAINERS = new Set<number>([
  0x1a45dfa3, // EBML
  0x18538067, // Segment
  0x1549a966, // Info
  0x1654ae6b, // Tracks
  0xae, // TrackEntry
  0x1f43b675, // Cluster
  0xa0, // BlockGroup
  0x114d9b74, // SeekHead
  0x1c53bb6b, // Cues
  0xbb, // CuePoint
]);

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 0x80000000) !== 0 ? ((value << 1) ^ 0x04c11db7) >>> 0 : (value << 1) >>> 0;
    }
    table[index] = value;
  }
  return table;
})();

type Vint = { value: number | null; next: number };

function readVint(data: Uint8Array, offset: number, keepMarker: boolean): Vint | null {
  if (offset >= data.length) return null;
  const first = data[offset] ?? 0;
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > data.length || mask === 0) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let unknown = !keepMarker && value === mask - 1;
  for (let index = 1; index < length; index += 1) {
    const byte = data[offset + index] ?? 0;
    value = value * 256 + byte;
    if (byte !== 0xff) unknown = false;
  }
  if (unknown) return { value: null, next: offset + length };
  if (!Number.isSafeInteger(value)) return null;
  return { value, next: offset + length };
}

function walk(data: Uint8Array, start: number, end: number, visit: (id: number, contentStart: number, contentEnd: number) => void) {
  let offset = start;
  while (offset + 2 <= end) {
    const id = readVint(data, offset, true);
    const size = id ? readVint(data, id.next, false) : null;
    if (!id?.value || !size) break;
    const contentEnd = size.value === null ? end : size.next + size.value;
    if (contentEnd < size.next || contentEnd > end) break;
    visit(id.value, size.next, contentEnd);
    if (CONTAINERS.has(id.value)) walk(data, size.next, contentEnd, visit);
    if (size.value === null || contentEnd <= offset) break;
    offset = contentEnd;
  }
}

function text(data: Uint8Array, start: number, end: number) {
  return new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(start, end));
}

function unsigned(data: Uint8Array, start: number, end: number) {
  let value = 0;
  for (let index = start; index < end && index < start + 6; index += 1) value = value * 256 + (data[index] ?? 0);
  return value;
}

function opusFrameSamples(config: number) {
  if (config < 12) return [480, 960, 1920, 2880][config % 4] ?? 960;
  if (config < 16) return config % 2 === 0 ? 480 : 960;
  return [120, 240, 480, 960][config % 4] ?? 960;
}

function opusPacketSamples(packet: Uint8Array) {
  const toc = packet[0] ?? 0;
  const samples = opusFrameSamples(toc >> 3);
  const code = toc & 0x03;
  if (code === 0) return samples;
  if (code === 1 || code === 2) return samples * 2;
  const frames = (packet[1] ?? 0) & 0x3f;
  return samples * Math.max(1, frames);
}

function packetsFromBlock(data: Uint8Array, start: number, end: number): Uint8Array[] | null {
  const track = readVint(data, start, false);
  if (!track || track.value === null || track.next + 3 > end) return null;
  const flags = data[track.next + 2] ?? 0;
  const lacing = flags & 0x06;
  const payloadStart = track.next + 3;
  const payload = data.subarray(payloadStart, end);
  if (lacing === 0) return payload.length > 0 ? [payload] : [];
  if (payload.length === 0) return [];
  const count = (payload[0] ?? 0) + 1;
  if (lacing === 4) {
    const frameSize = Math.floor((payload.length - 1) / count);
    if (frameSize <= 0) return null;
    return Array.from({ length: count }, (_, index) => payload.subarray(1 + index * frameSize, 1 + (index + 1) * frameSize));
  }
  if (lacing !== 2) return null;
  const sizes: number[] = [];
  let cursor = 1;
  for (let frame = 0; frame < count - 1; frame += 1) {
    let size = 0;
    while (cursor < payload.length && payload[cursor] === 255) {
      size += 255;
      cursor += 1;
    }
    if (cursor >= payload.length) return null;
    size += payload[cursor] ?? 0;
    cursor += 1;
    sizes.push(size);
  }
  const used = sizes.reduce((sum, size) => sum + size, 0);
  sizes.push(payload.length - cursor - used);
  if (sizes.some((size) => size < 0) || cursor + used > payload.length) return null;
  const frames: Uint8Array[] = [];
  for (const size of sizes) {
    frames.push(payload.subarray(cursor, cursor + size));
    cursor += size;
  }
  return frames;
}

export type WebmOpusTrack = { head: Uint8Array; packets: Uint8Array[]; channels: number };

export function parseWebmOpus(data: Uint8Array): WebmOpusTrack | null {
  if (data.length < 16 || data[0] !== 0x1a || data[1] !== 0x45 || data[2] !== 0xdf || data[3] !== 0xa3) return null;
  let currentTrack = 0;
  let opusTrack = 0;
  // A property stays nullable after the walk. A local assigned only inside the callback is treated as still null.
  const found: { head: Uint8Array | null } = { head: null };
  let corrupt = false;
  const packets: Uint8Array[] = [];
  walk(data, 0, data.length, (id, start, end) => {
    if (id === 0xd7) currentTrack = unsigned(data, start, end);
    if (id === 0x86 && text(data, start, end) === "A_OPUS") opusTrack = currentTrack || 1;
    if (id === 0x63a2 && opusTrack !== 0 && currentTrack === opusTrack) found.head = data.subarray(start, end);
    if ((id === 0xa3 || id === 0xa1) && opusTrack !== 0 && trackNumber(data, start) === opusTrack) {
      const frames = packetsFromBlock(data, start, end);
      if (!frames) corrupt = true;
      else packets.push(...frames.filter((frame) => frame.length > 0));
    }
  });
  const head = found.head;
  if (corrupt || !head || head.length < 19 || text(head, 0, 8) !== "OpusHead") return null;
  return { head, packets, channels: head[9] ?? 0 };
}

function trackNumber(data: Uint8Array, start: number) {
  return readVint(data, start, false)?.value ?? 0;
}

function oggCrc(page: Uint8Array) {
  let crc = 0;
  for (const byte of page) crc = (OGG_CRC_TABLE[(crc >>> 24) ^ byte] ^ (crc << 8)) >>> 0;
  return crc;
}

function writeGranule(page: Uint8Array, granule: number) {
  let rest = Math.max(0, Math.floor(granule));
  for (let index = 0; index < 8; index += 1) {
    page[6 + index] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }
}

function oggPage(packets: Uint8Array[], granule: number, headerType: number, serial: number, sequence: number) {
  const segments: number[] = [];
  const body: number[] = [];
  for (const packet of packets) {
    // A packet whose length is a multiple of 255 ends with a zero segment.
    let remaining = packet.length;
    let offset = 0;
    if (remaining === 0) segments.push(0);
    while (remaining > 0) {
      const size = Math.min(255, remaining);
      segments.push(size);
      for (let index = 0; index < size; index += 1) body.push(packet[offset + index] ?? 0);
      offset += size;
      remaining -= size;
      if (remaining === 0 && size === 255) segments.push(0);
    }
  }
  const page = new Uint8Array(27 + segments.length + body.length);
  page.set([0x4f, 0x67, 0x67, 0x53, 0, headerType], 0);
  writeGranule(page, granule);
  page[14] = serial & 0xff;
  page[15] = (serial >>> 8) & 0xff;
  page[16] = (serial >>> 16) & 0xff;
  page[17] = (serial >>> 24) & 0xff;
  page[18] = sequence & 0xff;
  page[19] = (sequence >>> 8) & 0xff;
  page[20] = (sequence >>> 16) & 0xff;
  page[21] = (sequence >>> 24) & 0xff;
  page[26] = segments.length;
  page.set(segments, 27);
  page.set(body, 27 + segments.length);
  const crc = oggCrc(page);
  page[22] = crc & 0xff;
  page[23] = (crc >>> 8) & 0xff;
  page[24] = (crc >>> 16) & 0xff;
  page[25] = (crc >>> 24) & 0xff;
  return page;
}

function opusTags() {
  const vendor = new TextEncoder().encode("fertiliv");
  const packet = new Uint8Array(8 + 4 + vendor.length + 4);
  packet.set(new TextEncoder().encode("OpusTags"), 0);
  packet[8] = vendor.length & 0xff;
  packet[9] = (vendor.length >>> 8) & 0xff;
  packet.set(vendor, 12);
  return packet;
}

export function buildOggOpus(head: Uint8Array, packets: Uint8Array[]) {
  const serial = 0x4f707573;
  const pages: Uint8Array[] = [oggPage([head], 0, 0x02, serial, 0), oggPage([opusTags()], 0, 0, serial, 1)];
  let sequence = 2;
  let granule = 0;
  let batch: Uint8Array[] = [];
  let segments = 0;
  const flush = (eos: boolean) => {
    if (batch.length === 0) return;
    pages.push(oggPage(batch, granule, eos ? 0x04 : 0, serial, sequence));
    sequence += 1;
    batch = [];
    segments = 0;
  };
  packets.forEach((packet, index) => {
    const packetSegments = Math.max(1, Math.ceil(packet.length / 255));
    if (segments + packetSegments > 255) flush(false);
    granule += opusPacketSamples(packet);
    batch.push(packet);
    segments += packetSegments;
    if (index === packets.length - 1) flush(true);
  });
  const size = pages.reduce((sum, page) => sum + page.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const page of pages) {
    output.set(page, offset);
    offset += page.length;
  }
  return output;
}

export function isOggOpusMono(data: Uint8Array) {
  if (data.length < 64 || text(data, 0, 4) !== "OggS") return false;
  const marker = text(data, 0, Math.min(data.length, 128));
  const headAt = marker.indexOf("OpusHead");
  if (headAt < 0 || headAt + 9 >= data.length) return false;
  return data[headAt + 9] === 1;
}

export function remuxWebmOpusToOgg(data: Uint8Array): Buffer {
  const parsed = parseWebmOpus(data);
  if (!parsed) throw new Error("voice_note_container_unsupported");
  if (parsed.channels !== 1) throw new Error("voice_note_not_mono");
  if (parsed.packets.length === 0) throw new Error("voice_note_empty");
  const ogg = buildOggOpus(parsed.head, parsed.packets);
  if (!isOggOpusMono(ogg)) throw new Error("voice_note_container_unsupported");
  return Buffer.from(ogg);
}
