// api/analyze.js — Vercel Serverless Function
// Gemini API 키가 서버에서만 사용됨 (클라이언트에 절대 노출되지 않음)

import { createClient } from '@supabase/supabase-js';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SUPA_URL   = process.env.SUPABASE_URL;
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY; // service role key (관리자용)

const SYSTEM_PROMPTS = {
  en: `You are an expert English language tutor for Korean learners. Analyze this diary entry comprehensively.
Assess language level using: American school grade equivalent (K-12), CEFR (A1-C2), TOEIC score range, TOEFL iBT score range.
Respond ONLY in valid JSON (no markdown, no backticks, no preamble):
{
  "overall": "2-3 sentence warm overall impression in Korean",
  "corrected": "lightly corrected version keeping the writer's voice (fix only clear errors)",
  "grammar_score": 0-100,
  "vocab_score": 0-100,
  "naturalness_score": 0-100,
  "level": {
    "grade": "e.g. Grade 5-6 equivalent",
    "cefr": "B1",
    "toeic_range": "550-650",
    "toefl_range": "57-74",
    "summary_ko": "한 줄 설명 (예: 중학교 2학년 수준의 자연스러운 영어)"
  },
  "errors": [{"original":"...","corrected":"...","explanation_ko":"...","category":"grammar|vocab|naturalness"}],
  "good_points": ["string in Korean"],
  "new_expressions": [{"expression":"...","meaning_ko":"...","example":"..."}],
  "next_challenge": "specific writing challenge for tomorrow in Korean"
}`,
  zh: `You are an expert Chinese (Mandarin) language tutor for Korean learners. Analyze this diary entry.
Assess level: HSK (1-6+), CEFR (A1-C2), native speaker age equivalent.
Respond ONLY in valid JSON:
{
  "overall": "2-3 sentence warm overall impression in Korean",
  "corrected": "lightly corrected version",
  "grammar_score": 0-100,
  "vocab_score": 0-100,
  "naturalness_score": 0-100,
  "level": {"grade":"...","cefr":"B1","toeic_range":"N/A","toefl_range":"N/A","hsk":"3","summary_ko":"한 줄 설명"},
  "errors": [{"original":"...","corrected":"...","explanation_ko":"...","category":"grammar|vocab|naturalness","pinyin_hint":"..."}],
  "good_points": ["string in Korean"],
  "new_expressions": [{"expression":"...","pinyin":"...","meaning_ko":"...","example":"..."}],
  "next_challenge": "in Korean"
}`,
  ja: `You are an expert Japanese language tutor for Korean learners. Analyze this diary entry.
Assess level: JLPT (N5-N1), CEFR (A1-C2), native speaker age/school year equivalent.
Respond ONLY in valid JSON:
{
  "overall": "2-3 sentence warm overall impression in Korean",
  "corrected": "lightly corrected version",
  "grammar_score": 0-100,
  "vocab_score": 0-100,
  "naturalness_score": 0-100,
  "level": {"grade":"...","cefr":"B1","toeic_range":"N/A","toefl_range":"N/A","jlpt":"N3","summary_ko":"한 줄 설명"},
  "errors": [{"original":"...","corrected":"...","explanation_ko":"...","category":"grammar|vocab|naturalness","reading":"..."}],
  "good_points": ["string in Korean"],
  "new_expressions": [{"expression":"...","reading":"...","meaning_ko":"...","example":"..."}],
  "next_challenge": "in Korean"
}`
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. 인증 확인 (Supabase JWT)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const supaAdmin = createClient(SUPA_URL, SUPA_SERVICE);
  const { data: { user }, error: authErr } = await supaAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: '인증 실패. 다시 로그인해주세요.' });

  // 2. 요청 파싱
  const { text, lang } = req.body || {};
  if (!text || text.length < 5) return res.status(400).json({ error: '일기 내용이 너무 짧습니다.' });
  if (!['en','zh','ja'].includes(lang)) return res.status(400).json({ error: '지원하지 않는 언어입니다.' });

  // 3. Gemini API 호출 (서버에서만!)
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPTS[lang] }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 1500 }
        })
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok || geminiData.error) {
      throw new Error(geminiData.error?.message || 'Gemini API 오류');
    }

    const raw = geminiData.candidates[0].content.parts
      .map(p => p.text || '').join('')
      .replace(/```json|```/g, '').trim();

    const result = JSON.parse(raw);
    return res.status(200).json({ result });

  } catch(e) {
    console.error('Analyze error:', e);
    return res.status(500).json({ error: e.message || '분석 중 오류가 발생했습니다.' });
  }
}
