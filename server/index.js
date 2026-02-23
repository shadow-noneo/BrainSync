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

console.log("🚀 SERVER v23.0 - PYQ EXAM MODE ENABLED");

function cleanJSON(text) {
    try { return JSON.parse(text); } catch (e) {
        const first = text.indexOf('{'), last = text.lastIndexOf('}');
        if (first !== -1 && last !== -1) {
            try { return JSON.parse(text.substring(first, last + 1)); } catch (e2) { return null; }
        }
        return null;
    }
}

async function generateAIQuestion(subject, topicsArray) {
  const topic = (topicsArray && topicsArray.length > 0) ? topicsArray[Math.floor(Math.random() * topicsArray.length)] : "General";
  const marks = [5, 6, 7, 8, 10][Math.floor(Math.random() * 5)];
  
  const randomSeed = Math.floor(Math.random() * 9999999);
  
  try {
    // 🟢 NEW PYQ INSTRUCTIONS FOR THE AI
    const prompt = `Act as a strict Engineering University Board Examiner. Generate ONE UNIQUE multiple-choice question (${marks} Marks) that perfectly mimics a standard university Previous Year Question (PYQ). 
    Subject: ${subject}, Topic: ${topic}. 
    Difficulty: Real Exam Level (Medium/Hard). 
    CRITICAL INSTRUCTION: This must look and feel exactly like a real past paper exam question. It should involve realistic engineering values or standard derivations. Make it completely unique (Randomizer Seed: ${randomSeed}). 
    STRICT JSON format. DO NOT use single letters like "A" or "C" for the answer field, write the EXACT string of the correct option. 
    Example format: {"question": "Evaluate the integral...", "options": ["x/2", "x/3", "x^2", "1"], "answer": "x/2", "explanation": "Using the standard reduction formula...", "marks": ${marks}}`;
    
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: prompt }], 
        model: "llama-3.3-70b-versatile",
        temperature: 0.9 
    });
    
    const data = cleanJSON(res.choices[0].message.content);
    if (!data) throw new Error("Invalid JSON received from AI");

    const cleanOpts = data.options.map(o => o.trim());
    const cleanAns = data.answer.trim();
    let correctIndex = cleanOpts.findIndex(o => o === cleanAns);
    
    if (correctIndex === -1 && cleanAns.length === 1) {
        const letterMatch = cleanAns.toUpperCase().charCodeAt(0) - 65; 
        if (letterMatch >= 0 && letterMatch < cleanOpts.length) {
            correctIndex = letterMatch;
            data.answer = cleanOpts[correctIndex]; 
        }
    }

    if (correctIndex === -1) { correctIndex = 0; data.options[0] = data.answer; }

    data.correctIndex = correctIndex; 
    data.marks = marks;
    data.topic = topic;
    return data;

  } catch (e) { 
    console.error("❌ AI ERROR:", e.message);
    return { 
        question: `AI Error: ${e.message}. Please check Server Logs.`, 
        options: ["Retry", "Check Key", "Restart", "Contact Host"], 
        answer: "Retry", 
        explanation: "The server failed to connect to Groq AI.", 
        correctIndex: 0, 
        marks: 0, 
        topic: "System Error" 
    }; 
  }
}

async function solveDoubt(q, d) {
  try {
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: `Context: ${q}. Doubt: ${d}. Explain METHOD ONLY. No formulas. 2 sentences.` }], 
        model: "llama-3.3-70b-versatile" 
    });
    return res.choices[0].message.content;
  } catch (e) { return "I cannot connect to the AI brain right now."; }
}

io.on('connection', (socket) => {
  socket.on('rejoin_room', ({ roomCode, username }) => {
    if (rooms[roomCode]) {
      socket.join(roomCode);
      socket.emit('set_role', { role: rooms[roomCode].hostUsername === username ? 'host' : 'member' });
      if (rooms[roomCode].currentQuestion) socket.emit('new_question', rooms[roomCode].currentQuestion);
      socket.emit('update_scores', rooms[roomCode].scores);
    } else { socket.emit('error_message', "Room expired."); }
  });

  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { users: [], hostId: socket.id, hostUsername: username, currentQuestion: null, scores: {}, history: [], historyIndex: -1, questionLimit: -1, questionCount: 0, canMoveOn: false, selectedTopics: ["General"] };
    rooms[roomCode].users.push({ id: socket.id, username });
    if (!rooms[roomCode].scores[username]) rooms[roomCode].scores[username] = 0;
    if (rooms[roomCode].hostUsername === username) rooms[roomCode].hostId = socket.id;
    socket.emit('set_role', { role: rooms[roomCode].hostUsername === username ? 'host' : 'member' });
    io.to(roomCode).emit('update_scores', rooms[roomCode].scores);
  });

  socket.on('send_message', (data) => socket.to(data.roomCode).volatile.emit('receive_message', { ...data, time: new Date().toLocaleTimeString() }));
  socket.on('send_audio_chunk', (data) => socket.to(data.roomCode).emit('receive_audio_chunk', data));

  socket.on('start_quiz', async ({ roomCode, subject, topics, limit, forceNew }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    if (forceNew) {
        room.questionCount = 0;
        room.history = [];
        room.historyIndex = -1;
        room.currentQuestion = null;
        room.canMoveOn = false;
        room.subject = subject; 
        if (limit !== undefined) room.questionLimit = parseInt(limit);
        if (topics) room.selectedTopics = topics;
    }
    
    if (!forceNew && room.questionLimit !== -1 && room.questionCount >= room.questionLimit) {
      io.to(roomCode).emit('game_over', { scores: room.scores, history: room.history });
      return;
    }

    const qData = await generateAIQuestion(room.subject || subject, room.selectedTopics);
    
    room.history.push(qData);
    room.historyIndex = room.history.length - 1;
    room.currentQuestion = qData;
    room.questionCount++;
    room.timeLeft = 420; room.timerRunning = true; room.canMoveOn = false;

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

  socket.on('nav_next', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex < room.history.length - 1) {
        room.historyIndex++;
        io.to(roomCode).emit('new_question', room.history[room.historyIndex]);
        io.to(roomCode).emit('round_result', { correctIndex: room.history[room.historyIndex].correctIndex, correctAnswer: room.history[room.historyIndex].answer, explanation: room.history[room.historyIndex].explanation, isReview: true });
    }
  });
  
  socket.on('nav_prev', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.historyIndex > 0) {
        room.historyIndex--;
        io.to(roomCode).emit('new_question', room.history[room.historyIndex]);
        io.to(roomCode).emit('round_result', { correctIndex: room.history[room.historyIndex].correctIndex, correctAnswer: room.history[room.historyIndex].answer, explanation: room.history[room.historyIndex].explanation, isReview: true });
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
    if (room) {
        if (action === 'add') room.timeLeft += 60;
        if (action === 'pause') room.timerRunning = !room.timerRunning;
        io.to(roomCode).emit('timer_update', room.timeLeft);
    }
  });

  socket.on('student_signal', ({ roomCode, type, username }) => {
    const room = rooms[roomCode];
    if (room && room.hostId) {
        io.to(room.hostId).emit('host_notification', { type, username });
        if (type === 'stuck') { room.canMoveOn = true; io.to(room.hostId).emit('unlock_host'); }
    }
  });

  socket.on('ask_ai', async ({ roomCode, userQuery }) => {
    const room = rooms[roomCode];
    if (room) socket.emit('ai_voice_reply', { text: await solveDoubt(room.currentQuestion.question, userQuery) });
  });
});

server.listen(3001, () => console.log('SERVER ON 3001'));