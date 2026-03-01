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

console.log("🚀 SERVER v33.0 - NEP 2020 PYQ MODES");

async function generateAIQuestion(subject, topicsArray, attempt = 1) {
  const topic = (topicsArray && topicsArray.length > 0) ? topicsArray[Math.floor(Math.random() * topicsArray.length)] : "General";
  const marks = [5, 6, 7, 8, 10][Math.floor(Math.random() * 5)];
  
  try {
    // 🟢 UPDATED PROMPT: Forces NEP 2020 Era Questions + Year Tag
    const prompt = `Act as an elite Engineering Professor. Create ONE multiple-choice question (${marks} Marks).
    Subject: ${subject}. Topic: ${topic}.
    
    ABSOLUTE RULES:
    1. Output ONLY valid JSON.
    2. MATH FORMATTING: Use LaTeX with double-escaped backslashes (e.g. \\\\frac, \\\\int).
    3. QUESTION SOURCE: The question must be derived from recent NEP 2020 syllabus papers (Years: 2021, 2022, 2023, 2024, 2025).
    4. You MUST include an "exam_year" field with a random realistic date (e.g. "Dec 2023", "May 2022").
    5. CRITICAL: Wrap the ENTIRE equation in ONE pair of dollar signs ($...$).

    JSON Schema:
    {"question": "What is the derivative of $e^{2x}$?", "options": ["$2e^{2x}$", "$e^{2x}$", "$\\\\frac{1}{2}e^{2x}$", "$4e^{2x}$"], "answer": "$2e^{2x}$", "explanation": "Using the chain rule...", "marks": ${marks}, "topic": "${topic}", "exam_year": "May 2024"}`;
    
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: prompt }], 
        model: attempt === 1 ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant",
        temperature: 0.7,
        response_format: { type: "json_object" } 
    });
    
    let data = JSON.parse(res.choices[0].message.content);

    // Anti-Lazy Stripper
    const cleanOpts = data.options.map(o => {
        let str = String(o).trim();
        while (/^[A-Da-d]\s*[\.\)]\s*/.test(str)) str = str.replace(/^[A-Da-d]\s*[\.\)]\s*/, '').trim();
        return str;
    });
    
    let cleanAns = String(data.answer).trim();
    while (/^[A-Da-d]\s*[\.\)]\s*/.test(cleanAns)) cleanAns = cleanAns.replace(/^[A-Da-d]\s*[\.\)]\s*/, '').trim();

    // Force Shuffle
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
        question: "Could not generate a complex question. Please click Next.", 
        options: ["Next", "Next", "Next", "Next"], answer: "Next", explanation: "Error.", correctIndex: 0, marks: 0, topic: "Recovery Mode" 
    }; 
  }
}

async function solveDoubt(q, d) {
  try {
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: `Context: ${q}. Doubt: ${d}. Explain simply in 2 sentences.` }], 
        model: "llama-3.3-70b-versatile" 
    });
    return res.choices[0].message.content;
  } catch (e) { return "AI unavailable."; }
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