import React from 'react';

interface DuckyAvatarProps {
  isListening: boolean;
  isSpeaking: boolean;
  volume: number; // 0 to 1
}

export const DuckyAvatar: React.FC<DuckyAvatarProps> = ({ isListening, isSpeaking, volume }) => {
  const baseScale = 1;
  const visualVolume = Math.min(volume * 2, 0.4); 
  const talkingScale = baseScale + visualVolume;
  
  return (
    <div className="relative w-80 h-80 flex items-center justify-center">
      
      {/* Outer Glow / Ripple Effect - Orange for DuckDuckGo Theme */}
      <div 
        className={`absolute inset-0 rounded-full transition-all duration-300 ease-out ${isListening ? 'bg-orange-400/20' : 'bg-transparent'}`}
        style={{ 
          transform: `scale(${1 + visualVolume * 0.5})`,
        }}
      />
      
      {/* Listening Pulse Ring - Orange */}
      {isListening && (
        <div className="absolute inset-[-10px] border-2 border-orange-500/30 rounded-full animate-ping" />
      )}

      {/* Main Container */}
      <div 
        className="relative z-10 w-64 h-64 rounded-full border-[8px] border-orange-100 shadow-xl bg-amber-50 overflow-hidden flex items-center justify-center transition-transform duration-100"
        style={{ transform: `scale(${talkingScale})` }}
      >
         {/* Colorful Low-Poly Duck Logo SVG */}
         <svg 
            viewBox="0 0 100 100" 
            className="w-full h-full p-6" 
            style={{ filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.1))' }}
         >
            {/* Head (Red/Orange) */}
            <path d="M65 20 L80 25 L75 40 L60 35 Z" fill="#EF4444" />
            <path d="M60 35 L75 40 L70 50 L55 45 Z" fill="#F97316" />
            
            {/* Neck Shadow / Beak Connection (Changed from Purple #9333EA to Orange #F97316) */}
            <path d="M70 50 L75 40 L80 50 L85 70 Z" fill="#F97316" />
            
            {/* Beak (Dark Orange) */}
            <path d="M75 40 L95 42 L80 50 Z" fill="#C2410C" />

            {/* Neck (Yellow/Orange) */}
            <path d="M55 45 L70 50 L60 65 L45 55 Z" fill="#F59E0B" />
            
            {/* Chest (Bright Yellow) */}
            <path d="M60 65 L70 50 L85 70 L65 80 Z" fill="#FACC15" />
            
            {/* Body (Orange/Tan) */}
            <path d="M45 55 L60 65 L45 80 L30 70 Z" fill="#FDBA74" />
            
            {/* Back (Dark Orange) */}
            <path d="M30 70 L45 55 L25 50 L15 65 Z" fill="#FB923C" />
            
            {/* Tail (Blue/Green) */}
            <path d="M15 65 L30 70 L20 85 L5 75 Z" fill="#3B82F6" />
            
            {/* Water/Bottom (Cyan/Teal) */}
            <path d="M30 70 L45 80 L35 90 L20 85 Z" fill="#06B6D4" />
            <path d="M45 80 L65 80 L60 90 L35 90 Z" fill="#22D3EE" />
            <path d="M65 80 L85 70 L80 85 L60 90 Z" fill="#4ADE80" />
         </svg>
      </div>
    </div>
  );
};