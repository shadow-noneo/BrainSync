import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { SYLLABUS } from './syllabus';
import './App.css';

// 🔗 CONNECT TO SERVER (Make sure this matches your Vercel/Render setup)
const socket = io.connect("https://brainsync-nqgkl61j1-s-projects-222f23b8.vercel.app"); 

function App() {
  const [gameState, setGameState] = useState('menu'); // menu, playing, result
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  
  const [question, setQuestion] = useState(null);
  const [roundResult, setRoundResult] = useState(null); // Stores the answer/explanation
  
  const [timer, setTimer] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [currentTopic, setCurrentTopic] = useState(null); // Remembers topic for "Next Question"

  useEffect(() => {
    socket.on('update_room', (data) => console.log("Room Updated", data));
    
    socket.on('new_question', (data) => {
      setQuestion(data);
      setRoundResult(null); // Clear previous result
      setGameState('playing');
    });

    socket.on('timer_update', (time) => setTimer(time));
    
    // 🟢 NEW: Instead of alert(), we save data to show a nice UI
    socket.on('round_result', (data) => {
      setRoundResult(data);
      setGameState('result');
    });

    return () => socket.off();
  }, []);

  const joinRoom = () => {
    if (username && roomCode) {
      socket.emit('join_room', { roomCode, username });
      alert("Joined! Open the menu (☰) to pick a module.");
    }
  };

  const startTopicQuiz = (topicPrompt) => {
    setCurrentTopic(topicPrompt); // Save topic for "Next Question" button
    
    const marks = Math.floor(Math.random() * 4) + 5; // Random marks 5-8
    
    socket.emit('start_quiz', { 
      roomCode, 
      subject: "Applied Mathematics-II", 
      difficulty: topicPrompt, 
      marks 
    });
    setMenuOpen(false);
  };

  // Helper to trigger next question
  const nextQuestion = () => {
    if (currentTopic) {
      startTopicQuiz(currentTopic);
    }
  };

  return (
    <div className="app-container">
      {/* ☰ MENU BUTTON */}
      <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰ Syllabus</button>

      {/* 📂 SIDEBAR */}
      {menuOpen && (
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>Select Module</h3>
            <button className="close-btn" onClick={() => setMenuOpen(false)}>×</button>
          </div>
          
          <div className="subject-list">
            {Object.keys(SYLLABUS).map((subject) => (
              <div key={subject}>
                <div className="subject-title">{subject}</div>
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
        <h1 className="logo">🧠 BrainSync</h1>
        
        {/* 1. LOGIN SCREEN */}
        {gameState === 'menu' && (
          <div className="card login-box">
            <h2>Student Login</h2>
            <input placeholder="Enter Name" onChange={(e) => setUsername(e.target.value)} />
            <input placeholder="Room Code (e.g. 101)" onChange={(e) => setRoomCode(e.target.value)} />
            <button onClick={joinRoom} className="primary-btn">Join Class</button>
          </div>
        )}

        {/* 2. QUIZ SCREEN */}
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

        {/* 3. RESULT SCREEN (Replaces the Pop-up!) */}
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