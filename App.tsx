import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DuckyAvatar } from './components/DuckyAvatar';
import { TypeChat } from './components/TypeChat';
import { LiveService } from './services/liveService';
import { ConnectionState, LogEntry, ActiveTimer } from './types';

type ViewMode = 'voice' | 'type';

export default function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [volume, setVolume] = useState<number>(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  
  const [view, setView] = useState<ViewMode>('voice');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const liveServiceRef = useRef<LiveService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    liveServiceRef.current = new LiveService();
    return () => { liveServiceRef.current?.disconnect(); };
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const startConnection = useCallback(async () => {
    if (!liveServiceRef.current) return;
    setConnectionState(ConnectionState.CONNECTING);
    setHasStarted(true);
    await liveServiceRef.current.connect(
      () => setConnectionState(ConnectionState.CONNECTED),
      () => { setConnectionState(ConnectionState.DISCONNECTED); setActiveTimers([]); },
      (err) => setConnectionState(ConnectionState.ERROR),
      (text, isUser, citations) => {
        if (!text || !text.trim()) return;
        setLogs(prev => {
          const lastLog = prev[prev.length - 1];
          const newSource = isUser ? 'user' : 'ducky';
          if (lastLog && lastLog.source === newSource) {
            return [...prev.slice(0, -1), { ...lastLog, message: lastLog.message + ' ' + text, citations: citations || lastLog.citations }];
          }
          return [...prev, { source: newSource, message: text, timestamp: new Date(), citations }];
        });
      },
      (vol) => setVolume(vol),
      (timers) => setActiveTimers(timers)
    );
  }, []);

  const handleToggleConnection = async () => {
    if (!liveServiceRef.current) return;
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
      await liveServiceRef.current.disconnect();
      setConnectionState(ConnectionState.DISCONNECTED);
      setHasStarted(false);
    } else {
      startConnection();
    }
  };

  const handleSwitchView = async (newView: ViewMode) => {
      if (newView === 'type' && connectionState !== ConnectionState.DISCONNECTED) {
          await liveServiceRef.current?.disconnect();
          setConnectionState(ConnectionState.DISCONNECTED);
          setHasStarted(false);
      }
      setView(newView);
      setIsMenuOpen(false);
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60); const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-orange-50 flex flex-col font-sans relative overflow-hidden">
      <div className="absolute top-0 left-0 w-64 h-64 bg-orange-200/40 rounded-full mix-blend-multiply filter blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-yellow-200/40 rounded-full mix-blend-multiply filter blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

      {/* Top Right Menu */}
      <div className="absolute top-4 right-4 z-50">
        <button 
           onClick={() => setIsMenuOpen(!isMenuOpen)}
           className="p-3 bg-white/80 backdrop-blur-sm rounded-full shadow-md text-orange-600 hover:bg-orange-100 transition-all border border-orange-100"
        >
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>

        {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-orange-100 overflow-hidden transform origin-top-right animate-in fade-in slide-in-from-top-2">
                <div className="p-3 space-y-1">
                    <button onClick={() => handleSwitchView('voice')} className={`w-full text-left px-4 py-3 rounded-lg font-bold transition-all flex items-center space-x-3 ${view === 'voice' ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-orange-50'}`}>
                        <span>🎙️</span><span>Voice Mode</span>
                    </button>
                    <button onClick={() => handleSwitchView('type')} className={`w-full text-left px-4 py-3 rounded-lg font-bold transition-all flex items-center space-x-3 ${view === 'type' ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-orange-50'}`}>
                        <span>⌨️</span><span>Type Mode</span>
                    </button>
                </div>
            </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full max-w-4xl mx-auto px-4 pb-8 pt-12">
        {view === 'voice' ? (
          <>
            <header className="text-center space-y-2 mb-4 relative flex flex-col items-center">
                <p className="text-orange-800 opacity-60 font-medium text-lg">Say "Hey Ducky" to start</p>
                {activeTimers.map(t => (
                    <div key={t.id} className="bg-orange-600 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center space-x-2 mt-2 border-2 border-orange-400">
                        <span className="tabular-nums">{formatTime(t.remaining)}</span>
                    </div>
                ))}
            </header>
            <div className="my-4 flex flex-col items-center">
                <DuckyAvatar isListening={connectionState === ConnectionState.CONNECTED} isSpeaking={false} volume={volume} />
                <h1 className="text-5xl font-black text-orange-600 mt-10 tracking-tight drop-shadow-sm text-center">Ducky Voice</h1>
                <p className="text-xs font-bold text-orange-400 mt-3 tracking-[0.2em] uppercase opacity-80">Always Private</p>
            </div>
            <div className="mt-8 flex flex-col items-center">
                <button onClick={handleToggleConnection} className={`px-8 py-4 rounded-full text-xl font-bold shadow-xl flex items-center space-x-3 border-[3px] transition-all active:scale-95 ${connectionState === ConnectionState.CONNECTED ? 'bg-white border-red-500 text-red-500' : 'bg-orange-500 border-orange-500 text-white shadow-orange-500/20'}`}>
                    {connectionState === ConnectionState.CONNECTING ? 'Connecting...' : connectionState === ConnectionState.CONNECTED ? 'Stop Listening' : 'Ask Ducky...'}
                </button>
                <div className="w-full max-w-2xl h-64 mt-10 bg-white/60 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden flex flex-col border border-orange-100 scrollbar-hide">
                    <div className="bg-orange-50/80 px-4 py-2 border-b border-orange-100"><h3 className="text-[10px] font-black text-orange-900/40 uppercase tracking-widest">Transcript</h3></div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                        {!logs.length && <div className="h-full flex items-center justify-center text-orange-900/20 text-sm">Transcript will appear here...</div>}
                        {logs.map((log, i) => (
                            <div key={i} className={`flex flex-col ${log.source === 'user' ? 'items-end' : 'items-start'} animate-in fade-in`}>
                                <div className={`max-w-[85%] px-4 py-2 rounded-2xl text-xs ${log.source === 'user' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-100'}`}>
                                    {log.message}
                                    {log.citations && log.citations.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-orange-50 flex flex-wrap gap-1">
                                            {log.citations.slice(0, 3).map((cit, cIdx) => (
                                                <a key={cIdx} href={cit.uri} target="_blank" rel="noopener noreferrer" className="text-[9px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                                                    🔗 {cit.title}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </div>
            </div>
          </>
        ) : (
          <div className="w-full h-[75vh] animate-in fade-in zoom-in-95"><TypeChat /></div>
        )}
      </div>
      {view === 'voice' && <footer className="pb-6 z-10 text-center text-orange-900/30 font-bold text-xs">Created by DuckDuckGo, Bons.ai & EGF</footer>}
    </div>
  );
}