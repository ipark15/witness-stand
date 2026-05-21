import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude(prompt) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    temperature: 0.85,
    messages: [{ role: 'user', content: prompt }],
  });
  return message.content[0].text.trim();
}

function computeScoring(userMessage, topic) {
  const words = userMessage.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const topicKeywords = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const msgLower = userMessage.toLowerCase();

  let qualityDelta = 0;
  let juryDelta = 0;

  if (wordCount > 80) {
    qualityDelta += 10;
    juryDelta += 5;
  } else if (wordCount >= 40) {
    qualityDelta += 5;
    juryDelta += 2;
  } else if (wordCount < 20) {
    juryDelta -= 5;
  }

  const keywordHits = topicKeywords.filter((kw) => msgLower.includes(kw)).length;
  qualityDelta += Math.min(keywordHits * 3, 15);
  juryDelta += Math.min(keywordHits * 2, 8);

  if (msgLower.includes('co-counsel')) {
    juryDelta -= 5;
  }

  return { qualityDelta, juryDelta };
}

function detectRole(text) {
  const lower = text.toLowerCase();
  if (
    lower.startsWith('[judge]') ||
    lower.includes('order in the court') ||
    lower.includes('the court notes') ||
    lower.includes('court will') ||
    lower.includes('sustained') ||
    lower.includes('overruled') ||
    lower.includes('so noted')
  ) {
    return 'judge';
  }
  return 'counsel';
}

app.post('/api/subtopics', async (req, res) => {
  const { subject, topic } = req.body;
  if (!subject || !topic) {
    return res.status(400).json({ error: 'subject and topic are required' });
  }

  const prompt = `Generate exactly 4 specific academic subtopics for a student being cross-examined on "${topic}" within the subject of ${subject}. Each subtopic should be a concise phrase (4–7 words). Return ONLY a valid JSON array of 4 strings, nothing else. Example format: ["Subtopic One Here", "Subtopic Two Here", "Subtopic Three Here", "Subtopic Four Here"]`;

  try {
    const raw = await callClaude(prompt);
    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      const subtopics = JSON.parse(match[0]);
      return res.json({ subtopics: subtopics.slice(0, 4) });
    }
    throw new Error('No JSON array found');
  } catch (err) {
    console.error('Subtopics error:', err.message);
    res.json({
      subtopics: [
        'Core Definitions & Concepts',
        'Fundamental Principles',
        'Real-World Applications',
        'Advanced Edge Cases',
      ],
    });
  }
});

app.post('/api/co-counsel', async (req, res) => {
  const { subject, topic, currentSubtopic, messageHistory } = req.body;
  if (!subject || !topic) {
    return res.status(400).json({ error: 'subject and topic are required' });
  }

  const recentExchange = (messageHistory || [])
    .slice(-4)
    .map((m) => (m.role === 'user' ? `Student: ${m.content}` : `Examiner: ${m.content}`))
    .join('\n');

  const prompt = `You are a knowledgeable co-counsel whispering a hint to a student mid-examination in an academic courtroom.

The student is being examined on:
Subject: ${subject}
Topic: ${topic}
Current Subtopic: ${currentSubtopic}

Recent exchange:
${recentExchange || '(Examination just beginning)'}

Give a brief hint (2–4 sentences) that:
- Surfaces a key concept, definition, or framework relevant to "${currentSubtopic}"
- Does NOT give the full answer — nudges the right direction
- Is written as a hushed aside: "Co-Counsel leans in: ..."
- Helps them structure a more precise, confident response

Keep it under 80 words. Stay in courtroom voice.`;

  try {
    const hint = await callClaude(prompt);
    res.json({ hint });
  } catch (err) {
    console.error('Co-counsel error:', err.message);
    res.status(502).json({ error: 'Co-counsel unavailable', details: err.message });
  }
});

app.post('/api/examine', async (req, res) => {
  const { subject, topic, intensity, messageHistory, currentSubtopic, juryFavor, userMessage } =
    req.body;

  if (!subject || !topic || !userMessage) {
    return res.status(400).json({ error: 'subject, topic, and userMessage are required' });
  }

  const intensityDesc = {
    Preliminary: 'conversational and exploratory — ask open questions, acknowledge correct points warmly, gently redirect gaps',
    Trial: 'rigorous and Socratic — probe for precision, identify gaps clearly, but always point toward what a stronger answer would include',
    Appeal: 'demanding and exacting — require precise technical language, expose logical gaps directly, but frame every critique as a specific standard to meet',
  }[intensity] || 'rigorous and Socratic — probe for precision and guide toward stronger answers';

  const formattedHistory = (messageHistory || [])
    .slice(-10)
    .map((m) => {
      if (m.role === 'user') return `Defense: ${m.content}`;
      return `${m.speakerRole === 'judge' ? 'Judge' : 'Counsel'}: ${m.content}`;
    })
    .join('\n');

  const prompt = `System:
You are an examiner in a courtroom-style academic quiz. You ask questions to check understanding — not to drill for perfection.
You alternate between two roles:
  [COUNSEL] — Examining Counsel: asks questions, accepts reasonable answers, keeps things moving
  [JUDGE] — Presiding Judge: brief procedural remarks and topic transitions

Tone and approach:
- Think of this as a friendly oral exam, not a deposition. You are checking that the student understands the idea, not testing whether they can recite a textbook.
- If the student's answer shows they get the gist — accept it and move on. Most answers that are roughly correct are good enough.
- Only push back if the answer is clearly wrong, contradicts itself, or completely misses the point.
- A one-sentence correct answer is perfectly fine. Never demand more words or deeper explanation unless the answer is actually wrong.
- Acknowledge correct answers warmly and briefly, then ask the next question on a fresh topic.
- Use light courtroom flavor ("Noted, Counsel.", "The court is satisfied.", "Very well.") but keep it natural, not theatrical.

Rules:
- Begin your response with exactly [COUNSEL] or [JUDGE] on a separate line
- If the answer is correct or close enough, add [ADVANCE] on its own line at the very end
- Ask one short, clear question per response — always about a NEW aspect, never re-asking what was just answered
- Intensity level: ${intensityDesc}
- Keep responses under 80 words total

Context:
Subject: ${subject}
Topic: ${topic}
Current Subtopic Under Examination: ${currentSubtopic}
Jury Favor (0–100, higher = student performing well): ${juryFavor}

Conversation:
${formattedHistory || '(Examination beginning)'}

Defense's latest response:
${userMessage}

Respond now as the examiner:`;

  try {
    const rawText = await callClaude(prompt);

    let role = 'counsel';
    let cleanMessage = rawText;

    if (rawText.startsWith('[JUDGE]')) {
      role = 'judge';
      cleanMessage = rawText.replace(/^\[JUDGE\]\s*/i, '').trim();
    } else if (rawText.startsWith('[COUNSEL]')) {
      role = 'counsel';
      cleanMessage = rawText.replace(/^\[COUNSEL\]\s*/i, '').trim();
    } else {
      role = detectRole(rawText);
    }

    const advanceSubtopic = /\[ADVANCE\]/i.test(cleanMessage);
    cleanMessage = cleanMessage.replace(/\[ADVANCE\]/gi, '').trim();

    const { qualityDelta, juryDelta } = computeScoring(userMessage, topic);

    res.json({ role, message: cleanMessage, qualityDelta, juryDelta, advanceSubtopic });
  } catch (err) {
    console.error('Examine error:', err.message);
    res.status(502).json({ error: 'Failed to reach AI API', details: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Witness Stand backend running on http://localhost:${PORT}`));
