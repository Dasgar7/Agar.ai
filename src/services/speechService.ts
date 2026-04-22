
export interface SpeechSettings {
  voiceIndex: number;
  rate: number;
  pitch: number;
  volume: number;
}

class SpeechService {
  private synthesis: SpeechSynthesis | null = null;
  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private _isListening = false;
  private _isStarting = false;
  private settings: SpeechSettings = {
    voiceIndex: 0,
    rate: 1,
    pitch: 1,
    volume: 1
  };

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = navigator.language || 'en-US';
        
        this.recognition.onstart = () => {
          this._isStarting = false;
          this._isListening = true;
        };
        
        this.recognition.onend = () => {
          this._isListening = false;
          this._isStarting = false;
        };
      }
    }
  }

  isSupported(): boolean {
    return !!this.recognition;
  }

  // --- TTS (Text-to-Speech) ---
  
  getVoices(): SpeechSynthesisVoice[] {
    return this.synthesis?.getVoices() || [];
  }

  updateSettings(newSettings: Partial<SpeechSettings>) {
    this.settings = { ...this.settings, ...newSettings };
  }

  speak(text: string, onEnd?: () => void, onError?: () => void) {
    if (!this.synthesis) return;

    this.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = this.getVoices();
    
    // Simple language detection (very basic)
    const isRussian = /[а-яА-Я]/.test(text);
    const isGerman = /[äöüßÄÖÜ]/.test(text);
    const isSpanish = /[áéíóúñÁÉÍÓÚÑ]/.test(text);
    const isFrench = /[éàèùâêîôûçËÏÜ]/.test(text);

    let targetLang = 'en-US';
    if (isRussian) targetLang = 'ru-RU';
    else if (isGerman) targetLang = 'de-DE';
    else if (isSpanish) targetLang = 'es-ES';
    else if (isFrench) targetLang = 'fr-FR';

    const voice = voices.find(v => v.lang.startsWith(targetLang.split('-')[0])) || voices[0];
    
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    utterance.rate = this.settings.rate;
    utterance.pitch = this.settings.pitch;
    utterance.volume = this.settings.volume;

    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onError?.();

    this.synthesis.speak(utterance);
  }

  cancel() {
    this.synthesis?.cancel();
  }

  // --- STT (Speech-to-Text) ---

  async startListening(onResult: (text: string, audioUrl?: string) => void, onError: (err: any) => void, onEnd: () => void) {
    if (!this.recognition) {
      this.initRecognition();
      if (!this.recognition) {
        onError('Speech recognition not supported in this browser.');
        return;
      }
    }

    if (this._isListening || this._isStarting) {
      console.warn('Speech Recognition: Already active or starting.');
      return;
    }

    this._isStarting = true;
    this.audioChunks = [];
    let finalTranscript = '';
    let finalAudioUrl: string | undefined;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/ogg') 
          ? 'audio/ogg' 
          : '';

      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
        finalAudioUrl = URL.createObjectURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        
        // If we have a transcript, call onResult now that we have the audio
        if (finalTranscript) {
          onResult(finalTranscript, finalAudioUrl);
          finalTranscript = ''; // Clear to prevent double call
        }
      };

      this.mediaRecorder.start();
    } catch (e) {
      console.warn('MediaRecorder failed to start:', e);
    }

    this.recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }

      if (transcript) {
        finalTranscript = transcript;
        // Stop media recorder to trigger onstop and get the audio URL
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        } else {
          // If no media recorder, just return the transcript
          onResult(transcript);
          finalTranscript = '';
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      // Ignore 'no-speech' if we are still recording audio, it might just be silence
      if (event.error === 'no-speech') {
        console.warn('Speech Recognition: No speech detected.');
        return;
      }
      console.error('Speech Recognition Error:', event.error);
      this.stopListening();
      onError(event.error);
    };

    this.recognition.onend = () => {
      this._isListening = false;
      this._isStarting = false;
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      onEnd();
    };

    try {
      this.recognition.start();
    } catch (e: any) {
      if (e.name === 'InvalidStateError' || e.message?.includes('already started')) {
        console.warn('Speech Recognition: Already started (handled).');
        this._isStarting = false;
        this._isListening = true;
      } else {
        console.error('STT Start Error:', e);
        this._isStarting = false;
        this._isListening = false;
        onError(e);
      }
    }
  }

  stopListening() {
    if (!this._isListening && !this._isStarting) return;
    
    try {
      this.recognition?.stop();
    } catch (e) {
      console.warn('Speech Recognition stop failed:', e);
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.warn('MediaRecorder stop failed:', e);
      }
    }
    
    this._isListening = false;
    this._isStarting = false;
  }
}

export const speechService = new SpeechService();
