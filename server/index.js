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

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const rooms = {}; 

console.log("🚀 SERVER v41.0 | KEY: " + (process.env.GROQ_API_KEY ? "✅ Loaded" : "❌ MISSING"));

function cleanLatex(str) {
    if (!str) return "";
    return String(str)
        .replace(/f\\frac/g, '\\frac') // Fixes "f\frac" bug
        .replace(/\\f/g, 'f')
        .replace(/rac\{/g, '\\frac{')
        .replace(/\\left\s+/g, '\\left')
        .replace(/\\right\s+/g, '\\right')
        .trim();
}

async function generateAIQuestion(subject, topicsArray, attempt = 1) {
  const topic = (topicsArray && topicsArray.length > 0) ? topicsArray[Math.floor(Math.random() * topicsArray.length)] : "General";
  const marks = [5, 6, 7, 8, 10][Math.floor(Math.random() * 5)];
  
  try {
    const prompt = `Act as an elite Engineering Professor. Create ONE multiple-choice question (${marks} Marks).
    Subject: ${subject}. Topic: ${topic}.
    
    RULES:
    1. Output ONLY valid JSON. No extra text outside the JSON.
    2. For math, use ONLY standard LaTeX wrapped in single dollar signs. NEVER start a LaTeX command with f. Write \\frac not f\\frac.
    3. Every option must be a COMPLETE answer, not just a letter like A or B.

    JSON Schema:
    {"question": "Calculate $ \\int x dx $", "options": ["$ x^2 $", "$ \\frac{x^2}{2} $"], "answer": "$ \\frac{x^2}{2} $", "explanation": "Power rule...", "marks": ${marks}, "topic": "${topic}", "exam_year": "May 2024"}`;
    
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: prompt }], 
        model: attempt === 1 ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant",
        temperature: 0.5,
        response_format: { type: "json_object" } 
    });
    
    let data = JSON.parse(res.choices[0].message.content);

    // 🟢 SERVER-SIDE CLEANING
    data.question = cleanLatex(data.question);
    data.options = data.options.map(o => cleanLatex(o));
    data.answer = cleanLatex(data.answer);
    data.explanation = cleanLatex(data.explanation);

    const cleanOpts = data.options.map(o => {
        let str = String(o).trim();
        while (/^[A-Da-d]\s*[\.\)]\s*/.test(str)) str = str.replace(/^[A-Da-d]\s*[\.\)]\s*/, '').trim();
        return str;
    });
    
    let cleanAns = String(data.answer).trim();
    while (/^[A-Da-d]\s*[\.\)]\s*/.test(cleanAns)) cleanAns = cleanAns.replace(/^[A-Da-d]\s*[\.\)]\s*/, '').trim();

    let optionsWithAnswer = cleanOpts.map(opt => ({ text: opt, isCorrect: opt === cleanAns }));
    if (!optionsWithAnswer.some(o => o.isCorrect)) {
        optionsWithAnswer[0].isCorrect = true;
        optionsWithAnswer[0].text = cleanAns;
    }
    optionsWithAnswer.sort(() => Math.random() - 0.5);
    
    data.options = optionsWithAnswer.map(o => o.text);
    data.correctIndex = optionsWithAnswer.findIndex(o => o.isCorrect);
    data.answer = data.options[data.correctIndex];
    data.topic = topic;

    return data;

  } catch (e) { 
    if (attempt < 2) return await generateAIQuestion(subject, topicsArray, 2);
    return { 
        question: "Math Generation Error. Please click Next.", 
        options: ["Error", "Error", "Error", "Error"], answer: "Error", explanation: "Error.", correctIndex: 0, marks: 0, topic: "System" 
    }; 
  }
}

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
  socket.on('send_audio_chunk', (data) => socket.to(data.roomCode).emit('receive_audio_chunk', data));

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

    const totalStudents = Math.max(0, room.users.length - 1);
    const submittedCount = room.submittedUsers.size;
    const isLatestQuestion = room.historyIndex === room.history.length - 1;

    if (isLatestQuestion && submittedCount < totalStudents) {
        if (room.hostId) io.to(room.hostId).emit('error_message', "Wait for all students to answer!");
        return;
    }

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
});

server.listen(3001, () => console.log('SERVER ON 3001'));
