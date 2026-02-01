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

// 🧠 AI GENERATOR (FIXED RANDOM MARKS)
async function generateAIQuestion(subject, topic) {
  // 1. Force Random Marks Here
  const possibleMarks = [5, 6, 7, 8, 10];
  const marks = possibleMarks[Math.floor(Math.random() * possibleMarks.length)];

  const prompt = `Act as an Engineering Math Professor.
  Generate ONE multiple-choice question worth ${marks} Marks.
  Subject: ${subject}, Topic: ${topic}.
  
  Difficulty Level:
  - ${marks} Marks Question (Make it ${marks >= 8 ? "Complex/Hard" : "Medium/Conceptual"}).

  STRICT JSON FORMAT (Do not include markdown formatting like \`\`\`json):
  {
    "question": "Question text with LaTeX",
    "options": ["A", "B", "C", "D"],
    "answer": "Exact option text",
    "explanation": "Solution."
  }`;
  
  try {
    const res = await groq.chat.completions.create({ 
      messages: [{ role: "user", content: prompt }], 
      model: "llama-3.3-70b-versatile", 
      response_format: { type: "json_object" } 
    });
    
    const parsedData = JSON.parse(res.choices[0].message.content);
    
    // 2. Overwrite marks with our random value to be safe
    parsedData.marks = marks; 
    return parsedData;

  } catch (e) { 
    console.error("AI Error:", e);
    // 3. Fallback also uses the random marks!
    return { 
      question: "Could not generate question. Please try Next.", 
      options: ["Error", "Try", "Next", "Button"], 
      answer: "Next", 
      explanation: "AI Service Error.", 
      marks: marks 
    }; 
  }
}

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
      rooms[roomCode] = { 
        users: [], hostId: socket.id, currentQuestion: null, history: [], historyIndex: -1, scores: {}, currentTopic: "General", questionLimit: -1, questionCount: 0 
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

  socket.on('start_quiz', async ({ roomCode, subject, difficulty }) => {
    const room = rooms[roomCode];
    if (!room) return;

    if (difficulty) room.currentTopic = difficulty;

    if (room.questionLimit !== -1 && room.questionCount >= room.questionLimit) {
      io.to(roomCode).emit('game_over', { scores: room.scores });
      return;
    }

    // Generate with Dynamic Marks
    const qData = await generateAIQuestion(subject, room.currentTopic);
    
    room.history.push(qData);
    room.historyIndex = room.history.length - 1;
    room.currentQuestion = qData;
    room.questionCount++;
    room.timeLeft = 420; 
    room.timerRunning = true;

    io.to(roomCode).emit('new_question', qData);
    
    if (room.interval) clearInterval(room.interval);
    room.interval = setInterval(() => {
      if (room.timerRunning) {
        room.timeLeft--;
        io.to(roomCode).emit('timer_update', room.timeLeft);
        if (room.timeLeft <= 0) clearInterval(room.interval);
      }
    }, 1000);
  });

  // Navigation Logic
  socket.on('nav_prev', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex > 0) {
      room.historyIndex--;
      const prevQ = room.history[room.historyIndex];
      room.currentQuestion = prevQ;
      io.to(roomCode).emit('new_question', prevQ); 
      io.to(roomCode).emit('round_result', { correctAnswer: prevQ.answer, explanation: prevQ.explanation, isReview: true });
    }
  });

  socket.on('nav_next', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex < room.history.length - 1) {
      room.historyIndex++;
      const nextQ = room.history[room.historyIndex];
      room.currentQuestion = nextQ;
      io.to(roomCode).emit('new_question', nextQ);
      io.to(roomCode).emit('round_result', { correctAnswer: nextQ.answer, explanation: nextQ.explanation, isReview: true });
    }
  });

  socket.on('submit_answer', ({ roomCode, answer, username }) => {
    const room = rooms[roomCode];
    if (!room || !room.currentQuestion) return;
    
    const isCorrect = room.currentQuestion.answer === answer;
    if (isCorrect) {
       // Use the dynamic marks for scoring!
       room.scores[username] = (room.scores[username] || 0) + (room.currentQuestion.marks || 5);
       io.to(roomCode).emit('update_scores', room.scores);
    }
    socket.emit('round_result', { correctAnswer: room.currentQuestion.answer, explanation: room.currentQuestion.explanation, isCorrect });
  });

  socket.on('host_action', ({ roomCode, action }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (action === 'add') room.timeLeft += 60;
    if (action === 'pause') room.timerRunning = !room.timerRunning;
    io.to(roomCode).emit('timer_update', room.timeLeft);
  });

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