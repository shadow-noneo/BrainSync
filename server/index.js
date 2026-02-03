require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" }, 
  maxHttpBufferSize: 1e8, 
  pingInterval: 2000, 
  pingTimeout: 5000 
});

const groq = new Groq({ apiKey: "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" });

const rooms = {}; 

console.log("🚀 SERVER v13.0 - PDF REPORT READY");

async function generateAIQuestion(subject, topicsArray) {
  const topic = (topicsArray && topicsArray.length > 0) 
    ? topicsArray[Math.floor(Math.random() * topicsArray.length)] 
    : "General Engineering Math";

  const possibleMarks = [5, 6, 7, 8, 10];
  const marks = possibleMarks[Math.floor(Math.random() * possibleMarks.length)];
  
  try {
    const prompt = `Act as an Engineering Math Professor. Generate ONE multiple-choice question worth ${marks} Marks. Subject: ${subject}, Topic: ${topic}. Difficulty: ${marks >= 8 ? "Hard" : "Medium"}. STRICT JSON format only (no markdown): {"question": "LaTeX text", "options": ["A", "B", "C", "D"], "answer": "Exact option text", "explanation": "Sol.", "marks": ${marks}}`;
    
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: prompt }], 
        model: "llama-3.3-70b-versatile", 
    });
    
    let rawContent = res.choices[0].message.content;
    rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const data = JSON.parse(rawContent);
    const cleanOpts = data.options.map(o => o.trim());
    const cleanAns = data.answer.trim();
    let correctIndex = cleanOpts.findIndex(o => o === cleanAns);
    
    if (correctIndex === -1) { correctIndex = 0; data.options[0] = data.answer; }

    data.correctIndex = correctIndex; 
    data.marks = marks;
    data.topic = topic;
    return data;

  } catch (e) { 
    return { 
        question: "Could not generate question. Please try again.", 
        options: ["Retry", "Skip", "Reload", "Check Connection"], 
        answer: "Retry",
        correctIndex: 0, 
        explanation: "Server parsing error.", 
        marks: 0,
        topic: "Error"
    }; 
  }
}

async function solveDoubt(q, d) {
  try {
    const res = await groq.chat.completions.create({ 
      messages: [{ role: "user", content: `Context: ${q}. Doubt: ${d}. Explain METHOD ONLY in plain English. No formulas reading. 2 sentences max.` }], 
      model: "llama-3.3-70b-versatile" 
    });
    return res.choices[0].message.content;
  } catch (e) { return "I cannot connect to the AI."; }
}

io.on('connection', (socket) => {
  socket.on('rejoin_room', ({ roomCode, username }) => {
    if (rooms[roomCode]) {
      socket.join(roomCode);
      const room = rooms[roomCode];
      
      const userIndex = room.users.findIndex(u => u.username === username);
      if (userIndex !== -1) room.users[userIndex].id = socket.id;
      else room.users.push({ id: socket.id, username });

      let isHost = (room.hostUsername === username);
      if(isHost) room.hostId = socket.id;

      socket.emit('set_role', { role: isHost ? 'host' : 'member' });
      if (room.currentQuestion) socket.emit('new_question', room.currentQuestion);
      if (isHost && room.canMoveOn) socket.emit('unlock_host');
      socket.emit('update_scores', room.scores);
    } else {
      socket.emit('error_message', "Room expired.");
    }
  });

  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) {
        rooms[roomCode] = { 
            users: [], hostId: socket.id, hostUsername: username, currentQuestion: null, scores: {}, 
            history: [], historyIndex: -1, questionLimit: -1, questionCount: 0, 
            canMoveOn: false, selectedTopics: ["General"]
        };
    }
    const room = rooms[roomCode];
    room.users.push({ id: socket.id, username });
    if (typeof room.scores[username] === 'undefined') room.scores[username] = 0;

    const isHost = (room.hostUsername === username);
    if(isHost) room.hostId = socket.id;

    socket.emit('set_role', { role: isHost ? 'host' : 'member' });
    io.to(roomCode).emit('update_scores', room.scores);
  });

  socket.on('send_message', ({ roomCode, username, text, image }) => {
    socket.to(roomCode).volatile.emit('receive_message', { username, text, image, time: new Date().toLocaleTimeString() });
  });

  socket.on('send_audio_chunk', ({ roomCode, audioChunk, username }) => {
    socket.to(roomCode).emit('receive_audio_chunk', { audioChunk, username });
  });

  socket.on('tab_switch', ({ roomCode, username }) => {
    const room = rooms[roomCode];
    if (room && room.hostId) io.to(room.hostId).emit('cheat_alert', { username });
  });

  socket.on('start_quiz', async ({ roomCode, subject, topics, limit }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    if (topics) room.selectedTopics = topics;
    if (limit !== undefined) room.questionLimit = parseInt(limit);
    
    // 🟢 GAME OVER: SEND SCORES + HISTORY FOR PDF
    if (room.questionLimit !== -1 && room.questionCount >= room.questionLimit) {
      io.to(roomCode).emit('game_over', { scores: room.scores, history: room.history });
      return;
    }

    const qData = await generateAIQuestion(subject, room.selectedTopics);
    
    room.history.push(qData);
    room.historyIndex = room.history.length - 1;
    room.currentQuestion = qData;
    room.questionCount++;
    room.timeLeft = 420; 
    room.timerRunning = true;
    room.canMoveOn = false;

    io.to(roomCode).emit('new_question', qData);
    if (room.hostId) io.to(room.hostId).emit('lock_host');

    if (room.interval) clearInterval(room.interval);
    room.interval = setInterval(() => {
      if (room.timerRunning) {
        room.timeLeft--;
        io.to(roomCode).emit('timer_update', room.timeLeft);
        if (room.timeLeft <= 0) clearInterval(room.interval);
      }
    }, 1000);
  });

  socket.on('nav_prev', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex > 0) {
      room.historyIndex--;
      const q = room.history[room.historyIndex];
      room.currentQuestion = q;
      io.to(roomCode).emit('new_question', q);
      io.to(roomCode).emit('round_result', { correctIndex: q.correctIndex, correctAnswer: q.answer, explanation: q.explanation, isReview: true });
    }
  });

  socket.on('nav_next', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex < room.history.length - 1) {
      room.historyIndex++;
      const q = room.history[room.historyIndex];
      room.currentQuestion = q;
      io.to(roomCode).emit('new_question', q);
      io.to(roomCode).emit('round_result', { correctIndex: q.correctIndex, correctAnswer: q.answer, explanation: q.explanation, isReview: true });
    }
  });

  socket.on('submit_answer', ({ roomCode, answerIndex, username }) => {
    const room = rooms[roomCode];
    if (!room || !room.currentQuestion) return;
    const isCorrect = (answerIndex === room.currentQuestion.correctIndex);
    if (isCorrect) {
       room.scores[username] = (room.scores[username] || 0) + (room.currentQuestion.marks || 5);
       io.to(roomCode).emit('update_scores', room.scores);
    }
    if (!room.canMoveOn) {
        room.canMoveOn = true;
        if(room.hostId) io.to(room.hostId).emit('unlock_host');
    }
    socket.emit('round_result', { correctIndex: room.currentQuestion.correctIndex, correctAnswer: room.currentQuestion.answer, explanation: room.currentQuestion.explanation, isCorrect });
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
    if (room && room.hostId) {
        io.to(room.hostId).emit('host_notification', { type, username });
        if (type === 'stuck' && !room.canMoveOn) {
            room.canMoveOn = true;
            io.to(room.hostId).emit('unlock_host');
        }
    }
  });

  socket.on('ask_ai', async ({ roomCode, userQuery }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const ans = await solveDoubt(room.currentQuestion.question, userQuery);
    socket.emit('ai_voice_reply', { text: ans });
  });
});

server.listen(3001, () => console.log('SERVER ON 3001'));