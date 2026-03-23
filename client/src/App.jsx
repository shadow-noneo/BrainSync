import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import 'katex/dist/katex.min.css'; 
import { InlineMath } from 'react-katex';
import { Toaster, toast } from 'react-hot-toast';
import { jsPDF } from "jspdf";
import { SYLLABUS } from './syllabus.js'; 

document.title = "BrainSync | Live Quiz";
const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
link.type = 'image/svg+xml';
link.rel = 'icon';
link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧠</text></svg>';
document.getElementsByTagName('head')[0].appendChild(link);

const socket = io.connect("https://brainsync-server.onrender.com"); 

// 🟢 CRASH GUARD
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error("CRASH REPORT:", error, errorInfo); }
  render() {
    if (this.state.hasError) return <div style={{padding: 20, color: 'white', textAlign: 'center'}}><h2>⚠️ Display Error</h2><button onClick={() => window.location.reload()} style={{padding: 10, marginTop: 10}}>Reload</button></div>;
    return this.props.children; 
  }
}

// 🟢 SAFEST SANITIZER
const sanitizeText = (text) => {
    if (!text) return "";
    return String(text).replace(/f\\frac/g, '\\frac').replace(/\\f/g, 'f').replace(/rac\{/g, '\\frac{').replace(/\\left\s+/g, '\\left').replace(/\\right\s+/g, '\\right').trim();
};

const sanitizeQuestionData = (data) => {
    if (!data) return null;
    return {
        ...data,
        question: sanitizeText(data?.question || "Error Loading Question"),
        options: Array.isArray(data?.options) ? data.options.map(o => sanitizeText(o)) : ["Error", "Error", "Error", "Error"],
        answer: sanitizeText(data?.answer || ""),
        explanation: sanitizeText(data?.explanation || "")
    };
};
const getLetter = (i) => ["A", "B", "C", "D"][i] ?? "?";
const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const MathText = ({ text }) => {
  if (!text) return <span>...</span>;
  try {
    let t = String(text);
    
    // Convert custom notation to LaTeX
    // FRAC(a,b) → \frac{a}{b}
    t = t.replace(/FRAC\(([^,]+),([^)]+)\)/g, '\\frac{$1}{$2}');
    // SQRT(x) → \sqrt{x}
    t = t.replace(/SQRT\(([^)]+)\)/g, '\\sqrt{$1}');
    // Greek letters
    t = t.split('THETA').join('\\theta');
    t = t.split('SIGMA').join('\\sigma');
    t = t.split('ALPHA').join('\\alpha');
    t = t.split('BETA').join('\\beta');
    t = t.split('OMEGA').join('\\omega');
    t = t.split('LAMBDA').join('\\lambda');
    t = t.split('DELTA').join('\\delta');
    t = t.split('GAMMA').join('\\gamma');
    t = t.split('EPSILON').join('\\epsilon');
    t = t.split('PHI').join('\\phi');
    t = t.split('PSI').join('\\psi');
    t = t.split('MU').join('\\mu');
    t = t.split('ETA').join('\\eta');
    t = t.split('KAPPA').join('\\kappa');
    t = t.split('NU').join('\\nu');
    t = t.split('XI').join('\\xi');
    t = t.split('TAU').join('\\tau');
    t = t.split('UPSILON').join('\\upsilon');
    t = t.split('CHI').join('\\chi');
    t = t.split('ZETA').join('\\zeta');
    // Capital Greek
    t = t.split('BIGTHETA').join('\\Theta');
    t = t.split('BIGSIGMA').join('\\Sigma');
    t = t.split('BIGDELTA').join('\\Delta');
    t = t.split('BIGOMEGA').join('\\Omega');
    t = t.split('BIGGAMMA').join('\\Gamma');
    t = t.split('BIGPHI').join('\\Phi');
    t = t.split('BIGPSI').join('\\Psi');
    t = t.split('BIGLAMBDA').join('\\Lambda');
    // Special symbols  
    t = t.split('INF').join('\\infty');
    t = t.split('DOT').join('\\cdot');
    t = t.split('PLUSMINUS').join('\\pm');
    t = t.split('APPROX').join('\\approx');
    t = t.split('HBAR').join('\\hbar');
    t = t.split('NABLA').join('\\nabla');
    t = t.split('PARTIAL').join('\\partial');
    t = t.split('TIMES').join('\\times');
    t = t.split('LEQQ').join('\\leq');
    t = t.split('GEQQ').join('\\geq');
    // VEC(x) → \vec{x}
    t = t.replace(/VEC\(([^)]+)\)/g, '\\vec{$1}');
    // INT(a,b,expr) → \int_{a}^{b} expr
    t = t.replace(/INT\(([^,]+),([^,]+),([^)]+)\)/g, '\\int_{$1}^{$2} $3');
    // SUM(i=0,n,expr) → \sum_{i=0}^{n} expr
    t = t.replace(/SUM\(([^,]+),([^,]+),([^)]+)\)/g, '\\sum_{$1}^{$2} $3');
    
    // Fix any remaining f\frac patterns
    t = t.replace(/f\\frac/g, '\\frac');
    t = t.replace(/f\\sqrt/g, '\\sqrt');
    
    // Wrap math expressions in $ for rendering
    // If no $ signs, wrap everything that looks like math
    if (!t.includes('$')) {
      // Wrap known math patterns
      t = t.replace(/(\\[a-zA-Z]+{[^}]*})/g, '$$$1$$');
      t = t.replace(/(\\[a-zA-Z]+)/g, '$$$1$$');
      t = t.replace(/([a-zA-Z0-9]+^[{0-9a-zA-Z}]+)/g, '$$$1$$');
    }
    
    t = t.split('\\(').join('$').split('\\)').join('$').split('\\[').join('$').split('\\]').join('$').split('$$').join('$');
    
    const parts = t.split('$');
    return <span style={{fontSize:'1.1em',wordBreak:'break-word',lineHeight:'1.8'}}>{parts.map((p,i)=>{
      if(!p) return null;
      if(i%2===1) return <span key={i}><InlineMath math={p} renderError={()=><span style={{color:'#FFD60A'}}>{p}</span>}/></span>;
      return <span key={i}>{p}</span>;
    })}</span>;
  } catch(e){ return <span>{text}</span>; }
};

const compressImage = (file, callback) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image(); img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const maxWidth = 800; const scaleSize = maxWidth / img.width; canvas.width = maxWidth; canvas.height = img.height * scaleSize;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height); callback(canvas.toDataURL('image/jpeg', 0.6));
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
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0); 
  const [questionLimit, setQuestionLimit] = useState(""); 
  const [selectedSubject, setSelectedSubject] = useState("Applied Mathematics-II");
  const [expandedSubject, setExpandedSubject] = useState(null); 
  const [quizHistory, setQuizHistory] = useState([]);
  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyLength, setHistoryLength] = useState(0);
  const [canMoveOn, setCanMoveOn] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [studentProgress, setStudentProgress] = useState({ submitted: 0, total: 0 });

  const mediaRecorderRef = useRef(null); const audioChunksRef = useRef([]); const audioContextRef = useRef(null); const roomInputRef = useRef(null); const fileInputRef = useRef(null); const cameraInputRef = useRef(null); const messagesEndRef = useRef(null); const recTimerRef = useRef(null);

  const unlockAudio = () => { if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)(); if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume(); };
  const handleLogout = () => { localStorage.removeItem("bs_room"); localStorage.removeItem("bs_user"); window.location.reload(); };
  const joinRoom = () => { if (username && roomCode) { setQuizHistory([]); socket.emit('join_room', { roomCode, username }); } else toast.error("Enter Details"); };
  const handleAnswer = (opt, index) => { setSelectedOptionIndex(index); socket.emit('submit_answer', { roomCode, answerIndex: index, username }); };
  const navPrev = () => { socket.emit('nav_prev', { roomCode }); setHistoryIndex(prev => Math.max(0, prev - 1)); };
  const handleSmartNext = () => { if (isHistoryMode && historyIndex < historyLength - 1) { socket.emit('nav_next', { roomCode }); setHistoryIndex(prev => prev + 1); } else { socket.emit('start_quiz', { roomCode, subject: "Continued", topics: selectedTopics, forceNew: false }); } };
  const setLimitAndOpenMenu = (limit) => { setQuestionLimit(limit.toString()); setMenuOpen(true); if (document.activeElement) document.activeElement.blur(); };
  const handleStart = () => { if (gameState === 'lobby' && selectedTopics.length === 0) return toast.error("Select at least 1 topic!"); setGameState('loading'); setMenuOpen(false); const safeLimit = questionLimit.trim() === "" ? -1 : parseInt(questionLimit); socket.emit('start_quiz', { roomCode, subject: selectedSubject, topics: selectedTopics, limit: isNaN(safeLimit) ? 10 : safeLimit, forceNew: true }); };
  const startRecording = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorderRef.current = new MediaRecorder(stream); audioChunksRef.current = []; mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); }; mediaRecorderRef.current.onstop = () => { const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); const reader = new FileReader(); reader.readAsDataURL(audioBlob); reader.onloadend = () => { const msg = { username, text: "", image: null, audio: reader.result, time: new Date().toLocaleTimeString() }; setMessages(prev => [...prev, msg]); socket.emit('send_message', { roomCode, ...msg }); }; stream.getTracks().forEach(track => track.stop()); }; mediaRecorderRef.current.start(); setRecState('holding'); setRecTime(0); setRecStartTime(Date.now()); if (recTimerRef.current) clearInterval(recTimerRef.current); recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000); } catch (err) { toast.error("Microphone access denied!"); } };
  const stopRecordingAndSend = () => { if (Date.now() - recStartTime < 300 && recState === 'holding') { setRecState('locked'); return; } if (mediaRecorderRef.current && (recState === 'holding' || recState === 'locked')) { mediaRecorderRef.current.onstop = () => { const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); const reader = new FileReader(); reader.readAsDataURL(audioBlob); reader.onloadend = () => { const msg = { username, text: "", image: null, audio: reader.result, time: new Date().toLocaleTimeString() }; setMessages(prev => [...prev, msg]); socket.emit('send_message', { roomCode, ...msg }); }; }; mediaRecorderRef.current.stop(); } resetRecUI(); };
  const cancelRecording = () => { if (mediaRecorderRef.current) mediaRecorderRef.current.stop(); resetRecUI(); toast("Discarded 🗑️"); };
  const lockRecording = () => { setRecState('locked'); };
  const resetRecUI = () => { setRecState('idle'); setRecTime(0); if (recTimerRef.current) clearInterval(recTimerRef.current); };
  const handleTouchMove = (e) => { if (recState !== 'holding') return; const touch = e.touches[0]; if (touch.clientY < window.innerHeight - 150) lockRecording(); if (touch.clientX < window.innerWidth / 2) cancelRecording(); };
  const sendMessage = () => { if(chatInput.trim() !== "") { const msg = { username, text: chatInput, image: null, audio: null, time: new Date().toLocaleTimeString() }; setMessages(prev => [...prev, msg]); socket.emit('send_message', { roomCode, ...msg }); setChatInput(""); } };
  const handleImageUpload = (e) => { setShowCamOptions(false); if(e.target.files[0]) compressImage(e.target.files[0], (dataUrl) => { const msg = { username, text: "", image: dataUrl, audio: null, time: new Date().toLocaleTimeString() }; setMessages(prev => [...prev, msg]); socket.emit('send_message', { roomCode, ...msg }); }); };
  const toggleTopic = (prompt) => { setSelectedTopics(prev => prev.includes(prompt) ? prev.filter(t => t !== prompt) : [...prev, prompt]); };
  const toggleSubject = (sub) => { if(expandedSubject === sub) { setExpandedSubject(null); } else { setExpandedSubject(sub); } };
  const getCorrectIndex = () => roundResult?.correctIndex ?? 0;
  const downloadPDF = () => { if (!quizHistory || quizHistory.length === 0) return toast.error("No questions to save."); const doc = new jsPDF(); let y = 20; doc.setFontSize(22); doc.text("BrainSync - Quiz Report", 20, y); y += 10; doc.setFontSize(10); doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, y); y += 20; quizHistory.forEach((q, i) => { if(y > 270) { doc.addPage(); y = 20; } let plainQ = q.question.replace(/\$/g, ''); doc.text(`Q${i+1}. ${plainQ}`, 20, y); y += 10; q.options.forEach((opt, idx) => { if(y > 280) { doc.addPage(); y = 20; } let plainOpt = opt.replace(/\$/g, ''); doc.text(`   (${getLetter(idx)}) ${plainOpt}`, 20, y); y += 6; }); y += 8; }); doc.save("BrainSync_Quiz.pdf"); toast.success("PDF Downloaded! 📥"); };
  const formatRecTime = (s) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;

  useEffect(() => { if (roomCode && username) { socket.emit('rejoin_room', { roomCode, username }); unlockAudio(); } }, []);

  useEffect(() => {
    socket.on('set_role', ({ role }) => { setRole(role); if (gameState === 'menu') setGameState('lobby'); localStorage.setItem("bs_room", roomCode); localStorage.setItem("bs_user", username); unlockAudio(); });
    socket.on('error_message', (msg) => { toast.error(msg); handleLogout(); });
    
    // 🟢 SAFE DATA HANDLER
    socket.on('new_question', (data) => {
      try {
          const cleanData = sanitizeQuestionData(data);
          if(!cleanData || !cleanData.options) throw new Error("Invalid Data");
          setQuestion(cleanData);
          setRoundResult(null); setSelectedOptionIndex(null); setGameState('playing'); setIsHistoryMode(false); setHistoryLength(prev => { const newLen = prev + 1;  return newLen; }); setHistoryIndex(prev => prev + 1);
      } catch (e) {
          console.error("Crash prevented:", e);
          setGameState('lobby');
          toast.error("Question Error. Trying again...");
      }
    });

    socket.on('lock_host', () => setCanMoveOn(false));
    socket.on('unlock_host', () => { if(!canMoveOn) toast.success("Unlocked! 🔓"); setCanMoveOn(true); });
    socket.on('timer_update', (t) => setTimer(t));
    socket.on('update_scores', (s) => setScores(s));
    socket.on('progress_update', (data) => { setStudentProgress(data); });
    
    socket.on('round_result', (data) => { 
        const cleanData = { ...data, explanation: sanitizeText(data.explanation), correctAnswer: sanitizeText(data.correctAnswer) };
        setRoundResult(cleanData); setGameState('result'); if(data.isReview) setIsHistoryMode(true); 
    });

    socket.on('host_notification', ({ type, username }) => { toast(`${username}: ${type === 'stuck' ? 'Stuck 🤷' : 'Help!'}`, { icon: '📣' }); });
    socket.on('cheat_alert', ({ username }) => { toast.error(`⚠️ ${username} tab switched!`); new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(()=>{}); });
    socket.on('receive_message', (msg) => { setMessages(prev => [...prev, msg]); if(!chatOpen) toast("New Message 💬", { icon: '💬' }); });
    socket.on('game_over', ({ scores, history }) => { setGameState('lobby'); toast("Quiz Ended! 🏁"); setScores(scores); setQuizHistory(history || []); });
    const handleVisibilityChange = () => { if (document.hidden && gameState === 'playing' && role === 'member') socket.emit('tab_switch', { roomCode, username }); };
    document.addEventListener("visibilitychange", handleVisibilityChange); return () => { socket.off(); document.removeEventListener("visibilitychange", handleVisibilityChange); };
  }, [gameState, role, roomCode, username, chatOpen, canMoveOn]);

  useEffect(() => { if (messagesEndRef.current) { messagesEndRef.current.scrollIntoView({ behavior: "smooth" }); } }, [messages, chatOpen]);

  return (
    <ErrorBoundary>
    <div className="app-container">
      <Toaster position="top-center" />
      
      <style>{`
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow-x: hidden; background: #1a1a1a; color: white; font-family: -apple-system, sans-serif; }
        .app-container { display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 75px 20px 20px 20px; width: 100vw; box-sizing: border-box; }
        .top-header { position: fixed; top: 0; left: 0; right: 0; height: 55px; background: rgba(20,20,22,0.95); backdrop-filter: blur(12px); border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; z-index: 20000; }
        .top-header .logo-small { font-size: 1.3em; font-weight: 800; letter-spacing: -0.5px; }
        .top-header .header-right { display: flex; align-items: center; gap: 8px; }
        .card { background: #222; padding: 2rem; border-radius: 16px; width: 100%; max-width: 750px; border: 1px solid #333; box-shadow: 0 10px 40px rgba(0,0,0,0.6); position: relative; max-height: calc(100vh - 100px); overflow-y: auto; }
        .logo { font-size: 2.5em; margin-bottom: 20px; text-shadow: 0 0 15px rgba(100,108,255,0.6); font-weight: 800; letter-spacing: -1px; }
        .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #444; position: sticky; top: 0; background: #1c1c1e; z-index: 10; padding-top: 8px; }
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
        .menu-btn { font-size: 15px; background: rgba(44, 44, 46, 0.8); border: 1px solid #444; color: white; padding: 7px 13px; border-radius: 12px; font-weight: 500; cursor: pointer; }
        .profile-btn { font-size: 20px; background: rgba(44, 44, 46, 0.8); border: 1px solid #444; color: white; padding: 6px; border-radius: 50%; width: 38px; height: 38px; cursor: pointer; display:flex; align-items:center; justify-content:center; }
        .chat-btn { position: fixed; bottom: 25px; right: 25px; font-size: 26px; background: #0A84FF; color: white; width: 60px; height: 60px; border-radius: 50%; border: none; box-shadow: 0 8px 20px rgba(10, 132, 255, 0.4); z-index: 20000; display: flex; align-items: center; justify-content: center; transition: 0.3s; }
        .chat-btn:hover { transform: scale(1.1); }
        .profile-menu { position: fixed; top: 60px; right: 15px; background: rgba(44, 44, 46, 0.95); border: 1px solid #555; padding: 15px; border-radius: 16px; z-index: 20001; width: 200px; }
        .sidebar { position: fixed; top: 55px; left: 0; width: 320px; height: calc(100dvh - 55px); background: #1c1c1e; padding: 20px; z-index: 20001; border-right: 1px solid #333; overflow-y: auto; box-sizing: border-box; }
        .sub-list { padding-left: 15px; border-left: 2px solid #444; margin-top: 5px; }
        .explanation-box { max-height: 250px; overflow-y: auto; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 12px; margin-top: 15px; border: 1px solid rgba(255,255,255,0.1); }
        .explanation-box::-webkit-scrollbar { width: 8px; }
        .explanation-box::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
        .chat-sidebar { position: fixed; top: 55px; right: 0; width: 350px; height: calc(100% - 55px); background: rgba(28, 28, 30, 0.95); z-index: 10002; border-left: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; box-shadow: -10px 0 30px rgba(0,0,0,0.5); }
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
        .cam-popup { position: absolute; bottom: 80px; left: 15px; background: rgba(44, 44, 46, 0.95); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 5px; z-index: 10002; }
        .cam-popup button { background: transparent; color: white; border: none; padding: 10px 15px; text-align: left; cursor: pointer; border-radius: 8px; }
        .cam-popup button:hover { background: rgba(255,255,255,0.1); }
        .icon-btn { background: none; border: none; color: #0A84FF; font-size: 24px; cursor: pointer; padding: 5px; display: flex; align-items: center; justify-content: center; }
        .chat-input-field { flex: 1; padding: 10px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: #3a3a3c; color: white; font-size: 15px; outline: none; transition: 0.2s; }
        .send-btn { background: #0A84FF; border: none; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer;}
        .topic-row { display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #333; cursor: pointer; }
        .topic-row input { margin-right: 10px; width: 18px; height: 18px; accent-color: #0A84FF; }
        @keyframes galaxy { 100% { transform: rotate(360deg); } }
        @keyframes brainPulse { 0%, 100% { filter: drop-shadow(0 0 20px rgba(100,108,255,0.8)) drop-shadow(0 0 40px rgba(94,92,230,0.4)); transform: scale(1); } 50% { filter: drop-shadow(0 0 60px rgba(100,108,255,1)) drop-shadow(0 0 100px rgba(94,92,230,0.9)); transform: scale(1.08); } }
        .galaxy-ring { width: 50px; height: 50px; border-radius: 50%; background: conic-gradient(#0A84FF, #FF3B30, #FFD60A, #34C759, #0A84FF); mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #fff 0); animation: galaxy 1s linear infinite; margin: 20px auto; }
        @media (max-width: 600px) { .chat-sidebar { width: 100%; } .grid { grid-template-columns: 1fr; } .menu-btn { font-size: 13px; padding: 6px 10px; } .profile-btn { width: 35px; height: 35px; } .chat-btn { bottom: 20px; right: 20px; width: 50px; height: 50px; font-size: 22px; } .sidebar { width: 100%; max-width: 100%; border-right: none; } }
      `}</style>

      {gameState !== 'menu' && (
        <div className="top-header">
          <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰ Topics</button>
          <div className="logo-small" onClick={() => { if(gameState !== 'menu') { setGameState('lobby'); setRoundResult(null); setSelectedTopics([]); } }} style={{cursor: gameState !== 'menu' ? 'pointer' : 'default', userSelect: 'none'}}>🧠 BrainSync</div>
          <button className="profile-btn" onClick={() => setProfileOpen(!profileOpen)}>👤</button>
        </div>
      )}
      {gameState !== 'menu' && !chatOpen && <button className="chat-btn" onClick={() => setChatOpen(!chatOpen)}>💬</button>}
      {profileOpen && gameState !== 'menu' && (<div className="profile-menu"><h4 style={{margin:'0 0 10px 0', borderBottom:'1px solid #444', paddingBottom:5}}>{username}</h4><div style={{fontSize:12, color:'#aaa', marginBottom:15}}>Room: {roomCode}</div><div style={{fontSize:12, color:'#aaa', marginBottom:15}}>Role: {role.toUpperCase()}</div><button onClick={handleLogout} style={{width:'100%', background:'#FF3B30', border:'none', color:'white', padding:10, borderRadius:10, cursor:'pointer', fontWeight: 600}}>Logout 🚪</button></div>)}
      {menuOpen && (<div className="sidebar"><div style={{display:'flex', justifyContent:'space-between', marginBottom:20, alignItems:'center', marginTop:10}}><h3 style={{margin: 0}}>Syllabus</h3><button onClick={()=>setMenuOpen(false)} style={{background:'none', border:'none', color:'white', fontSize:28, cursor:'pointer'}}>×</button></div><div style={{marginBottom:20}}>{Object.keys(SYLLABUS).map(subjectName => (<div key={subjectName}><button className="option-btn" onClick={() => { setSelectedSubject(subjectName); setExpandedSubject(prev => prev === subjectName ? null : subjectName); }} style={{width:'100%', marginBottom:10, minHeight:'auto', background: selectedSubject === subjectName ? '#1a3a5c' : ''}}>{subjectName} {expandedSubject === subjectName ? '▼' : '▶'}</button>{expandedSubject === subjectName && (<div className="sub-list">{SYLLABUS[subjectName].map(m => (<div key={m.id} className="topic-row" onClick={() => toggleTopic(m.prompt)}><input type="checkbox" readOnly checked={selectedTopics.includes(m.prompt)} /><span>{m.name}</span></div>))}</div>)}</div>))}</div><div style={{display:'flex', gap:10, marginTop: 20}}><button onClick={handleStart} style={{flex:1, padding: '12px', background: selectedTopics.length > 0 ? '#0A84FF' : '#444', color: selectedTopics.length > 0 ? 'white' : '#888', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: selectedTopics.length > 0 ? 'pointer' : 'not-allowed'}}>🚀 Start Quiz</button><button onClick={() => setMenuOpen(false)} style={{width: '80px', padding: '12px', background: '#34C759', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px'}}>✅</button></div></div>)}
      {chatOpen && (<div className="chat-sidebar"><div className="chat-header"><h3 style={{margin: 0}}>Group Chat</h3><button onClick={() => setChatOpen(false)} style={{background:'none', border:'none', color:'#0A84FF', fontSize:28, cursor:'pointer'}}>×</button></div><div className="chat-messages">{messages.map((m, i) => (<div key={i} className={`msg-bubble ${m.username === username ? 'mine' : ''}`}><div className="msg-user">{m.username} • {m.time}</div>{m.text && <div>{m.text}</div>}{m.image && <img src={m.image} className="msg-img" onClick={() => window.open(m.image)} />}{m.audio && <audio src={m.audio} controls className="msg-audio" />}</div>))}<div ref={messagesEndRef} /></div><div className="chat-input-area" onTouchMove={handleTouchMove}>{recState === 'locked' ? (<div className="rec-locked-container"><button onClick={cancelRecording} style={{background:'none', border:'none', color:'#FF3B30', fontSize:'20px'}}>❌</button><div className="rec-timer-container"><div className="rec-wave"><div className="rec-bar"></div><div className="rec-bar"></div><div className="rec-bar"></div><div className="rec-bar"></div><div className="rec-bar"></div></div><span>{formatRecTime(recTime)}</span></div><button onClick={stopRecordingAndSend} className="send-btn" style={{background:'#0A84FF', borderRadius:'50%', width:'40px', height:'40px'}}>➤</button></div>) : (<>{showCamOptions && (<div className="cam-popup"><button onClick={() => { cameraInputRef.current.click(); setShowCamOptions(false); }}>📸 Camera</button><button onClick={() => { fileInputRef.current.click(); setShowCamOptions(false); }}>📁 Upload File</button></div>)}<input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{display:'none'}} onChange={handleImageUpload} /><input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleImageUpload} /><button className="icon-btn" onClick={() => setShowCamOptions(!showCamOptions)}>📎</button><input className="chat-input-field" placeholder="Message..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />{chatInput.trim() !== "" ? (<button className="send-btn" onClick={sendMessage}>↑</button>) : (<button className={recState === 'holding' ? "mic-btn-hold" : "mic-btn"} onMouseDown={startRecording} onMouseUp={stopRecordingAndSend} onMouseLeave={stopRecordingAndSend} onTouchStart={(e) => { e.preventDefault(); startRecording(); }} onTouchEnd={(e) => { e.preventDefault(); stopRecordingAndSend(); }}>🎙️</button>)}</>)}</div></div>)}

      {/* MAIN GAME UI */}
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', width:'100%'}}>
        <h1 className="logo" style={{display:'none'}}>🧠 BrainSync</h1>
        {gameState === 'loading' && (<div className="card" style={{textAlign:'center', minHeight:300, display:'flex', flexDirection:'column', justifyContent:'center'}}><div className="galaxy-ring"></div><h2>Generating Exam Question... ✨</h2></div>)}
        {gameState === 'menu' && (<div className="card" style={{textAlign:'center'}}><div style={{fontSize:'4em', marginBottom:'8px', filter:'drop-shadow(0 0 20px rgba(100,108,255,0.8))', animation:'brainPulse 2s ease-in-out infinite'}}>🧠</div><h1 style={{fontSize:'2.4em', fontWeight:900, letterSpacing:'-1.5px', background:'linear-gradient(135deg, #0A84FF, #5E5CE6, #FF375F)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', margin:'0 0 20px 0'}}>BrainSync</h1><input className="input" style={{textAlign:'left'}} placeholder="Enter Name" onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && roomInputRef.current.focus()} /><input className="input" style={{textAlign:'left'}} ref={roomInputRef} placeholder="Room Code (101)" onChange={(e) => setRoomCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && joinRoom()} /><button className="primary-btn" onClick={joinRoom}>Enter Class</button></div>)}
        
        {/* HOST LOBBY */}
        {gameState === 'lobby' && role === 'host' && (
          <div className="card">
             <h3>👑 Host Controls</h3>
             {studentProgress.total > 0 && (<div style={{background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}><span style={{fontWeight:'bold'}}>👨‍🎓 Students Finished:</span><span style={{color: studentProgress.submitted === studentProgress.total ? '#34C759' : '#FFD60A', fontWeight:'bold', fontSize:'1.2em'}}>{studentProgress.submitted} / {studentProgress.total}</span></div>)}
             <p>1. Select Number of Questions:</p>
             <div style={{display:'flex', gap:10, marginBottom:20, flexWrap:'wrap'}}>{[10, 15, 20].map(n => <button key={n} onClick={() => setLimitAndOpenMenu(n)} style={{background: questionLimit===n.toString()?'#0A84FF':'#2c2c2e', color:'white', border:'none', padding:'12px 20px', borderRadius:12, fontSize:16, flex:1}}>{n}</button>)}<input type="number" placeholder="Custom #" value={questionLimit} onChange={(e) => setQuestionLimit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); setMenuOpen(true); }}} style={{background:'#2c2c2e', color:'white', border:'1px solid #444', padding:'12px', borderRadius:12, fontSize:16, width:100, textAlign:'center'}} /></div>
             <p>2. Select Topics from ☰ Menu.</p>
             <button onClick={handleStart} disabled={selectedTopics.length === 0} className="primary-btn" style={{background: selectedTopics.length > 0 ? '#34C759' : '#444', color: selectedTopics.length > 0 ? 'white' : '#888', cursor: selectedTopics.length > 0 ? 'pointer' : 'not-allowed'}}>{selectedTopics.length > 0 ? `🚀 Start Quiz (${selectedTopics.length} Topics)` : "⚠️ Select Topics First"}</button>
             {quizHistory && quizHistory.length > 0 && (<button onClick={downloadPDF} style={{width:'100%', background:'#FF3B30', color:'white', border:'none', padding:14, borderRadius:12, marginTop:15, fontWeight:'bold'}}>📥 Download Current Session PDF</button>)}
          </div>
        )}

        {/* MEMBER LOBBY */}
        {gameState === 'lobby' && role === 'member' && (<div className="card" style={{textAlign:'center'}}><h2>Waiting for Host... ☕</h2>{quizHistory && quizHistory.length > 0 && (<button onClick={downloadPDF} style={{width:'100%', background:'#FF3B30', color:'white', border:'none', padding:14, borderRadius:12, marginTop:20, fontWeight:'bold'}}>📥 Download Current Session PDF</button>)}</div>)}

        {/* QUESTION & RESULT */}
        {(gameState === 'playing' || gameState === 'result') && question && (
          <div className="card" style={{maxWidth: '800px', marginTop: '10px'}}>
            <div className="header-row">
                <div style={{fontSize:'1.2em', fontWeight:'bold', color: timer < 30 ? '#FF3B30' : '#34C759'}}>⏳ {formatTime(timer)}</div>
                <div className="marks-badge">🏆 {question.marks} Marks</div>
            </div>
            {gameState !== 'result' && question.topic && <div style={{fontSize:12, color:'rgba(255,255,255,0.5)', textAlign:'center', marginBottom:15, textTransform: 'uppercase', letterSpacing: 1}}>Topic: {question.topic}</div>}
            {gameState !== 'result' && <h3 style={{textAlign:'center', lineHeight:1.6, fontSize: '1.3em', marginBottom: '30px'}}><MathText text={question?.question || "Loading..."} /></h3>}
            {gameState !== 'result' && question.exam_year && (<div style={{marginBottom:30, textAlign:'center', fontSize: '0.9em', color: '#FFD60A', border: '1px solid #FFD60A', display: 'inline-block', padding: '4px 10px', borderRadius: '15px', marginLeft: 'auto', marginRight: 'auto', display: 'table'}}>📚 Exam: {question.exam_year}</div>)}

            {gameState === 'playing' && (<div className="grid">{question?.options?.map((opt, i) => (<button key={i} className={`option-btn ${selectedOptionIndex === i ? 'selected' : ''}`} onClick={() => handleAnswer(opt, i)} disabled={selectedOptionIndex !== null}><div className="option-badge">{getLetter(i)}</div><div style={{flex:1, overflow:'hidden', fontSize: '1.1em'}}><MathText text={opt} /></div></button>))}</div>)}

            {gameState === 'result' && roundResult && (
              <div style={{marginTop:20, paddingTop:20, borderTop:'1px solid #444', overflowY:'auto', maxHeight:'calc(100vh - 180px)'}}>
                <h2 style={{color: roundResult.isCorrect ? '#34C759' : '#FF3B30', textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap: 10}}>{roundResult.isCorrect ? "✅ Correct!" : "❌ Wrong!"}</h2>
                {!roundResult.isCorrect && selectedOptionIndex !== null && (<div style={{background:'rgba(255, 59, 48, 0.1)', padding:12, borderRadius:12, marginBottom:10, border:'1px solid rgba(255, 59, 48, 0.3)'}}><strong style={{color:'#FF3B30'}}>You Chose: Option {getLetter(selectedOptionIndex)}</strong></div>)}
                <div style={{background:'rgba(52, 199, 89, 0.1)', padding:15, borderRadius:12, marginBottom:10, border:'1px solid rgba(52, 199, 89, 0.3)'}}><strong style={{color:'#34C759'}}>Correct Answer: Option {getLetter(getCorrectIndex())}</strong><div style={{marginTop:8, fontSize: '1.2em'}}><MathText text={roundResult.correctAnswer} /></div></div>
                <div className="explanation-box"><div style={{color:'rgba(255,255,255,0.9)', fontSize:'1.05em', lineHeight: 1.6}}><MathText text={roundResult.explanation} /></div></div>
              </div>
            )}
            {role === 'host' && (
              <div className="host-controls">
                <button onClick={navPrev} style={{background:'#2c2c2e', border:'none', color:'white', padding:'10px 20px', borderRadius:10}}>⬅ Prev</button>
                <button onClick={() => socket.emit('host_action', {roomCode, action:'add'})} style={{background:'#2c2c2e', border:'none', color:'#FFD60A', padding:'10px 20px', borderRadius:10}}>+60s</button>
                <button onClick={() => handleSmartNext()} disabled={!isHistoryMode && studentProgress.submitted < studentProgress.total} style={{background: (isHistoryMode || studentProgress.submitted === studentProgress.total) ? '#0A84FF' : '#444', border:'none', color: (isHistoryMode || studentProgress.submitted === studentProgress.total) ? 'white' : '#888', padding:'10px 20px', borderRadius:10, marginLeft:10, cursor: (isHistoryMode || studentProgress.submitted === studentProgress.total) ? 'pointer' : 'not-allowed', fontWeight: 'bold'}}>{isHistoryMode ? "Next (Rev) ➡" : (studentProgress.submitted < studentProgress.total ? `Wait (${studentProgress.submitted}/${studentProgress.total}) 🔒` : "Next ➡")}</button>
              </div>
            )}
          </div>
        )}

        {gameState !== 'menu' && Object.keys(scores).length > 0 && (<div className="card" style={{marginTop:20, background:'#1c1c1e', border:'1px solid rgba(255,255,255,0.1)'}}><h3 style={{borderBottom:'1px solid rgba(255,255,255,0.1)', paddingBottom:15, marginTop: 0}}>🏆 Live Scores</h3>{Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([u, s], i) => (<div key={u} style={{display:'flex', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.05)', color: i===0?'#FFD60A':'white', fontSize: 16}}><span>{i+1}. {u}</span><span style={{fontWeight:'bold'}}>{Number(s || 0)} Marks</span></div>))}</div>)}
      </div>
    </div>
    </ErrorBoundary>
  );
}
export default App;
