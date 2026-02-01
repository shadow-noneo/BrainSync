require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const groq = new Groq({ apiKey: "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" });

const rooms = {}; 

// 🧠 AI GENERATOR
async function generateAIQuestion(subject, topic, marks) {
  const prompt = `Act as an Engineering Math Professor. Generate 1 MCQ worth ${marks} marks.
  Subject: ${subject}, Topic: ${topic}.
  STRICT JSON FORMAT:
  {
    "question": "Question text using LaTeX",
    "options": ["A", "B", "C", "D"],
    "answer": "Exact text of correct option",
    "explanation": "Short solution."
  }`;
  
  try {
    const res = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: "llama-3.3-70b-versatile", response_format: { type: "json_object" } });
    return JSON.parse(res.choices[0].message.content);
  } catch (e) { return { question: "Error", options: [], answer: "", explanation: "" }; }
}

// 🎙️ DOUBT SOLVER
async function solveDoubt(q, d) {
  try {
    const res = await groq.chat.completions.create({ messages: [{ role: "user", content: `Context: ${q}. Doubt: ${d}. Explain simply.` }], model: "llama-3.3-70b-versatile" });
    return res.choices[0].message.content;
  } catch (e) { return "I couldn't hear that."; }
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      // 👑 INIT ROOM
      rooms[roomCode] = { 
        users: [], 
        hostId: socket.id, 
        currentQuestion: null, 
        history: [], // Stores past questions
        historyIndex: -1, // Where are we in history?
        scores: {}, 
        currentTopic: "General",
        questionLimit: -1, // -1 = Unlimited
        questionCount: 0
      };
    }
    const room = rooms[roomCode];
    room.users.push({ id: socket.id, username });
    if (!room.scores[username]) room.scores[username] = 0;

    const isHost = room.hostId === socket.id;
    socket.emit('set_role', { role: isHost ? 'host' : 'member' });
    io.to(roomCode).emit('update_scores', room.scores);
  });

  socket.on('set_settings', ({ roomCode, limit }) => {
    if (rooms[roomCode]) rooms[roomCode].questionLimit = limit;
  });

  socket.on('start_quiz', async ({ roomCode, subject, difficulty, marks }) => {
    const room = rooms[roomCode];
    if (!room) return;

    // Sticky Topic Logic
    if (difficulty) room.currentTopic = difficulty;

    // Check Limit
    if (room.questionLimit !== -1 && room.questionCount >= room.questionLimit) {
      io.to(roomCode).emit('game_over', { scores: room.scores });
      return;
    }

    const qData = await generateAIQuestion(subject, room.currentTopic, marks);
    qData.marks = marks; // Store marks value
    
    // Add to History
    room.history.push(qData);
    room.historyIndex = room.history.length - 1;
    room.currentQuestion = qData;
    room.questionCount++;
    
    room.timeLeft = 420; 
    room.timerRunning = true;

    io.to(roomCode).emit('new_question', qData);
    
    // Timer Logic
    if (room.interval) clearInterval(room.interval);
    room.interval = setInterval(() => {
      if (room.timerRunning) {
        room.timeLeft--;
        io.to(roomCode).emit('timer_update', room.timeLeft);
        if (room.timeLeft <= 0) clearInterval(room.interval);
      }
    }, 1000);
  });

  // ⏪ PREVIOUS QUESTION
  socket.on('nav_prev', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex > 0) {
      room.historyIndex--;
      const prevQ = room.history[room.historyIndex];
      room.currentQuestion = prevQ;
      // Show result state for review
      io.to(roomCode).emit('round_result', { 
        correctAnswer: prevQ.answer, 
        explanation: prevQ.explanation, 
        isReview: true 
      });
    }
  });

  // ⏩ NEXT (If reviewing old question)
  socket.on('nav_next', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex < room.history.length - 1) {
      room.historyIndex++;
      const nextQ = room.history[room.historyIndex];
      room.currentQuestion = nextQ;
      io.to(roomCode).emit('round_result', { 
        correctAnswer: nextQ.answer, 
        explanation: nextQ.explanation, 
        isReview: true 
      });
    }
  });

  socket.on('submit_answer', ({ roomCode, answer, username }) => {
    const room = rooms[roomCode];
    if (!room || !room.currentQuestion) return;
    
    const isCorrect = room.currentQuestion.answer === answer;
    if (isCorrect) {
       room.scores[username] = (room.scores[username] || 0) + room.currentQuestion.marks;
       io.to(roomCode).emit('update_scores', room.scores);
    }

    // Send result ONLY to the user who answered (so others can still play)
    socket.emit('round_result', { 
      correctAnswer: room.currentQuestion.answer, 
      explanation: room.currentQuestion.explanation,
      isCorrect 
    });
  });

  socket.on('host_action', ({ roomCode, action }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (action === 'add') room.timeLeft += 60;
    if (action === 'pause') room.timerRunning = !room.timerRunning;
    io.to(roomCode).emit('timer_update', room.timeLeft);
  });

  // 🎓 MEMBER REQUESTS
  socket.on('student_signal', ({ roomCode, type, username }) => {
    const room = rooms[roomCode];
    if (room && room.hostId) io.to(room.hostId).emit('host_notification', { type, username });
  });

  socket.on('ask_ai', async ({ roomCode, userQuery }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const ans = await solveDoubt(room.currentQuestion.question, userQuery);
    socket.emit('ai_voice_reply', { text: ans });
  });
});

server.listen(3001, () => console.log('SERVER ON 3001'));