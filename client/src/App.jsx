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
  ],
  "Engineering Physics-II": [
    { id: "p1", name: "Module 1: Semiconductors", prompt: "Basics of Semiconductors, Fermi Dirac, Hall Effect" },
    { id: "p2", name: "Module 2: Junction Diodes", prompt: "PN Junction, Biasing, LED, Zener Diode" },
    { id: "p3", name: "Module 3: Important Diodes", prompt: "Photo diode, Solar cell, Varactor diode, Gunn diode" },
    { id: "p4", name: "Module 4: BJT", prompt: "Bipolar Junction Transistors, CE configurations" },
    { id: "p5", name: "Module 5: FETs", prompt: "Field Effect Transistors, JFET, MOSFET" },
    { id: "p6", name: "Module 6: Nano Tech", prompt: "Nanotechnology, Optical/Electrical properties" }
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

const cleanLatex = (text) => {
    if (!text) return "";
    return text
        .replace(/\\frac{([^{}]+)}{([^{}]+)}/g, '($1)/($2)') 
        .replace(/\\int/g, 'Integral ')
        .replace(/\\sqrt{([^{}]+)}/g, 'Sqrt($1)')
        .replace(/\\infty/g, 'Infinity')
        .replace(/\\pm/g, '+/-')
        .replace(/\\approx/g, '~')
        .replace(/\\cdot/g, '*')
        .replace(/\\times/g, 'x')
        .replace(/\\le/g, '<=')
        .replace(/\\ge/g, '>=')
        .replace(/\^/g, '^') 
        .replace(/_/g, '_')  
        .replace(/[{}]/g, '') 
        .replace(/\$/g, '')  
        .replace(/\\/g, ''); 
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
  const [showCamOptions, setShowCamOptions] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  const [selectedTopics, setSelectedTopics] = useState([]); 
  const [questionLimit, setQuestionLimit] = useState(""); 
  const [expandedSubject, setExpandedSubject] = useState(null); 
  
  const [quizHistory, setQuizHistory] = useState(() => {
      const saved = localStorage.getItem("bs_history");
      return saved ? JSON.parse(saved) : [];
  });

  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyLength, setHistoryLength] = useState(0);
  const [canMoveOn, setCanMoveOn] = useState(false);
  
  const [profileOpen, setProfileOpen] = useState(false);
  const [isListeningAI, setIsListeningAI] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  
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
    socket.on('host_notification', ({ type, username }) => { toast(`${username}: ${type === 'stuck' ? 'Stuck 🤷' : 'Help!'}`, { icon: '📣' }); });
    socket.on('cheat_alert', ({ username }) => { toast.error(`⚠️ ${username} tab switched!`); new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(()=>{}); });

    socket.on('receive_message', (msg) => { setMessages(prev => [...prev, msg]); if(!chatOpen) toast("New Message 💬", { icon: '💬' }); });
    
    socket.on('game_over', ({ scores, history }) => { 
        setGameState('lobby'); 
        toast("Quiz Ended! 🏁"); 
        setScores(scores);
        const safeHistory = history || [];
        setQuizHistory(safeHistory);
        localStorage.setItem("bs_history", JSON.stringify(safeHistory));
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

  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                const base64Audio = reader.result;
                const msg = { username, text: "", image: null, audio: base64Audio, time: new Date().toLocaleTimeString() };
                setMessages(prev => [...prev, msg]);
                socket.emit('send_message', { roomCode, ...msg });
            };
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
    } catch (err) {
        toast.error("Microphone access denied!");
    }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
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
          socket.emit('start_quiz', { roomCode, subject: "Continued", forceNew: false });
      }
  };
  
  const setLimitAndOpenMenu = (limit) => {
      setQuestionLimit(limit.toString());
      setMenuOpen(true);
  };

  const handleStart = () => {
      if (gameState === 'lobby' && selectedTopics.length === 0) return toast.error("Select at least 1 topic!");
      const limit = questionLimit.trim() === "" ? -1 : parseInt(questionLimit);
      setGameState('loading');
      setQuizHistory([]); 
      localStorage.removeItem("bs_history");
      // 🟢 FIX 1: CLOSE SIDEBAR AUTOMATICALLY
      setMenuOpen(false); 
      socket.emit('start_quiz', { 
          roomCode, 
          subject: expandedSubject === 'physics' ? "Engineering Physics-II" : "Applied Mathematics-II", 
          topics: selectedTopics, 
          limit: limit,
          forceNew: true 
      });
  };

  const requestStuck = () => socket.emit('student_signal', { roomCode, type: 'stuck', username });
  const requestChange = () => socket.emit('student_signal', { roomCode, type: 'change', username });

  const sendMessage = () => {
      if(chatInput.trim()) {
          const msg = { username, text: chatInput, image: null, audio: null, time: new Date().toLocaleTimeString() };
          setMessages(prev => [...prev, msg]); 
          socket.emit('send_message', { roomCode, ...msg });
          setChatInput("");
      }
  };

  const handleImageUpload = (e) => {
      setShowCamOptions(false);
      const file = e.target.files[0];
      if(file) compressImage(file, (dataUrl) => { 
          const msg = { username, text: "", image: dataUrl, audio: null, time: new Date().toLocaleTimeString() };
          setMessages(prev => [...prev, msg]); 
          socket.emit('send_message', { roomCode, ...msg }); 
      });
  };

  const getLetter = (i) => String.fromCharCode(65 + i);
  const getCorrectIndex = () => { if (!question || !roundResult) return -1; return roundResult.correctIndex; };
  
  const toggleTopic = (prompt) => { setSelectedTopics(prev => prev.includes(prompt) ? prev.filter(t => t !== prompt) : [...prev, prompt]); };
  const toggleSubject = (sub) => { 
      if(expandedSubject === sub) { setExpandedSubject(null); }
      else { setExpandedSubject(sub); }
  };

  const downloadPDF = () => {
      if (!quizHistory || quizHistory.length === 0) return toast.error("No questions to save.");
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - (margin * 2);
      let y = 20;

      doc.setFontSize(22); doc.setFont(undefined, 'bold'); doc.text("BrainSync - Quiz Report", margin, y); y += 10;
      doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, y); y += 20;

      doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text("Part 1: Practice Questions", margin, y); y += 10;
      doc.setFontSize(11); doc.setFont(undefined, 'normal');

      quizHistory.forEach((q, i) => {
          if(y > 270) { doc.addPage(); y = 20; }
          const cleanQ = cleanLatex(q.question);
          const qTitle = `Q${i+1}. ${cleanQ}`;
          const splitTitle = doc.splitTextToSize(qTitle, maxWidth);
          doc.text(splitTitle, margin, y);
          y += (splitTitle.length * 6) + 4; 
          q.options.forEach((opt, idx) => {
              if(y > 280) { doc.addPage(); y = 20; }
              const cleanOpt = cleanLatex(opt);
              doc.text(`   (${getLetter(idx)}) ${cleanOpt}`, margin, y);
              y += 6;
          });
          y += 8; 
      });

      doc.addPage(); y = 20;
      doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text("Part 2: Answers & Explanations", margin, y); y += 15;
      doc.setFontSize(11);
      
      quizHistory.forEach((q, i) => {
          if(y > 250) { doc.addPage(); y = 20; }
          const cleanAns = cleanLatex(q.answer);
          const cleanExpl = cleanLatex(q.explanation);
          doc.setFont(undefined, 'bold'); doc.text(`Q${i+1}. Answer: (${getLetter(q.correctIndex)}) ${cleanAns}`, margin, y); y += 8;
          doc.setFont(undefined, 'normal');
          const splitExpl = doc.splitTextToSize(`Explanation: ${cleanExpl}`, maxWidth);
          doc.text(splitExpl, margin, y);
          y += (splitExpl.length * 6) + 15; 
      });
      doc.save("BrainSync_Quiz.pdf"); toast.success("PDF Downloaded! 📥");
  };

  return (
    <div className="app-container">
      <Toaster position="top-center" />
      <style>{`
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow-x: hidden; background: #1a1a1a; color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .app-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; width: 100vw; box-sizing: border-box; }
        .card { background: #222; padding: 2rem; border-radius: 16px; width: 100%; max-width: 650px; border: 1px solid #333; box-shadow: 0 10px 40px rgba(0,0,0,0.6); position: relative; }
        .logo { font-size: 2.5em; margin-bottom: 20px; text-shadow: 0 0 15px rgba(100,108,255,0.6); font-weight: 800; letter-spacing: -1px; }
        .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #444; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
        button { cursor: pointer; transition: 0.2s; }
        button:active { transform: scale(0.98); }
        .input { width: 100%; padding: 14px; margin: 10px 0; background: #333; border: 1px solid #444; color: white; border-radius: 12px; font-size: 16px; box-sizing: border-box; }
        .primary-btn { width: 100%; padding: 14px; background: #0A84FF; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin-top: 10px; }
        .primary-btn:disabled { background: #444; color: #888; cursor: not-allowed; }
        .option-btn { width: 100%; padding: 12px; background: #2c2c2e; color: #eee; border: 1px solid #444; border-radius: 12px; text-align: left; display: flex; gap: 10px; align-items: center; transition: 0.2s; }
        .option-badge { background: #444; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0; }
        .selected { background: #0A84FF; border-color: #0A84FF; color: white; }
        .selected .option-badge { background: white; color: #0A84FF; }
        .marks-badge { background: #FFD60A; color: black; padding: 5px 12px; border-radius: 20px; font-weight: bold; font-size: 13px; }
        .host-controls { display: flex; gap: 10px; margin-top: 15px; justify-content: center; padding-top:15px; border-top:1px solid #333; }
        
        .menu-btn { position: fixed; top: 15px; left: 15px; font-size: 16px; background: rgba(44, 44, 46, 0.8); backdrop-filter: blur(10px); border: 1px solid #444; color: white; padding: 8px 14px; border-radius: 12px; z-index: 20000; font-weight: 500; }
        .profile-btn { position: fixed; top: 15px; right: 15px; font-size: 20px; background: rgba(44, 44, 46, 0.8); backdrop-filter: blur(10px); border: 1px solid #444; color: white; padding: 8px; border-radius: 50%; width: 45px; height: 45px; z-index: 20000; cursor: pointer; display:flex; align-items:center; justify-content:center; }
        .chat-btn { position: fixed; bottom: 25px; right: 25px; font-size: 26px; background: #0A84FF; color: white; width: 60px; height: 60px; border-radius: 50%; border: none; box-shadow: 0 8px 20px rgba(10, 132, 255, 0.4); z-index: 20000; display: flex; align-items: center; justify-content: center; transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .chat-btn:hover { transform: scale(1.1); }
        .profile-menu { position: fixed; top: 70px; right: 20px; background: rgba(44, 44, 46, 0.95); backdrop-filter: blur(20px); border: 1px solid #555; padding: 15px; border-radius: 16px; z-index: 20001; box-shadow: 0 10px 30px rgba(0,0,0,0.5); width: 200px; }
        .sidebar { position: fixed; top: 0; left: 0; width: 320px; height: 100%; background: #1c1c1e; padding: 20px; z-index: 10001; border-right: 1px solid #333; overflow-y: auto; }
        .sub-list { padding-left: 15px; border-left: 2px solid #444; margin-top: 5px; }
        
        .chat-sidebar { position: fixed; top: 0; right: 0; width: 350px; height: 100%; background: rgba(28, 28, 30, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 10002; border-left: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; box-shadow: -10px 0 30px rgba(0,0,0,0.5); }
        .chat-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
        .chat-header h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }
        .chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .msg-bubble { background: #3a3a3c; padding: 10px 16px; border-radius: 18px; max-width: 80%; word-break: break-word; font-size: 15px; line-height: 1.4; position: relative; border-bottom-left-radius: 4px; }
        .msg-bubble.mine { background: #0A84FF; align-self: flex-end; border-bottom-left-radius: 18px; border-bottom-right-radius: 4px; }
        .msg-user { font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 4px; font-weight: 500; }
        .msg-bubble.mine .msg-user { color: rgba(255,255,255,0.8); text-align: right; }
        .msg-img { max-width: 100%; border-radius: 12px; margin-top: 5px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); }
        .msg-audio { width: 100%; max-width: 220px; height: 35px; margin-top: 5px; border-radius: 20px; outline: none; }
        
        .chat-input-area { padding: 15px; display: flex; gap: 10px; align-items: center; background: transparent; padding-bottom: max(15px, env(safe-area-inset-bottom)); }
        .cam-popup { position: absolute; bottom: 80px; left: 15px; background: rgba(44, 44, 46, 0.95); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 5px; z-index: 10002; box-shadow: 0 5px 20px rgba(0,0,0,0.5); }
        .cam-popup button { background: transparent; color: white; border: none; padding: 10px 15px; text-align: left; cursor: pointer; border-radius: 8px; font-weight: 500; }
        .cam-popup button:hover { background: rgba(255,255,255,0.1); }
        
        .icon-btn { background: none; border: none; color: #0A84FF; font-size: 24px; cursor: pointer; padding: 5px; display: flex; align-items: center; justify-content: center; font-weight: 300; }
        .chat-input-field { flex: 1; padding: 10px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: #3a3a3c; color: white; font-size: 15px; outline: none; transition: 0.2s; }
        .chat-input-field:focus { border-color: rgba(10, 132, 255, 0.5); background: #444446; }
        
        .send-btn { background: #0A84FF; border: none; color: white; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: 0.2s; }
        .mic-btn { background: transparent; border: none; color: #0A84FF; font-size: 22px; cursor: pointer; padding: 5px; transition: 0.2s; -webkit-user-select: none; user-select: none; }
        .mic-btn.recording { color: #FF3B30; animation: pulse 1s infinite; transform: scale(1.2); }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

        .topic-row { display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #333; cursor: pointer; }
        .topic-row input { margin-right: 10px; width: 18px; height: 18px; accent-color: #0A84FF; }
        @keyframes galaxy { 100% { transform: rotate(360deg); } }
        .galaxy-ring { width: 50px; height: 50px; border-radius: 50%; background: conic-gradient(#0A84FF, #FF3B30, #FFD60A, #34C759, #0A84FF); mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #fff 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #fff 0); animation: galaxy 1s linear infinite; margin: 20px auto; }
        @media (max-width: 600px) { .chat-sidebar { width: 100%; } }
      `}</style>

      {gameState !== 'menu' && !menuOpen && <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰ Topics</button>}
      
      {gameState !== 'menu' && !chatOpen && <button className="chat-btn" onClick={() => setChatOpen(!chatOpen)}>💬</button>}
      
      {/* 🟢 FIX 3: HIDE PROFILE WHEN CHAT IS OPEN TO PREVENT OVERLAP */}
      {gameState !== 'menu' && !chatOpen && (
         <>
            <button className="profile-btn" onClick={() => setProfileOpen(!profileOpen)}>👤</button>
            {profileOpen && (
               <div className="profile-menu">
                  <h4 style={{margin:'0 0 10px 0', borderBottom:'1px solid #444', paddingBottom:5}}>{username}</h4>
                  <div style={{fontSize:12, color:'#aaa', marginBottom:15}}>Room: {roomCode}</div>
                  <div style={{fontSize:12, color:'#aaa', marginBottom:15}}>Role: {role.toUpperCase()}</div>
                  <button onClick={handleLogout} style={{width:'100%', background:'#FF3B30', border:'none', color:'white', padding:10, borderRadius:10, cursor:'pointer', fontWeight: 600}}>Logout 🚪</button>
               </div>
            )}
         </>
      )}

      {menuOpen && (
        <div className="sidebar">
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:20, alignItems:'center', marginTop:10}}>
             <h3 style={{margin: 0}}>Syllabus</h3>
             <button onClick={()=>setMenuOpen(false)} style={{background:'none', border:'none', color:'white', fontSize:28, cursor:'pointer'}}>×</button>
          </div>
          
          <div style={{marginBottom:20}}>
             <button className="option-btn" onClick={() => toggleSubject('math')} style={{width:'100%', marginBottom:10}}>
                Applied Mathematics-II {expandedSubject === 'math' ? '▼' : '▶'}
             </button>
             {expandedSubject === 'math' && (
                 <div className="sub-list">
                   {SYLLABUS["Applied Mathematics-II"].map(m => (
                      <div key={m.id} className="topic-row" onClick={() => toggleTopic(m.prompt)}>
                         <input type="checkbox" checked={selectedTopics.includes(m.prompt)} onChange={()=>{}} />
                         <span>{m.name}</span>
                      </div>
                   ))}
                 </div>
             )}

             <button className="option-btn" onClick={() => toggleSubject('physics')} style={{width:'100%', marginBottom:10}}>
                Engineering Physics-II {expandedSubject === 'physics' ? '▼' : '▶'}
             </button>
             {expandedSubject === 'physics' && (
                 <div className="sub-list">
                   {SYLLABUS["Engineering Physics-II"].map(m => (
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
                <h3>Group Chat</h3>
                <button onClick={() => setChatOpen(false)} style={{background:'none', border:'none', color:'#0A84FF', fontSize:28, cursor:'pointer'}}>×</button>
             </div>
             
             <div className="chat-messages">
                {messages.map((m, i) => (
                   <div key={i} className={`msg-bubble ${m.username === username ? 'mine' : ''}`}>
                      <div className="msg-user">{m.username} • {m.time}</div>
                      {m.text && <div>{m.text}</div>}
                      {m.image && <img src={m.image} className="msg-img" onClick={() => window.open(m.image)} />}
                      {m.audio && <audio src={m.audio} controls className="msg-audio" />}
                   </div>
                ))}
                <div ref={messagesEndRef} />
             </div>
             
             <div className="chat-input-area">
                {showCamOptions && (
                    <div className="cam-popup">
                        {/* 🟢 FIX 5: EXPLICIT CAMERA AND FILE UPLOAD LABELS */}
                        <button onClick={() => { cameraInputRef.current.click(); setShowCamOptions(false); }}>📸 Camera</button>
                        <button onClick={() => { fileInputRef.current.click(); setShowCamOptions(false); }}>📁 Upload File</button>
                    </div>
                )}
                <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{display:'none'}} onChange={handleImageUpload} />
                <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleImageUpload} />
                
                {/* 🟢 FIX 5: CLEAR PAPERCLIP ICON */}
                <button className="icon-btn" onClick={() => setShowCamOptions(!showCamOptions)}>📎</button>
                
                {/* 🟢 FIX 4: CHANGED PLACEHOLDER */}
                <input 
                    className="chat-input-field" 
                    placeholder="Message..." 
                    value={chatInput} 
                    onChange={(e) => setChatInput(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()} 
                />
                
                {chatInput.trim() ? (
                    <button className="send-btn" onClick={sendMessage}>↑</button>
                ) : (
                    <button 
                        className={`mic-btn ${isRecording ? 'recording' : ''}`}
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onMouseLeave={stopRecording}
                        onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                        onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                    >
                        {isRecording ? "🔴" : "🎙️"}
                    </button>
                )}
             </div>
          </div>
      )}

      <div style={{display:'flex', flexDirection:'column', alignItems:'center', width:'100%'}}>
        <h1 className="logo">🧠 BrainSync</h1>

        {gameState === 'loading' && (
           <div className="card" style={{textAlign:'center', minHeight:300, display:'flex', flexDirection:'column', justifyContent:'center'}}>
             <div className="galaxy-ring"></div>
             <h2>Generating Exam PyQ... ✨</h2>
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
                    <button key={n} onClick={() => setLimitAndOpenMenu(n)} style={{background: questionLimit===n.toString()?'#0A84FF':'#2c2c2e', color:'white', border:'none', padding:'12px 20px', borderRadius:12, fontSize:16, flex:1}}>
                        {n}
                    </button>
                )}
                <input 
                    type="number" 
                    placeholder="Custom #"
                    value={questionLimit}
                    onChange={(e) => setQuestionLimit(e.target.value)}
                    style={{background:'#2c2c2e', color:'white', border:'1px solid #444', padding:'12px', borderRadius:12, fontSize:16, width:100, textAlign:'center'}} 
                />
             </div>
             
             <p>2. Select Topics from ☰ Menu.</p>
             
             <button 
                onClick={handleStart} 
                disabled={selectedTopics.length === 0} 
                className="primary-btn"
                style={{
                    background: selectedTopics.length > 0 ? '#34C759' : '#444', 
                    color: selectedTopics.length > 0 ? 'white' : '#888',
                    cursor: selectedTopics.length > 0 ? 'pointer' : 'not-allowed'
                }}
             >
                {selectedTopics.length > 0 ? `🚀 Start Quiz (${selectedTopics.length} Topics)` : "⚠️ Select Topics First"}
             </button>
             
             {quizHistory && quizHistory.length > 0 && (
                 <button onClick={downloadPDF} style={{width:'100%', background:'#FF3B30', color:'white', border:'none', padding:14, borderRadius:12, marginTop:15, fontWeight:'bold'}}>
                    📥 Download Last Quiz PDF
                 </button>
             )}
          </div>
        )}

        {gameState === 'lobby' && role === 'member' && (
            <div className="card" style={{textAlign:'center'}}>
                <h2>Waiting for Host... ☕</h2>
                {quizHistory && quizHistory.length > 0 && (
                     <button onClick={downloadPDF} style={{width:'100%', background:'#FF3B30', color:'white', border:'none', padding:14, borderRadius:12, marginTop:20, fontWeight:'bold'}}>
                        📥 Download Last Quiz PDF
                     </button>
                )}
            </div>
        )}

        {(gameState === 'playing' || gameState === 'result') && question && (
          <div className="card">
            <div className="header-row">
                <div style={{fontSize:'1.2em', fontWeight:'bold', color: timer < 30 ? '#FF3B30' : '#34C759'}}>⏳ {formatTime(timer)}</div>
                <div className="marks-badge">🏆 {question.marks} Marks</div>
                
                <div style={{display:'flex', gap:5}}>
                  <button onClick={toggleAI} style={{background: isListeningAI ? '#FF3B30' : (aiSpeaking ? '#FFD60A' : '#2c2c2e'), color: aiSpeaking ? 'black' : 'white', border:'1px solid #444', borderRadius:'20px', padding:'8px 14px', fontWeight: 500}}>
                    {isListeningAI ? "🛑 Listening..." : (aiSpeaking ? "🔇 Stop AI" : "🤖 Ask AI")}
                  </button>
                </div>
            </div>

            {question.topic && <div style={{fontSize:12, color:'rgba(255,255,255,0.5)', textAlign:'center', marginBottom:10, textTransform: 'uppercase', letterSpacing: 1}}>Topic: {question.topic}</div>}

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
                <h2 style={{color: roundResult.isCorrect ? '#34C759' : '#FF3B30', textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap: 10}}>
                   {roundResult.isCorrect ? "✅ Correct!" : "❌ Wrong!"}
                </h2>
                {!roundResult.isCorrect && selectedOptionIndex !== null && (
                    <div style={{background:'rgba(255, 59, 48, 0.1)', padding:12, borderRadius:12, marginBottom:10, border:'1px solid rgba(255, 59, 48, 0.3)'}}>
                        <strong style={{color:'#FF3B30'}}>You Chose: Option {getLetter(selectedOptionIndex)}</strong>
                    </div>
                )}
                <div style={{background:'rgba(52, 199, 89, 0.1)', padding:15, borderRadius:12, marginBottom:10, border:'1px solid rgba(52, 199, 89, 0.3)'}}>
                   <strong style={{color:'#34C759'}}>Correct Answer: Option {getLetter(getCorrectIndex())}</strong>
                   <div style={{marginTop:8, fontSize: 16}}><MathText text={roundResult.correctAnswer} /></div>
                </div>
                <div style={{color:'rgba(255,255,255,0.8)', fontSize:'0.95em', marginTop:15, lineHeight: 1.5}}><MathText text={roundResult.explanation} /></div>
              </div>
            )}

            {role === 'host' && (
              <div className="host-controls">
                <button onClick={navPrev} style={{background:'#2c2c2e', border:'none', color:'white', padding:'10px 20px', borderRadius:10}}>⬅ Prev</button>
                <button onClick={() => socket.emit('host_action', {roomCode, action:'add'})} style={{background:'#2c2c2e', border:'none', color:'#FFD60A', padding:'10px 20px', borderRadius:10}}>+60s</button>
                <button onClick={() => handleSmartNext()} disabled={!canMoveOn && !isHistoryMode} style={{background: canMoveOn || isHistoryMode ? '#0A84FF' : '#444', border:'none', color: canMoveOn || isHistoryMode ? 'white' : '#888', padding:'10px 20px', borderRadius:10, marginLeft:10, cursor: canMoveOn || isHistoryMode ? 'pointer' : 'not-allowed', fontWeight: 'bold'}}>
                    {isHistoryMode ? "Next (Rev) ➡" : (canMoveOn ? "Next ➡" : "Locked 🔒")}
                </button>
              </div>
            )}
            
            {role === 'member' && (
               <div style={{display:'flex', justifyContent:'center', gap:10, marginTop:15}}>
                  <button onClick={requestStuck} style={{background:'#FF3B30', border:'none', color:'white', padding:'10px 20px', borderRadius:20, fontSize:13, fontWeight:'bold'}}>🤷 I'm Stuck (Unlock)</button>
                  <button onClick={requestChange} style={{background:'none', border:'1px solid #555', color:'#aaa', padding:'8px 15px', borderRadius:20, fontSize:13}}>Request Topic Change</button>
               </div>
            )}
          </div>
        )}

        {Object.keys(scores).length > 0 && (
           <div className="card" style={{marginTop:20, background:'#1c1c1e', border:'1px solid rgba(255,255,255,0.1)'}}>
              <h3 style={{borderBottom:'1px solid rgba(255,255,255,0.1)', paddingBottom:15, marginTop: 0}}>🏆 Live Scores</h3>
              {Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([u, s], i) => (
                 <div key={u} style={{display:'flex', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.05)', color: i===0?'#FFD60A':'white', fontSize: 16}}>
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