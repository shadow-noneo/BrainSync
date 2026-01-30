import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

// 🔗 CONNECT TO SERVER 
const socket = io.connect("https://brainsync-phi.vercel.app"); 

// 📚 SYLLABUS DATA (Directly inside here to prevent errors)
const SYLLABUS = {
  "Applied Mathematics-II": [
    { id: "m1", name: "Module 1: Differential Eq (1st Order)", prompt: "First Order First Degree Differential Equations, Exact equations, and Bernoulli's equation" },
    { id: "m2", name: "Module 2: LDE (Higher Order)", prompt: "Higher Order Linear Differential Equations with Constant Coefficients, Method of Variation of Parameters, Cauchy's & Legendre's" },
    { id: "m3", name: "Module 3: Beta, Gamma & DUIS", prompt: "Beta and Gamma Functions, properties, and Differentiation Under Integral Sign (DUIS)" },
    { id: "m4", name: "Module 4: Double Integration", prompt: "Double Integration, Change of Order, Evaluation in Polar Coordinates" },
    { id: "m5", name: "Module 5: Triple Integration", prompt: "Triple Integration, Cartesian/Cylindrical/Spherical coordinates, Area and Mass calculation" },
    { id: "m6", name: "Module 6: Numerical Methods", prompt: "Numerical solutions of ODE (Euler, Runge-Kutta 4th order) and Numerical Integration (Trapezoidal, Simpson's 1/3rd & 3/8th)" }
  ]
};

function App() {
  const [gameState, setGameState] = useState('menu'); // menu, playing, result
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  
  const [question, setQuestion] = useState(null);
  const [roundResult, setRoundResult] = useState(null); 
  
  const [timer, setTimer] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [currentTopic, setCurrentTopic] = useState(null); 

  useEffect(() => {
    socket.on('update_room', (data) => console.log("Room Updated", data));
    
    socket.on('new_question', (data) => {
      setQuestion(data);
      setRoundResult(null); 
      setGameState('playing');
    });

    socket.on('timer_update', (time) => setTimer(time));
    
    // 🟢 NO POPUP: This saves the result to the screen instead
    socket.on('round_result', (data) => {
      setRoundResult(data);
      setGameState('result');
    });

    return () => socket.off();
  }, []);

  const joinRoom = () => {
    if (username && roomCode) {
      socket.emit('join_room', { roomCode, username });
      // Removed the alert here too, just a console log
      console.log("Joined Room");
      setMenuOpen(true); // Auto-open menu
    }
  };

  const startTopicQuiz = (topicPrompt) => {
    setCurrentTopic(topicPrompt); 
    const marks = Math.floor(Math.random() * 4) + 5; 
    
    socket.emit('start_quiz', { 
      roomCode, 
      subject: "Applied Mathematics-II", 
      difficulty: topicPrompt, 
      marks 
    });
    setMenuOpen(false);
  };

  const nextQuestion = () => {
    if (currentTopic) {
      // 🟡 Set Loading State
      setGameState('loading');
      startTopicQuiz(currentTopic);
    }
  };

  return (
    <div className="app-container">
      {/* ☰ MENU BUTTON */}
      <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰ Topics</button>

      {/* 📂 SIDEBAR */}
      {menuOpen && (
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>Maths-II Syllabus</h3>
            <button className="close-btn" onClick={() => setMenuOpen(false)}>×</button>
          </div>
          
          <div className="subject-list">
            {Object.keys(SYLLABUS).map((subject) => (
              <div key={subject}>
                <div className="subtopic-list">
                    {SYLLABUS[subject].map((module) => (
                      <button 
                        key={module.id} 
                        className="subtopic-btn"
                        onClick={() => startTopicQuiz(module.prompt)}
                      >
                        {module.name}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🎮 GAME AREA */}
      <div className="game-area">
        <h1 className="logo">🧠 BrainSync v2.0</h1>
        
        {gameState === 'loading' && (
           <div className="card">
             <h2>🔄 Generating Question...</h2>
             <p>The AI is writing a new problem for you.</p>
           </div>
        )}

        {gameState === 'menu' && (
          <div className="card login-box">
            <h2>Student Login</h2>
            <input placeholder="Enter Name" onChange={(e) => setUsername(e.target.value)} />
            <input placeholder="Room Code (e.g. 101)" onChange={(e) => setRoomCode(e.target.value)} />
            <button onClick={joinRoom} className="primary-btn">Join Class</button>
          </div>
        )}

        {gameState === 'playing' && question && (
          <div className="card quiz-box">
            <div className="timer-badge">⏳ {timer}s</div>
            <h3 className="question-text">{question.question}</h3>
            <div className="options-grid">
              {question.options.map((opt, i) => (
                <button key={i} className="option-btn" onClick={() => socket.emit('submit_answer', { roomCode, answer: opt })}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === 'result' && roundResult && (
          <div className="card result-box">
            <h2>📝 Solution</h2>
            
            <div className="result-answer">
              <strong>Correct Answer:</strong>
              <p>{roundResult.correctAnswer}</p>
            </div>

            <div className="result-explanation">
              <strong>Explanation:</strong>
              <p>{roundResult.explanation}</p>
            </div>

            <button onClick={nextQuestion} className="primary-btn next-btn">
              Next Question ➡️
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;