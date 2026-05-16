/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

export class QuotaExceededError extends Error {
  isQuotaError = true;
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

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

export const sendMessage = async (messages: Message[], onChunk?: (text: string) => void, model?: string, connectedAccounts?: any) => {
  const lastMessage = messages[messages.length - 1];
  const history = messages.slice(0, -1);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: lastMessage.text,
        history,
        model,
        connectedAccounts
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to send message");
    }

    const data = await response.json();
    
    if (onChunk && data.text) {
      onChunk(data.text);
    }

    return {
      text: data.text || "",
      gameCode: data.gameCode,
      imageUrl: data.imageUrl
    };
  } catch (error: any) {
    console.error("SendMessage error:", error);
    throw error;
  }
};

export const generateSpeech = async (text: string) => {
  if (!text || text.trim().length === 0) return null;
  
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.audio) {
      return addWavHeader(data.audio);
    }
  } catch (error) {
    console.error("GenerateSpeech error:", error);
  }
  return null;
};

export const generateImage = async (prompt: string) => {
  // Image generation is now handled within the chat tool call on the server
  return null;
};
