import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import 'katex/dist/katex.min.css'; 
import { InlineMath } from 'react-katex';

// 🔗 CONNECT
const socket = io.connect("https://brainsync-server.onrender.com"); 

// 🧠 MATH RENDERER
const MathText = ({ text }) => {
  if (!text) return null;
  let cleanText = text.replace(/\\/g, '\\'); 
  // Force basic cleanup for common LaTeX issues
  cleanText = cleanText.replace(/\\\(/g, '$').replace(/\\\)/g, '$').replace(/\\\[/g, '$').replace(/\\\]/g, '$');
  
  // Split by $ for inline math
  const parts = cleanText.split('$');
  return (
    <span>
      {parts.map((part, index) => {
        return index % 2 === 0 ? <span key={index}>{part}</span> : <InlineMath key={index} math={part} />;
      })}
    </span>
  );
};

const SYLLABUS = {
  "Applied Mathematics-II": [
    { id: "m1", name: "Module 1: Diff Eq (1st Order)", prompt: "Exact differential Equations, Equations reducible to exact form" },
    { id: "m2", name: "Module 2: LDE (Higher Order)", prompt: "Linear Differential Equation with constant coefficient" },
    { id: "m3", name: "Module 3: Beta, Gamma & DUIS", prompt: "Beta and Gamma functions, DUIS" },
    { id: "m4", name: "Module 4: Double Integration", prompt: "Double integration definition, Evaluation" },
    { id: "m5", name: "Module 5: Triple Integration", prompt: "Triple integration definition, Cartesian, cylindrical" },
    { id: "m6", name: "Module 6: Numerical Methods", prompt: "Euler's method, Runge-Kutta fourth order" }
  ]
};

function App() {
  const [gameState, setGameState] = useState('menu'); 
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState(null);
  const [roundResult, setRoundResult] = useState(null); 
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  
  // 🎙️ VOICE STATE
  const [isListening, setIsListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);

  useEffect(() => {
    socket.on('new_question', (data) => {
      setQuestion(data);
      setRoundResult(null); 
      setSelectedOption(null);
      setGameState('playing');
    });

    socket.on('round_result', (data) => {
      setRoundResult(data);
      setGameState('result');
    });

    socket.on('ai_voice_reply', ({ text }) => {
      speakText(text);
    });

    return () => socket.off();
  }, []);

  const speakText = (text) => {
    // Stop any current speech
    window.speechSynthesis.cancel();
    setAiSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setAiSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Browser does not support Voice. Use Chrome/Edge.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    setIsListening(true);
    recognition.onstart = () => console.log("Mic On...");
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      socket.emit('ask_ai', { roomCode, userQuery: transcript });
    };
    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  const joinRoom = () => {
    if (username && roomCode) {
      socket.emit('join_room', { roomCode, username });
      setMenuOpen(true); 
    }
  };

  const startTopicQuiz = (prompt) => {
    setGameState('loading'); 
    setMenuOpen(false); 
    socket.emit('start_quiz', { roomCode, subject: "Applied Mathematics-II", difficulty: prompt, marks: 6 });
  };

  const handleAnswer = (opt) => {
    setSelectedOption(opt);
    socket.emit('submit_answer', { roomCode, answer: opt });
  };

  const isCorrect = roundResult && selectedOption === roundResult.correctAnswer;

  return (
    <div style={styles.appContainer}>
      {/* 🟢 INLINE STYLES FOR SPINNER (Cannot be cached!) */}
      <style>{`
        @keyframes galaxySpin { 100% { transform: rotate(360deg); } }
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
        .galaxy-ring {
           width: 70px; height: 70px; border-radius: 50%;
           background: conic-gradient(#4285F4, #EA4335, #FBBC05, #34A853, #4285F4);
           mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #fff 0);
           -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #fff 0);
           animation: galaxySpin 1s linear infinite;
           margin: 0 auto 20px auto;
        }
      `}</style>

      {/* VERSION CHECKER */}
      <div style={{position:'absolute', top:5, right:5, fontSize:10, color:'#555'}}>v3.0 (Voice+Galaxy)</div>

      {gameState !== 'menu' && (
        <button style={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
      )}

      {menuOpen && (
        <div style={styles.sidebar}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:20}}>
            <h3>Syllabus</h3>
            <button onClick={() => setMenuOpen(false)} style={{background:'none', border:'none', color:'white', fontSize:20}}>×</button>
          </div>
          {SYLLABUS["Applied Mathematics-II"].map(m => (
             <button key={m.id} style={styles.subtopicBtn} onClick={() => startTopicQuiz(m.prompt)}>{m.name}</button>
          ))}
        </div>
      )}

      <div style={styles.gameArea}>
        <h1 style={styles.logo}>🧠 BrainSync</h1>
        
        {/* 🟢 LOADING SCREEN */}
        {gameState === 'loading' && (
           <div style={styles.cardCenter}>
             <div className="galaxy-ring"></div>
             <h2 style={{animation: 'pulse 1.5s infinite'}}>BrainSync is Thinking... ✨</h2>
           </div>
        )}

        {/* MENU */}
        {gameState === 'menu' && (
          <div style={styles.card}>
            <h2>Student Login</h2>
            <input placeholder="Name" style={styles.input} onChange={(e) => setUsername(e.target.value)} />
            <input placeholder="Room Code" style={styles.input} onChange={(e) => setRoomCode(e.target.value)} />
            <button onClick={joinRoom} style={styles.primaryBtn}>Start Quiz</button>
          </div>
        )}

        {/* GAME & RESULT */}
        {(gameState === 'playing' || gameState === 'result') && question && (
          <div style={styles.card}>
            <h3 style={{lineHeight:1.6}}><MathText text={question.question} /></h3>
            
            {/* 🟢 MIC BUTTON */}
            <div style={{textAlign: 'right', marginBottom: 15}}>
               <button onClick={startListening} style={{
                   background: isListening ? '#ff4757' : (aiSpeaking ? '#f1c40f' : '#2ecc71'),
                   color: 'white', border: 'none', padding: '8px 15px', borderRadius: '50px', cursor: 'pointer', fontWeight:'bold'
               }}>
                 {isListening ? "Listening... 🛑" : (aiSpeaking ? "Speaking... 🔊" : "🎤 Ask Doubt")}
               </button>
            </div>

            {gameState === 'playing' && (
              <div style={styles.grid}>
                {question.options.map((opt, i) => (
                  <button 
                    key={i} 
                    style={{
                      ...styles.optionBtn, 
                      ...(selectedOption === opt ? styles.selected : {})
                    }}
                    onClick={() => handleAnswer(opt)}
                    disabled={selectedOption !== null}
                  >
                    <MathText text={opt} />
                  </button>
                ))}
              </div>
            )}

            {gameState === 'result' && roundResult && (
              <div style={{marginTop:20, borderTop:'1px solid #444', paddingTop:20}}>
                <h2 style={{color: isCorrect ? '#4caf50' : '#ff4757', textAlign:'center'}}>
                  {isCorrect ? "✅ Correct!" : "❌ Wrong!"}
                </h2>
                
                <div style={styles.resultBlock}>
                  <strong style={{color:'#aaa'}}>Correct Answer:</strong>
                  <div style={{color:'#4caf50', fontSize:18, marginTop:5}}><MathText text={roundResult.correctAnswer} /></div>
                </div>

                <div style={styles.resultBlock}>
                  <strong style={{color:'#aaa'}}>Explanation:</strong>
                  <div style={{marginTop:5, lineHeight:1.5}}><MathText text={roundResult.explanation} /></div>
                </div>

                <button onClick={() => startTopicQuiz("General")} style={styles.primaryBtn}>Next Question ➡️</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 🟢 INTERNAL STYLES (NO CACHE ISSUES)
const styles = {
  appContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', color: 'white', minHeight:'100vh', padding: 20 },
  card: { background: '#2a2a2a', padding: '2rem', borderRadius: 15, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', width: '100%', maxWidth: 600 },
  cardCenter: { background: '#2a2a2a', padding: '3rem', borderRadius: 15, width: '100%', maxWidth: 600, textAlign:'center', minHeight:300, display:'flex', flexDirection:'column', justifyContent:'center' },
  logo: { marginBottom: '2rem', fontSize: '2.5em', textShadow: '0 0 10px rgba(100, 108, 255, 0.5)' },
  input: { padding: 12, margin: '10px 0', width: '100%', borderRadius: 5, border: '1px solid #444', background: '#333', color: 'white', fontSize: 16 },
  primaryBtn: { background: '#646cff', color: 'white', padding: '12px 20px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 16, width: '100%', marginTop: 15, fontWeight: 'bold' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 },
  optionBtn: { background: '#333', color: 'white', padding: 15, border: '1px solid #444', borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: '0.2s' },
  selected: { background: '#4285F4', borderColor: 'white' },
  menuBtn: { position: 'fixed', top: 20, left: 20, fontSize: 18, background: '#222', border: '1px solid #444', color: 'white', padding: '8px 12px', borderRadius: 5, cursor: 'pointer', zIndex: 1000 },
  sidebar: { position: 'fixed', top: 0, left: 0, width: 320, height: '100%', background: '#1a1a1a', padding: 20, zIndex: 999, overflowY: 'auto' },
  subtopicBtn: { display:'block', width:'100%', textAlign:'left', padding:10, background:'transparent', color:'#ccc', border:'none', marginBottom:5, cursor:'pointer', borderBottom:'1px solid #333' },
  resultBlock: { background:'#1e1e1e', padding:15, borderRadius:8, marginTop:15 }
};

export default App;