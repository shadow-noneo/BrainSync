import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import 'katex/dist/katex.min.css'; 
import { InlineMath } from 'react-katex';
import './App.css';

// 🔗 CONNECT
const socket = io.connect("https://brainsync-server.onrender.com"); 

// 🧠 MATH RENDERER
const MathText = ({ text }) => {
  if (!text) return null;
  let cleanText = text.replace(/\\/g, '\\').replace(/\$/g, ''); // Simple cleanup
  // Re-add dollars for KaTeX
  if (text.includes('\\') || text.includes('^') || text.includes('_')) {
     return <InlineMath math={text} />;
  }
  return <span>{text}</span>;
};

// SYLLABUS (Kept same as before)
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

    // 🟢 HANDLE AI VOICE REPLY
    socket.on('ai_voice_reply', ({ text }) => {
      speakText(text);
    });

    return () => socket.off();
  }, []);

  // 🗣️ TEXT TO SPEECH
  const speakText = (text) => {
    setAiSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setAiSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // 🎙️ SPEECH TO TEXT
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
      console.log("You said:", transcript);
      setIsListening(false);
      // Send to AI
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
    <div className="app-container">
      {/* INJECT SPINNER STYLE */}
      <style>{`@keyframes nuclearSpin { 100% { transform: rotate(360deg); } }`}</style>

      {gameState !== 'menu' && (
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
      )}

      {menuOpen && (
        <div className="sidebar">
          <h3>Syllabus</h3>
          <button onClick={() => setMenuOpen(false)}>Close</button>
          {SYLLABUS["Applied Mathematics-II"].map(m => (
             <button key={m.id} className="subtopic-btn" onClick={() => startTopicQuiz(m.prompt)}>{m.name}</button>
          ))}
        </div>
      )}

      <div className="game-area">
        <h1 className="logo">🧠 BrainSync</h1>
        
        {gameState === 'loading' && (
           <div className="card" style={{textAlign:'center'}}>
             <div style={{width:'50px', height:'50px', borderRadius:'50%', border:'5px solid #4285F4', borderTopColor:'transparent', animation:'nuclearSpin 1s linear infinite', margin:'20px auto'}}></div>
             <h2>Thinking...</h2>
           </div>
        )}

        {gameState === 'menu' && (
          <div className="card login-box">
            <h2>Student Login</h2>
            <input placeholder="Name" onChange={(e) => setUsername(e.target.value)} />
            <input placeholder="Room Code" onChange={(e) => setRoomCode(e.target.value)} />
            <button onClick={joinRoom} className="primary-btn">Start Quiz</button>
          </div>
        )}

        {(gameState === 'playing' || gameState === 'result') && question && (
          <div className="card quiz-box">
            <h3 className="question-text"><MathText text={question.question} /></h3>
            
            {/* 🟢 MIC BUTTON */}
            <div style={{textAlign: 'right', marginBottom: '10px'}}>
               <button 
                 onClick={startListening} 
                 style={{
                   background: isListening ? '#ff4757' : '#2ecc71',
                   color: 'white', border: 'none', padding: '10px 15px', borderRadius: '50px', cursor: 'pointer', fontSize:'14px', fontWeight:'bold'
                 }}
               >
                 {isListening ? "Listening... 🛑" : (aiSpeaking ? "AI Speaking... 🔊" : "🎤 Discuss")}
               </button>
            </div>

            {gameState === 'playing' && (
              <div className="options-grid">
                {question.options.map((opt, i) => (
                  <button 
                    key={i} 
                    className={`option-btn ${selectedOption === opt ? 'selected' : ''}`} 
                    onClick={() => handleAnswer(opt)}
                    disabled={selectedOption !== null}
                  >
                    <MathText text={opt} />
                  </button>
                ))}
              </div>
            )}

            {gameState === 'result' && roundResult && (
              <div className="result-box">
                <h2 style={{color: isCorrect ? '#4caf50' : '#ff4757'}}>
                  {isCorrect ? "Correct!" : "Wrong!"}
                </h2>
                <div className="result-answer">
                  <strong>Answer:</strong> <MathText text={roundResult.correctAnswer} />
                </div>
                <div className="result-explanation">
                  <strong>Explanation:</strong> {roundResult.explanation}
                </div>
                <button onClick={() => startTopicQuiz("General")} className="primary-btn">Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;