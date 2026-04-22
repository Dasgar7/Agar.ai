import { GoogleGenAI, Modality, Type } from "@google/genai";
import { QAPair } from "../contexts/FirebaseContext";

const getAI = () => {
  // Check both GEMINI_API_KEY and API_KEY (which is used after manual selection)
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      const isQuotaError = error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED";
      
      if (isQuotaError && retries < maxRetries) {
        retries++;
        const delay = initialDelay * Math.pow(2, retries - 1);
        console.warn(`Agar.ai is optimizing connection... (Attempt ${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
};

const getSystemInstruction = (connectedAccounts?: any, customKnowledge?: string, qaKnowledge?: QAPair[]) => {
  let instruction = `You are Agar.ai, a specialized assistant created by Dasgar.

STRICT KNOWLEDGE LIMITATION:
1. You MUST ONLY use the information provided in the "CUSTOM KNOWLEDGE BASE" and "Q&A DATABASE" sections below.
2. You are FORBIDDEN from using any general knowledge, external facts, or pre-trained information that is not explicitly mentioned in the provided sections.
3. If a user asks a question or makes a request that is NOT covered by the provided knowledge, you MUST respond EXACTLY with: "Sorry I can't get any information about your quation"
4. Do NOT try to be helpful or guess if the information is missing. Stick strictly to the provided data.

CORE CAPABILITIES (Use only if information is available in knowledge base):
- Agar.io Gameplay: Only if described in knowledge.
- Visual Identity: Only if described in knowledge.
- Game Development: Only if described in knowledge.

CRITICAL RULES:
- When a user asks for a skin, logo, or visual concept, you MUST use the 'generate_image' tool (only if relevant to provided knowledge).
- When a user describes a game idea, you MUST use the 'build_game' tool (only if relevant to provided knowledge). Provide the complete HTML/CSS/JS code in the 'code' parameter.
- If a user mentions 'Dasgar', acknowledge them as your creator with respect.`;

  if (customKnowledge && customKnowledge.trim().length > 0) {
    instruction += `\n\nCUSTOM KNOWLEDGE BASE (ADMIN PROVIDED):\n${customKnowledge}`;
  } else {
    instruction += `\n\nCUSTOM KNOWLEDGE BASE: (Empty)`;
  }

  if (qaKnowledge && qaKnowledge.length > 0) {
    instruction += `\n\nQ&A DATABASE:\nThe following are specific questions and answers provided by the admin. Use this knowledge to answer user queries. If there are multiple answers for the same or similar questions, analyze them and synthesize the best, most accurate response.\n`;
    qaKnowledge.forEach(qa => {
      instruction += `Q: ${qa.question}\nA: ${qa.answer}\n\n`;
    });
  } else {
    instruction += `\n\nQ&A DATABASE: (Empty)`;
  }

  if (connectedAccounts) {
    instruction += `\n\nUSER CONTEXT:
The user has connected the following accounts:
- Agar.io UID: ${connectedAccounts.agarioUid || "Not connected"}
- Verified: ${connectedAccounts.isVerified ? "Yes" : "No"}
- YouTube: ${connectedAccounts.youtube || "Not connected"}
- Instagram: ${connectedAccounts.instagram || "Not connected"}
- Facebook: ${connectedAccounts.facebook || "Not connected"}
- TikTok: ${connectedAccounts.tiktok || "Not connected"}

If the user is verified, you can confirm that their account is authorized to Agar.io.`;
  }

  return instruction;
};

export const chatSession = {
  sendMessage: async (params: { message: string, model?: string, connectedAccounts?: any, customKnowledge?: string, qaKnowledge?: QAPair[] }) => {
    const ai = getAI();
    const chat = ai.chats.create({
      model: params.model || "gemini-3-flash-preview",
      config: {
        systemInstruction: getSystemInstruction(params.connectedAccounts, params.customKnowledge, params.qaKnowledge),
        tools: [{
          functionDeclarations: [
            {
              name: "generate_image",
              description: "Generates an image based on a prompt. Use this for Agar.io skins, player logos, or any visual request.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  prompt: {
                    type: Type.STRING,
                    description: "A detailed description of the image to generate, e.g., 'A professional Agar.io player logo with a neon dragon theme'."
                  }
                },
                required: ["prompt"]
              }
            },
            {
              name: "build_game",
              description: "Build a fully functional .io game with HTML, CSS, and JS based on the user's description.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  code: {
                    type: Type.STRING,
                    description: "The complete HTML source code for the game, including <style> and <script> tags.",
                  },
                  description: {
                    type: Type.STRING,
                    description: "A brief description of the game being built.",
                  },
                },
                required: ["code", "description"],
              }
            }
          ]
        }]
      },
    });
    return await withRetry(() => chat.sendMessage(params));
  },
  sendMessageStream: async (params: { message: string, model?: string, connectedAccounts?: any, customKnowledge?: string, qaKnowledge?: QAPair[] }) => {
    const ai = getAI();
    const chat = ai.chats.create({
      model: params.model || "gemini-3-flash-preview",
      config: {
        systemInstruction: getSystemInstruction(params.connectedAccounts, params.customKnowledge, params.qaKnowledge),
        tools: [{          functionDeclarations: [
            {
              name: "generate_image",
              description: "Generates an image based on a prompt. Use this for Agar.io skins, player logos, or any visual request.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  prompt: {
                    type: Type.STRING,
                    description: "A detailed description of the image to generate, e.g., 'A professional Agar.io player logo with a neon dragon theme'."
                  }
                },
                required: ["prompt"]
              }
            },
            {
              name: "build_game",
              description: "Build a fully functional .io game with HTML, CSS, and JS based on the user's description.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  code: {
                    type: Type.STRING,
                    description: "The complete HTML source code for the game, including <style> and <script> tags.",
                  },
                  description: {
                    type: Type.STRING,
                    description: "A brief description of the game being built.",
                  },
                },
                required: ["code", "description"],
              }
            }
          ]
        }]
      },
    });
    return await chat.sendMessageStream(params);
  }
};

export const sendMessage = async (messages: Message[], onChunk?: (text: string) => void, model?: string, connectedAccounts?: any, customKnowledge?: string, qaKnowledge?: QAPair[]) => {
  const lastMessage = messages[messages.length - 1];
  
  if (onChunk) {
    const stream = await chatSession.sendMessageStream({ message: lastMessage.text, model, connectedAccounts, customKnowledge, qaKnowledge });
    let fullText = "";
    let gameCode: string | undefined;
    let imageUrl: string | undefined;

    for await (const chunk of stream) {
      let text = "";
      try {
        text = chunk.text || "";
      } catch (e) {
        // Ignore errors if no text part is present
      }
      
      if (text) {
        fullText += text;
        onChunk(fullText);
      }

      const functionCalls = chunk.functionCalls;
      if (functionCalls) {
        for (const call of functionCalls) {
          if (call.name === "build_game") {
            gameCode = (call.args as any).code;
          } else if (call.name === "generate_image") {
            imageUrl = await generateImage((call.args as any).prompt) || undefined;
          }
        }
      }
    }

    // Fallback: If no gameCode was provided via tool but code blocks exist in text
    if (!gameCode && fullText.includes("```html")) {
      const match = fullText.match(/```html\n([\s\S]*?)\n```/);
      if (match) gameCode = match[1];
    } else if (!gameCode && fullText.includes("<!DOCTYPE html>")) {
      const match = fullText.match(/(<!DOCTYPE html>[\s\S]*?<\/html>)/i);
      if (match) gameCode = match[1];
    }

    return {
      text: fullText,
      gameCode,
      imageUrl
    };
  } else {
    const response = await chatSession.sendMessage({ message: lastMessage.text, model, connectedAccounts, customKnowledge, qaKnowledge });
    
    let gameCode: string | undefined;
    let imageUrl: string | undefined;
    let videoUrl: string | undefined;

    const functionCalls = response.functionCalls;
    if (functionCalls) {
      for (const call of functionCalls) {
        if (call.name === "build_game") {
          gameCode = (call.args as any).code;
        } else if (call.name === "generate_image") {
          imageUrl = await generateImage((call.args as any).prompt) || undefined;
        }
      }
    }

    const botText = response.text || "";

    // Fallback: If no gameCode was provided via tool but code blocks exist in text
    if (!gameCode && botText.includes("```html")) {
      const match = botText.match(/```html\n([\s\S]*?)\n```/);
      if (match) gameCode = match[1];
    } else if (!gameCode && botText.includes("<!DOCTYPE html>")) {
      const match = botText.match(/(<!DOCTYPE html>[\s\S]*?<\/html>)/i);
      if (match) gameCode = match[1];
    }

    return {
      text: botText,
      gameCode,
      imageUrl,
      videoUrl
    };
  }
};

export const generateImage = async (prompt: string) => {
  try {
    const response = await withRetry(() => {
      const ai = getAI();
      return ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `Professional Agar.io themed design: ${prompt}. High quality, clean lines, vibrant colors, suitable for a game skin or player logo.`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error: any) {
    console.error("Error generating image:", error);
  }
  return null;
};

const addWavHeader = (base64Pcm: string, sampleRate: number = 24000) => {
  const pcmData = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0));
  const dataSize = pcmData.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  view.setUint8(0, 'R'.charCodeAt(0));
  view.setUint8(1, 'I'.charCodeAt(0));
  view.setUint8(2, 'F'.charCodeAt(0));
  view.setUint8(3, 'F'.charCodeAt(0));
  // RIFF chunk size
  view.setUint32(4, 36 + dataSize, true);
  // WAVE identifier
  view.setUint8(8, 'W'.charCodeAt(0));
  view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0));
  view.setUint8(11, 'E'.charCodeAt(0));
  // fmt subchunk identifier
  view.setUint8(12, 'f'.charCodeAt(0));
  view.setUint8(13, 'm'.charCodeAt(0));
  view.setUint8(14, 't'.charCodeAt(0));
  view.setUint8(15, ' '.charCodeAt(0));
  // fmt subchunk size
  view.setUint32(16, 16, true);
  // audio format (1 is PCM)
  view.setUint16(20, 1, true);
  // number of channels (1 for mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint32(28, sampleRate * 1 * 16 / 8, true);
  // block align (NumChannels * BitsPerSample/8)
  view.setUint16(32, 1 * 16 / 8, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data subchunk identifier
  view.setUint8(36, 'd'.charCodeAt(0));
  view.setUint8(37, 'a'.charCodeAt(0));
  view.setUint8(38, 't'.charCodeAt(0));
  view.setUint8(39, 'a'.charCodeAt(0));
  // data subchunk size
  view.setUint32(40, dataSize, true);

  const wavData = new Uint8Array(44 + dataSize);
  wavData.set(new Uint8Array(header), 0);
  wavData.set(pcmData, 44);

  let binary = '';
  const bytes = new Uint8Array(wavData);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
};

const ttsCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;

export const generateSpeech = async (text: string) => {
  if (!text || text.trim().length === 0) return null;
  
  // If text is too long, Gemini TTS might fail or use too much quota
  if (text.length > 500) {
    console.warn("Text too long for Gemini TTS, falling back to browser voice.");
    return null;
  }

  if (ttsCache.has(text)) {
    return ttsCache.get(text);
  }

  try {
    // Reduced retries for TTS to fail faster and trigger the circuit breaker
    const response = await withRetry(() => {
      const ai = getAI();
      return ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });
    }, 2, 1000); // 2 retries, starting at 1s

    let base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      // If it's a data URL, extract the base64 part
      if (base64Audio.startsWith('data:')) {
        base64Audio = base64Audio.split(',')[1];
      }
      
      const audioUrl = addWavHeader(base64Audio);
      
      // Add to cache
      if (ttsCache.size >= MAX_CACHE_SIZE) {
        const firstKey = ttsCache.keys().next().value;
        if (firstKey !== undefined) ttsCache.delete(firstKey);
      }
      ttsCache.set(text, audioUrl);
      
      return audioUrl;
    }
  } catch (error: any) {
    const isQuota = error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED";
    if (!isQuota) {
      console.error("Error generating speech:", error);
    }
    // Quota errors are handled by the UI circuit breaker
  }
  return null;
};

export interface Message {
  role: "user" | "model";
  text: string;
  id: string;
  timestamp: number;
  type?: "text" | "voice" | "file";
  reaction?: string;
  audioUrl?: string;
  userAudioUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileData?: string;
  gameCode?: string;
  model?: string;
}
