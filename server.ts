import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const getSystemInstruction = (connectedAccounts?: any) => {
  let instruction = `You are Agar.ai, the ultimate professional assistant for the Agar.io community, created by Dasgar. 
Your personality is sleek, tech-forward, and highly strategic. 
You specialize in:
1. Agar.io Gameplay: Providing advanced tactics (split-running, baiting, virus farming).
2. Visual Identity: Designing professional skins and player logos.
3. Community: Being a helpful guide for players of all skill levels.
4. Game Development: Building fully functional .io games directly in the chat.

CRITICAL RULES:
- When a user asks for a skin, logo, or visual concept, you MUST use the 'generate_image' tool.
- When a user describes a game idea, you MUST use the 'build_game' tool. Provide the complete HTML/CSS/JS code in the 'code' parameter.
- Do NOT just provide code in markdown; ALWAYS use the 'build_game' tool for games.
- Your responses should be concise but packed with value. 
- If a user mentions 'Dasgar', acknowledge them as your creator with respect. 
- You are not just a chatbot; you are a specialized game engine assistant.`;

  if (connectedAccounts) {
    instruction += `\n\nUSER CONTEXT:
The user has connected the following accounts:
- Agar.io UID: ${connectedAccounts.agarioUid || "Not connected"}
- Verified: ${connectedAccounts.isVerified ? "Yes" : "No"}
- YouTube: ${connectedAccounts.youtube || "Not connected"}
- Instagram: ${connectedAccounts.instagram || "Not connected"}
- Facebook: ${connectedAccounts.facebook || "Not connected"}
- TikTok: ${connectedAccounts.tiktok || "Not connected"}

If the user is verified, you can confirm that their account is authorized to Agar.io and they can use advanced features like mobile/PC bots and AI skin uploads.`;
  }

  return instruction;
};

app.post("/api/chat", async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API key not configured" });
  }

  try {
    const { message, history, model, connectedAccounts } = req.body;
    const modelId = model || "gemini-3-flash-preview";

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        ...history.map((m: any) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }]
        })),
        { role: "user", parts: [{ text: message }] }
      ],
      config: {
        systemInstruction: getSystemInstruction(connectedAccounts),
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
      }
    });

    let gameCode: string | undefined;
    let imageUrl: string | undefined;
    
    const functionCalls = response.functionCalls;
    if (functionCalls) {
      for (const call of functionCalls) {
        if (call.name === "build_game") {
          gameCode = (call.args as any).code;
        } else if (call.name === "generate_image") {
          try {
            const imageResult = await ai.models.generateContent({
              model: "gemini-2.5-flash-image",
              contents: `Professional Agar.io themed design: ${(call.args as any).prompt}. High quality, clean lines, vibrant colors, suitable for a game skin or player logo.`,
              config: {
                imageConfig: { aspectRatio: "1:1" }
              }
            });
            for (const part of imageResult.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) {
                imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              }
            }
          } catch (err: any) {
            console.error("Image generation error:", err);
            if (err.message?.includes("429") || err.status === "RESOURCE_EXHAUSTED") {
               // If image generation fails due to quota, we still want the text response if possible
               // but we can add a note to the text.
            }
            throw err; // Re-throw to be caught by the main catch block
          }
        }
      }
    }

    res.json({
      text: response.text,
      gameCode,
      imageUrl
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    let errorMessage = error.message;
    if (errorMessage?.includes("429") || error.status === "RESOURCE_EXHAUSTED") {
      errorMessage = "Quota exceeded. This feature (e.g. image generation or TTS) requires a billing-enabled API key or you've reached your limit. Please check your API key in Settings > Secrets.";
    }
    res.status(500).json({ error: errorMessage });
  }
});

app.post("/api/tts", async (req, res) => {
  if (!apiKey) return res.status(500).json({ error: "Gemini API key not configured" });
  try {
    const { text } = req.body;
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
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

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    res.json({ audio: base64Audio });
  } catch (error: any) {
    console.error("TTS error:", error);
    let errorMessage = error.message;
    if (errorMessage?.includes("429") || error.status === "RESOURCE_EXHAUSTED") {
      errorMessage = "TTS quota exceeded. Please try again later or use a billing-enabled API key.";
    }
    res.status(500).json({ error: errorMessage });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
