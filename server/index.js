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

// Using a public free tier key - if this fails, the backup logic below takes over
const groq = new Groq({ apiKey: "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" });
const rooms = {}; 

console.log("🚀 SERVER v45.0 - FALLBACK PROTECTION ACTIVE");

// 🟢 SAFE CLEANER: Accepts anything, returns string
function cleanLatex(str) {
    if (!str) return "";
    return String(str)
        .replace(/f\\frac/g, '\\frac') 
        .replace(/\\f/g, 'f')
        .replace(/rac\{/g, '\\frac{')
        .replace(/\\left\s+/g, '\\left')
        .replace(/\\right\s+/g, '\\right')
        .trim();
}

// 🟢 BACKUP QUESTIONS (Used if AI Fails)
const BACKUP_QUESTIONS = [
    {
        question: "Solve the differential equation $ \\frac{dy}{dx} = y $",
        options: ["$ y = e^x $", "$ y = ce^x $", "$ y = e^{-x} $", "$ y = x $"],
        answer: "$ y = ce^x $",
        explanation: "Separation of variables: $ \\frac{dy}{y} = dx \\implies \\ln y = x + c $.",
        correctIndex: 1, marks: 5, topic: "Calculus"
    },
    {
        question: "What is the intrinsic carrier concentration $ n_i $ related to band gap $ E_g $?",
        options: ["$ n_i \\propto e^{-E_g/kT} $", "$ n_i \\propto e^{E_g/kT} $", "$ n_i \\propto T $", "$ n_i \\propto E_g $"],
        answer: "$ n_i \\propto e^{-E_g/kT} $",
        explanation: "Carrier concentration decreases exponentially with band gap.",
        correctIndex: 0, marks: 5, topic: "Semiconductors"
    }
];

async function generateAIQuestion(subject, topicsArray, attempt = 1) {
  const topic = (topicsArray && topicsArray.length > 0) ? topicsArray[Math.floor(Math.random() * topicsArray.length)] : "General";
  
  try {
    const prompt = `Create one Engineering multiple-choice question.
    Subject: ${subject}. Topic: ${topic}.
    Output JSON ONLY. Schema: {"question": "$ latex $", "options": ["$ A $", "$ B $", "$ C $", "$ D $"], "answer": "$ A $", "explanation": "text", "marks": 5}`;
    
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: prompt }], 
        model: "llama-3.1-8b-instant",
        temperature: 0.5,
        response_format: { type: "json_object" } 
    });
    
    let content = res.choices[0].message.content;
    if (!content) throw new Error("Empty AI Response");
    
    let data = JSON.parse(content);

    // Validate Data
    if (!data.question || !Array.isArray(data.options)) throw new Error("Invalid JSON Structure");

    // Clean Data
    data.question = cleanLatex(data.question);
    data.options = data.options.map(o => cleanLatex(o));
    data.answer = cleanLatex(data.answer);
    data.explanation = cleanLatex(data.explanation);
    
    // Find Correct Index
    let cleanAns = String(data.answer).trim();
    let correctIndex = data.options.findIndex(opt => opt.includes(cleanAns) || cleanAns.includes(opt));
    if (correctIndex === -1) { correctIndex = 0; data.options[0] = data.answer; } // Force correct answer if missing
    
    data.correctIndex = correctIndex;
    data.topic = topic;
    
    return data;

  } catch (e) { 
    console.error("⚠️ AI FAILED:", e.message);
    // 🟢 RETURN BACKUP QUESTION INSTEAD OF CRASHING
    const backup = BACKUP_QUESTIONS[Math.floor(Math.random() * BACKUP_QUESTIONS.length)];
    return { ...backup, topic: "Backup (" + topic + ")" };
  }
}

// ... (Rest of socket logic remains standard) ...
function broadcastProgress(roomCode) {
    if (!rooms[roomCode]) return;
    const room = rooms[roomCode];
    const totalStudents = Math.max(0, room.users.length - 1); 
    const submittedCount = room.submittedUsers ? room.submittedUsers.size : 0;
    io.to(roomCode).emit('progress_update', { submitted: submittedCount, total: totalStudents });
}

io.on('connection', (socket) => {
  socket.on('rejoin_room', ({ roomCode, username }) => {
    if (rooms[roomCode]) {
      socket.join(roomCode);
      socket.emit('set_role', { role: rooms[roomCode].hostUsername === username ? 'host' : 'member' });
      if (rooms[roomCode].currentQuestion) socket.emit('new_question', rooms[roomCode].currentQuestion);
      socket.emit('update_scores', rooms[roomCode].scores);
      broadcastProgress(roomCode);
    } else { socket.emit('error_message', "Room expired."); }
  });

  socket.on('join_room', ({ roomCode, username }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { 
        users: [], hostId: socket.id, hostUsername: username, 
        currentQuestion: null, scores: {}, history: [], 
        historyIndex: -1, questionLimit: -1, questionCount: 0, 
        canMoveOn: false, selectedTopics: ["General"],
        submittedUsers: new Set()
    };
    
    rooms[roomCode].users = rooms[roomCode].users.filter(u => u.username !== username);
    rooms[roomCode].users.push({ id: socket.id, username });
    
    if (!rooms[roomCode].scores[username]) rooms[roomCode].scores[username] = 0;
    if (rooms[roomCode].hostUsername === username) rooms[roomCode].hostId = socket.id;
    
    socket.emit('set_role', { role: rooms[roomCode].hostUsername === username ? 'host' : 'member' });
    io.to(roomCode).emit('update_scores', rooms[roomCode].scores);
    broadcastProgress(roomCode);
  });

  socket.on('disconnecting', () => {
      const roomsJoined = [...socket.rooms];
      roomsJoined.forEach(roomCode => {
          if (rooms[roomCode]) {
              rooms[roomCode].users = rooms[roomCode].users.filter(u => u.id !== socket.id);
              broadcastProgress(roomCode);
          }
      });
  });

  socket.on('send_message', (data) => socket.to(data.roomCode).volatile.emit('receive_message', { ...data, time: new Date().toLocaleTimeString() }));
  
  socket.on('start_quiz', async ({ roomCode, subject, topics, limit, forceNew }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    if (topics && topics.length > 0) room.selectedTopics = topics;
    
    if (forceNew) {
        room.questionCount = 0; room.history = []; room.historyIndex = -1;
        room.currentQuestion = null; room.canMoveOn = false; room.subject = subject; 
        if (limit !== undefined) room.questionLimit = parseInt(limit);
    }
    
    if (!forceNew && room.questionLimit !== -1 && room.questionCount >= room.questionLimit) {
      io.to(roomCode).emit('game_over', { scores: room.scores, history: room.history });
      return;
    }

    // Generate Question (Will use backup if AI fails)
    const qData = await generateAIQuestion(room.subject || subject, room.selectedTopics);
    
    room.history.push(qData);
    room.historyIndex = room.history.length - 1;
    room.currentQuestion = qData;
    room.questionCount++;
    room.timeLeft = 420; room.timerRunning = true; room.canMoveOn = false;
    room.submittedUsers = new Set(); 

    io.to(roomCode).emit('new_question', qData);
    broadcastProgress(roomCode);

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
    if (!room) return;
    if (room.historyIndex < room.history.length - 1) {
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
    
    room.submittedUsers.add(username);
    broadcastProgress(roomCode);

    const isCorrect = (answerIndex === room.currentQuestion.correctIndex);
    if (isCorrect) {
       room.scores[username] = (room.scores[username] || 0) + (room.currentQuestion.marks || 5);
       io.to(roomCode).emit('update_scores', room.scores);
    }
    
    const totalStudents = Math.max(0, room.users.length - 1);
    if (room.submittedUsers.size >= totalStudents) {
        room.canMoveOn = true;
        if(room.hostId) io.to(room.hostId).emit('unlock_host');
    }
    
    socket.emit('round_result', { correctIndex: room.currentQuestion.correctIndex, correctAnswer: room.currentQuestion.answer, explanation: room.currentQuestion.explanation, isCorrect });
  });

  socket.on('host_action', ({ roomCode, action }) => {
    const room = rooms[roomCode];
    if (room) {
        if (action === 'add') room.timeLeft += 60;
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
});

server.listen(3001, () => console.log('SERVER ON 3001'));