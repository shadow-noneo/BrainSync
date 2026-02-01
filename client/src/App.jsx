import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import 'katex/dist/katex.min.css'; 
import { InlineMath } from 'react-katex';
import { Toaster, toast } from 'react-hot-toast';

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

function App() {
  const [gameState, setGameState] = useState('menu'); 
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('member'); 
  const [question, setQuestion] = useState(null);
  const [roundResult, setRoundResult] = useState(null); 
  const [timer, setTimer] = useState(420);
  const [selectedOption, setSelectedOption] = useState(null);
  const [scores, setScores] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [questionLimit, setQuestionLimit] = useState(-1);
  const [isHistoryMode, setIsHistoryMode] = useState(false); // Track if we are reviewing
  
  const [isListening, setIsListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);

  const roomInputRef = useRef(null);

  useEffect(() => {
    socket.on('set_role', ({ role }) => { setRole(role); setGameState('lobby'); toast.success(`Joined as ${role.toUpperCase()}`); });
    
    socket.on('new_question', (data) => {
      setQuestion(data);
      setRoundResult(null); 
      setSelectedOption(null);
      setGameState('playing');
      setIsHistoryMode(false); // Reset history mode on new question
    });

    socket.on('timer_update', (t) => setTimer(t));
    socket.on('update_scores', (s) => setScores(s));
    
    socket.on('round_result', (data) => { 
        setRoundResult(data); 
        setGameState('result'); 
        if(data.isReview) setIsHistoryMode(true);
    });

    socket.on('ai_voice_reply', ({ text }) => speakText(text));

    socket.on('host_notification', ({ type, username }) => {
      toast(`${username} says: ${type === 'prev' ? 'Go Back!' : type === 'change' ? 'Change Topic!' : 'Help!'}`, { icon: '📣' });
    });

    return () => socket.off();
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
  
  const speakText = (text) => {
    window.speechSynthesis.cancel();
    setAiSpeaking(true);
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => setAiSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return toast.error("Use Chrome");
    const r = new SpeechRecognition();
    r.lang = 'en-US';
    setIsListening(true);
    r.onresult = (e) => { setIsListening(false); socket.emit('ask_ai', { roomCode, userQuery: e.results[0][0].transcript }); };
    r.start();
  };

  const joinRoom = () => { if (username && roomCode) socket.emit('join_room', { roomCode, username }); else toast.error("Enter Details"); };
  const startQuiz = (p) => { setGameState('loading'); socket.emit('start_quiz', { roomCode, subject: "Applied Mathematics-II", difficulty: p }); };
  const handleAnswer = (opt) => { setSelectedOption(opt); socket.emit('submit_answer', { roomCode, answer: opt, username }); };
  const setSettings = (limit) => { setQuestionLimit(limit); socket.emit('set_settings', { roomCode, limit }); toast.success(`Limit set to ${limit}`); };
  
  // Navigation
  const navPrev = () => { socket.emit('nav_prev', { roomCode }); setIsHistoryMode(true); };
  const navNextHistory = () => socket.emit('nav_next', { roomCode });

  const requestChange = () => socket.emit('student_signal', { roomCode, type: 'change', username });
  const requestPrev = () => socket.emit('student_signal', { roomCode, type: 'prev', username });

  return (
    <div className="app-container">
      <Toaster position="top-center" />
      <style>{`
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
        .option-btn { width: 100%; padding: 15px; background: #2a2a2a; color: #ddd; border: 1px solid #444; border-radius: 8px; text-align: left; }
        .selected { background: #4285F4; border-color: white; color: white; }
        .marks-badge { background: #f1c40f; color: black; padding: 5px 10px; border-radius: 20px; font-weight: bold; font-size: 12px; }
        .host-controls { display: flex; gap: 10px; margin-top: 15px; justify-content: center; padding-top:15px; border-top:1px solid #333; }
        .menu-btn { position: fixed; top: 20px; left: 20px; font-size: 16px; background: #222; border: 1px solid #444; color: white; padding: 8px 12px; border-radius: 5px; z-index: 1000; }
        .sidebar { position: fixed; top: 0; left: 0; width: 300px; height: 100%; background: #181818; padding: 20px; z-index: 999; border-right: 1px solid #333; overflow-y: auto; }
        .sub-list { padding-left: 15px; border-left: 2px solid #444; margin-top: 5px; }
        @keyframes galaxy { 100% { transform: rotate(360deg); } }
        .galaxy-ring { width: 50px; height: 50px; border-radius: 50%; background: conic-gradient(#4285F4, #EA4335, #FBBC05, #34A853, #4285F4); mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #fff 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #fff 0); animation: galaxy 1s linear infinite; margin: 20px auto; }
      `}</style>

      {gameState !== 'menu' && <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰ Topics</button>}
      {menuOpen && (
        <div className="sidebar">
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:20}}>
             <h3>Syllabus</h3><button onClick={()=>setMenuOpen(false)} style={{background:'none', border:'none', color:'white'}}>×</button>
          </div>
          <button className="option-btn" onClick={() => { if(selectedSubject === "Maths") setSelectedSubject(null); else setSelectedSubject("Maths"); }}>
            Applied Mathematics-II {selectedSubject === "Maths" ? '▼' : '▶'}
          </button>
          {selectedSubject === "Maths" && (
             <div className="sub-list">
               {SYLLABUS["Applied Mathematics-II"].map(m => (
                  <button key={m.id} style={{display:'block', width:'100%', textAlign:'left', padding:8, background:'none', color:'#ccc', border:'none', cursor:'pointer'}} onClick={() => { startQuiz(m.prompt); setMenuOpen(false); }}>
                    {m.name}
                  </button>
               ))}
             </div>
          )}
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
             <h3>👑 Host Settings</h3>
             <p>Select number of questions:</p>
             <div style={{display:'flex', gap:10, marginBottom:20}}>
                {[10, 15, 20].map(n => <button key={n} onClick={() => setSettings(n)} style={{background: questionLimit===n?'#646cff':'#333', color:'white', border:'none', padding:10, borderRadius:5}}>{n} Qs</button>)}
                <button onClick={() => setSettings(-1)} style={{background: questionLimit===-1?'#646cff':'#333', color:'white', border:'none', padding:10, borderRadius:5}}>Unlimited</button>
             </div>
             <p>Select a topic from the sidebar (☰) to start.</p>
          </div>
        )}

        {gameState === 'lobby' && role === 'member' && (
           <div className="card" style={{textAlign:'center'}}><h2>Waiting for Host... ☕</h2></div>
        )}

        {(gameState === 'playing' || gameState === 'result') && question && (
          <div className="card">
            <div className="header-row">
                <div style={{fontSize:'1.2em', fontWeight:'bold', color: timer < 30 ? '#ff4757' : '#2ecc71'}}>⏳ {formatTime(timer)}</div>
                <div className="marks-badge">🏆 {question.marks || 5} Marks</div>
                <button onClick={startListening} style={{background: isListening ? '#ff4757' : '#333', color:'white', border:'1px solid #555', borderRadius:'20px', padding:'6px 12px'}}>
                  {isListening ? "🛑" : (aiSpeaking ? "🔊" : "🎤 Doubt")}
                </button>
            </div>

            <h3 style={{textAlign:'center', lineHeight:1.5}}><MathText text={question.question} /></h3>

            {gameState === 'playing' && (
              <div className="grid">
                {question.options.map((opt, i) => (
                  <button key={i} className={`option-btn ${selectedOption === opt ? 'selected' : ''}`} onClick={() => handleAnswer(opt)} disabled={selectedOption !== null}>
                    <MathText text={opt} />
                  </button>
                ))}
              </div>
            )}

            {gameState === 'result' && roundResult && (
              <div style={{marginTop:20, paddingTop:20, borderTop:'1px solid #444'}}>
                <h2 style={{color: roundResult.isCorrect ? '#4caf50' : '#ff4757', textAlign:'center'}}>
                   {roundResult.isCorrect ? "✅ Correct!" : "❌ Wrong!"}
                </h2>
                <div style={{background:'#111', padding:15, borderRadius:8, marginBottom:10}}>
                   <strong>Answer:</strong> <MathText text={roundResult.correctAnswer} />
                </div>
                <div style={{color:'#aaa', fontSize:'0.9em'}}><MathText text={roundResult.explanation} /></div>
              </div>
            )}

            {/* 👑 HOST CONTROLS */}
            {role === 'host' && (
              <div className="host-controls">
                <button onClick={navPrev} style={{background:'#333', border:'none', color:'white', padding:'8px 15px', borderRadius:5}}>⬅ Prev</button>
                <button onClick={() => socket.emit('host_action', {roomCode, action:'add'})} style={{background:'#2d2d2d', border:'none', color:'#f1c40f', padding:'8px 15px', borderRadius:5}}>+60s</button>
                
                {/* 🟢 SMART NEXT BUTTON */}
                {isHistoryMode ? (
                   <button onClick={navNextHistory} style={{background:'#333', border:'none', color:'white', padding:'8px 15px', borderRadius:5, marginLeft:10}}>Next (Review) ➡</button>
                ) : (
                   <button onClick={() => startQuiz(question.topic || "General")} style={{background:'#646cff', border:'none', color:'white', padding:'8px 15px', borderRadius:5}}>Next Question ➡</button>
                )}
              </div>
            )}
            
            {role === 'member' && (
               <div style={{display:'flex', justifyContent:'center', gap:10, marginTop:15}}>
                  <button onClick={requestPrev} style={{background:'none', border:'1px solid #555', color:'#aaa', padding:'5px 10px', borderRadius:15, fontSize:12}}>Request Prev</button>
                  <button onClick={requestChange} style={{background:'none', border:'1px solid #555', color:'#aaa', padding:'5px 10px', borderRadius:15, fontSize:12}}>Request Topic Change</button>
               </div>
            )}
          </div>
        )}

        {Object.keys(scores).length > 0 && (
           <div className="card" style={{marginTop:20, background:'#1a1a1a', border:'1px solid #444'}}>
              <h3 style={{borderBottom:'1px solid #333', paddingBottom:10}}>🏆 Live Scores</h3>
              {Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([u, s], i) => (
                 <div key={u} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', color: i===0?'#f1c40f':'white'}}>
                    <span>{i+1}. {u}</span>
                    <span>{s} Marks</span>
                 </div>
              ))}
           </div>
        )}
      </div>
    </div>
  );
}

export default App;