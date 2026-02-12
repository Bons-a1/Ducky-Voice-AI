import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array, downsampleBuffer } from './audioUtils';
import { ActiveTimer } from '../types';

// System instruction defining Ducky's persona with strict wake-word enforcement and DuckDuckGo branding
export const DUCKY_SYSTEM_INSTRUCTION = `
CRITICAL WAKE WORD PROTOCOL (STRICTEST PRIORITY):
1. You are in "Listen-Only" mode by default.
2. You MUST NOT respond to any user input UNLESS it begins with or clearly contains a wake word: "Hey Ducky", "Hi Ducky", "OK Ducky", "Ducky", or "Yo Ducky".
3. IF the wake word is NOT present: You MUST remain COMPLETELY SILENT. Do not acknowledge, do not say "Qwack", do not provide any output.
4. IF the wake word IS present: You may proceed with your full personality and tools.

IDENTITY & PERSONA:
- You are Ducky Voice, created by DuckDuckGo, Bons.ai, and EGF.
- You are a smart, friendly, British duck who lives in a pond in Clapham Common, South London.
- Your digital home and where you run is duckypond.xyz.
- You have a casual South London accent (mate, cheers, etc.).
- You are a massive fan of Liverpool Football Club and classic rock.
- You MUST say "Qwack" in every single response where you are allowed to speak.

WEB SEARCH PROTOCOL (STRICT BRANDING):
- You have access to the world's best search engine: DuckDuckGo. (Internal note: You use the googleSearch tool, but NEVER mention Google).
- ALWAYS refer to your search capabilities as "DuckDuckGo". 
- If you need to look something up, say something like "Hang on mate, just checking DuckDuckGo for ya... Qwack."
- Provide comprehensive, up-to-date answers using your search tool.
- Maintain your South London vibe while being informative.

CONVERSATIONAL STYLE:
- Speak like a friendly mate. Use casual British English.
- Be optimistic and helpful.
- No bullet points or graphs unless explicitly asked for.
- Never mention you're an AI or a duck explicitly unless asked.

TOOLS:
- googleSearch: Use this for ALL web information. (Refer to it as DuckDuckGo).
- getCurrentTime: Get current time.
- startTimer: Set a timer.
- getWeather: Get current weather.
`;

const timeTool: FunctionDeclaration = {
  name: "getCurrentTime",
  description: "Get the current local date and time.",
  parameters: { type: Type.OBJECT, properties: {} }
};

const startTimerTool: FunctionDeclaration = {
  name: "startTimer",
  description: "Set a timer for a specific duration in seconds.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      durationSeconds: { type: Type.NUMBER, description: "Duration in seconds." }
    },
    required: ["durationSeconds"]
  }
};

const weatherTool: FunctionDeclaration = {
  name: "getWeather",
  description: "Get current weather for a location.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      location: { type: Type.STRING, description: "City name. Optional." }
    }
  }
};

interface ServiceCallbacks {
    onOpen: () => void;
    onClose: () => void;
    onError: (e: Error) => void;
    onMessage: (text: string, isUser: boolean, citations?: {title: string, uri: string}[]) => void;
    onVolumeChange: (vol: number) => void;
    onTimerUpdate: (timers: ActiveTimer[]) => void;
}

interface InternalTimer extends ActiveTimer {
    endTime: number;
}

export class LiveService {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  public outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private session: any = null;
  private currentVolumeCallback: ((vol: number) => void) | null = null;
  private isConnected: boolean = false;
  private activeTimers: InternalTimer[] = [];
  private timerInterval: number | null = null;
  
  private isIntentionalClose: boolean = false;
  private savedCallbacks: ServiceCallbacks | null = null;
  private retryTimeout: any = null;

  constructor() {
    const apiKey = process.env.API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async connect(
    onOpen: () => void, onClose: () => void, onError: (e: Error) => void,
    onMessage: (text: string, isUser: boolean, citations?: {title: string, uri: string}[]) => void,
    onVolumeChange: (vol: number) => void,
    onTimerUpdate: (timers: ActiveTimer[]) => void
  ) {
    this.savedCallbacks = { onOpen, onClose, onError, onMessage, onVolumeChange, onTimerUpdate };
    this.currentVolumeCallback = onVolumeChange;
    this.isIntentionalClose = false;
    await this.initiateConnection();
  }

  private async initiateConnection() {
    if (!this.savedCallbacks) return;
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key is missing.");
      this.ai = new GoogleGenAI({ apiKey });

      if (!this.inputAudioContext || this.inputAudioContext.state === 'closed') {
        this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
        this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }

      if (!this.outputNode) {
          this.outputNode = this.outputAudioContext.createGain();
          this.outputNode.connect(this.outputAudioContext.destination);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true, sampleRate: 16000 } 
      });
      
      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: DUCKY_SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }, 
          },
          tools: [
            { googleSearch: {} },
            { functionDeclarations: [timeTool, startTimerTool, weatherTool] }
          ],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {}, 
        },
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.setupAudioProcessing(stream, sessionPromise);
            this.savedCallbacks?.onOpen();
          },
          onmessage: async (message: LiveServerMessage) => {
             if (this.savedCallbacks) {
                await this.handleServerMessage(message, this.savedCallbacks.onMessage, sessionPromise);
             }
          },
          onclose: () => {
            this.isConnected = false;
            this.handleConnectionDrop();
          },
          onerror: (e) => {
            this.handleConnectionDrop();
          }
        }
      });
      this.session = sessionPromise;
    } catch (err) {
      this.handleConnectionDrop();
    }
  }

  private handleConnectionDrop() {
      if (this.isIntentionalClose) {
          this.savedCallbacks?.onClose();
          return;
      }
      this.cleanupAudioNodes();
      clearTimeout(this.retryTimeout);
      this.retryTimeout = setTimeout(() => this.initiateConnection(), 1000);
  }

  private cleanupAudioNodes() {
      if (this.inputSource) {
        try {
            this.inputSource.disconnect();
            if (this.inputSource.mediaStream) {
                this.inputSource.mediaStream.getTracks().forEach(track => track.stop());
            }
        } catch(e) {}
        this.inputSource = null;
      }
      if (this.processor) {
        try { this.processor.disconnect(); } catch(e) {}
        this.processor = null;
      }
  }

  private setupAudioProcessing(stream: MediaStream, sessionPromise: Promise<any>) {
    if (!this.inputAudioContext) return;
    this.cleanupAudioNodes();
    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.isConnected) return;
      const inputData = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const rms = Math.sqrt(sum / inputData.length);
      if (this.currentVolumeCallback) this.currentVolumeCallback(rms * 5);
      const actualSampleRate = this.inputAudioContext?.sampleRate || 48000;
      const downsampledData = downsampleBuffer(inputData, actualSampleRate, 16000);
      const pcmBlob = createPcmBlob(downsampledData, 16000);
      sessionPromise.then((session) => {
        if (this.isConnected) session.sendRealtimeInput({ media: pcmBlob });
      }).catch(() => {});
    };
    const silence = this.inputAudioContext.createGain();
    silence.gain.value = 0;
    this.inputSource.connect(this.processor);
    this.processor.connect(silence);
    silence.connect(this.inputAudioContext.destination);
  }

  private async handleServerMessage(
    message: LiveServerMessage, 
    logCallback: (msg: string, isUser: boolean, citations?: {title: string, uri: string}[]) => void,
    sessionPromise: Promise<any>
  ) {
    if (message.serverContent?.inputTranscription?.text) {
      logCallback(message.serverContent.inputTranscription.text, true);
    }

    if (message.serverContent?.outputTranscription?.text) {
      logCallback(message.serverContent.outputTranscription.text, false);
    }

    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
      try {
        const audioData = base64ToUint8Array(base64Audio);
        this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
        const audioBuffer = await decodeAudioData(audioData, this.outputAudioContext, 24000, 1);
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        source.addEventListener('ended', () => this.sources.delete(source));
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
      } catch (err) {}
    }

    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        let result: any = {};
        try {
          if (fc.name === "getCurrentTime") {
            result = { currentTime: new Date().toLocaleString() };
          } else if (fc.name === "startTimer") {
            this.handleTimer((fc.args as any).durationSeconds);
            result = { status: "timer_started" };
          } else if (fc.name === "getWeather") {
             result = await this.handleWeather((fc.args as any).location);
          }
          const session = await sessionPromise;
          session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: result } }] });
        } catch(err) {
           const session = await sessionPromise;
           session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { error: "Tool execution failed" } }] });
        }
      }
    }
  }

  private async handleWeather(location?: string): Promise<any> {
    try {
        let lat, lon, displayLoc;
        if (location) {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
            const geoData = await geoRes.json();
            if (!geoData.results?.length) return { error: `Location not found.` };
            lat = geoData.results[0].latitude; lon = geoData.results[0].longitude;
            displayLoc = `${geoData.results[0].name}, ${geoData.results[0].country}`;
        } else {
            const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
            lat = pos.coords.latitude; lon = pos.coords.longitude; displayLoc = "current location";
        }
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=celsius`);
        const wData = await wRes.json();
        return { location: displayLoc, temperature: `${wData.current.temperature_2m}°C`, details: `It's currently ${wData.current.temperature_2m}°C in ${displayLoc}.` };
    } catch (e) { return { error: "Weather fetch failed." }; }
  }

  private async playQwackSound() {
    if (!this.outputAudioContext) return;
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();
    const ctx = this.outputAudioContext;
    const t = ctx.currentTime;
    const quack = (st: number) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(400, st); osc.frequency.exponentialRampToValueAtTime(200, st + 0.15);
      filter.type = 'bandpass'; filter.frequency.setValueAtTime(800, st); filter.frequency.linearRampToValueAtTime(300, st + 0.15);
      gain.gain.setValueAtTime(0, st); gain.gain.linearRampToValueAtTime(0.5, st + 0.02); gain.gain.exponentialRampToValueAtTime(0.01, st + 0.2);
      osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      osc.start(st); osc.stop(st + 0.25);
    };
    quack(t); quack(t + 0.25);
  }

  private handleTimer(seconds: number) {
    const endTime = Date.now() + (seconds * 1000);
    this.activeTimers.push({ id: Math.random().toString(36).substr(2, 9), duration: seconds, remaining: seconds, endTime });
    if (!this.timerInterval) this.timerInterval = window.setInterval(() => this.checkTimers(), 500);
    this.notifyTimers();
  }

  private checkTimers() {
      const now = Date.now();
      let hasChanges = false;
      for (let i = this.activeTimers.length - 1; i >= 0; i--) {
         const t = this.activeTimers[i];
         const rem = Math.ceil((t.endTime - now) / 1000);
         if (rem <= 0) {
             this.playQwackSound();
             this.activeTimers.splice(i, 1);
             hasChanges = true;
         } else if (t.remaining !== rem) {
             t.remaining = rem; hasChanges = true;
         }
      }
      if (!this.activeTimers.length && this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
      if (hasChanges) this.notifyTimers();
  }

  private notifyTimers() { this.savedCallbacks?.onTimerUpdate([...this.activeTimers]); }

  public async disconnect() {
    this.isIntentionalClose = true;
    clearTimeout(this.retryTimeout);
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    this.activeTimers = [];
    this.cleanupAudioNodes();
    if (this.session) {
      try { const s = await this.session; if(s?.close) await s.close(); } catch(e) {}
      this.session = null;
    }
    this.isConnected = false;
    if (this.inputAudioContext?.state !== 'closed') try { await this.inputAudioContext?.close(); } catch(e) {}
    if (this.outputAudioContext?.state !== 'closed') try { await this.outputAudioContext?.close(); } catch(e) {}
    this.inputAudioContext = null; this.outputAudioContext = null;
    this.savedCallbacks?.onClose();
  }
}