/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, Bot, User, Loader2, Trash2, Sparkles, Mic, MicOff, 
  Volume2, VolumeX, Copy, Edit2, Smile, Play, Pause, 
  MessageSquare, Headphones, Settings, ArrowLeft, ChevronRight, Download, Image as ImageIcon,
  Plus, Video, FileText, X, Paperclip, Maximize, Minimize, Globe, ExternalLink, Check,
  ChevronLeft, ThumbsUp, ThumbsDown, Youtube, Instagram, Facebook, Music, ShieldCheck, ShieldAlert
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Message, sendMessage, generateImage, generateSpeech } from "./services/gemini";
import { speechService } from "./services/speechService";
import { useFirebase, QAPair } from "./contexts/FirebaseContext";
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  handleFirestoreError, 
  OperationType,
  toFirestoreData,
  deleteDoc,
  updateDoc,
  writeBatch,
  getDocs
} from "./firebase";

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const AgarCellLoader = () => {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-10 h-10 flex items-center justify-center">
        {/* Outer wobbly cell */}
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            borderRadius: ["40% 60% 60% 40% / 60% 30% 70% 40%", "60% 40% 30% 70% / 50% 60% 40% 50%", "40% 60% 60% 40% / 60% 30% 70% 40%"]
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity,
            ease: "easeInOut" 
          }}
          className="absolute inset-0 bg-zinc-900/5 border-2 border-[#9900ff]/20"
        />
        {/* Inner nucleus */}
        <motion.div 
          animate={{ 
            scale: [0.8, 1, 0.8],
            x: [-2, 2, -2],
            y: [-2, 2, -2]
          }}
          transition={{ 
            duration: 1.5, 
            repeat: Infinity,
            ease: "easeInOut" 
          }}
          className="w-4 h-4 rounded-full bg-[#9900ff] shadow-lg shadow-[#9900ff]/30"
        />
        {/* Small orbiting cells */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#ff3333]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#33ff33]" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#3333ff]" />
        </motion.div>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest animate-pulse">Agar.ai is absorbing data...</span>
        <div className="flex gap-1 mt-0.5">
          <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0 }} className="w-1 h-1 rounded-full bg-[#ff3333]" />
          <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0.2 }} className="w-1 h-1 rounded-full bg-[#33ff33]" />
          <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0.4 }} className="w-1 h-1 rounded-full bg-[#3333ff]" />
        </div>
      </div>
    </div>
  );
};

const useLongPress = (onLongPress: (e: any) => void, ms = 500) => {
  const [startLongPress, setStartLongPress] = useState(false);
  const timerRef = useRef<any>(null);
  const eventRef = useRef<any>(null);

  useEffect(() => {
    if (startLongPress) {
      timerRef.current = setTimeout(() => {
        if (eventRef.current) {
          onLongPress(eventRef.current);
        }
      }, ms);
    } else {
      clearTimeout(timerRef.current);
    }
    return () => clearTimeout(timerRef.current);
  }, [startLongPress, onLongPress, ms]);

  return {
    onMouseDown: (e: any) => { 
      eventRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        preventDefault: () => e.preventDefault()
      };
      setStartLongPress(true); 
    },
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: (e: any) => { 
      const touch = e.touches[0];
      eventRef.current = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => e.preventDefault()
      };
      setStartLongPress(true); 
    },
    onTouchEnd: () => setStartLongPress(false),
  };
};

export default function App() {
  const { user, loading, isLoggingIn, login, logout, connectedAccounts, updateConnectedAccounts, verifyAccount, customKnowledge: initialCustomKnowledge, updateCustomKnowledge, qaKnowledge, updateQAKnowledge } = useFirebase();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState("gemini-3-flash-preview");
  const [forceBrowserVoice, setForceBrowserVoice] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, msgId: string } | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isTtsCooldown, setIsTtsCooldown] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const [fullScreenGameCode, setFullScreenGameCode] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [customDomain, setCustomDomain] = useState("");
  const [isDomainPaid, setIsDomainPaid] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [actualWorkingUrl, setActualWorkingUrl] = useState<string | null>(null);
  const [isPublishedView, setIsPublishedView] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<'rules' | 'qa'>('rules');
  const [customKnowledge, setCustomKnowledge] = useState(initialCustomKnowledge || "");
  const [localQaKnowledge, setLocalQaKnowledge] = useState<QAPair[]>([]);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [confirmMessage, setConfirmMessage] = useState("");

  const showConfirm = (message: string, action: () => void) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setIsConfirmModalOpen(true);
  };
  const [selectedFile, setSelectedFile] = useState<{
    data: string;
    name: string;
    type: string;
    mimeType: string;
  } | null>(null);

  const [speechSettings, setSpeechSettings] = useState({
    rate: 1,
    pitch: 1,
    volume: 1
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomKnowledge(initialCustomKnowledge || "");
  }, [initialCustomKnowledge]);

  useEffect(() => {
    setLocalQaKnowledge(qaKnowledge || []);
  }, [qaKnowledge]);

  const handleAddQA = () => {
    if (!newQ.trim() || !newA.trim()) return;
    setLocalQaKnowledge([...localQaKnowledge, { id: Date.now().toString(), question: newQ, answer: newA }]);
    setNewQ("");
    setNewA("");
  };

  const handleRemoveQA = (id: string) => {
    setLocalQaKnowledge(localQaKnowledge.filter(qa => qa.id !== id));
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    speechService.updateSettings(speechSettings);
  }, [speechSettings]);

  useEffect(() => {
    if (!user) return;

    const messagesRef = collection(db, 'users', user.uid, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => doc.data() as Message);
      if (msgs.length === 0) {
        setMessages([
          {
            role: "model",
            text: "Hello! I'm Agar.ai. I can help you build games, generate images, or just chat. How can I help you today?",
            id: "initial-1",
            timestamp: Date.now(),
            type: "text"
          }
        ]);
      } else {
        setMessages(msgs);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/messages`);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.hash === '#published') {
        setIsPublishedView(true);
      } else {
        setIsPublishedView(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    if (window.location.hash === '#published') {
      setIsPublishedView(true);
    }
    
    setIsInitialLoading(false);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSend = async (overrideText?: string, isVoiceMessage = false, audioUrl?: string) => {
    const textToSend = overrideText || input;
    if ((!textToSend.trim() && !selectedFile && !audioUrl) || isLoading) return;

    const userMessage: Message = {
      role: "user",
      text: textToSend,
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: isVoiceMessage ? "voice" : selectedFile ? "file" : "text",
      userAudioUrl: audioUrl,
      fileName: selectedFile?.name,
      fileType: selectedFile?.type,
      fileData: selectedFile?.data
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSelectedFile(null);
    setIsLoading(true);
    setVoiceError(null);

    try {
      let currentBotMessageId = (Date.now() + 1).toString();
      
      // Save user message to Firestore
      if (user) {
        const userMsgRef = doc(db, 'users', user.uid, 'messages', userMessage.id);
        await setDoc(userMsgRef, toFirestoreData(userMessage));
      }

      const response = await sendMessage([...messages, userMessage], (streamedText) => {
        setIsLoading(false);
        setMessages((prev) => 
          prev.map(m => m.id === currentBotMessageId ? { ...m, text: streamedText } : m)
        );
      }, selectedModel, connectedAccounts, customKnowledge, qaKnowledge);
      
      const botText = response.text || "";
      const botMessage: Message = {
        role: "model",
        text: botText,
        id: currentBotMessageId,
        timestamp: Date.now(),
        type: "text",
        gameCode: response.gameCode,
        imageUrl: response.imageUrl,
        model: selectedModel
      };

      // Save bot message to Firestore
      if (user) {
        const botMsgRef = doc(db, 'users', user.uid, 'messages', botMessage.id);
        await setDoc(botMsgRef, toFirestoreData(botMessage));
      }
      
      if (isVoiceEnabled) {
        playResponse(botText, currentBotMessageId);
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      
      // Silent retry or vague themed message
      const errorMessage: Message = {
        role: "model",
        text: "Agar.ai is currently evolving and absorbing new data. One moment while I optimize my neural cells...",
        id: `error-${Date.now()}`,
        timestamp: Date.now(),
        type: "text"
      };
      setMessages((prev) => [...prev, errorMessage]);
      
      // Attempt a silent recovery after a delay
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== errorMessage.id));
        handleSend(textToSend, isVoiceMessage, audioUrl);
      }, 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const playResponse = async (text: string, msgId: string) => {
    if (!isVoiceEnabled || isTtsCooldown) return;

    if (forceBrowserVoice || quotaError) {
      speechService.speak(text, () => setPlayingAudioId(null));
      setPlayingAudioId(msgId);
      return;
    }

    try {
      setIsTtsCooldown(true);
      const audioUrl = await generateSpeech(text);
      if (audioUrl) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audioUrl: audioUrl, type: "voice" } : m));
        
        stopAudio();
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => setPlayingAudioId(null);
        setPlayingAudioId(msgId);
        await audioRef.current.play();
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setQuotaError(true);
      speechService.speak(text, () => setPlayingAudioId(null));
      setPlayingAudioId(msgId);
    } finally {
      setTimeout(() => setIsTtsCooldown(false), 1000);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    speechService.cancel();
    setPlayingAudioId(null);
  };

  const startRecording = async () => {
    if (isLoading) return;
    
    setVoiceError(null);
    try {
      await speechService.startListening(
        (text, audioUrl) => {
          if (text.trim() || audioUrl) {
            handleSend(text, !!audioUrl, audioUrl);
          }
        },
        (err) => {
          setVoiceError(typeof err === 'string' ? err : "Voice recognition error");
          setIsRecording(false);
        },
        () => {
          setIsRecording(false);
          clearInterval(recordingTimerRef.current);
        }
      );
      
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Start recording failed:", err);
    }
  };

  const stopRecording = () => {
    speechService.stopListening();
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      setSelectedFile({
        data,
        name: file.name,
        type: file.type.split('/')[0],
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const clearChat = async () => {
    if (!user) return;
    
    showConfirm("Clear all messages?", async () => {
      try {
        const messagesRef = collection(db, 'users', user.uid, 'messages');
        const snapshot = await getDocs(messagesRef);
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        setMessages([]);
        stopAudio();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/messages`);
      }
    });
  };

  const deleteMessage = async (id: string) => {
    if (!user) return;
    try {
      const msgRef = doc(db, 'users', user.uid, 'messages', id);
      await deleteDoc(msgRef);
      setMessages(prev => prev.filter(m => m.id !== id));
      closeContextMenu();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/messages/${id}`);
    }
  };

  const reactToMessage = async (id: string, emoji: string) => {
    if (!user) return;
    try {
      const msgRef = doc(db, 'users', user.uid, 'messages', id);
      await updateDoc(msgRef, toFirestoreData({ reaction: emoji }));
      setMessages(prev => prev.map(m => m.id === id ? { ...m, reaction: emoji } : m));
      closeContextMenu();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/messages/${id}`);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msgId });
  };

  const closeContextMenu = () => setContextMenu(null);

  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    closeContextMenu();
  };

  const editMessage = (msg: Message) => {
    setEditingMsgId(msg.id);
    setInput(msg.text);
    closeContextMenu();
  };

  const handleVerify = async () => {
    if (!connectedAccounts?.agarioUid) return;
    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const success = await verifyAccount(connectedAccounts.agarioUid);
      setVerificationResult({
        success,
        message: success ? "Account authorized successfully!" : "Invalid UID. Please check your Agar.io settings."
      });
    } catch (error) {
      setVerificationResult({ success: false, message: "Verification failed. Try again later." });
    } finally {
      setIsVerifying(false);
    }
  };
  const toggleMessageType = (id: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, type: m.type === "voice" ? "text" : "voice" };
      }
      return m;
    }));
    closeContextMenu();
  };

  const handlePublish = () => {
    setIsPublishModalOpen(true);
  };

  const confirmPublish = async () => {
    setIsPublishing(true);
    // Simulate deployment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const domain = customDomain || `game-${Math.random().toString(36).substring(2, 7)}`;
    const url = `${domain}.agar.ai`;
    setPublishedUrl(url);
    
    // In a real app, this would be the actual URL. 
    // Here we use a hash to simulate the published view in the same app.
    const workingUrl = `${window.location.origin}${window.location.pathname}#published`;
    setActualWorkingUrl(workingUrl);
    
    setIsPublishing(false);
    setIsPublishModalOpen(false);
    
    // Auto-navigate to the published view after a short delay
    setTimeout(() => {
      window.location.hash = 'published';
      setIsPublishedView(true);
    }, 1000);
  };

  const injectBadge = (code: string) => {
    const badgeHtml = `
      <div style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: sans-serif;">
        <div style="background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); color: white; padding: 10px 20px; border-radius: 15px; font-size: 12px; font-weight: bold; display: flex; items-center: center; gap: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);">
          <span style="opacity: 0.6;">Powered by</span>
          <span style="letter-spacing: 1px;">AGAR.AI</span>
        </div>
      </div>
    `;
    return code.replace('</body>', `${badgeHtml}</body>`);
  };

  const playVoiceMessage = async (msg: Message) => {
    const audioUrl = msg.role === "user" ? msg.userAudioUrl : msg.audioUrl;
    
    if (audioUrl) {
      stopAudio();
      setPlayingAudioId(msg.id);
      
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      
      const audio = audioRef.current;
      audio.src = audioUrl;
      audio.onended = () => setPlayingAudioId(null);
      
      try {
        await audio.play();
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error("Audio play error:", error);
        }
      }
    } else if (msg.role === "model") {
      playResponse(msg.text, msg.id);
    }
  };

  if (isInitialLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-900 animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <AgarCellLoader />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-2xl shadow-zinc-200 p-8 text-center border border-zinc-100"
        >
          <div className="w-20 h-20 bg-[#9900ff] rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-[#9900ff]/30 rotate-12">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-zinc-900 mb-2 tracking-tight">Agar.ai</h1>
          <p className="text-zinc-500 mb-8 font-medium">The ultimate professional assistant for the Agar.io community.</p>
          
          <button 
            onClick={login}
            disabled={isLoggingIn}
            className={`w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-zinc-800 transition-all shadow-lg active:scale-[0.98] ${isLoggingIn ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {isLoggingIn ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Globe className="w-5 h-5" />
            )}
            {isLoggingIn ? "Signing in..." : "Sign in with Google"}
          </button>
          
          <p className="mt-6 text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
            Created by Dasgar
          </p>
        </motion.div>
      </div>
    );
  }

  if (isPublishedView && fullScreenGameCode) {
    return (
      <div className="fixed inset-0 bg-white z-[200] flex flex-col font-sans">
        <div className="bg-zinc-100 px-4 py-3 flex items-center gap-4 border-b border-zinc-200">
          <div className="flex gap-2">
            <div className="w-3.5 h-3.5 rounded-full bg-[#FF5F56]" />
            <div className="w-3.5 h-3.5 rounded-full bg-[#FFBD2E]" />
            <div className="w-3.5 h-3.5 rounded-full bg-[#27C93F]" />
          </div>
          <div className="flex-1 bg-white rounded-xl px-4 py-2 flex items-center gap-3 text-zinc-400 shadow-sm border border-zinc-200 max-w-2xl mx-auto">
            <Globe className="w-4 h-4 text-zinc-300" />
            <span className="text-sm font-medium text-zinc-600">https://{customDomain || "game"}.agar.ai</span>
            <div className="ml-auto flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Secure</span>
            </div>
          </div>
          <button 
            onClick={() => {
              window.history.replaceState({}, '', window.location.pathname);
              setIsPublishedView(false);
            }}
            className="p-2 hover:bg-zinc-200 rounded-xl transition-colors text-zinc-500 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold">Editor</span>
          </button>
        </div>
        <div className="flex-1 relative bg-zinc-50">
          <iframe
            srcDoc={injectBadge(fullScreenGameCode)}
            title="Published Game"
            className="w-full h-full border-none"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-2xl overflow-hidden sm:my-8 sm:h-[calc(100vh-4rem)] sm:rounded-3xl border border-zinc-200 relative" onClick={closeContextMenu}>
      {/* Admin Panel Modal */}
      <AnimatePresence>
        {isAdminPanelOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl border border-zinc-100 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Admin Panel</h3>
                    <p className="text-xs text-zinc-500 font-medium">Manage AI Knowledge Base</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAdminPanelOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pr-2">
                <div className="flex gap-2 mb-2 p-1 bg-zinc-100 rounded-xl">
                  <button
                    onClick={() => setAdminTab('rules')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${adminTab === 'rules' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    General Rules
                  </button>
                  <button
                    onClick={() => setAdminTab('qa')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${adminTab === 'qa' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    Q&A Database
                  </button>
                </div>

                {adminTab === 'rules' ? (
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 ml-1">Custom Knowledge Base</label>
                    <textarea 
                      value={customKnowledge}
                      onChange={(e) => setCustomKnowledge(e.target.value)}
                      placeholder="Enter custom instructions, rules, or knowledge for Agar.ai here..."
                      className="w-full h-64 p-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all text-sm font-medium resize-none font-mono"
                    />
                    <p className="text-[10px] text-zinc-400 ml-1 italic">This text will be appended to the AI's system instructions.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                      {localQaKnowledge.map((qa) => (
                        <div key={qa.id} className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl relative group">
                          <button
                            onClick={() => handleRemoveQA(qa.id)}
                            className="absolute top-2 right-2 p-1.5 bg-white text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-zinc-100 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <p className="text-xs font-bold text-zinc-900 mb-1 pr-8">Q: {qa.question}</p>
                          <p className="text-xs text-zinc-600">A: {qa.answer}</p>
                        </div>
                      ))}
                      {localQaKnowledge.length === 0 && (
                        <div className="text-center py-8 text-zinc-400 text-sm font-medium">No Q&A pairs added yet.</div>
                      )}
                    </div>

                    <div className="p-4 bg-zinc-100 rounded-2xl space-y-3 border border-zinc-200">
                      <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-widest">Add New Q&A</h4>
                      <input
                        type="text"
                        placeholder="Question"
                        value={newQ}
                        onChange={(e) => setNewQ(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 transition-all"
                      />
                      <textarea
                        placeholder="Answer"
                        value={newA}
                        onChange={(e) => setNewA(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 transition-all resize-none h-20"
                      />
                      <button
                        onClick={handleAddQA}
                        disabled={!newQ.trim() || !newA.trim()}
                        className="w-full py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all disabled:opacity-50"
                      >
                        Add to Database
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-zinc-100 shrink-0 flex gap-3">
                <button 
                  onClick={() => setIsAdminPanelOpen(false)}
                  className="flex-1 py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    setIsSavingKnowledge(true);
                    await updateCustomKnowledge(customKnowledge);
                    await updateQAKnowledge(localQaKnowledge);
                    setIsSavingKnowledge(false);
                    setIsAdminPanelOpen(false);
                  }}
                  disabled={isSavingKnowledge}
                  className="flex-1 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                >
                  {isSavingKnowledge ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
                  ) : (
                    <><Check className="w-5 h-5" /> Save Knowledge</>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Connect Accounts Modal */}
      <AnimatePresence>
        {isConnectModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-zinc-100"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Connect Accounts</h3>
                <button 
                  onClick={() => setIsConnectModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Agar.io UID */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Agar.io UID</label>
                    {connectedAccounts?.isVerified && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase tracking-widest">
                        <ShieldCheck className="w-3 h-3" /> Authorized
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
                      <Globe className="w-5 h-5 text-white" />
                    </div>
                    <input 
                      type="text"
                      placeholder="Enter your Agar.io UID"
                      value={connectedAccounts?.agarioUid || ""}
                      onChange={(e) => updateConnectedAccounts({ ...connectedAccounts, agarioUid: e.target.value, isVerified: false })}
                      className={`w-full pl-16 pr-4 py-4 bg-zinc-50 border rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all text-sm font-bold ${connectedAccounts?.isVerified ? "border-green-100 bg-green-50/30" : "border-zinc-100"}`}
                    />
                  </div>
                  
                  <button 
                    onClick={handleVerify}
                    disabled={isVerifying || !connectedAccounts?.agarioUid || connectedAccounts?.isVerified}
                    className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                      connectedAccounts?.isVerified 
                        ? "bg-green-500 text-white cursor-default" 
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    } ${isVerifying ? "opacity-70" : ""}`}
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                      </>
                    ) : connectedAccounts?.isVerified ? (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Account Linked
                      </>
                    ) : (
                      "Authorize with Agar.io"
                    )}
                  </button>

                  {verificationResult && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-[10px] font-bold text-center uppercase tracking-widest ${verificationResult.success ? "text-green-500" : "text-red-500"}`}
                    >
                      {verificationResult.message}
                    </motion.p>
                  )}
                  <p className="text-[10px] text-zinc-400 ml-1 italic">Connect for mobile/PC bots, AI skins, and glitches.</p>
                </div>

                {/* Socials */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 ml-1">YouTube</label>
                    <div className="relative">
                      <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                      <input 
                        type="text"
                        placeholder="@channel"
                        value={connectedAccounts?.youtube || ""}
                        onChange={(e) => updateConnectedAccounts({ ...connectedAccounts, youtube: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 ml-1">Instagram</label>
                    <div className="relative">
                      <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pink-500" />
                      <input 
                        type="text"
                        placeholder="@username"
                        value={connectedAccounts?.instagram || ""}
                        onChange={(e) => updateConnectedAccounts({ ...connectedAccounts, instagram: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 ml-1">Facebook</label>
                    <div className="relative">
                      <Facebook className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
                      <input 
                        type="text"
                        placeholder="profile_id"
                        value={connectedAccounts?.facebook || ""}
                        onChange={(e) => updateConnectedAccounts({ ...connectedAccounts, facebook: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 ml-1">TikTok</label>
                    <div className="relative">
                      <Music className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-900" />
                      <input 
                        type="text"
                        placeholder="@username"
                        value={connectedAccounts?.tiktok || ""}
                        onChange={(e) => updateConnectedAccounts({ ...connectedAccounts, tiktok: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setIsConnectModalOpen(false)}
                className="w-full mt-8 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg active:scale-95"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <AnimatePresence>
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-zinc-100 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Are you sure?</h3>
              <p className="text-zinc-500 mb-8 font-medium">{confirmMessage}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="flex-1 py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    confirmAction();
                    setIsConfirmModalOpen(false);
                  }}
                  className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200 active:scale-95"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-zinc-200 overflow-hidden border border-zinc-100">
            <img src="/icon.svg" alt="Agar.ai" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-lg tracking-tight">Agar.ai</h1>
              {connectedAccounts?.isVerified && (
                <ShieldCheck className="w-4 h-4 text-green-500" />
              )}
            </div>
            <p className="text-xs text-zinc-500 font-medium">{isVoiceMode ? "Voice Mode" : "AI Assistant"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsVoiceMode(!isVoiceMode)}
            className={`p-2 rounded-xl transition-all duration-200 flex items-center gap-2 ${
              isVoiceMode ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {isVoiceMode ? <Headphones className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            <span className="text-xs font-semibold hidden sm:inline">{isVoiceMode ? "Voice" : "Text"}</span>
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all duration-200"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={clearChat}
            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings Overlay */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-white flex flex-col"
          >
            <header className="px-6 py-4 border-b border-zinc-100 flex items-center gap-4 bg-white">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-zinc-600" />
              </button>
              <h2 className="font-semibold text-lg tracking-tight">Settings</h2>
            </header>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <section>
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Profile</h3>
                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-zinc-200 rounded-xl overflow-hidden">
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || ""} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-5 h-5 text-zinc-400 m-2.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-800 truncate">{user?.displayName}</p>
                      <p className="text-[10px] text-zinc-400 font-medium truncate">{user?.email}</p>
                    </div>
                    <button 
                      onClick={logout}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                      title="Sign out"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Audio Settings</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isVoiceEnabled ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-500"}`}>
                        {isVoiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-medium text-zinc-800">AI Voice Output</p>
                        <p className="text-xs text-zinc-500">Allow Agar.ai to speak responses</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        isVoiceEnabled ? "bg-zinc-900" : "bg-zinc-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isVoiceEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Advanced</h3>
                <button
                  onClick={() => setIsAdminPanelOpen(true)}
                  className="w-full flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100 hover:bg-zinc-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-zinc-200 text-zinc-600">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-zinc-800">Admin Panel</p>
                      <p className="text-xs text-zinc-500">Manage AI knowledge and settings</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-400" />
                </button>
              </section>
            </div>
            
            <footer className="p-6 text-center border-t border-zinc-100">
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-semibold">
                Developed by Dasgar • agar.ai
              </p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-zinc-50/50"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
            <Bot className="w-16 h-16 text-zinc-300" />
            <div>
              <p className="text-xl font-medium text-zinc-400">How can I help you today?</p>
              <p className="text-sm">Start a conversation with Agar.ai</p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageBubble 
              key={msg.id} 
              msg={msg} 
              onLongPress={(e) => handleContextMenu(e, msg.id)}
              isPlaying={playingAudioId === msg.id}
              onPlay={() => playVoiceMessage(msg)}
              onFullScreen={(code) => setFullScreenGameCode(code)}
              onReact={(emoji) => reactToMessage(msg.id, emoji)}
              onCopy={(text) => copyMessage(text)}
            />
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex justify-start px-2"
          >
            <AgarCellLoader />
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <footer className="p-4 bg-white border-t border-zinc-100">
        <div className="max-w-3xl mx-auto space-y-4">
          {selectedFile && (
            <div className="flex items-center gap-3 p-2 bg-zinc-50 rounded-xl border border-zinc-100 animate-in fade-in slide-in-from-bottom-2">
              <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center text-white">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-zinc-900 truncate">{selectedFile.name}</p>
                <p className="text-[10px] text-zinc-400 uppercase tracking-widest">{selectedFile.type}</p>
              </div>
              <button 
                onClick={() => setSelectedFile(null)}
                className="p-1 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsConnectModalOpen(true)}
              className="w-12 h-12 bg-zinc-100 text-zinc-400 rounded-2xl flex items-center justify-center hover:bg-zinc-200 hover:text-zinc-900 transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-6 h-6" />
            </button>
            <div className="flex-1 relative flex items-center">
              <div className="absolute left-2 z-10 flex items-center gap-1">
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-white/80 backdrop-blur-sm border border-zinc-200 rounded-xl px-2 py-1 text-[10px] font-bold text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-all cursor-pointer appearance-none hover:bg-white"
                >
                  <option value="gemini-3-flash-preview">FLASH</option>
                  <option value="gemini-3.1-pro-preview">PRO</option>
                </select>
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={isRecording ? "Recording..." : "Type a message or ask for a game..."}
                className={`w-full pl-20 pr-12 py-4 bg-zinc-100 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 transition-all text-sm font-medium placeholder:text-zinc-400 ${isRecording ? "opacity-0 pointer-events-none" : "opacity-100"}`}
              />

              {isRecording && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute inset-0 flex items-center px-4 gap-3 text-red-500 font-medium bg-zinc-100 rounded-2xl"
                >
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-bold">{formatDuration(recordingDuration)}</span>
                  <div className="flex-1 flex items-center justify-center gap-2 text-zinc-400 animate-pulse">
                    <ChevronLeft className="w-4 h-4" />
                    <span className="text-[10px] uppercase tracking-widest font-bold">Slide to cancel</span>
                  </div>
                </motion.div>
              )}

              <div className="absolute right-2 flex items-center gap-1">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
              </div>
            </div>

            <button
              onMouseDown={input.trim() || selectedFile ? undefined : startRecording}
              onMouseUp={input.trim() || selectedFile ? undefined : stopRecording}
              onMouseLeave={isRecording ? stopRecording : undefined}
              onTouchStart={input.trim() || selectedFile ? undefined : (e) => { e.preventDefault(); startRecording(); }}
              onTouchEnd={input.trim() || selectedFile ? undefined : (e) => { e.preventDefault(); stopRecording(); }}
              onClick={input.trim() || selectedFile ? () => handleSend() : undefined}
              disabled={isLoading}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-lg shrink-0 touch-none ${
                isRecording 
                  ? "bg-red-500 text-white scale-110 z-20" 
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              }`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={input.trim() || selectedFile ? "send" : isRecording ? "mic-on" : "mic"}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.1 }}
                >
                  {input.trim() || selectedFile ? (
                    <Send className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </motion.div>
              </AnimatePresence>
            </button>
          </div>
        </div>
      </footer>

      {/* Context Menu Overlay */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed z-50 bg-white border border-zinc-200 shadow-2xl rounded-2xl p-2 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <button 
                onClick={() => copyMessage(messages.find(m => m.id === contextMenu.msgId)?.text || "")}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors"
              >
                <Copy className="w-4 h-4" /> Copy
              </button>
              <button 
                onClick={() => deleteMessage(contextMenu.msgId)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageBubble({ msg, onLongPress, isPlaying, onPlay, onFullScreen, onReact, onCopy }: { 
  msg: Message, 
  onLongPress: (e: any) => void,
  isPlaying: boolean,
  onPlay: () => void,
  onFullScreen: (code: string) => void,
  onReact: (emoji: string) => void,
  onCopy: (text: string) => void
}) {
  const longPressProps = useLongPress(onLongPress);
  const isUser = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isUser ? "justify-end" : "justify-start w-full"}`}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(e); }}
      {...longPressProps}
    >
      <div className={`flex gap-4 ${isUser ? "max-w-[85%] sm:max-w-[75%] flex-row-reverse" : "w-full flex-col"}`}>
        {/* Header for AI or Icon for User */}
        {!isUser ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-zinc-200 overflow-hidden border border-zinc-100">
              <img src="/icon.svg" alt="AI" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-zinc-900 tracking-tight">Agar.ai</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0 shadow-sm">
            <User className="w-4 h-4" />
          </div>
        )}
        
        <div className={`flex-1 ${isUser ? "space-y-2 items-end" : "w-full"}`}>
          <div className={`${
            isUser 
              ? "p-4 rounded-2xl shadow-sm bg-zinc-900 text-white rounded-tr-none" 
              : "text-zinc-800 leading-relaxed text-base w-full"
          }`}>
            {msg.imageUrl && (
              <img 
                src={msg.imageUrl} 
                className={`rounded-xl mb-4 object-cover cursor-pointer hover:opacity-90 transition-opacity ${isUser ? "w-full max-h-[300px]" : "max-w-2xl w-full h-auto shadow-xl border border-zinc-100"}`} 
                onClick={() => window.open(msg.imageUrl, '_blank')}
                referrerPolicy="no-referrer"
              />
            )}
            {msg.videoUrl && (
              <video 
                src={msg.videoUrl} 
                controls 
                className={`rounded-xl mb-4 object-cover ${isUser ? "w-full max-h-[300px]" : "max-w-2xl w-full h-auto shadow-xl"}`}
              />
            )}
            {msg.fileUrl && (
              <a 
                href={msg.fileUrl} 
                download={msg.fileName}
                className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl mb-3 hover:bg-zinc-100 transition-colors border border-zinc-100"
              >
                <FileText className="w-5 h-5 text-zinc-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-zinc-900 truncate">{msg.fileName || "File"}</p>
                  <p className="text-[10px] text-zinc-400 uppercase tracking-widest">{msg.fileType || "Download"}</p>
                </div>
                <Download className="w-4 h-4 text-zinc-400" />
              </a>
            )}
            
            <div className={`markdown-body ${!isUser && "prose prose-zinc max-w-none"}`}>
              <ReactMarkdown>{msg.text}</ReactMarkdown>
            </div>

            {(msg.audioUrl || (isUser && msg.userAudioUrl)) && (
              <div className={`flex items-center gap-3 mt-4 min-w-[200px] ${!isUser ? "p-3 bg-zinc-50 rounded-xl border border-zinc-100 max-w-md" : "p-2 bg-white/10 rounded-xl"}`}>
                <button 
                  onClick={onPlay}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    isUser ? "bg-white/10 text-white hover:bg-white/20" : "bg-zinc-900 text-white hover:bg-zinc-800"
                  }`}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
                <div className="flex-1 space-y-1">
                  <div className={`h-1 rounded-full overflow-hidden ${isUser ? "bg-white/20" : "bg-zinc-200"}`}>
                    <motion.div 
                      className={`h-full ${isUser ? "bg-white" : "bg-zinc-900"}`}
                      animate={{ width: isPlaying ? "100%" : "0%" }}
                      transition={{ duration: isPlaying ? 30 : 0, ease: "linear" }}
                    />
                  </div>
                  <p className={`text-[9px] font-bold uppercase tracking-widest ${isUser ? "text-white/40" : "text-zinc-400"}`}>
                    Voice Message
                  </p>
                </div>
              </div>
            )}

            {msg.gameCode && (
              <button 
                onClick={() => onFullScreen(msg.gameCode!)}
                className="mt-6 flex items-center justify-center gap-3 px-8 py-4 bg-zinc-900 text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200 active:scale-95 group"
              >
                <Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" /> 
                Play Game
              </button>
            )}
          </div>
          
          {!isUser && (
            <div className="flex items-center gap-1 mt-4">
              <button 
                onClick={() => onReact("👍")}
                className={`p-2 rounded-lg transition-colors ${msg.reaction === "👍" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"}`}
              >
                <ThumbsUp className={`w-4 h-4 ${msg.reaction === "👍" ? "fill-current" : ""}`} />
              </button>
              <button 
                onClick={() => onReact("👎")}
                className={`p-2 rounded-lg transition-colors ${msg.reaction === "👎" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"}`}
              >
                <ThumbsDown className={`w-4 h-4 ${msg.reaction === "👎" ? "fill-current" : ""}`} />
              </button>
              <button 
                onClick={() => onCopy(msg.text)}
                className="p-2 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 rounded-lg transition-colors ml-1"
                title="Copy message"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          )}

          {isUser && (
            <div className="flex items-center gap-2 px-1 flex-row-reverse">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {msg.reaction && (
                <span className="text-xs bg-white border border-zinc-100 rounded-full px-1.5 py-0.5 shadow-sm">
                  {msg.reaction}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
