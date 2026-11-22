// Dịch prompt Việt -> Anh bằng Google Dịch (miễn phí, không cần khóa).
// Chỉ gửi đoạn chữ prompt, không gửi ảnh hay dữ liệu cá nhân. Dịch sát chữ nên giữ đúng văn phong câu tiếng Việt.

async function googleTranslate(text) {
  // giữ cách gọi ảnh: "ảnh 1" -> "image 1" trước khi dịch
  const src = text.replace(/ảnh\s*(\d+)/gi, 'image $1');
  const parts = [];
  for (const block of src.split(/(\n+)/)) {
    if (!block.trim()) { parts.push({ raw: block }); continue; }
    // cắt khối dài theo câu để không vượt giới hạn
    let cur = '';
    for (const sentence of block.split(/(?<=[.;!?])\s+/)) {
      if (cur && (cur + ' ' + sentence).length > 1200) { parts.push({ q: cur }); cur = sentence; }
      else cur = cur ? cur + ' ' + sentence : sentence;
    }
    if (cur) parts.push({ q: cur });
  }
  let out = '';
  for (const part of parts) {
    if (part.raw !== undefined) { out += part.raw; continue; }
    const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=en&dt=t', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: part.q }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error('Google Dịch lỗi ' + res.status);
    const data = await res.json();
    out += (data[0] || []).map((x) => x[0]).join('') + ' ';
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\b[Pp]hoto (\d)/g, 'image $1')
    .replace(/\b[Pp]icture (\d)/g, 'image $1')
    .replace(/\bcostumes\b/g, 'outfits').replace(/\bcostume\b/g, 'outfit').replace(/\bCostume\b/g, 'Outfit')
    .trim();
}

// Trả về { en, engine }
async function viToEn(text) {
  if (!text || !text.trim()) return { en: '', engine: null };
  try {
    return { en: await googleTranslate(text), engine: 'google' };
  } catch (e) {
    throw new Error('Google Dịch lỗi: ' + e.message + '. Kiểm tra mạng hoặc tự gõ ô tiếng Anh.');
  }
}

module.exports = { viToEn };
