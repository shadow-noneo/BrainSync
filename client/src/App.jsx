import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import 'katex/dist/katex.min.css'; 
import { InlineMath } from 'react-katex';
import './App.css';

// 🔗 CONNECTED TO YOUR RENDER SERVER
const socket = io.connect("https://brainsync-server.onrender.com"); 

// 🧠 MATH RENDERER
const MathText = ({ text }) => {
  if (!text) return null;
  const parts = text.split('$');
  return (
    <span>
      {parts.map((part, index) => {
        return index % 2 === 0 ? (
          <span key={index}>{part}</span>
        ) : (
          <InlineMath key={index} math={part} />
        );
      })}
    </span>
  );
};

// 📚 SYLLABUS
const SYLLABUS = {
  "Applied Mathematics-II": [
    { id: "m1", name: "Module 1: Diff Eq (1st Order)", prompt: "Exact differential Equations, Equations reducible to exact form, Linear differential equations, Bernoulli's equation" },
    { id: "m2", name: "Module 2: LDE (Higher Order)", prompt: "Linear Differential Equation with constant coefficient, Method of variation of parameters, Cauchy's homogeneous linear differential equation" },
    { id: "m3", name: "Module 3: Beta, Gamma & DUIS", prompt: "Beta and Gamma functions, DUIS (Differentiation Under Integral Sign), Rectification of curves" },
    { id: "m4", name: "Module 4: Double Integration", prompt: "Double integration definition, Evaluation, Change of order of integration, Polar coordinates" },
    { id: "m5", name: "Module 5: Triple Integration", prompt: "Triple integration definition, Cartesian, cylindrical and spherical polar coordinates, Area, Mass, Volume" },
    { id: "m6", name: "Module 6: Numerical Methods", prompt: "Euler's method, Runge-Kutta fourth order, Trapezoidal Rule, Simpson's 1/3rd and 3/8th rule" }
  ]
};

function App() {
  const [gameState, setGameState] = useState('menu'); 
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState(null);
  const [roundResult, setRoundResult] = useState(null); 
  const [timer, setTimer] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentTopic, setCurrentTopic] = useState(null); 
  const [selectedSubject, setSelectedSubject] = useState(null);

  useEffect(() => {
    socket.on('update_room', (data) => console.log("Room Updated", data));
    
    socket.on('new_question', (data) => {
      setQuestion(data);
      setRoundResult(null); 
      setGameState('playing');
    });

    socket.on('timer_update', (time) => setTimer(time));
    
    socket.on('round_result', (data) => {
      setRoundResult(data);
      setGameState('result');
    });

    return () => socket.off();
  }, []);

  const joinRoom = () => {
    if (username && roomCode) {
      socket.emit('join_room', { roomCode, username });
      setMenuOpen(true); 
    }
  };

  const startTopicQuiz = (topicPrompt) => {
    setCurrentTopic(topicPrompt); 
    setGameState('loading'); 
    setMenuOpen(false); 
    
    const marks = Math.floor(Math.random() * 4) + 5; 
    
    socket.emit('start_quiz', { 
      roomCode, 
      subject: "Applied Mathematics-II", 
      difficulty: topicPrompt, 
      marks 
    });
  };

  const nextQuestion = () => {
    if (currentTopic) {
      setGameState('loading');
      setRoundResult(null); 
      startTopicQuiz(currentTopic);
    }
  };

  const toggleSubject = (subject) => {
    if (selectedSubject === subject) {
      setSelectedSubject(null);
    } else {
      setSelectedSubject(subject);
    }
  };

  return (
    <div className="app-container">
      
      {gameState !== 'menu' && (
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰ Topics</button>
      )}

      {menuOpen && (
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>Syllabus</h3>
            <button className="close-btn" onClick={() => setMenuOpen(false)}>×</button>
          </div>
          
          <div className="subject-list">
            {Object.keys(SYLLABUS).map((subject) => (
              <div key={subject} className="subject-group">
                <button 
                  className="subject-btn" 
                  onClick={() => toggleSubject(subject)}
                >
                  {subject} {selectedSubject === subject ? '▼' : '▶'}
                </button>

                {selectedSubject === subject && (
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
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="game-area">
        <h1 className="logo">🧠 BrainSync</h1>
        
        {gameState === 'loading' && (
           <div className="card">
             <h2>🔄 Generating Math...</h2>
             <div className="loader"></div>
           </div>
        )}

        {gameState === 'menu' && (
          <div className="card login-box">
            <h2>Student Login</h2>
            <input placeholder="Enter Name" onChange={(e) => setUsername(e.target.value)} />
            <input placeholder="Room Code (e.g. 101)" onChange={(e) => setRoomCode(e.target.value)} />
            {/* 🔴 FIX: Changed Text Here */}
            <button onClick={joinRoom} className="primary-btn">Start Quiz</button>
          </div>
        )}

        {gameState === 'playing' && question && (
          <div className="card quiz-box">
            <div className="timer-badge">⏳ {timer}s</div>
            <h3 className="question-text">
              <MathText text={question.question} />
            </h3>
            <div className="options-grid">
              {question.options.map((opt, i) => (
                <button key={i} className="option-btn" onClick={() => socket.emit('submit_answer', { roomCode, answer: opt })}>
                  <MathText text={opt} />
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
              <div className="math-block">
                 <MathText text={roundResult.correctAnswer} />
              </div>
            </div>
            <div className="result-explanation">
              <strong>Explanation:</strong>
              <div className="math-explanation">
                <MathText text={roundResult.explanation} />
              </div>
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