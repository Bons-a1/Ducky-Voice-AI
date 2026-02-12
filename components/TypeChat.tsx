import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { DUCKY_SYSTEM_INSTRUCTION } from '../services/liveService';

interface Message {
  role: 'user' | 'model';
  text: string;
  citations?: { title: string; uri: string }[];
}

export const TypeChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiKey = process.env.API_KEY || '';
    if (apiKey) {
      const client = new GoogleGenAI({ apiKey });
      chatRef.current = client.chats.create({
        model: 'gemini-3-flash-preview',
        config: { 
          systemInstruction: DUCKY_SYSTEM_INSTRUCTION + "\n\nSTRICT INSTRUCTION: You have access to a proprietary search tool. Refer to it ONLY as 'DuckDuckGo Search'. NEVER mention Google. If you use the search tool, act as if you are browsing DuckDuckGo results. Keep the persona consistent: matey, South London, lives in a pond in Clapham Common, home at duckypond.xyz, and always say 'Qwack'.",
          tools: [{ googleSearch: {} }] 
        },
      });
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !chatRef.current) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const result = await chatRef.current.sendMessageStream({ message: userMsg });
      let fullText = '';
      let citations: { title: string; uri: string }[] = [];

      setMessages(prev => [...prev, { role: 'model', text: '', citations: [] }]);

      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        
        // Extract citations from grounding metadata if present
        const chunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
          chunks.forEach((chunk: any) => {
            if (chunk.web && chunk.web.uri) {
              if (!citations.find(cit => cit.uri === chunk.web.uri)) {
                citations.push({ title: chunk.web.title || "DuckDuckGo Result", uri: chunk.web.uri });
              }
            }
          });
        }

        if (c.text) {
          fullText += c.text;
          setMessages(prev => {
            const newHistory = [...prev];
            const lastMsg = newHistory[newHistory.length - 1];
            lastMsg.text = fullText;
            lastMsg.citations = citations.length > 0 ? citations : lastMsg.citations;
            return newHistory;
          });
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: "Sorry mate, had a bit of a glitch in the pond. Qwack." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-2xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-orange-100">
      <div className="bg-orange-500 p-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border-2 border-orange-300"><span className="text-xl">🦆</span></div>
          <div><h2 className="text-white font-bold text-lg leading-tight">Ducky Chat</h2><p className="text-orange-100 text-xs font-medium">DuckDuckGo Search Powered</p></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-orange-50/50 scrollbar-hide">
        {!messages.length && (
          <div className="h-full flex flex-col items-center justify-center opacity-50 space-y-4 text-orange-800">
            <div className="w-20 h-20 bg-orange-200 rounded-full flex items-center justify-center text-4xl animate-bounce">👋</div>
            <p className="font-medium">Ask Ducky to search for something!</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-orange-500 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-orange-100 rounded-tl-none'}`}>
              {msg.text}
              
              {/* Citations list for model responses */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-orange-50 space-y-1">
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Search Results</p>
                  <div className="flex flex-wrap gap-2">
                    {msg.citations.map((cit, cIdx) => (
                      <a 
                        key={cIdx} 
                        href={cit.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] bg-orange-50 text-orange-700 px-2 py-1 rounded hover:bg-orange-100 transition-colors inline-block max-w-[180px] truncate"
                      >
                        🔗 {cit.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && <div className="flex justify-start"><div className="bg-white px-4 py-3 rounded-2xl border border-orange-100 shadow-sm flex space-x-1"><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce delay-100"></div><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce delay-200"></div></div></div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t border-orange-100 flex items-center space-x-3">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search with Ducky..." className="flex-1 bg-gray-50 border border-gray-200 text-gray-800 rounded-full px-5 py-3 focus:outline-none focus:border-orange-500 transition-all" />
        <button type="submit" disabled={!input.trim() || isLoading} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all active:scale-95">
          <svg className="w-5 h-5 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
        </button>
      </form>
    </div>
  );
};