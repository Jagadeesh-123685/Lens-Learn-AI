import { useState, useRef, useEffect } from 'react';
import { Upload, X, Loader2, ChevronRight, ChevronLeft, Volume2, Maximize, AlertCircle, MessageSquare } from 'lucide-react';
import { analyzeScreenshot, AnalysisResult, chatWithScreenshot } from './services/ai';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';

type Mode = "Beginner" | "Intermediate" | "Expert";

export default function App() {
  const [image, setImage] = useState<{ src: string, base64: string, mime: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [mode, setMode] = useState<Mode>("Intermediate");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);

  // Sync state with ref for closure access
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Chat state
  const [chatHistory, setChatHistory] = useState<{role: "user" | "model", text: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imageDimension, setImageDimension] = useState({ width: 0, height: 0 });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const base64 = src.split(',')[1];
      setImage({ src, base64, mime: file.type });
      setResult(null); // Reset
      setCurrentStepIndex(-1);
    };
    reader.readAsDataURL(file);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimension({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const startAnalysis = async () => {
    if (!image) return;
    setIsAnalyzing(true);
    try {
      const data = await analyzeScreenshot(image.base64, image.mime, mode);
      setResult(data);
      setCurrentStepIndex(0);
    } catch (err) {
      console.error(err);
      alert("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const playTTS = (text: string) => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      speechSynthesis.speak(utterance);
    }
  };

  const playTTSAuto = (startIndex: number) => {
    if (!result || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();

    let currentIndex = startIndex;
    
    const playNext = () => {
      if (!isPlayingRef.current) return;
      if (currentIndex >= result.steps.length) {
        setIsPlaying(false);
        return;
      }
      
      setCurrentStepIndex(currentIndex);
      const step = result.steps[currentIndex];
      const text = `${step.elementName}. Where to look: ${step.whatToLookAt}. What it represents: ${step.whatItRepresents}. Action: ${step.actionOrInsight}`;
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => {
        currentIndex++;
        // Small delay before next slide
        setTimeout(() => {
           // We need to check if still playing inside timeout
           playNext();
        }, 1000);
      };
      
      speechSynthesis.speak(utterance);
    };
    
    playNext();
  };

  const exportAsScript = () => {
    if (!result) return;
    
    let content = `# Tutorial: ${result.context}\n\n`;
    
    content += `## Step-by-Step Guide\n\n`;
    result.steps.forEach((step, index) => {
      content += `### Step ${index + 1}: ${step.elementName}\n`;
      content += `- **Where to look:** ${step.whatToLookAt}\n`;
      content += `- **What it represents:** ${step.whatItRepresents}\n`;
      content += `- **Action/Insight:** ${step.actionOrInsight}\n\n`;
    });

    if (result.improvements.length > 0) {
      content += `## Areas for Improvement\n`;
      result.improvements.forEach(imp => {
        content += `- ${imp}\n`;
      });
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tutorial-script.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderBoundingBox = (box_2d: [number, number, number, number], isActive: boolean, label: string, index: number) => {
    const [ymin, xmin, ymax, xmax] = box_2d;
    const top = `${(ymin / 1000) * 100}%`;
    const left = `${(xmin / 1000) * 100}%`;
    const height = `${((ymax - ymin) / 1000) * 100}%`;
    const width = `${((xmax - xmin) / 1000) * 100}%`;

    return (
      <div
        key={label + index}
        onClick={() => setCurrentStepIndex(index)}
        className={cn(
          "absolute border transition-all duration-500 cursor-pointer",
          isActive 
            ? "border-cyan-400 bg-cyan-400/20 z-20 shadow-[0_0_20px_rgba(34,211,238,0.4)] scale-[1.02]" 
            : "border-white/30 border-dashed z-0 hover:bg-white/10 hover:border-white/70"
        )}
        style={{ top, left, width, height }}
      >
        {isActive && (
          <span className="absolute -top-3 -left-1 bg-gradient-to-r from-cyan-400 to-cyan-500 text-black text-xs px-2 py-0.5 font-bold rounded uppercase shadow-[0_4px_10px_rgba(0,0,0,0.5)] whitespace-nowrap transform -translate-y-1">
            {label}
          </span>
        )}
      </div>
    );
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !image) return;

    const currentInput = chatInput;
    setChatInput("");
    const newHistory = [...chatHistory, { role: "user" as const, text: currentInput }];
    setChatHistory(newHistory);
    setIsChatting(true);

    try {
      const response = await chatWithScreenshot(image.base64, image.mime, chatHistory, currentInput);
      setChatHistory([...newHistory, { role: "model", text: response }]);
    } catch (err) {
      console.error(err);
      setChatHistory([...newHistory, { role: "model", text: "Sorry, an error occurred while processing your request." }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[#050508] text-gray-200 flex flex-col font-serif overflow-hidden relative">
      {/* Glassmorphism Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
         <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vh] rounded-full bg-cyan-700/20 blur-[120px] mix-blend-screen"></div>
         <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[60vh] rounded-full bg-indigo-700/20 blur-[130px] mix-blend-screen"></div>
         <div className="absolute bottom-[-20%] left-[20%] w-[60vw] h-[50vh] rounded-full bg-blue-800/20 blur-[140px] mix-blend-screen"></div>
         <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      {/* Header */}
      <header className="relative z-20 flex-none h-16 border-b border-white/10 px-4 md:px-8 flex items-center justify-between bg-black/20 backdrop-blur-2xl shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
        <div className="flex items-center space-x-2 md:space-x-3">
          <div className="w-6 h-6 md:w-8 md:h-8 bg-cyan-500 rounded flex items-center justify-center flex-shrink-0">
            <Maximize className="w-4 h-4 md:w-5 md:h-5 text-black" strokeWidth={2.5} />
          </div>
          <h1 className="text-base md:text-xl font-semibold tracking-tight text-white uppercase whitespace-nowrap">
            Lens & Learn <span className="text-cyan-500 hidden sm:inline">AI</span>
          </h1>
        </div>
        <div className="flex items-center text-base font-medium ml-2">
          <div className="flex bg-black/40 p-1 rounded-lg border border-white/10 shadow-inner backdrop-blur-md overflow-x-auto max-w-[160px] sm:max-w-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {['Beginner', 'Intermediate', 'Expert'].map((m) => (
              <button 
                  key={m} 
                  onClick={() => !isAnalyzing && setMode(m as Mode)}
                  disabled={isAnalyzing}
                  className={cn(
                    "px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-bold uppercase rounded transition-all duration-300 whitespace-nowrap",
                    mode === m 
                      ? "bg-white/20 text-cyan-300 border border-white/20 shadow-[0_2px_15px_rgba(34,211,238,0.3)] transform scale-[1.02] backdrop-blur-lg" 
                      : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                  )}
              >
                  {m}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative z-10">
        {/* Left pane: Image & Overlay */}
        <section className="flex-none lg:flex-1 p-4 lg:p-8 min-h-[60vh] lg:min-h-0 relative flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 bg-white/[0.02] backdrop-blur-sm z-10">
          {!image ? (
            <div 
              className="flex-1 flex flex-col items-center justify-center relative overflow-hidden my-8 lg:my-0"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
               {/* Background Effects */}
               {/* Handled by global background now */}

               {/* Hero Content */}
               <div className="z-10 text-center mb-8 lg:mb-12 space-y-4 lg:space-y-6 mt-4 lg:mt-0">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-black tracking-widest uppercase mb-2 shadow-[0_0_15px_rgba(34,211,238,0.2)] mx-auto">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    AI Vision Engine Active
                  </div>
                  <h2 className="text-4xl md:text-6xl font-light text-white tracking-tight leading-tight">
                    Decode any Interface. <br className="hidden sm:block"/>
                    <span className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">Instantly.</span>
                  </h2>
                  <p className="text-gray-400 max-w-lg mx-auto text-sm sm:text-base leading-relaxed px-4">
                    Upload a dashboard, web app, or error screen. Our AI will analyze its elements, explain what they mean, and generate a step-by-step interactive tutorial.
                  </p>
               </div>

               {/* Upload Box with 3D Effect */}
               <div className="z-10 [perspective:1000px] w-full max-w-lg mx-auto">
                 <div className={cn(
                    "w-full p-8 lg:p-12 border border-white/10 rounded-3xl text-center transition-all duration-700 cursor-pointer backdrop-blur-2xl relative overflow-hidden group shadow-[0_8px_32px_rgba(0,0,0,0.4)] transform [transform-style:preserve-3d]",
                    isDragging ? "bg-cyan-500/20 border-cyan-400 shadow-[0_0_50px_rgba(34,211,238,0.3)] scale-[1.02]" : "bg-black/20 hover:bg-white/10 hover:border-white/30 hover:shadow-[0_15px_40px_rgba(0,0,0,0.6)] hover:-translate-y-2"
                 )} onClick={() => fileInputRef.current?.click()}>
                   
                   <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/0 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

                   <div className="w-24 h-24 mx-auto mb-8 bg-black/40 rounded-2xl border border-white/10 backdrop-blur-xl shadow-[inset_0_2px_20px_rgba(255,255,255,0.05)] flex items-center justify-center relative group-hover:-translate-y-4 group-hover:shadow-[0_10px_40px_rgba(34,211,238,0.3)] transition-all duration-700 ease-out">
                     <div className="absolute inset-0 rounded-2xl bg-cyan-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                     <Upload className="w-10 h-10 text-cyan-400 relative z-10 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" strokeWidth={1.5} />
                   </div>
                   
                   <h3 className="text-2xl font-medium mb-3 text-white drop-shadow-md">Drag & drop your screenshot</h3>
                   <p className="text-gray-400 text-base">Or click to browse (PNG, JPG files up to 10MB)</p>
                   
                   <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                 </div>
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden relative min-h-[40vh]">
               <div className="flex justify-between items-end mb-4 flex-wrap gap-2">
                 <div>
                   <h2 className="text-xl md:text-3xl font-light text-white">Screenshot Loaded</h2>
                   <p className="text-xs md:text-sm text-gray-500 font-mono">READY FOR ANALYSIS</p>
                 </div>
                 <div className="flex gap-2">
                   <button 
                      onClick={() => { setImage(null); setResult(null); setChatHistory([]); }}
                      className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-lg border border-white/10 text-white hover:bg-white/5"
                      title="Clear Image"
                   >
                     <X className="w-4 h-4 md:w-5 md:h-5" />
                   </button>
                 </div>
               </div>
               
               <div className="flex-1 bg-black/30 backdrop-blur-2xl p-2 md:p-6 rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center relative group shadow-[0_8px_32px_rgba(0,0,0,0.4)] min-h-[300px]">
                 <div ref={imageContainerRef} className="relative inline-block max-w-full max-h-full [perspective:1000px]">
                    <img 
                      src={image.src} 
                      alt="Uploaded screenshot" 
                      className="max-w-full max-h-[calc(100vh-320px)] lg:max-h-[calc(100vh-220px)] object-contain block rounded shadow-[0_20px_50px_rgba(0,0,0,0.7)] border border-white/10 transform transition-transform duration-700 group-hover:scale-[1.01]"
                      onLoad={handleImageLoad}
                    />
                    {/* Bounding boxes */}
                    {result && result.steps.map((step, idx) => (
                      renderBoundingBox(step.box_2d, currentStepIndex === idx, step.elementName, idx)
                    ))}
                 </div>
               </div>
            </div>
          )}
        </section>

        {/* Right pane: Analysis & Chat */}
        <aside className="w-full lg:w-[450px] xl:w-[500px] flex-none flex flex-col bg-black/20 backdrop-blur-xl lg:border-l border-t lg:border-t-0 border-white/10 lg:overflow-hidden z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.3)] min-h-[60vh] lg:min-h-0">
          {!image ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center relative overflow-hidden bg-transparent">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:16px_16px]"></div>
                <div className="w-20 h-20 rounded-full bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-center mb-6 relative shadow-[0_0_30px_rgba(34,211,238,0.05)]">
                   <div className="absolute inset-0 rounded-full bg-transparent border border-cyan-400/20 animate-ping opacity-50" style={{ animationDuration: '3s' }}></div>
                   <MessageSquare className="w-8 h-8 text-cyan-500/50" strokeWidth={1.5} />
                </div>
                <h3 className="text-white/80 font-medium mb-3 z-10 text-xl tracking-tight">System Standby</h3>
                <p className="text-sm text-gray-500 max-w-[250px] leading-relaxed z-10">Upload a screenshot on the left to activate the AI analysis engine and unlock interactive tutorials.</p>
            </div>
          ) : !result ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 text-center space-y-6">
                <p className="text-sm md:text-base text-gray-400">Image loaded successfully. Analyze it to generate the tutorial.</p>
                <button 
                  onClick={startAnalysis} 
                  disabled={isAnalyzing}
                  className="w-full max-w-xs mx-auto px-5 py-3 bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-bold uppercase rounded-md tracking-wider hover:bg-white/20 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all duration-300 flex items-center justify-center active:scale-95"
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Analyzing...</>
                  ) : "Generate Tutorial"}
                </button>
            </div>
          ) : (
             <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-white/10 bg-black/20 backdrop-blur-md">
                   <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500 mb-1">Context</p>
                   <p className="text-sm font-medium text-white">{result.context}</p>
                </div>
                
                {/* Tabs */}
                <div className="flex-1 overflow-y-auto">
                   {/* Tutorial Section */}
                   <div className="p-6">
                       <div className="flex items-center justify-between mb-4">
                         <h3 className="text-sm font-bold text-white uppercase tracking-tighter flex items-center gap-2">
                            <span className="w-1 h-4 bg-cyan-500 rounded-full"></span> Tutorial Walkthrough
                         </h3>
                         <div className="flex items-center space-x-2">
                           <button
                             onClick={() => {
                               if (isPlaying) {
                                  setIsPlaying(false);
                                  speechSynthesis.cancel();
                               } else {
                                  setIsPlaying(true);
                                  playTTSAuto(currentStepIndex);
                               }
                             }}
                             className={cn(
                               "px-2 py-1 text-xs font-black uppercase tracking-widest rounded transition-colors border",
                               isPlaying ? "border-amber-500 text-amber-500 hover:bg-amber-500/10" : "border-white/10 text-gray-400 hover:text-white"
                             )}
                           >
                              {isPlaying ? "Stop" : "Play Intro"}
                           </button>

                           <button 
                             onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}
                             disabled={currentStepIndex <= 0}
                             className="w-6 h-6 flex items-center justify-center rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 ml-2 disabled:opacity-30"
                           ><ChevronLeft className="w-4 h-4"/></button>
                           <span className="text-xs font-bold text-gray-500">{currentStepIndex + 1} / {result.steps.length}</span>
                           <button 
                             onClick={() => setCurrentStepIndex(Math.min(result.steps.length - 1, currentStepIndex + 1))}
                             disabled={currentStepIndex >= result.steps.length - 1}
                             className="w-6 h-6 flex items-center justify-center rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30"
                           ><ChevronRight className="w-4 h-4"/></button>
                         </div>
                      </div>

                      {result.steps[currentStepIndex] && (
                        <div className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 p-5 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in slide-in-from-right-4 duration-300 relative overflow-hidden">
                           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-50"></div>
                           <div className="flex justify-between items-start">
                             <div className="flex gap-3">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-black/40 border border-white/10 backdrop-blur-md flex items-center justify-center text-xs font-bold text-cyan-300">
                                   {(currentStepIndex + 1).toString().padStart(2, '0')}
                                </div>
                                <h4 className="font-medium text-base text-white pt-1 drop-shadow-md">
                                  {result.steps[currentStepIndex].elementName}
                                </h4>
                             </div>
                             <button
                               onClick={() => playTTS(`${result.steps[currentStepIndex].elementName}. Where to look: ${result.steps[currentStepIndex].whatToLookAt}. What it represents: ${result.steps[currentStepIndex].whatItRepresents}. Action: ${result.steps[currentStepIndex].actionOrInsight}`)}
                               className="p-1.5 text-gray-400 hover:text-white transition-all duration-300 hover:bg-white/10 rounded-full hover:shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                               title="Read aloud"
                             >
                                <Volume2 className="w-4 h-4" />
                             </button>
                           </div>
                           
                           <div className="space-y-3 text-sm text-gray-300 leading-relaxed pl-9">
                              <div>
                                <span className="block text-white/80 font-medium mb-0.5 drop-shadow-sm">Where to look</span>
                                <p>{result.steps[currentStepIndex].whatToLookAt}</p>
                              </div>
                              <div>
                                <span className="block text-white/80 font-medium mb-0.5 drop-shadow-sm">What it represents</span>
                                <p>{result.steps[currentStepIndex].whatItRepresents}</p>
                              </div>
                              <div className="bg-gradient-to-br from-white/10 to-white/5 p-3 rounded-lg border-t border-l border-white/10 border-b border-l-2 border-l-cyan-400 text-gray-200 mt-2 shadow-inner">
                                <span className="block text-xs font-black uppercase tracking-widest text-cyan-400 mb-1 drop-shadow-sm">Action / Insight</span>
                                <p className="text-sm">{result.steps[currentStepIndex].actionOrInsight}</p>
                              </div>
                           </div>
                        </div>
                      )}
                   </div>

                   {/* Improvements Section */}
                   {result.improvements.length > 0 && (
                     <div className="p-6 pt-0">
                        <h3 className="text-sm font-bold text-white uppercase tracking-tighter mb-4 flex items-center gap-2 mt-4">
                           <span className="w-1 h-4 bg-amber-500 rounded-full"></span> Structural Improvements
                        </h3>
                        <ul className="space-y-2">
                           {result.improvements.map((imp, idx) => (
                             <li key={idx} className="bg-white/5 backdrop-blur-md p-3 rounded-lg border border-white/5 border-l-2 border-l-amber-500 shadow-md flex items-start gap-3 text-sm text-gray-200">
                               <AlertCircle className="w-4 h-4 text-amber-500 min-w-[16px] mt-0.5" />
                               <span>{imp}</span>
                             </li>
                           ))}
                        </ul>
                     </div>
                   )}
                </div>

                {/* Chat Section */}
                <div className="h-[45vh] lg:h-64 border-t border-white/10 flex flex-col bg-black/20 backdrop-blur-md flex-none">
                  <div className="px-6 py-3 border-b border-white/10 bg-white/5 flex items-center text-xs font-black uppercase tracking-widest text-gray-400">
                     <MessageSquare className="w-3 h-3 mr-2" /> Q&A
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                     {chatHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-2">
                          <MessageSquare className="w-8 h-8 text-gray-500" />
                          <p className="text-sm text-center text-gray-500">Ask a question about the screenshot.</p>
                        </div>
                     ) : (
                        chatHistory.map((msg, idx) => (
                          <div key={idx} className={cn(
                             "text-sm p-3 rounded-lg max-w-[85%] leading-relaxed shadow-[0_4px_15px_rgba(0,0,0,0.2)] backdrop-blur-md", 
                             msg.role === "user" 
                                ? "bg-white/10 text-white border border-white/10 ml-auto" 
                                : "bg-cyan-500/20 text-cyan-50 border border-cyan-500/30 mr-auto"
                          )}>
                             {msg.role === "model" ? (
                               <div className="markdown-body"><ReactMarkdown>{msg.text}</ReactMarkdown></div>
                             ) : (
                               msg.text
                             )}
                          </div>
                        ))
                     )}
                     {isChatting && (
                        <div className="text-xs font-bold text-cyan-500 uppercase tracking-widest animate-pulse flex items-center mt-2">
                          <Loader2 className="w-3 h-3 animate-spin mr-2" /> AI is typing...
                        </div>
                     )}
                  </div>
                  <form onSubmit={handleChat} className="p-4 border-t border-white/10 bg-black/30 shadow-[0_-10px_20px_rgba(0,0,0,0.3)] z-10 relative backdrop-blur-2xl">
                     <div className="relative bg-black/40 border border-white/10 rounded-xl p-1.5 flex items-center shadow-inner focus-within:border-cyan-500/50 transition-all">
                        <input 
                          type="text" 
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          placeholder="Ask a question about this UI..."
                          className="bg-transparent border-none outline-none text-sm flex-1 text-white placeholder-gray-500 px-3"
                        />
                        <button 
                           type="submit" 
                           disabled={!chatInput.trim() || isChatting}
                           className="p-2 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-lg disabled:opacity-50 hover:bg-white/20 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all active:translate-y-px"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </button>
                     </div>
                  </form>
                </div>
                <div className="p-4 border-t border-white/10 bg-black/40 backdrop-blur-xl">
                   <div className="flex justify-between">
                     <button onClick={exportAsScript} className="text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-cyan-400 transition-colors">Export Script</button>
                     <button onClick={() => playTTSAuto(0)} className="text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-cyan-400 transition-colors">Generate Presentation</button>
                   </div>
                </div>
             </div>
          )}
        </aside>
      </main>
    </div>
  );
}
