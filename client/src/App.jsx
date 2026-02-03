import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import 'katex/dist/katex.min.css'; 
import { InlineMath } from 'react-katex';
import { Toaster, toast } from 'react-hot-toast';
import { jsPDF } from "jspdf"; 

document.title = "BrainSync | Live Quiz";
const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
link.type = 'image/svg+xml';
link.rel = 'icon';
link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧠</text></svg>';
document.getElementsByTagName('head')[0].appendChild(link);

const socket = io.connect("https://brainsync-server.onrender.com"); 

const MathText = ({ text }) => {
  if (!text) return null;
  let cleanText = text.replace(/\\/g, '\\').replace(/\\\(/g, '$').replace(/\\\)/g, '$').replace(/\\\[/g, '$').replace(/\\\]/g, '$');
  const parts = cleanText.split('$');
  return <span>{parts.map((p, i) => i % 2 === 0 ? <span key={i}>{p}</span> : <InlineMath key={i} math={p} />)}</span>;
};

const SYLLABUS = {
  "Applied Mathematics-II": [
    { id: "m1", name: "Module 1: Diff Eq", prompt: "Exact differential Equations" },
    { id: "m2", name: "Module 2: LDE", prompt: "Linear Differential Equation" },
    { id: "m3", name: "Module 3: Beta Gamma", prompt: "Beta and Gamma functions" },
    { id: "m4", name: "Module 4: Double Int", prompt: "Double integration" },
    { id: "m5", name: "Module 5: Triple Int", prompt: "Triple integration" },
    { id: "m6", name: "Module 6: Numerical", prompt: "Runge-Kutta" }
  ]
};

const compressImage = (file, callback) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxWidth = 800; 
            const scaleSize = maxWidth / img.width;
            canvas.width = maxWidth;
            canvas.height = img.height * scaleSize;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            callback(canvas.toDataURL('image/jpeg', 0.6));
        }
    }
};

// 🟢 IMPROVED LATEX CLEANER
const cleanLatex = (text) => {
    if (!text) return "";
    return text
        .replace(/\\frac{([^{}]+)}{([^{}]+)}/g, '($1)/($2)') // Fractions
        .replace(/\\int/g, 'Integral ')
        .replace(/\\sqrt{([^{}]+)}/g, 'Sqrt($1)')
        .replace(/\\infty/g, 'Infinity')
        .replace(/\\pm/g, '+/-')
        .replace(/\\approx/g, '~')
        .replace(/\\cdot/g, '*')
        .replace(/\\times/g, 'x')
        .replace(/\\le/g, '<=')
        .replace(/\\ge/g, '>=')
        .replace(/\^/g, '^') // Keep powers
        .replace(/_/g, '_')  // Keep subscripts
        .replace(/[{}]/g, '') // Remove brackets
        .replace(/\$/g, '')  // Remove dollar signs
        .replace(/\\/g, ''); // Remove stray backslashes
};

function App() {
  const [gameState, setGameState] = useState(() => localStorage.getItem("bs_room") ? 'lobby' : 'menu');
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("bs_room") || '');
  const [username, setUsername] = useState(() => localStorage.getItem("bs_user") || '');
  
  const [role, setRole] = useState('member'); 
  const [question, setQuestion] = useState(null);
  const [roundResult, setRoundResult] = useState(null); 
  const [timer, setTimer] = useState(420);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
  const [scores, setScores] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  
  const [selectedTopics, setSelectedTopics] = useState([]); 
  const [questionLimit, setQuestionLimit] = useState(""); 
  const [subjectExpanded, setSubjectExpanded] = useState(false);
  
  const [quizHistory, setQuizHistory] = useState(() => {
      const saved = localStorage.getItem("bs_history");
      return saved ? JSON.parse(saved) : [];
  });

  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyLength, setHistoryLength] = useState(0);
  const [canMoveOn, setCanMoveOn] = useState(false);
  
  const [profileOpen, setProfileOpen] = useState(false);
  const [showCamOptions, setShowCamOptions] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isListeningAI, setIsListeningAI] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const roomInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const unlockAudio = () => {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
  };

  useEffect(() => {
    if (roomCode && username) { socket.emit('rejoin_room', { roomCode, username }); unlockAudio(); }
  }, []);

  useEffect(() => {
    socket.on('set_role', ({ role }) => { 
        setRole(role); 
        if (gameState === 'menu') setGameState('lobby');
        localStorage.setItem("bs_room", roomCode);
        localStorage.setItem("bs_user", username);
        unlockAudio();
    });

    socket.on('error_message', (msg) => { toast.error(msg); handleLogout(); });
    
    socket.on('new_question', (data) => {
      setQuestion(data);
      setRoundResult(null); 
      setSelectedOptionIndex(null);
      setGameState('playing');
      setIsHistoryMode(false); 
      setHistoryLength(prev => prev + 1);
      setHistoryIndex(prev => prev + 1);
      window.speechSynthesis.cancel();
      setAiSpeaking(false);
    });

    socket.on('lock_host', () => setCanMoveOn(false));
    socket.on('unlock_host', () => { if(!canMoveOn) toast.success("Unlocked! 🔓"); setCanMoveOn(true); });
    socket.on('timer_update', (t) => setTimer(t));
    socket.on('update_scores', (s) => setScores(s));
    
    socket.on('round_result', (data) => { 
        setRoundResult(data); 
        setGameState('result'); 
        if(data.isReview) setIsHistoryMode(true); 
    });
    
    socket.on('ai_voice_reply', ({ text }) => { setIsListeningAI(false); speakText(text); toast("🤖 AI Answered", { icon: '🤫' }); });
    socket.on('host_notification', ({ type, username }) => toast(`${username}: ${type === 'stuck' ? 'Stuck 🤷' : 'Help!'}`, { icon: '📣' }));
    socket.on('cheat_alert', ({ username }) => { toast.error(`⚠️ ${username} tab switched!`); new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(()=>{}); });

    socket.on('receive_audio_chunk', async ({ audioChunk, username: speaker }) => {
        unlockAudio();
        try {
            const ctx = audioContextRef.current;
            const arrayBuffer = await new Response(new Blob([audioChunk])).arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.start(0);
            toast(`${speaker} 🔊`, { icon: '🎙️', duration: 500, position:'bottom-center', style:{background:'#333', color:'white', fontSize:'12px', padding:'4px'} });
        } catch(e) {}
    });

    socket.on('receive_message', (msg) => { setMessages(prev => [...prev, msg]); if(!chatOpen) toast("New Message 💬", { icon: '💬' }); });
    
    socket.on('game_over', ({ scores, history }) => { 
        setGameState('lobby'); 
        toast("Quiz Ended! 🏁"); 
        setScores(scores);
        if (history) {
            setQuizHistory(history);
            localStorage.setItem("bs_history", JSON.stringify(history));
        }
    });

    const handleVisibilityChange = () => { if (document.hidden && gameState === 'playing' && role === 'member') socket.emit('tab_switch', { roomCode, username }); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => { socket.off(); document.removeEventListener("visibilitychange", handleVisibilityChange); };
  }, [gameState, role, roomCode, username, chatOpen, canMoveOn]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatOpen]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
  
  const speakText = (text) => {
    window.speechSynthesis.cancel();
    setAiSpeaking(true);
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => setAiSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const toggleAI = () => {
    if (aiSpeaking) { window.speechSynthesis.cancel(); setAiSpeaking(false); setIsListeningAI(false); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return toast.error("Use Chrome");
    const r = new SpeechRecognition();
    r.lang = 'en-US';
    setIsListeningAI(true);
    r.onresult = (e) => { setIsListeningAI(false); toast("Thinking... 🤖"); socket.emit('ask_ai', { roomCode, userQuery: e.results[0][0].transcript }); };
    r.start();
  };

  const toggleMic = async () => {
    unlockAudio();
    if (isMicOn) {
        if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
        setIsMicOn(false);
        toast("Mic Muted 🔇");
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm;codecs=opus' };
            else if (MediaRecorder.isTypeSupported('audio/mp4')) options = { mimeType: 'audio/mp4' };
            
            mediaRecorderRef.current = new MediaRecorder(stream, options);
            mediaRecorderRef.current.ondataavailable = (event) => { if (event.data.size > 0 && socket.connected) socket.emit('send_audio_chunk', { roomCode, audioChunk: event.data, username }); };
            mediaRecorderRef.current.start(250); 
            setIsMicOn(true);
            toast("Mic ON 🎙️", { style: { background: '#2ecc71', color: 'white' } });
        } catch (err) { toast.error("Mic Error"); setIsMicOn(false); }
    }
  };

  const handleLogout = () => { localStorage.removeItem("bs_room"); localStorage.removeItem("bs_user"); setRoomCode(""); setUsername(""); setGameState('menu'); setProfileOpen(false); window.location.reload(); };
  const joinRoom = () => { if (username && roomCode) socket.emit('join_room', { roomCode, username }); else toast.error("Enter Details"); };
  const handleAnswer = (opt, index) => { setSelectedOptionIndex(index); socket.emit('submit_answer', { roomCode, answerIndex: index, username }); };
  const navPrev = () => { socket.emit('nav_prev', { roomCode }); setHistoryIndex(prev => Math.max(0, prev - 1)); };
  
  const handleSmartNext = () => {
      window.speechSynthesis.cancel();
      setAiSpeaking(false);
      if (isHistoryMode && historyIndex < historyLength - 1) {
          socket.emit('nav_next', { roomCode });
          setHistoryIndex(prev => prev + 1);
      } else {
          socket.emit('start_quiz', { roomCode, subject: "Applied Mathematics-II" });
      }
  };
  
  const setLimitAndOpenMenu = (limit) => {
      setQuestionLimit(limit.toString());
      setMenuOpen(true);
      if(!subjectExpanded) setSubjectExpanded(true);
  };

  const handleStart = () => {
      if (gameState === 'lobby' && selectedTopics.length === 0) return toast.error("Select at least 1 topic!");
      const limit = questionLimit.trim() === "" ? -1 : parseInt(questionLimit);
      setGameState('loading');
      setQuizHistory([]);
      localStorage.removeItem("bs_history");
      socket.emit('start_quiz', { roomCode, subject: "Applied Mathematics-II", topics: selectedTopics, limit: limit });
  };

  const requestStuck = () => socket.emit('student_signal', { roomCode, type: 'stuck', username });
  const requestChange = () => socket.emit('student_signal', { roomCode, type: 'change', username });

  const sendMessage = () => {
      if(chatInput.trim()) {
          const msg = { username, text: chatInput, image: null, time: new Date().toLocaleTimeString() };
          setMessages(prev => [...prev, msg]); 
          socket.emit('send_message', { roomCode, username, text: chatInput, image: null });
          setChatInput("");
      }
  };

  const handleImageUpload = (e) => {
      setShowCamOptions(false);
      const file = e.target.files[0];
      if(file) compressImage(file, (dataUrl) => { setMessages(prev => [...prev, {username, text:"", image:dataUrl}]); socket.emit('send_message', {roomCode, username, text:"", image:dataUrl}); });
  };

  const getLetter = (i) => String.fromCharCode(65 + i);
  const getCorrectIndex = () => { if (!question || !roundResult) return -1; return roundResult.correctIndex; };
  const toggleTopic = (prompt) => { setSelectedTopics(prev => prev.includes(prompt) ? prev.filter(t => t !== prompt) : [...prev, prompt]); };

  // 🟢 IMPROVED PDF GENERATOR
  const downloadPDF = () => {
      if (!quizHistory || quizHistory.length === 0) return toast.error("No questions to save.");
      const doc = new jsPDF();
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - (margin * 2);
      let y = 20;

      // HEADER
      doc.setFontSize(22);
      doc.setFont(undefined, 'bold');
      doc.text("BrainSync - Quiz Report", margin, y);
      y += 10;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, y);
      y += 20;

      // PART 1: QUESTIONS
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text("Part 1: Practice Questions", margin, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');

      quizHistory.forEach((q, i) => {
          // Check for new page
          if(y > 270) { doc.addPage(); y = 20; }

          const cleanQ = cleanLatex(q.question);
          const qTitle = `Q${i+1}. ${cleanQ}`;
          const splitTitle = doc.splitTextToSize(qTitle, maxWidth);
          
          doc.text(splitTitle, margin, y);
          y += (splitTitle.length * 6) + 4; // Dynamic spacing

          q.options.forEach((opt, idx) => {
              if(y > 280) { doc.addPage(); y = 20; }
              const cleanOpt = cleanLatex(opt);
              doc.text(`   (${getLetter(idx)}) ${cleanOpt}`, margin, y);
              y += 6;
          });
          y += 8; // Space between questions
      });

      // PART 2: SOLUTIONS
      doc.addPage();
      y = 20;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text("Part 2: Answers & Explanations", margin, y);
      y += 15;

      doc.setFontSize(11);
      
      quizHistory.forEach((q, i) => {
          if(y > 250) { doc.addPage(); y = 20; }
          
          const cleanAns = cleanLatex(q.answer);
          const cleanExpl = cleanLatex(q.explanation);
          
          // Answer Line
          doc.setFont(undefined, 'bold');
          doc.text(`Q${i+1}. Answer: (${getLetter(q.correctIndex)}) ${cleanAns}`, margin, y);
          y += 8;
          
          // Explanation Block
          doc.setFont(undefined, 'normal');
          const splitExpl = doc.splitTextToSize(`Explanation: ${cleanExpl}`, maxWidth);
          doc.text(splitExpl, margin, y);
          y += (splitExpl.length * 6) + 15; // Extra spacing after explanation
      });

      doc.save("BrainSync_Quiz.pdf");
      toast.success("PDF Downloaded! 📥");
  };

  return (
    <div className="app-container">
      <Toaster position="top-center" />
      <style>{`
        /* Same CSS as before */
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow-x: hidden; background: #1a1a1a; color: white; font-family: sans-serif; }
        .app-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; width: 100vw; box-sizing: border-box; }
        .card { background: #222; padding: 2rem; border-radius: 16px; width: 100%; max-width: 650px; border: 1px solid #333; box-shadow: 0 10px 40px rgba(0,0,0,0.6); position: relative; }
        .logo { font-size: 2.5em; margin-bottom: 20px; text-shadow: 0 0 15px rgba(100,108,255,0.6); }
        .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #444; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
        button { cursor: pointer; transition: 0.2s; }
        button:active { transform: scale(0.98); }
        .input { width: 100%; padding: 14px; margin: 10px 0; background: #333; border: 1px solid #444; color: white; border-radius: 8px; font-size: 16px; box-sizing: border-box; }
        .primary-btn { width: 100%; padding: 14px; background: #646cff; color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 10px; }
        .primary-btn:disabled { background: #444; color: #888; cursor: not-allowed; }
        .option-btn { width: 100%; padding: 12px; background: #2a2a2a; color: #ddd; border: 1px solid #444; border-radius: 8px; text-align: left; display: flex; gap: 10px; align-items: center; transition: 0.2s; }
        .option-badge { background: #444; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0; }
        .selected { background: #4285F4; border-color: white; color: white; }
        .selected .option-badge { background: white; color: #4285F4; }
        .marks-badge { background: #f1c40f; color: black; padding: 5px 10px; border-radius: 20px; font-weight: bold; font-size: 12px; }
        .host-controls { display: flex; gap: 10px; margin-top: 15px; justify-content: center; padding-top:15px; border-top:1px solid #333; }
        .menu-btn { position: fixed; top: 15px; left: 15px; font-size: 16px; background: #222; border: 1px solid #444; color: white; padding: 8px 12px; border-radius: 5px; z-index: 20000; }
        .profile-btn { position: fixed; top: 15px; right: 15px; font-size: 20px; background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 50%; width: 45px; height: 45px; z-index: 20000; cursor: pointer; display:flex; align-items:center; justify-content:center; }
        .chat-btn { position: fixed; bottom: 25px; right: 25px; font-size: 26px; background: #646cff; color: white; width: 60px; height: 60px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 20000; display: flex; align-items: center; justify-content: center; }
        .profile-menu { position: fixed; top: 70px; right: 20px; background: #333; border: 1px solid #555; padding: 15px; border-radius: 8px; z-index: 20001; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 200px; }
        .sidebar { position: fixed; top: 0; left: 0; width: 300px; height: 100%; background: #181818; padding: 20px; z-index: 10001; border-right: 1px solid #333; overflow-y: auto; }
        .chat-sidebar { position: fixed; top: 0; right: 0; width: 320px; height: 100%; background: #222; padding: 0; z-index: 10002; border-left: 1px solid #333; display: flex; flex-direction: column; box-shadow: -5px 0 15px rgba(0,0,0,0.5); }
        .sub-list { padding-left: 15px; border-left: 2px solid #444; margin-top: 5px; }
        .chat-header { padding: 15px; border-bottom: 1px solid #444; display: flex; justify-content: space-between; align-items: center; background: #2a2a2a; }
        .chat-messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .chat-input-area { padding: 10px; border-top: 1px solid #444; display: flex; gap: 5px; background: #2a2a2a; position: relative; }
        .cam-popup { position: absolute; bottom: 60px; left: 10px; background: #333; border: 1px solid #555; border-radius: 8px; padding: 5px; display: flex; flex-direction: column; gap: 5px; z-index: 10002; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
        .cam-popup button { background: #444; color: white; border: none; padding: 8px 12px; text-align: left; cursor: pointer; border-radius: 4px; }
        .cam-popup button:hover { background: #555; }
        .msg-bubble { background: #333; padding: 8px 12px; border-radius: 12px; max-width: 80%; word-break: break-word; font-size: 14px; }
        .msg-bubble.mine { background: #646cff; align-self: flex-end; }
        .msg-user { font-size: 10px; color: #aaa; margin-bottom: 2px; }
        .msg-img { max-width: 100%; border-radius: 8px; margin-top: 5px; cursor: pointer; }
        .topic-row { display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #333; cursor: pointer; }
        .topic-row input { margin-right: 10px; width: 18px; height: 18px; }
        @keyframes galaxy { 100% { transform: rotate(360deg); } }
        .galaxy-ring { width: 50px; height: 50px; border-radius: 50%; background: conic-gradient(#4285F4, #EA4335, #FBBC05, #34A853, #4285F4); mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #fff 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #fff 0); animation: galaxy 1s linear infinite; margin: 20px auto; }
        @media (max-width: 600px) { .chat-sidebar { width: 100%; } }
      `}</style>

      {/* ... (UI code same as before) ... */}
      {gameState !== 'menu' && <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰ Topics</button>}
      {gameState !== 'menu' && <button className="chat-btn" onClick={() => setChatOpen(!chatOpen)}>💬</button>}
      {gameState !== 'menu' && (
         <>
            <button className="profile-btn" onClick={() => setProfileOpen(!profileOpen)}>👤</button>
            {profileOpen && (
               <div className="profile-menu">
                  <h4 style={{margin:'0 0 10px 0', borderBottom:'1px solid #444', paddingBottom:5}}>{username}</h4>
                  <div style={{fontSize:12, color:'#aaa', marginBottom:15}}>Room: {roomCode}</div>
                  <div style={{fontSize:12, color:'#aaa', marginBottom:15}}>Role: {role.toUpperCase()}</div>
                  <button onClick={handleLogout} style={{width:'100%', background:'#e74c3c', border:'none', color:'white', padding:8, borderRadius:5, cursor:'pointer'}}>Logout 🚪</button>
               </div>
            )}
         </>
      )}

      {menuOpen && (
        <div className="sidebar">
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:20, alignItems:'center'}}>
             <h3>Syllabus</h3>
             <button onClick={()=>setMenuOpen(false)} style={{background:'none', border:'none', color:'white', fontSize:20}}>×</button>
          </div>
          <div style={{marginBottom:20}}>
             <button className="option-btn" onClick={() => setSubjectExpanded(!subjectExpanded)} style={{width:'100%', marginBottom:10}}>
                Applied Mathematics-II {subjectExpanded ? '▼' : '▶'}
             </button>
             {subjectExpanded && (
                 <div className="sub-list">
                   {SYLLABUS["Applied Mathematics-II"].map(m => (
                      <div key={m.id} className="topic-row" onClick={() => toggleTopic(m.prompt)}>
                         <input type="checkbox" checked={selectedTopics.includes(m.prompt)} onChange={()=>{}} />
                         <span>{m.name}</span>
                      </div>
                   ))}
                 </div>
             )}
          </div>
        </div>
      )}

      {chatOpen && (
          <div className="chat-sidebar">
             <div className="chat-header">
                <h3 style={{margin:0}}>Group Chat</h3>
                <button onClick={() => setChatOpen(false)} style={{background:'none', border:'none', color:'#aaa', fontSize:20}}>×</button>
             </div>
             <div className="chat-messages">
                {messages.map((m, i) => (
                   <div key={i} className={`msg-bubble ${m.username === username ? 'mine' : ''}`}>
                      <div className="msg-user">{m.username} • {m.time}</div>
                      {m.text && <div>{m.text}</div>}
                      {m.image && <img src={m.image} className="msg-img" onClick={() => window.open(m.image)} />}
                   </div>
                ))}
                <div ref={messagesEndRef} />
             </div>
             <div className="chat-input-area">
                {showCamOptions && (
                    <div className="cam-popup">
                        <button onClick={() => { cameraInputRef.current.click(); setShowCamOptions(false); }}>📸 Take Photo</button>
                        <button onClick={() => { fileInputRef.current.click(); setShowCamOptions(false); }}>🖼️ Gallery</button>
                    </div>
                )}
                <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{display:'none'}} onChange={handleImageUpload} />
                <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleImageUpload} />
                <button onClick={() => setShowCamOptions(!showCamOptions)} style={{background:'none', border:'none', fontSize:20, cursor:'pointer'}}>📷</button>
                <input style={{flex:1, padding:8, borderRadius:20, border:'none', background:'#444', color:'white'}} placeholder="Type..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
                <button onClick={sendMessage} style={{background:'#646cff', border:'none', color:'white', borderRadius:'50%', width:35, height:35}}>➤</button>
             </div>
          </div>
      )}

      <div style={{display:'flex', flexDirection:'column', alignItems:'center', width:'100%'}}>
        <h1 className="logo">🧠 BrainSync</h1>

        {gameState === 'loading' && (
           <div className="card" style={{textAlign:'center', minHeight:300, display:'flex', flexDirection:'column', justifyContent:'center'}}>
             <div className="galaxy-ring"></div>
             <h2>Generating Question... ✨</h2>
           </div>
        )}

        {gameState === 'menu' && (
          <div className="card">
            <h2>Student Login</h2>
            <input className="input" placeholder="Enter Name" onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && roomInputRef.current.focus()} />
            <input className="input" ref={roomInputRef} placeholder="Room Code (101)" onChange={(e) => setRoomCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && joinRoom()} />
            <button className="primary-btn" onClick={joinRoom}>Enter Class</button>
          </div>
        )}

        {gameState === 'lobby' && role === 'host' && (
          <div className="card">
             <h3>👑 Host Controls</h3>
             <p>1. Select Number of Questions:</p>
             <div style={{display:'flex', gap:10, marginBottom:20, flexWrap:'wrap'}}>
                {[10, 15, 20].map(n => 
                    <button key={n} onClick={() => setLimitAndOpenMenu(n)} style={{background: questionLimit===n.toString()?'#646cff':'#333', color:'white', border:'none', padding:'12px 20px', borderRadius:5, fontSize:16, flex:1}}>
                        {n}
                    </button>
                )}
                <input 
                    type="number" 
                    placeholder="Custom #"
                    value={questionLimit}
                    onChange={(e) => setQuestionLimit(e.target.value)}
                    style={{background:'#333', color:'white', border:'1px solid #555', padding:'12px', borderRadius:5, fontSize:16, width:100, textAlign:'center'}} 
                />
             </div>
             
             <p>2. Select Topics from ☰ Menu.</p>
             
             <button 
                onClick={handleStart} 
                disabled={selectedTopics.length === 0} 
                className="primary-btn"
                style={{
                    background: selectedTopics.length > 0 ? '#4caf50' : '#444', 
                    color: selectedTopics.length > 0 ? 'white' : '#888',
                    cursor: selectedTopics.length > 0 ? 'pointer' : 'not-allowed'
                }}
             >
                {selectedTopics.length > 0 ? `🚀 Start Quiz (${selectedTopics.length} Topics)` : "⚠️ Select Topics First"}
             </button>
             
             {quizHistory && quizHistory.length > 0 && (
                 <button onClick={downloadPDF} style={{width:'100%', background:'#e74c3c', color:'white', border:'none', padding:14, borderRadius:8, marginTop:10, fontWeight:'bold'}}>
                    📥 Download Last Quiz PDF
                 </button>
             )}
          </div>
        )}

        {gameState === 'lobby' && role === 'member' && (
            <div className="card" style={{textAlign:'center'}}>
                <h2>Waiting for Host... ☕</h2>
                {quizHistory && quizHistory.length > 0 && (
                     <button onClick={downloadPDF} style={{width:'100%', background:'#e74c3c', color:'white', border:'none', padding:14, borderRadius:8, marginTop:20, fontWeight:'bold'}}>
                        📥 Download Last Quiz PDF
                     </button>
                )}
            </div>
        )}

        {(gameState === 'playing' || gameState === 'result') && question && (
          <div className="card">
            <div className="header-row">
                <div style={{fontSize:'1.2em', fontWeight:'bold', color: timer < 30 ? '#ff4757' : '#2ecc71'}}>⏳ {formatTime(timer)}</div>
                <div className="marks-badge">🏆 {question.marks} Marks</div>
                
                <div style={{display:'flex', gap:5}}>
                  <button onClick={toggleMic} style={{background: isMicOn ? '#2ecc71' : '#222', color: isMicOn ? 'black' : 'white', border: isMicOn ? '2px solid white' : '1px solid #555', borderRadius:'20px', padding:'6px 12px', transition: '0.2s'}}>
                    {isMicOn ? "🔊 ON" : "🔇 Muted"}
                  </button>
                  <button onClick={toggleAI} style={{background: isListeningAI ? '#ff4757' : (aiSpeaking ? '#f1c40f' : '#333'), color: aiSpeaking ? 'black' : 'white', border:'1px solid #555', borderRadius:'20px', padding:'6px 12px'}}>
                    {isListeningAI ? "🛑 Listening..." : (aiSpeaking ? "🔇 Stop AI" : "🤖 Ask AI")}
                  </button>
                </div>
            </div>

            {question.topic && <div style={{fontSize:12, color:'#aaa', textAlign:'center', marginBottom:10}}>Topic: {question.topic}</div>}

            <h3 style={{textAlign:'center', lineHeight:1.5}}><MathText text={question.question} /></h3>

            {gameState === 'playing' && (
              <div className="grid">
                {question.options.map((opt, i) => (
                  <button key={i} className={`option-btn ${selectedOptionIndex === i ? 'selected' : ''}`} onClick={() => handleAnswer(opt, i)} disabled={selectedOptionIndex !== null}>
                    <div className="option-badge">{getLetter(i)}</div>
                    <div style={{flex:1, overflow:'hidden'}}><MathText text={opt} /></div>
                  </button>
                ))}
              </div>
            )}

            {gameState === 'result' && roundResult && (
              <div style={{marginTop:20, paddingTop:20, borderTop:'1px solid #444'}}>
                <h2 style={{color: roundResult.isCorrect ? '#4caf50' : '#ff4757', textAlign:'center'}}>
                   {roundResult.isCorrect ? "✅ Correct!" : "❌ Wrong!"}
                </h2>
                {!roundResult.isCorrect && selectedOptionIndex !== null && (
                    <div style={{background:'#331111', padding:10, borderRadius:8, marginBottom:5, border:'1px solid #553333'}}>
                        <strong style={{color:'#ff4757'}}>You Chose: Option {getLetter(selectedOptionIndex)}</strong>
                    </div>
                )}
                <div style={{background:'#113311', padding:15, borderRadius:8, marginBottom:10, border:'1px solid #225522'}}>
                   <strong style={{color:'#4caf50'}}>Correct Answer: Option {getLetter(getCorrectIndex())}</strong>
                   <div style={{marginTop:5}}><MathText text={roundResult.correctAnswer} /></div>
                </div>
                <div style={{color:'#aaa', fontSize:'0.9em', marginTop:10}}><MathText text={roundResult.explanation} /></div>
              </div>
            )}

            {role === 'host' && (
              <div className="host-controls">
                <button onClick={navPrev} style={{background:'#333', border:'none', color:'white', padding:'8px 15px', borderRadius:5}}>⬅ Prev</button>
                <button onClick={() => socket.emit('host_action', {roomCode, action:'add'})} style={{background:'#2d2d2d', border:'none', color:'#f1c40f', padding:'8px 15px', borderRadius:5}}>+60s</button>
                <button onClick={() => handleSmartNext()} disabled={!canMoveOn && !isHistoryMode} style={{background: canMoveOn || isHistoryMode ? '#646cff' : '#444', border:'none', color: canMoveOn || isHistoryMode ? 'white' : '#888', padding:'8px 15px', borderRadius:5, marginLeft:10, cursor: canMoveOn || isHistoryMode ? 'pointer' : 'not-allowed'}}>
                    {isHistoryMode ? "Next (Rev) ➡" : (canMoveOn ? "Next ➡" : "Locked 🔒")}
                </button>
              </div>
            )}
            
            {role === 'member' && (
               <div style={{display:'flex', justifyContent:'center', gap:10, marginTop:15}}>
                  <button onClick={requestStuck} style={{background:'#e74c3c', border:'none', color:'white', padding:'8px 15px', borderRadius:20, fontSize:12, fontWeight:'bold'}}>🤷 I'm Stuck (Unlock)</button>
                  <button onClick={requestChange} style={{background:'none', border:'1px solid #555', color:'#aaa', padding:'5px 10px', borderRadius:15, fontSize:12}}>Request Topic Change</button>
               </div>
            )}
          </div>
        )}

        {Object.keys(scores).length > 0 && (
           <div className="card" style={{marginTop:20, background:'#1a1a1a', border:'1px solid #444'}}>
              <h3 style={{borderBottom:'1px solid #333', paddingBottom:10}}>🏆 Live Scores</h3>
              {Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([u, s], i) => (
                 <div key={u} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #222', color: i===0?'#f1c40f':'white'}}>
                    <span>{i+1}. {u}</span>
                    <span style={{fontWeight:'bold'}}>{Number(s || 0)} Marks</span>
                 </div>
              ))}
           </div>
        )}
      </div>
    </div>
  );
}

export default App;