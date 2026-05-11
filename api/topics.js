// api/topics.js — 주제 추천 API

const GEMINI_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { lang, langName } = req.body || {};

  const fallbacks = {
    en: ['My morning routine','A challenge I faced','Something I learned','Weekend plans','My favorite food'],
    zh: ['我的日常生活','今天的挑战','我学到的东西','周末计划','我喜欢的食物'],
    ja: ['私の日課','今日の挑戦','学んだこと','週末の計画','好きな食べ物']
  };

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Give 5 interesting diary topics for a ${langName} learner. Return ONLY a JSON array in ${langName}: ["topic1","topic2","topic3","topic4","topic5"]` }] }],
          generationConfig: { maxOutputTokens: 200 }
        })
      }
    );
    const data = await geminiRes.json();
    const raw = data.candidates[0].content.parts[0].text.replace(/```json|```/g,'').trim();
    const topics = JSON.parse(raw);
    return res.status(200).json({ topics });
  } catch(e) {
    return res.status(200).json({ topics: fallbacks[lang] || fallbacks.en });
  }
}

