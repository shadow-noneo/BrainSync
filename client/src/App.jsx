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

// 🟢 ROBUST MATH RENDERER
const MathText = ({ text }) => {
  if (!text) return null;
  let cleanText = String(text)
     .replace(/\\\(/g, '$').replace(/\\\)/g, '$')
     .replace(/\\\[/g, '$').replace(/\\\]/g, '$')
     .replace(/\$\$/g, '$');
     
  const parts = cleanText.split('$');
  return (
    <span style={{ fontSize: '1.1em', wordBreak: 'break-word' }}>
      {parts.map((p, i) => {
        if (!p) return null;
        if (i % 2 === 1) {
          return <InlineMath key={i} math={p} renderError={() => <span style={{color: '#FFD60A'}}>{p}</span>} />;
        } else {
          if (/[\\]|[\^]|[_]/.test(p)) {
              return <InlineMath key={i} math={p} renderError={() => <span>{p}</span>} />;
          }
          return <span key={i}>{p}</span>;
        }
      })}
    </span>
  );
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
  
  const [recState, setRecState] = useState('idle'); 
  const [recTime, setRecTime] = useState(0);
  const [recStartTime, setRecStartTime] = useState(0);
  
  const [selectedTopics, setSelectedTopics] = useState([]); 
  const [questionLimit, setQuestionLimit] = useState(""); 
  const [expandedSubject, setExpandedSubject] = useState(null); 
  const [quizHistory, setQuizHistory] = useState([]);

  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyLength, setHistoryLength] = useState(0);
  const [canMoveOn, setCanMoveOn] = useState(false);
  
  const [profileOpen, setProfileOpen] = useState(false);
  
  // 🟢 NEW AI VOICE STATES
  const [aiState, setAiState] = useState('idle'); // 'idle', 'listening', 'thinking', 'speaking'
  const recognitionRef = useRef(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const roomInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recTimerRef = useRef(null);

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
      setAiState('idle'); // Reset AI on new question
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
    
    // 🟢 AI REPLY HANDLER
    socket.on('ai_voice_reply', ({ text }) => { 
        setAiState('speaking'); 
        speakText(text); 
    });

    socket.on('host_notification', ({ type, username }) => { toast(`${username}: ${type === 'stuck' ? 'Stuck 🤷' : 'Help!'}`, { icon: '📣' }); });
    socket.on('cheat_alert', ({ username }) => { toast.error(`⚠️ ${username} tab switched!`); new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(()=>{}); });

    socket.on('receive_message', (msg) => { 
        setMessages(prev => [...prev, msg]); 
        if(!chatOpen) toast("New Message 💬", { icon: '💬' }); 
    });
    
    socket.on('game_over', ({ scores, history }) => { 
        setGameState('lobby'); 
        toast("Quiz Ended! 🏁"); 
        setScores(scores);
        setQuizHistory(history || []);
    });

    const handleVisibilityChange = () => { if (document.hidden && gameState === 'playing' && role === 'member') socket.emit('tab_switch', { roomCode, username }); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => { socket.off(); document.removeEventListener("visibilitychange", handleVisibilityChange); };
  }, [gameState, role, roomCode, username, chatOpen, canMoveOn]);

  useEffect(() => { 
      if (messagesEndRef.current) { messagesEndRef.current.scrollIntoView({ behavior: "smooth" }); }
  }, [messages, chatOpen]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
  
  // 🟢 IMPROVED TEXT-TO-SPEECH
  const speakText = (text) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1; // Slightly faster natural speed
    u.pitch = 1.0;
    u.onend = () => setAiState('idle');
    window.speechSynthesis.speak(u);
  };

  // 🟢 NEW "BRAINSYNC WAVE" AI CONTROLLER
  const toggleAI = () => {
    // Case 1: If Speaking -> STOP
    if (aiState === 'speaking' || aiState === 'thinking') {
        window.speechSynthesis.cancel();
        if (recognitionRef.current) recognitionRef.current.stop();
        setAiState('idle');
        return;
    }

    // Case 2: If Listening -> STOP
    if (aiState === 'listening') {
        if (recognitionRef.current) recognitionRef.current.stop();
        setAiState('idle');
        return;
    }

    // Case 3: If Idle -> START LISTENING
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return toast.error("Use Chrome for AI Voice");
    
    const r = new SpeechRecognition();
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = false;

    r.onstart = () => {
        setAiState('listening');
    };

    r.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        setAiState('thinking'); // Transition to thinking animation
        socket.emit('ask_ai', { roomCode, userQuery: transcript }); 
    };

    r.onerror = (e) => {
        setAiState('idle');
        toast.error("Did not hear you.");
    };
    
    r.onend = () => {
        // If we finished listening but haven't sent a query yet (handled in onresult), reset.
        if (aiState === 'listening') setAiState('thinking');
    };

    recognitionRef.current = r;
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
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start();
        setRecState('holding');
        setRecTime(0);
        setRecStartTime(Date.now());
        
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
        
    } catch (err) { 
        toast.error("Microphone access denied!"); 
    }
  };

  const stopRecordingAndSend = () => {
      if (Date.now() - recStartTime < 300 && recState === 'holding') {
          setRecState('locked');
          return;
      }

      if (mediaRecorderRef.current && (recState === 'holding' || recState === 'locked')) {
          mediaRecorderRef.current.onstop = () => {
              const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
              const reader = new FileReader();
              reader.readAsDataURL(audioBlob);
              reader.onloadend = () => {
                  const msg = { username, text: "", image: null, audio: reader.result, time: new Date().toLocaleTimeString() };
                  setMessages(prev => [...prev, msg]);
                  socket.emit('send_message', { roomCode, ...msg });
              };
          };
          mediaRecorderRef.current.stop();
      }
      resetRecUI();
  };

  const cancelRecording = () => {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      resetRecUI();
      toast("Discarded 🗑️");
  };

  const lockRecording = () => { setRecState('locked'); };

  const resetRecUI = () => {
      setRecState('idle');
      setRecTime(0);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
  };

  const handleTouchMove = (e) => {
      if (recState !== 'holding') return;
      const touch = e.touches[0];
      if (touch.clientY < window.innerHeight - 150) lockRecording();
      if (touch.clientX < window.innerWidth / 2) cancelRecording();
  };

  const handleLogout = () => { localStorage.removeItem("bs_room"); localStorage.removeItem("bs_user"); window.location.reload(); };
  const joinRoom = () => { 
      if (username && roomCode) {
          setQuizHistory([]); 
          socket.emit('join_room', { roomCode, username }); 
      } else toast.error("Enter Details"); 
  };
  
  const handleAnswer = (opt, index) => { setSelectedOptionIndex(index); socket.emit('submit_answer', { roomCode, answerIndex: index, username }); };
  const navPrev = () => { socket.emit('nav_prev', { roomCode }); setHistoryIndex(prev => Math.max(0, prev - 1)); };
  
  const handleSmartNext = () => {
      window.speechSynthesis.cancel();
      setAiState('idle');
      if (isHistoryMode && historyIndex < historyLength - 1) {
          socket.emit('nav_next', { roomCode });
          setHistoryIndex(prev => prev + 1);
      } else {
          socket.emit('start_quiz', { roomCode, subject: "Continued", topics: selectedTopics, forceNew: false });
      }
  };
  
  const setLimitAndOpenMenu = (limit) => { setQuestionLimit(limit.toString()); setMenuOpen(true); };

  const handleStart = () => {
      if (gameState === 'lobby' && selectedTopics.length === 0) return toast.error("Select at least 1 topic!");
      setGameState('loading');
      setMenuOpen(false); 
      socket.emit('start_quiz', { 
          roomCode, 
          subject: expandedSubject === 'physics' ? "Engineering Physics-II" : "Applied Mathematics-II", 
          topics: selectedTopics, 
          limit: questionLimit.trim() === "" ? -1 : parseInt(questionLimit),
          forceNew: true 
      });
  };

  const requestStuck = () => socket.emit('student_signal', { roomCode, type: 'stuck', username });
  const requestChange = () => socket.emit('student_signal', { roomCode, type: 'change', username });

  const sendMessage = () => {
      if(chatInput.trim() !== "") {
          const msg = { username, text: chatInput, image: null, audio: null, time: new Date().toLocaleTimeString() };
          setMessages(prev => [...prev, msg]); 
          socket.emit('send_message', { roomCode, ...msg });
          setChatInput(""); 
      }
  };

  const handleImageUpload = (e) => {
      setShowCamOptions(false);
      if(e.target.files[0]) compressImage(e.target.files[0], (dataUrl) => { 
          const msg = { username, text: "", image: dataUrl, audio: null, time: new Date().toLocaleTimeString() };
          setMessages(prev => [...prev, msg]); 
          socket.emit('send_message', { roomCode, ...msg }); 
      });
  };

  const getLetter = (i) => String.fromCharCode(65 + i);
  const getCorrectIndex = () => { if (!question || !roundResult) return -1; return roundResult.correctIndex; };
  const toggleTopic = (prompt) => { setSelectedTopics(prev => prev.includes(prompt) ? prev.filter(t => t !== prompt) : [...prev, prompt]); };
  const toggleSubject = (sub) => { expandedSubject === sub ? setExpandedSubject(null) : setExpandedSubject(sub); };

  const downloadPDF = () => {
      if (!quizHistory || quizHistory.length === 0) return toast.error("No questions to save.");
      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(22); doc.text("BrainSync - Quiz Report", 20, y); y += 10;
      doc.setFontSize(10); doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, y); y += 20;

      quizHistory.forEach((q, i) => {
          if(y > 270) { doc.addPage(); y = 20; }
          let plainQ = q.question.replace(/\$/g, '');
          doc.text(`Q${i+1}. ${plainQ}`, 20, y); y += 10;
          q.options.forEach((opt, idx) => {
              if(y > 280) { doc.addPage(); y = 20; }
              let plainOpt = opt.replace(/\$/g, '');
              doc.text(`   (${getLetter(idx)}) ${plainOpt}`, 20, y); y += 6;
          });
          y += 8; 
      });
      doc.save("BrainSync_Quiz.pdf"); toast.success("PDF Downloaded! 📥");
  };

  const formatRecTime = (s) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;

  return (
    <div className="app-container">
      <Toaster position="top-center" />
      <style>{`
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow-x: hidden; background: #1a1a1a; color: white; font-family: -apple-system, sans-serif; }
        .app-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; width: 100vw; box-sizing: border-box; }
        .card { background: #222; padding: 2rem; border-radius: 16px; width: 100%; max-width: 750px; border: 1px solid #333; box-shadow: 0 10px 40px rgba(0,0,0,0.6); position: relative; }
        .logo { font-size: 2.5em; margin-bottom: 20px; text-shadow: 0 0 15px rgba(100,108,255,0.6); font-weight: 800; letter-spacing: -1px; }
        .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #444; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
        button { cursor: pointer; transition: 0.2s; }
        button:active { transform: scale(0.98); }
        .input { width: 100%; padding: 14px; margin: 10px 0; background: #333; border: 1px solid #444; color: white; border-radius: 12px; font-size: 16px; box-sizing: border-box; }
        .primary-btn { width: 100%; padding: 14px; background: #0A84FF; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin-top: 10px; }
        .primary-btn:disabled { background: #444; color: #888; cursor: not-allowed; }
        .option-btn { width: 100%; padding: 15px 12px; background: #2c2c2e; color: #eee; border: 1px solid #444; border-radius: 12px; text-align: left; display: flex; gap: 15px; align-items: center; transition: 0.2s; min-height: 70px; }
        .option-badge { background: #444; color: white; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 15px; flex-shrink: 0; }
        .selected { background: #0A84FF; border-color: #0A84FF; color: white; }
        .selected .option-badge { background: white; color: #0A84FF; }
        .marks-badge { background: #FFD60A; color: black; padding: 5px 12px; border-radius: 20px; font-weight: bold; font-size: 13px; }
        .host-controls { display: flex; gap: 10px; margin-top: 15px; justify-content: center; padding-top:15px; border-top:1px solid #333; }
        
        .menu-btn { position: fixed; top: 15px; left: 15px; font-size: 16px; background: rgba(44, 44, 46, 0.8); backdrop-filter: blur(10px); border: 1px solid #444; color: white; padding: 8px 14px; border-radius: 12px; z-index: 20000; font-weight: 500; }
        .profile-btn { position: fixed; top: 15px; right: 15px; font-size: 20px; background: rgba(44, 44, 46, 0.8); backdrop-filter: blur(10px); border: 1px solid #444; color: white; padding: 8px; border-radius: 50%; width: 45px; height: 45px; z-index: 20000; cursor: pointer; display:flex; align-items:center; justify-content:center; }
        .chat-btn { position: fixed; bottom: 25px; right: 25px; font-size: 26px; background: #0A84FF; color: white; width: 60px; height: 60px; border-radius: 50%; border: none; box-shadow: 0 8px 20px rgba(10, 132, 255, 0.4); z-index: 20000; display: flex; align-items: center; justify-content: center; transition: 0.3s; }
        .chat-btn:hover { transform: scale(1.1); }
        .profile-menu { position: fixed; top: 70px; right: 20px; background: rgba(44, 44, 46, 0.95); border: 1px solid #555; padding: 15px; border-radius: 16px; z-index: 20001; width: 200px; }
        .sidebar { position: fixed; top: 0; left: 0; width: 320px; height: 100%; background: #1c1c1e; padding: 20px; z-index: 10001; border-right: 1px solid #333; overflow-y: auto; }
        .sub-list { padding-left: 15px; border-left: 2px solid #444; margin-top: 5px; }
        .chat-sidebar { position: fixed; top: 0; right: 0; width: 350px; height: 100%; background: rgba(28, 28, 30, 0.95); z-index: 10002; border-left: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; box-shadow: -10px 0 30px rgba(0,0,0,0.5); }
        .chat-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
        .chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .msg-bubble { background: #3a3a3c; padding: 10px 16px; border-radius: 18px; max-width: 80%; word-break: break-word; font-size: 15px; border-bottom-left-radius: 4px; }
        .msg-bubble.mine { background: #0A84FF; align-self: flex-end; border-bottom-left-radius: 18px; border-bottom-right-radius: 4px; }
        .msg-user { font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
        .msg-bubble.mine .msg-user { text-align: right; }
        .msg-img { max-width: 100%; border-radius: 12px; margin-top: 5px; cursor: pointer; }
        .msg-audio { width: 100%; max-width: 220px; height: 35px; margin-top: 5px; border-radius: 20px; outline: none; }
        .chat-input-area { padding: 10px 15px; display: flex; gap: 10px; align-items: center; min-height: 60px; position: relative; }
        
        .rec-locked-container { display: flex; align-items: center; width: 100%; justify-content: space-between; padding: 5px 15px; background: rgba(10, 132, 255, 0.1); border-radius: 30px; border: 1px solid #0A84FF; animation: glow 2s infinite; }
        .rec-timer-container { display: flex; align-items: center; gap: 10px; color: white; font-family: monospace; font-size: 16px; font-weight: bold; }
        .rec-wave { display: flex; align-items: center; gap: 3px; height: 20px; }
        .rec-bar { width: 3px; background: #0A84FF; border-radius: 2px; animation: wave 1s ease-in-out infinite; }
        .rec-bar:nth-child(1) { height: 10px; animation-delay: 0.0s; }
        .rec-bar:nth-child(2) { height: 15px; animation-delay: 0.1s; }
        .rec-bar:nth-child(3) { height: 20px; animation-delay: 0.2s; }
        .rec-bar:nth-child(4) { height: 12px; animation-delay: 0.3s; }
        .rec-bar:nth-child(5) { height: 18px; animation-delay: 0.4s; }
        
        .mic-btn-hold { background: linear-gradient(135deg, #0A84FF, #5E5CE6); color: white; border: none; border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; transition: 0.2s; box-shadow: 0 0 20px rgba(10, 132, 255, 0.6); transform: scale(1.1); }
        .mic-btn { background: transparent; color: #0A84FF; border: 2px solid #0A84FF; border-radius: 50%; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; transition: 0.2s; }
        .mic-btn:hover { background: rgba(10, 132, 255, 0.1); }
        
        @keyframes wave { 0%, 100% { height: 5px; } 50% { height: 20px; } }
        @keyframes glow { 0% { box-shadow: 0 0 5px rgba(10, 132, 255, 0.2); } 50% { box-shadow: 0 0 15px rgba(10, 132, 255, 0.5); } 100% { box-shadow: 0 0 5px rgba(10, 132, 255, 0.2); } }

        /* 🟢 NEW AI BUTTON STYLES */
        .ai-btn { background: #333; color: white; border: 1px solid #555; border-radius: 25px; padding: 8px 16px; display: flex; align-items: center; gap: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; overflow: hidden; position: relative; }
        .ai-btn.listening { background: #1a472a; border-color: #2ecc71; box-shadow: 0 0 10px #2ecc71; }
        .ai-btn.speaking { background: #4a2c4a; border-color: #e056fd; box-shadow: 0 0 10px #e056fd; }
        .ai-btn.thinking { background: #4a3b1a; border-color: #f1c40f; animation: pulse-border 1.5s infinite; }
        
        .ai-wave-container { display: flex; align-items: center; gap: 2px; height: 15px; margin-left: 5px; }
        .ai-bar { width: 3px; background: white; border-radius: 2px; animation: quiet 1s infinite; }
        .ai-btn.listening .ai-bar { background: #2ecc71; animation: active-wave 0.5s infinite alternate; }
        .ai-btn.speaking .ai-bar { background: #e056fd; animation: active-wave 0.3s infinite alternate; }
        
        .ai-bar:nth-child(1) { animation-delay: 0.0s; }
        .ai-bar:nth-child(2) { animation-delay: 0.1s; }
        .ai-bar:nth-child(3) { animation-delay: 0.2s; }
        
        @keyframes active-wave { 0% { height: 3px; } 100% { height: 15px; } }
        @keyframes quiet { 0% { height: 3px; opacity: 0.5; } 100% { height: 3px; opacity: 0.5; } }
        @keyframes pulse-border { 0% { border-color: #555; } 50% { border-color: #f1c40f; } 100% { border-color: #555; } }

        .cam-popup { position: absolute; bottom: 80px; left: 15px; background: rgba(44, 44, 46, 0.95); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 5px; z-index: 10002; }
        .cam-popup button { background: transparent; color: white; border: none; padding: 10px 15px; text-align: left; cursor: pointer; border-radius: 8px; }
        .cam-popup button:hover { background: rgba(255,255,255,0.1); }
        .icon-btn { background: none; border: none; color: #0A84FF; font-size: 24px; cursor: pointer; padding: 5px; display: flex; align-items: center; justify-content: center; }
        .chat-input-field { flex: 1; padding: 10px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: #3a3a3c; color: white; font-size: 15px; outline: none; transition: 0.2s; }
        .send-btn { background: #0A84FF; border: none; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer;}
        
        .topic-row { display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #333; cursor: pointer; }
        .topic-row input { margin-right: 10px; width: 18px; height: 18px; accent-color: #0A84FF; }
        @keyframes galaxy { 100% { transform: rotate(360deg); } }
        .galaxy-ring { width: 50px; height: 50px; border-radius: 50%; background: conic-gradient(#0A84FF, #FF3B30, #FFD60A, #34C759, #0A84FF); mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #fff 0); animation: galaxy 1s linear infinite; margin: 20px auto; }
        
        @media (max-width: 600px) { .chat-sidebar { width: 100%; } .grid { grid-template-columns: 1fr; } }
      `}</style>

      {gameState !== 'menu' && !menuOpen && <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰ Topics</button>}
      {gameState !== 'menu' && !chatOpen && <button className="chat-btn" onClick={() => setChatOpen(!chatOpen)}>💬</button>}
      
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
             <button className="option-btn" onClick={() => toggleSubject('math')} style={{width:'100%', marginBottom:10, minHeight:'auto'}}>
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
             <button className="option-btn" onClick={() => toggleSubject('physics')} style={{width:'100%', marginBottom:10, minHeight:'auto'}}>
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
          <button onClick={() => setMenuOpen(false)} style={{width: '100%', padding: '12px', background: '#34C759', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', marginTop: '20px'}}>
             ✅ Done
          </button>
        </div>
      )}

      {chatOpen && (
          <div className="chat-sidebar">
             <div className="chat-header">
                <h3 style={{margin: 0}}>Group Chat</h3>
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
             
             <div className="chat-input-area" onTouchMove={handleTouchMove}>
                {recState === 'locked' ? (
                    <div className="rec-locked-container">
                        <button onClick={cancelRecording} style={{background:'none', border:'none', color:'#FF3B30', fontSize:'20px'}}>❌</button>
                        <div className="rec-timer-container">
                            <div className="rec-wave">
                                <div className="rec-bar"></div>
                                <div className="rec-bar"></div>
                                <div className="rec-bar"></div>
                                <div className="rec-bar"></div>
                                <div className="rec-bar"></div>
                            </div>
                            <span>{formatRecTime(recTime)}</span>
                        </div>
                        <button onClick={stopRecordingAndSend} className="send-btn" style={{background:'#0A84FF', borderRadius:'50%', width:'40px', height:'40px'}}>➤</button>
                    </div>
                ) : (
                    <>
                        {showCamOptions && (
                            <div className="cam-popup">
                                <button onClick={() => { cameraInputRef.current.click(); setShowCamOptions(false); }}>📸 Camera</button>
                                <button onClick={() => { fileInputRef.current.click(); setShowCamOptions(false); }}>📁 Upload File</button>
                            </div>
                        )}
                        <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{display:'none'}} onChange={handleImageUpload} />
                        <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleImageUpload} />
                        
                        {recState === 'idle' ? (
                            <>
                                <button className="icon-btn" onClick={() => setShowCamOptions(!showCamOptions)}>📎</button>
                                <input className="chat-input-field" placeholder="Message..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
                            </>
                        ) : (
                            <div style={{flex:1, color:'#888', paddingLeft:10}} className="slide-to-cancel">Slide to cancel &lt;</div>
                        )}

                        {chatInput.trim() !== "" ? (
                            <button className="send-btn" onClick={sendMessage}>↑</button>
                        ) : (
                            <button 
                                className={recState === 'holding' ? "mic-btn-hold" : "mic-btn"}
                                onMouseDown={startRecording}
                                onMouseUp={stopRecordingAndSend}
                                onMouseLeave={stopRecordingAndSend}
                                onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                                onTouchEnd={(e) => { e.preventDefault(); stopRecordingAndSend(); }}
                            >
                                🎙️
                            </button>
                        )}
                    </>
                )}
             </div>
          </div>
      )}

      <div style={{display:'flex', flexDirection:'column', alignItems:'center', width:'100%'}}>
        <h1 className="logo">🧠 BrainSync</h1>
        
        {gameState === 'loading' && (
           <div className="card" style={{textAlign:'center', minHeight:300, display:'flex', flexDirection:'column', justifyContent:'center'}}>
             <div className="galaxy-ring"></div>
             <h2>Generating Exam Question... ✨</h2>
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
                    <button key={n} onClick={() => setLimitAndOpenMenu(n)} style={{background: questionLimit===n.toString()?'#0A84FF':'#2c2c2e', color:'white', border:'none', padding:'12px 20px', borderRadius:12, fontSize:16, flex:1}}>{n}</button>
                )}
                <input type="number" placeholder="Custom #" value={questionLimit} onChange={(e) => setQuestionLimit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setMenuOpen(true)} style={{background:'#2c2c2e', color:'white', border:'1px solid #444', padding:'12px', borderRadius:12, fontSize:16, width:100, textAlign:'center'}} />
             </div>
             <p>2. Select Topics from ☰ Menu.</p>
             <button onClick={handleStart} disabled={selectedTopics.length === 0} className="primary-btn" style={{background: selectedTopics.length > 0 ? '#34C759' : '#444', color: selectedTopics.length > 0 ? 'white' : '#888', cursor: selectedTopics.length > 0 ? 'pointer' : 'not-allowed'}}>
                {selectedTopics.length > 0 ? `🚀 Start Quiz (${selectedTopics.length} Topics)` : "⚠️ Select Topics First"}
             </button>
             
             {quizHistory && quizHistory.length > 0 && (
                 <button onClick={downloadPDF} style={{width:'100%', background:'#FF3B30', color:'white', border:'none', padding:14, borderRadius:12, marginTop:15, fontWeight:'bold'}}>
                    📥 Download Current Session PDF
                 </button>
             )}
          </div>
        )}

        {gameState === 'lobby' && role === 'member' && (
            <div className="card" style={{textAlign:'center'}}>
                <h2>Waiting for Host... ☕</h2>
                {quizHistory && quizHistory.length > 0 && (
                     <button onClick={downloadPDF} style={{width:'100%', background:'#FF3B30', color:'white', border:'none', padding:14, borderRadius:12, marginTop:20, fontWeight:'bold'}}>
                        📥 Download Current Session PDF
                     </button>
                )}
            </div>
        )}

        {(gameState === 'playing' || gameState === 'result') && question && (
          <div className="card" style={{maxWidth: '800px'}}>
            <div className="header-row">
                <div style={{fontSize:'1.2em', fontWeight:'bold', color: timer < 30 ? '#FF3B30' : '#34C759'}}>⏳ {formatTime(timer)}</div>
                <div className="marks-badge">🏆 {question.marks} Marks</div>
                
                {/* 🟢 NEW "BRAINSYNC LIVE WAVE" AI BUTTON */}
                <button 
                    onClick={toggleAI} 
                    className={`ai-btn ${aiState}`}
                >
                    {aiState === 'idle' && <span>🤖 Ask AI</span>}
                    {aiState === 'listening' && <span>👂 Listening</span>}
                    {aiState === 'thinking' && <span>🧠 Thinking...</span>}
                    {aiState === 'speaking' && <span>🔊 Speaking</span>}
                    
                    {aiState !== 'idle' && (
                        <div className="ai-wave-container">
                            <div className="ai-bar"></div>
                            <div className="ai-bar"></div>
                            <div className="ai-bar"></div>
                        </div>
                    )}
                </button>
            </div>

            {question.topic && <div style={{fontSize:12, color:'rgba(255,255,255,0.5)', textAlign:'center', marginBottom:15, textTransform: 'uppercase', letterSpacing: 1}}>Topic: {question.topic}</div>}
            
            <h3 style={{textAlign:'center', lineHeight:1.6, fontSize: '1.3em', marginBottom: '30px'}}><MathText text={question.question} /></h3>

            {gameState === 'playing' && (
              <div className="grid">
                {question.options.map((opt, i) => (
                  <button key={i} className={`option-btn ${selectedOptionIndex === i ? 'selected' : ''}`} onClick={() => handleAnswer(opt, i)} disabled={selectedOptionIndex !== null}>
                    <div className="option-badge">{getLetter(i)}</div>
                    <div style={{flex:1, overflow:'hidden', fontSize: '1.1em'}}><MathText text={opt} /></div>
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
                   <div style={{marginTop:8, fontSize: '1.2em'}}><MathText text={roundResult.correctAnswer} /></div>
                </div>
                <div style={{color:'rgba(255,255,255,0.9)', fontSize:'1.05em', marginTop:15, lineHeight: 1.6}}><MathText text={roundResult.explanation} /></div>
                {question.exam_year && (
                    <div style={{marginTop:15, textAlign:'center', fontSize: '0.9em', color: '#FFD60A', border: '1px solid #FFD60A', display: 'inline-block', padding: '4px 10px', borderRadius: '15px'}}>
                        📚 Exam: {question.exam_year}
                    </div>
                )}
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
          </div>
        )}

        {gameState !== 'menu' && Object.keys(scores).length > 0 && (
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