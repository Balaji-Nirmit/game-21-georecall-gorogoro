import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Volume2, VolumeX, Maximize2, MonitorOff, Smartphone } from 'lucide-react';
import { sound } from '../lib/audio';
import confetti from 'canvas-confetti';
import { cn } from '../lib/utils';

// world atlas 110m GeoJSON URL
const geoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

type GameState = 'idle' | 'showing' | 'playing' | 'round_over' | 'game_over';

interface MapMemoryGameProps {}

export default function MapMemoryGame({}: MapMemoryGameProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [guesses, setGuesses] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [lastTap, setLastTap] = useState<{ id: string, time: number } | null>(null);
  
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [wrongSelections, setWrongSelections] = useState<string[]>([]);
  const [allCountries, setAllCountries] = useState<any[]>([]);
  const [idToName, setIdToName] = useState<Record<string, string>>({});
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [hoveredCountry, setHoveredCountry] = useState<{ name: string, x: number, y: number } | null>(null);
  
  const [message, setMessage] = useState("GeoRecall");
  const [subMessage, setSubMessage] = useState("Remember the sequence of highlighted countries.");

  const maxMistakes = 3 + Math.floor((level - 1) / 3);
  const remainingChances = maxMistakes - wrongSelections.length;
  const accuracy = guesses === 0 ? 100 : Math.round((hits / guesses) * 100);

  // Fullscreen & Orientation Listeners
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    
    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Timer Logic for Showing and Playing phases
  useEffect(() => {
    let timer: any;
    if (gameState === 'showing' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (gameState === 'showing' && timeLeft === 0) {
      setGameState('playing');
      setSubMessage(`Replicate the pattern by clicking all ${targetCountries.length} countries.`);
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft, targetCountries]);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
        if ('orientation' in screen && 'lock' in screen.orientation) {
          // @ts-ignore
          await screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (err) {
        console.error("Fullscreen failed", err);
      }
    } else {
      document.exitFullscreen();
    }
  };

  // Fetch topologies purely to get a list of active IDs
  useEffect(() => {
    fetch(geoUrl)
      .then(res => res.json())
      .then(data => {
        // Extract features
        if (data && data.objects && data.objects.countries && data.objects.countries.geometries) {
           const geometries = data.objects.countries.geometries;
           const validGeos = geometries.filter((g: any) => g.id !== undefined && g.id !== null && String(g.id).trim() !== "");
           // Use a Set to ensure allCountries contains ONLY unique IDs
           const uniqueIds = Array.from(new Set(validGeos.map((g: any) => String(g.id))));
           const mapping: Record<string, string> = {};
           validGeos.forEach((g: any) => {
             mapping[String(g.id)] = g.properties?.name || "Unknown";
           });
           setAllCountries(uniqueIds);
           setIdToName(mapping);
           setIsDataLoaded(true);
        }
      });
  }, []);

  const generateTargets = useCallback((currentLevel: number) => {
    if (allCountries.length === 0) return [];
    
    // Scaling: starts at 2, adds 1 every 2 levels.
    const count = Math.min(2 + Math.floor((currentLevel - 1) / 2), 40);
    // Since allCountries is now pre-filtered for uniqueness, this slice is safe
    const shuffled = [...allCountries].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }, [allCountries]);

  const startLevel = useCallback((currentLevel: number) => {
    const targets = generateTargets(currentLevel);
    
    // Memory time: 8s base, adds 2s every 2 levels as requested
    const duration = 8 + Math.floor((currentLevel - 1) / 2) * 2;
    
    setTargetCountries(targets);
    setSelectedCountries([]);
    setWrongSelections([]);
    setTimeLeft(duration);
    setGameState('showing');
    setMessage(`Level ${currentLevel < 10 ? '0' + currentLevel : currentLevel}`);
    setSubMessage(`Memorize these ${targets.length} locations before time runs out.`);
    
    if (soundEnabled) sound.playHighlight();
  }, [generateTargets, soundEnabled]);

  const startGame = useCallback(() => {
    setScore(0);
    setHits(0);
    setGuesses(0);
    setLevel(1);
    startLevel(1);
  }, [startLevel]);

  const handleCountryClick = (geoProps: any) => {
    if (gameState !== 'playing') return;
    
    const id = String(geoProps.id);
    if (!id || selectedCountries.includes(id) || wrongSelections.includes(id)) return;

    // Selection Feedback for touch confirmation
    if (isTouchDevice) {
      const now = Date.now();
      if (lastTap && lastTap.id === id && now - lastTap.time < 400) {
        setLastTap(null); // Valid trigger
      } else {
        setLastTap({ id, time: now });
        if (soundEnabled) sound.playClick();
        return;
      }
    }
    
    setGuesses(g => g + 1);

    if (targetCountries.includes(id)) {
      const newSelected = [...selectedCountries, id];
      setSelectedCountries(newSelected);
      setHits(h => h + 1);
      if (soundEnabled) sound.playClick();
      setScore(s => s + 10 * level);
      
      if (newSelected.length === targetCountries.length) {
        setGameState('round_over');
        setMessage("Level Complete!");
        setSubMessage("Mission success. Loading next coordinates...");
        if (soundEnabled) sound.playSuccess();
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });
        
        setTimeout(() => {
          setLevel(l => l + 1);
          startLevel(level + 1);
        }, 2000);
      }
    } else {
      if (soundEnabled) sound.playError();
      const updatedWrong = [...wrongSelections, id];
      setWrongSelections(updatedWrong);
      
      if (updatedWrong.length >= maxMistakes) {
        setGameState('game_over');
        setMessage("Mission Failed");
        setSubMessage(`${maxMistakes} critical errors flagged. Revealing remaining intel.`);
      }
    }
  };

  const getCountryStyle = (id: string) => {
    // default
    const strId = String(id);
    let fill = "#ebeced";
    let stroke = "#ffffff";

    if (gameState === 'showing') {
      if (targetCountries.includes(strId)) {
        fill = "var(--color-apple-highlight)"; // Highlight for memorization
      }
    } else if (gameState === 'playing' || gameState === 'round_over' || gameState === 'game_over') {
      if (selectedCountries.includes(strId)) {
        fill = "var(--color-apple-success)"; // Correct sequential hit
      } else if (wrongSelections.includes(strId)) {
        fill = "var(--color-apple-error)"; // Wrong / out-of-order hit
      } else if (gameState === 'game_over' && targetCountries.includes(strId)) {
         fill = "var(--color-apple-highlight)"; // Show missed targets in blue
      }
    }
    
    return {
      default: { fill, stroke, outline: "none", strokeWidth: 0.5 },
      // On touch devices, hover styles often get 'stuck' or require extra taps to resolve.
      // We disable the hover color change on touch devices to ensure the first tap registers as a click.
      hover: { 
        fill: (!isTouchDevice && gameState === 'playing') ? "#d1d3d6" : fill, 
        stroke, 
        outline: "none", 
        strokeWidth: 0.5, 
        cursor: gameState === 'playing' ? "pointer" : "default" 
      },
      pressed: { fill: gameState === 'playing' ? "#c0c2c7" : fill, stroke, outline: "none", strokeWidth: 0.5 },
    };
  };

  return (
    <main 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden flex flex-col items-center bg-[#FBFBFD] select-none"
    >
      <div className="bg-gradient" />
      
      {/* Visually Hidden SEO Content */}
      <div className="sr-only">
        <h1>GeoRecall: The Ultimate Geography Memory Game</h1>
        <p>Master world geography with GeoRecall. Memorize country locations across 50+ levels of intense mission-based gameplay. The best geo game for training your memory and map skills.</p>
        <nav>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/play">Play Now</a></li>
          </ul>
        </nav>
      </div>
      
      {/* Dynamic Header HUD */}
      <header className="absolute top-0 w-full px-4 sm:px-8 py-4 sm:py-6 flex justify-between items-start z-30 pointer-events-none">
        
        {/* Top Left: Timer & Context */}
        <div className="flex flex-col gap-2 sm:gap-4 pointer-events-auto">
          <div className="text-lg sm:text-xl font-bold tracking-tight text-[#1D1D1F] drop-shadow-sm">GeoRecall</div>
          
          <div className="flex items-center gap-3 sm:gap-6">
            <AnimatePresence mode="wait">
              {gameState === 'showing' && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 sm:gap-3 bg-[#007AFF] text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl shadow-lg border border-white/20"
                >
                  <span className="text-[8px] sm:text-[10px] uppercase font-bold tracking-widest opacity-80">Timer</span>
                  <span className="text-xl sm:text-2xl font-mono font-bold leading-none">{timeLeft}s</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="glass px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl flex gap-3 sm:gap-6 shadow-sm border border-black/5">
              <div className="flex flex-col">
                <span className="text-[8px] sm:text-[9px] uppercase font-bold text-[#86868B] tracking-widest">Lvl</span>
                <span className="text-xs sm:text-sm font-bold">{level < 10 ? `0${level}` : level}</span>
              </div>
              <div className="flex flex-col border-l border-black/10 pl-3 sm:pl-4">
                <span className="text-[8px] sm:text-[9px] uppercase font-bold text-[#86868B] tracking-widest">Score</span>
                <span className="text-xs sm:text-sm font-bold">{score}</span>
              </div>
              <div className="flex flex-col border-l border-black/10 pl-3 sm:pl-4">
                <span className="text-[8px] sm:text-[9px] uppercase font-bold text-[#86868B] tracking-widest">Lives</span>
                <span className={cn(
                  "text-xs sm:text-sm font-bold transition-colors",
                  remainingChances <= 1 ? "text-[#ff3b30]" : "text-[#1D1D1F]"
                )}>
                  {remainingChances > 0 ? "●".repeat(remainingChances) : "○"}
                </span>
              </div>
            </div>
          </div>
        </div>

      {/* HUD Message (Active Play) */}
      <div className="absolute left-1/2 -translate-x-1/2 top-4 sm:top-8 text-center hidden sm:block pointer-events-none">
         <AnimatePresence mode="wait">
           {gameState === 'playing' && (
             <motion.div 
               key="hud-msg"
               initial={{ opacity: 0, y: -10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 10 }}
               className="flex flex-col items-center"
             >
               <h2 className="text-[10px] sm:text-sm font-bold text-[#1D1D1F] uppercase tracking-[0.2em]">{message}</h2>
               <p className="text-[9px] sm:text-[11px] text-[#86868B] font-medium tracking-wide mt-1 max-w-[200px] sm:max-w-none">{subMessage}</p>
             </motion.div>
           )}
         </AnimatePresence>
      </div>

        {/* Top Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="glass w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl hover:bg-white transition-colors"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button 
            onClick={toggleFullscreen}
            className="glass w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl hover:bg-white transition-colors"
          >
            {isFullscreen ? <MonitorOff size={16} /> : <Maximize2 size={16} />}
          </button>
          
          {(gameState === 'game_over') && (
            <button 
              onClick={() => {
                if (!isFullscreen) toggleFullscreen();
                startGame();
              }}
              className="bg-[#1D1D1F] hover:bg-black text-white px-4 sm:px-6 h-9 sm:h-10 rounded-xl font-bold text-[10px] sm:text-xs uppercase tracking-widest shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              Retry
            </button>
          )}
        </div>
      </header>

      {/* Immersive Game Over / Success Overlays */}
      <AnimatePresence>
        {gameState === 'game_over' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-xl flex items-center justify-center p-6 sm:p-12"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass max-w-lg w-full p-8 sm:p-12 rounded-[40px] text-center shadow-2xl border border-white/20"
            >
              <div className="bg-[#ff3b30] w-20 h-20 rounded-full flex items-center justify-center shadow-lg mx-auto mb-8">
                <RotateCcw size={40} className="text-white" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1D1D1F] mb-4 tracking-tight">Mission Failed</h2>
              <p className="text-lg text-[#86868B] mb-12 leading-relaxed">
                Critical intelligence lapse detected at Level {level}. The sequence was compromised. Missing targets are highlighted in blue for debriefing.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => window.location.reload()}
                  className="bg-white/50 text-[#1D1D1F] px-8 py-4 rounded-2xl font-bold text-sm tracking-widest border border-black/5 hover:bg-white transition-all"
                >
                  ABANDON
                </button>
                <button 
                  onClick={startGame}
                  className="bg-[#1D1D1F] text-white px-8 py-4 rounded-2xl font-bold text-sm tracking-widest shadow-xl hover:bg-black active:scale-95 transition-all"
                >
                  RE-DEPLOY
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'round_over' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-white/40 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <motion.div 
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 10, -10, 0]
                }}
                className="text-7xl mb-6 inline-block"
              >
                🎯
              </motion.div>
              <h2 className="text-5xl font-black text-[#1D1D1F] mb-4 tracking-tight">MISSION SUCCESS</h2>
              <p className="text-xl text-[#007AFF] font-bold tracking-widest uppercase">Level {level} Secured</p>
              <p className="text-[#86868B] mt-4">Syncing next coordinates...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {(gameState === 'idle') && !hasInteracted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[110] bg-[#FBFBFD] flex flex-col items-center justify-center p-8 bg-gradient-to-br from-white to-[#F2F2F7]"
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <div className="text-6xl mb-6">🌍</div>
              <h1 className="text-4xl font-extrabold tracking-tight text-[#1D1D1F] mb-4">GeoRecall</h1>
              <p className="text-xl text-[#86868B] max-w-md mb-12">
                A high-stakes global memory challenge. Master the world mission by mission.
              </p>
              
              <button 
                disabled={!isDataLoaded}
                onClick={() => {
                  setHasInteracted(true);
                  if (!isFullscreen) toggleFullscreen();
                  startGame();
                }}
                className={cn(
                  "bg-[#007AFF] text-white px-12 py-5 rounded-3xl font-bold text-lg tracking-widest shadow-2xl transition-all flex items-center gap-4",
                  !isDataLoaded ? "opacity-50 cursor-not-allowed" : "hover:scale-105 active:scale-95"
                )}
              >
                {isDataLoaded ? "START MISSION" : "LOADING INTEL..."} <Play size={24} fill="white" />
              </button>
            </motion.div>
          </motion.div>
      )}

      {/* Fullscreen/Orientation Warning Overlay */}
      <AnimatePresence>
        {hasInteracted && (!isFullscreen || isPortrait) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#FBFBFD] flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="bg-[#007AFF] w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl mb-6">
              {isPortrait ? <Smartphone size={40} className="text-white rotate-90" /> : <Maximize2 size={40} className="text-white" />}
            </div>
            <h2 className="text-2xl font-bold text-[#1D1D1F] mb-3">
              {isPortrait ? "Rotate your device" : "Re-engage Mission"}
            </h2>
            <p className="text-[#86868B] max-w-sm mb-8">
              {isPortrait 
                ? "This mission requires a horizontal perspective. Please rotate your device to landscape mode." 
                : "The global feed was interrupted. Please re-activate full-screen mode to continue tracking."}
            </p>
            
            <button 
              onClick={toggleFullscreen}
              className="bg-[#1D1D1F] text-white px-10 py-4 rounded-2xl font-bold text-sm tracking-widest shadow-2xl hover:bg-black active:scale-95 transition-all"
            >
              RESTORE FULLSCREEN
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Area */}
      <div className="absolute inset-0 w-full h-full map-container [touch-action:manipulation]">
        <ComposableMap width={1000} height={600} projection="geoMercator" projectionConfig={{ scale: 180, center: [0, 20] }}>
          <ZoomableGroup zoom={1} minZoom={1} maxZoom={12}>
            <Geographies geography={geoUrl}>
              {({ geographies }) => 
                geographies.map(geo => (
                  <Geography 
                    key={geo.rsmKey} 
                    geography={geo}
                    // Use onPointerDown for immediate feedback on both touch and mouse
                    onPointerDown={(e) => {
                      // Prevent default to avoid simulated mouse events and double-triggers
                      if (e.pointerType === 'touch') {
                        e.preventDefault();
                      }
                      handleCountryClick(geo);
                    }}
                    onMouseEnter={(e) => {
                      // Only show tooltips for mouse users and not on touch devices
                      if (!isTouchDevice && (gameState === 'idle' || gameState === 'game_over')) {
                        setHoveredCountry({
                          name: idToName[geo.id] || "Unknown",
                          x: e.clientX,
                          y: e.clientY
                        });
                      }
                    }}
                    onMouseMove={(e) => {
                      if (!isTouchDevice && hoveredCountry) {
                        setHoveredCountry(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                      }
                    }}
                    onMouseLeave={() => setHoveredCountry(null)}
                    style={getCountryStyle(geo.id)}
                    className={cn(
                      "transition-colors duration-300",
                      gameState === 'showing' && targetCountries.includes(String(geo.id)) && "pulse-active"
                    )}
                  />
                ))
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Floating Tooltip */}
      <AnimatePresence>
        {hoveredCountry && (gameState === 'idle' || gameState === 'game_over') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed z-50 country-label"
            style={{ left: hoveredCountry.x + 15, top: hoveredCountry.y + 15 }}
          >
            {hoveredCountry.name}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
