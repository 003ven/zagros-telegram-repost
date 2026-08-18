import { GoogleGenAI } from '@google/genai';
import { logger } from './logger';

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY') {
      aiInstance = new GoogleGenAI({ apiKey: key });
    }
  }
  return aiInstance;
}

/**
 * Rewrite or translate Telegram post content via Gemini AI
 */
export async function rewriteContentWithAI(
  text: string,
  options: { aiRewrite?: boolean; aiTranslate?: 'fa' | 'en' | 'ar' | 'none' }
): Promise<string> {
  const ai = getAI();
  if (!ai || (!options.aiRewrite && options.aiTranslate === 'none')) {
    return text;
  }

  try {
    let prompt = `You are a professional social media editor. Process the following Telegram post text. Keep any emojis and line breaks intact. Return ONLY the final revised text without markdown formatting wrappers or conversational comments.\n\n`;

    if (options.aiRewrite) {
      prompt += `- Rewrite and rephrase the text to be unique, natural, and highly engaging for Telegram channel readers.\n`;
    }

    if (options.aiTranslate && options.aiTranslate !== 'none') {
      const langNames: Record<string, string> = {
        fa: 'Persian (Farsi)',
        en: 'English',
        ar: 'Arabic',
      };
      prompt += `- Translate the post into ${langNames[options.aiTranslate] || 'Persian'}.\n`;
    }

    prompt += `\nOriginal Post:\n${text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    });

    if (response.text) {
      return response.text.trim();
    }
  } catch (err) {
    logger.warn({ err }, 'Gemini AI rewriting failed, returning original text');
  }

  return text;
}
