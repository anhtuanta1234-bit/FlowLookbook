// Dọn các đoạn prompt phong cách chụp 35mm đã bị bỏ từ v1.1.18 / v1.1.21.
// Mẫu mặc định chỉ áp dụng cho dự án MỚI — dự án cũ lưu sẵn prompt trong project.json
// nên phải dọn riêng, nếu không người dùng vẫn thấy câu cũ dù đã cập nhật app.

const MARKERS = /shot on 35mm|slight film grain|Phong cách ảnh chụp đời thực|Real-life photo style|Tránh:\s*da nhựa|Avoid:\s*plastic skin/i;
// Phong cách MỚI (KOL/KOC, ảnh đời thực, KHÔNG có 35mm/film grain) là prompt mặc định hiện tại:
// phải giữ nguyên, không được dọn nhầm như đoạn phong cách cũ.
const NEW_STYLE = /^(?:Phong cách ảnh chụp đời thực|(?:the\s+)?real-life photo style)[\s\S]*\bKOL\s*\/\s*KOC\b/i;
const isNewStyle = (p) => NEW_STYLE.test(p) && !/shot on 35mm|slight film grain/i.test(p);
// Đoạn đứng riêng (toàn bộ là phong cách chụp / danh sách "Tránh") → bỏ cả đoạn.
const DEAD_PARAGRAPH = /^(?:Phong cách ảnh chụp đời thực|Real-life photo style|Tránh:[^\n]*(?:da nhựa|plastic skin)|Avoid:[^\n]*(?:plastic skin|da nhựa))/i;
// Câu dính vào cuối đoạn yêu cầu → chỉ bỏ câu đó, giữ lại yêu cầu chính.
const STYLE_SENTENCE = /shot on 35mm|slight film grain|phong cách ảnh chụp đời thực|real-life photo style|da nhựa|plastic skin|render 3d|texture vải|fabric texture/i;

function cleanPrompt(text) {
  if (typeof text !== 'string' || !MARKERS.test(text)) return text;
  const kept = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && (isNewStyle(p) || !DEAD_PARAGRAPH.test(p)))
    .map((p) => {
      if (isNewStyle(p) || !STYLE_SENTENCE.test(p)) return p;
      // Chia theo câu: dấu "." trong f/2.8 không bị coi là ranh giới (không có space sau nó).
      return p.split(/(?<=[.!?])\s+/)
        .filter((s) => !STYLE_SENTENCE.test(s))
        .join(' ')
        .trim();
    })
    .filter(Boolean);
  return kept.join('\n\n');
}

// Đi qua mọi trường chuỗi trong project (promptVi/promptEn/enFrom/runs[].promptEn/...).
function cleanPromptsIn(obj) {
  if (typeof obj === 'string') return cleanPrompt(obj);
  if (Array.isArray(obj)) return obj.map(cleanPromptsIn);
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) obj[key] = cleanPromptsIn(obj[key]);
  }
  return obj;
}

module.exports = { cleanPrompt, cleanPromptsIn, MARKERS };
