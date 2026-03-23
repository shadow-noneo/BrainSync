require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
function buildPrompt(subject, module, marks, examYear, examMonth) {
  const syllabusDB = {
  "Applied Mathematics-II": {
    "modules": {
      "Module 1: Differential Equations of First Order": [
        "Variable separable method",
        "Exact differential equations and reducible to exact",
        "Linear differential equations",
        "Bernoulli's equation",
        "Applications: Newton's law of cooling, orthogonal trajectories"
      ],
      "Module 2: Linear Differential Equations": [
        "Complementary function and particular integral",
        "Method of variation of parameters",
        "Cauchy and Legendre equations",
        "Simultaneous differential equations",
        "Applications to electrical circuits and mechanical systems"
      ],
      "Module 3: Laplace Transform": [
        "Definition and standard results of Laplace transform",
        "Laplace transform of derivatives and integrals",
        "Inverse Laplace transform using partial fractions",
        "Convolution theorem",
        "Solution of differential equations using Laplace transform"
      ],
      "Module 4: Complex Variables": [
        "Analytic functions and Cauchy-Riemann equations",
        "Harmonic functions",
        "Conformal mapping",
        "Bilinear transformation",
        "Cauchy integral theorem and formula"
      ],
      "Module 5: Numerical Methods": [
        "Solution of algebraic and transcendental equations: Bisection, Regula-Falsi, Newton-Raphson",
        "Solution of simultaneous equations: Gauss elimination, Gauss-Seidel",
        "Numerical integration: Trapezoidal rule, Simpson's 1/3 and 3/8 rule",
        "Numerical solution of ODE: Euler, Modified Euler, Runge-Kutta 4th order"
      ],
      "Module 6: Vector Calculus": [
        "Gradient, divergence and curl",
        "Line integral, surface integral, volume integral",
        "Green's theorem, Stokes' theorem, Gauss divergence theorem",
        "Applications in engineering problems"
      ]
    }
  },
  "Engineering Physics-II": {
    "modules": {
      "Module 1: Quantum Mechanics": [
        "De Broglie hypothesis, matter waves",
        "Heisenberg's uncertainty principle",
        "Schrodinger wave equation: time dependent and independent",
        "Particle in a box, energy levels",
        "Wave function and physical significance"
      ],
      "Module 2: Semiconductor Physics": [
        "Energy band theory: conductors, insulators, semiconductors",
        "Intrinsic and extrinsic semiconductors",
        "Fermi level, carrier concentration",
        "Hall effect and its applications",
        "p-n junction, I-V characteristics"
      ],
      "Module 3: Superconductivity": [
        "Properties of superconductors",
        "Meissner effect",
        "Type I and Type II superconductors",
        "BCS theory (qualitative)",
        "Applications: SQUID, Maglev trains, MRI"
      ],
      "Module 4: Lasers and Fiber Optics": [
        "Spontaneous and stimulated emission",
        "Population inversion, pumping mechanisms",
        "Ruby laser, He-Ne laser, semiconductor laser",
        "Applications of lasers in industry and medicine",
        "Optical fiber: structure, acceptance angle, numerical aperture",
        "Types of optical fibers and applications in communication"
      ],
      "Module 5: Nanotechnology": [
        "Introduction to nanoscience and nanotechnology",
        "Quantum confinement effect",
        "Carbon nanotubes: types, properties, applications",
        "Nanomaterials: synthesis methods",
        "Applications of nanotechnology in medicine, electronics"
      ],
      "Module 6: Electrodynamics": [
        "Maxwell's equations in differential and integral form",
        "Displacement current",
        "Electromagnetic wave propagation",
        "Poynting vector and energy transport",
        "Reflection and refraction of EM waves"
      ]
    }
  },
  "Engineering Materials": {
    "modules": {
      "Module 1: Alloys": [
        "Ferrous alloys: Plain-carbon steels (low, medium, high), Heat resisting steels, Shock resisting steels, Stainless steels",
        "Effect of alloying elements: Ni, Cr, Co, Mn, Mo, W, V on properties",
        "Aluminium alloys: Duralumin (composition, properties, uses), Magnalium (composition, properties, uses)",
        "Copper alloys: Brass varieties (Dutch Metal, German Silver), Bronze varieties (Gun metal, Nickel bronze)",
        "Lead alloys: Wood's metal (composition, uses), Tinman's solder (composition, uses)",
        "Numerical: Calculation based on composition, density and weight of alloy"
      ],
      "Module 2: Ceramics": [
        "Introduction to Ceramics: Definition, classification (crystalline/non-crystalline), properties (hardness, brittleness, refractoriness) and uses",
        "Glass: Definition, Types (soda-lime, borosilicate, lead glass), Properties, Uses in construction and optics",
        "Natural Abrasives: Diamond, Corundum, Emery — properties and applications",
        "Artificial Abrasives: Silicon Carbide (SiC), Aluminium Oxide (Al2O3) — properties and applications",
        "Optical Fibres: Definition, Components of optical transmission system (core, cladding, buffer)",
        "Advantages of optical fibre over conventional cables, Applications in communication"
      ],
      "Module 3: Composites": [
        "Fibre-reinforced composites: glass fibre, carbon fibre, Kevlar — matrix types, properties, applications in aerospace/automotive",
        "Layered-composites (Laminates): structure, properties, uses in plywood, safety glass",
        "Particulate-composites: types (large particle, dispersion strengthened), examples, properties",
        "Bio-composites: Definition, Classification (natural/synthetic), Applications in biomedical and packaging"
      ],
      "Module 4: Plastics and Elastomers": [
        "Thermoplastics: properties (remoldable, recyclable), examples: PVC, PE, PP, PMMA, PTFE",
        "Thermosetting plastics: properties (rigid, non-remoldable), examples: Bakelite, Epoxy, Melamine",
        "Compounding of plastics: fillers, plasticizers, stabilizers, colorants",
        "Numerical: Degree of polymerisation, density, tensile strength calculations",
        "Elastomers: structural requirements, natural rubber processing and drawbacks",
        "Synthesis: PMMA (Perspex) — preparation, properties, uses; PTFE (Teflon) — preparation, properties, uses",
        "Polyurethane Rubber — preparation, properties, uses; Silicone rubber — preparation, properties, uses"
      ],
      "Module 5: Advanced Polymers": [
        "Conducting polymers: mechanism of conductivity, examples: polyacetylene, polyaniline, applications in solar cells",
        "Bio-polymers: definition, classification (natural: proteins, cellulose; synthetic: PLA), biodegradable applications",
        "Liquid crystal polymers: thermotropic and lyotropic, Kevlar as LCP, applications in electronics",
        "Intelligent (smart) polymers: stimuli-responsive, shape memory polymers, applications in biomedical"
      ],
      "Module 6: Nanomaterials": [
        "Nanostructured materials: definition, classification (0D, 1D, 2D, 3D nanostructures), properties vs bulk",
        "Applications of Nanomaterials: medicine (drug delivery), electronics (nanotransistors), energy (solar cells)",
        "Graphene: structure (2D hexagonal lattice), properties (electrical, mechanical, thermal), applications",
        "SWCNTs (Single-walled carbon nanotubes): structure, properties, applications in nanoelectronics",
        "MWCNTs (Multi-walled carbon nanotubes): structure, properties vs SWCNTs, applications"
      ]
    }
  },
  "Engineering Graphics": {
    "modules": {
      "Module 1: Introduction to Engineering Drawing": [
        "Types of lines (continuous, dashed, chain) and their applications per IS conventions",
        "Dimensioning systems: aligned and unidirectional, IS dimensioning rules",
        "Plain scale and diagonal scale construction and problems",
        "Cycloid: construction for one full rotation of circle",
        "Involute: construction of involute of circle and square",
        "Helix: construction of helix on cylinder"
      ],
      "Module 2: Projections of Points, Lines and Planes": [
        "Projections of points in all four quadrants on HP and VP",
        "True length and inclination of line inclined to both HP and VP",
        "Traces of a line: HT and VT (excluded from paper setting)",
        "Projections of planes: triangular, square, pentagonal, hexagonal, circular planes",
        "Planes inclined to one reference plane and perpendicular to other",
        "Planes inclined to both HP and VP using change of position or auxiliary plane method"
      ],
      "Module 3: Projections of Solids": [
        "Axis perpendicular to HP: prism, pyramid, cylinder, cone in standard position",
        "Axis inclined to HP and perpendicular to VP: change of position method",
        "Axis inclined to VP and perpendicular to HP",
        "Axis inclined to both HP and VP: two-step method",
        "Frustum of cone and pyramid projections",
        "Sphere projections and hollow solid projections"
      ],
      "Module 4: Sections of Solids and Development of Surfaces": [
        "Section of prism cut by plane perpendicular to VP",
        "Section of pyramid cut by plane perpendicular to VP",
        "Section of cylinder cut by plane perpendicular to VP",
        "Section of cone cut by plane perpendicular to VP (excluding curved section plane)",
        "True shape of section using auxiliary plane",
        "Development of lateral surface of prism (triangular, square, hexagonal)",
        "Development of lateral surface of pyramid only"
      ],
      "Module 5: Orthographic Projections": [
        "First angle projection method: front view, top view, side view",
        "Arrangement of views in first angle projection",
        "Third angle projection method and symbol",
        "Missing view problems: identifying and drawing the third view",
        "Sectional views: full section, half section",
        "Rib and web representation in section"
      ],
      "Module 6: Isometric Views": [
        "Isometric scale calculation and use",
        "Isometric view of simple solids: cube, prism, cylinder",
        "Isometric view of combination of solids",
        "Converting orthographic views to isometric view",
        "Isometric view of objects with cut sections"
      ]
    }
  },
  "Data Structure": {
    "modules": {
      "Module 1: Introduction to Data Structures": [
        "ADT (Abstract Data Type): definition, advantages, examples",
        "Linear data structures: arrays, stacks, queues, linked lists",
        "Nonlinear data structures: trees, graphs",
        "Static vs dynamic data structures",
        "Time complexity and space complexity analysis: O(1), O(n), O(n²), O(log n)",
        "C programming constructs: pointers, structures, recursion review"
      ],
      "Module 2: Stack": [
        "Stack as ADT: PUSH, POP, PEEK, isEmpty, isFull operations",
        "Array implementation of stack: algorithm and C code",
        "Multiple stacks in single array",
        "Applications: function call stack, expression evaluation",
        "Evaluation of postfix expression using stack: algorithm and trace",
        "Conversion: infix to postfix using stack algorithm"
      ],
      "Module 3: Queue": [
        "Queue as ADT: ENQUEUE, DEQUEUE, FRONT, REAR operations",
        "Array implementation of linear queue: algorithm and C code",
        "Circular Queue: concept, implementation, advantages over linear queue",
        "Priority Queue: types (ascending, descending), implementation",
        "Double Ended Queue (DEQUE): input restricted, output restricted",
        "Multiple Queues: implementation and use cases"
      ],
      "Module 4: Linked List": [
        "Singly linked list: node structure, traversal, insertion (beginning, end, position), deletion",
        "Doubly linked list: node structure, forward and backward traversal, insertion, deletion",
        "Circular linked list: structure, traversal, operations",
        "Reversing a singly linked list: iterative algorithm",
        "Implementation of Stack using singly linked list",
        "Implementation of Queue using singly linked list"
      ],
      "Module 5: Tree": [
        "Tree terminology: root, node, leaf, height, depth, degree, subtree",
        "Binary tree: definition, properties, types (full, complete, perfect, skewed)",
        "Binary tree representation: array and linked representation",
        "Binary tree traversals: Inorder (LNR), Preorder (NLR), Postorder (LRN) — recursive and non-recursive",
        "Binary Search Tree (BST): properties, insertion algorithm with trace",
        "BST deletion: three cases (leaf, one child, two children) with algorithm",
        "BST search operation and complexity analysis"
      ],
      "Module 6: Applications of Data Structures": [
        "Infix to Postfix conversion: complete algorithm with operator precedence and associativity",
        "Infix to Prefix conversion algorithm",
        "Postfix expression evaluation: step-by-step algorithm and trace",
        "Reversing a string using stack: algorithm",
        "Parentheses checker (balanced brackets) using stack: algorithm and trace",
        "Expression tree: construction from postfix expression",
        "Huffman encoding: algorithm, frequency table, building Huffman tree, encoding table"
      ]
    }
  },
  "Python Programming": {
    "modules": {
      "Module 1: Introduction to Python": [
        "Python features: interpreted, dynamically typed, object-oriented",
        "Variables and data types: int, float, complex, bool, str, NoneType",
        "Operators: arithmetic, relational, logical, bitwise, assignment, identity, membership",
        "Input/output: input(), print(), format strings, f-strings",
        "List: creation, indexing, slicing, methods (append, insert, remove, pop, sort, reverse)",
        "Tuple: immutability, packing/unpacking, methods",
        "Set: unordered, unique elements, set operations (union, intersection, difference)",
        "Dictionary: key-value pairs, methods (get, keys, values, items, update)"
      ],
      "Module 2: Control Flow and Functions": [
        "if-elif-else: nested conditions, ternary operator",
        "for loop: range(), iterating over list/tuple/dict/string",
        "while loop: loop control statements (break, continue, pass)",
        "List comprehensions and dictionary comprehensions",
        "Functions: def keyword, return statement, default arguments, keyword arguments",
        "Variable-length arguments: *args and **kwargs",
        "Scope: local, global, nonlocal variables, LEGB rule",
        "Lambda functions: syntax and use with map(), filter(), reduce()"
      ],
      "Module 3: File Handling, Packaging and Debugging": [
        "File modes: r, w, a, r+, rb, wb — differences and use",
        "Reading files: read(), readline(), readlines()",
        "Writing files: write(), writelines()",
        "with statement (context manager) for file handling",
        "Exception handling: try, except, else, finally, raise",
        "Built-in exceptions: ValueError, TypeError, FileNotFoundError, ZeroDivisionError",
        "Modules: import, from-import, as keyword, __name__ == '__main__'",
        "Creating packages: __init__.py, package structure",
        "Debugging: print debugging, syntax errors vs runtime errors vs logical errors"
      ],
      "Module 4: Object-Oriented Programming in Python": [
        "Class and object: class definition, instantiation, self parameter",
        "Instance variables vs class variables",
        "Constructor (__init__) and destructor (__del__)",
        "Encapsulation: public, protected (_), private (__) attributes",
        "Inheritance: single inheritance syntax and method overriding",
        "Multiple inheritance: MRO (Method Resolution Order), super()",
        "Multilevel inheritance: chained inheritance",
        "Polymorphism: method overriding, operator overloading (__add__, __str__, __len__)"
      ],
      "Module 5: Advanced Python Concepts": [
        "Regular expressions: re module, raw strings",
        "re functions: match(), search(), findall(), finditer(), sub(), split()",
        "Metacharacters: ., *, +, ?, ^, $, [], {}, |, ()",
        "Special sequences: \\d, \\w, \\s, \\b and their uppercase counterparts",
        "Pattern matching: greedy vs non-greedy matching",
        "GUI with Tkinter: window creation, widgets (Label, Button, Entry, Text, Frame)",
        "Tkinter event handling: command parameter, bind() method",
        "Layout managers: pack(), grid(), place()"
      ],
      "Module 6: Python Libraries": [
        "NumPy: array creation, ndarray properties (shape, dtype, ndim), array operations",
        "NumPy mathematical functions: mean, median, std, min, max, sum",
        "NumPy array slicing and indexing, broadcasting concept",
        "Pandas: Series and DataFrame creation",
        "DataFrame operations: read_csv, head(), info(), describe(), loc[], iloc[]",
        "Data manipulation: dropna(), fillna(), groupby(), merge(), concat()",
        "Matplotlib: pyplot module, basic plot types: line, bar, histogram, scatter, pie",
        "Plot customization: title, xlabel, ylabel, legend, color, linestyle, figsize"
      ]
    }
  }
};
  const questionStyles = {
  "Applied Mathematics-II": "\n    Generate NUMERICAL/PROBLEM-SOLVING questions like MU exam:\n    - Solve the differential equation: dy/dx + 2y = e^3x\n    - Find the Laplace transform of f(t) = t²e^(-3t)\n    - Evaluate the integral using Simpson's rule with n=4\n    - Find the analytic function f(z) = u + iv given u = x² - y²\n    Questions MUST have specific numbers, functions, and require calculation.\n    Use proper mathematical notation written in plain text.\n    Marks pattern: 3 marks = short numerical, 5 marks = medium derivation, 7-8 marks = full problem with multiple parts",
  "Engineering Physics-II": "\n    Generate CONCEPTUAL + NUMERICAL questions like MU exam:\n    - Derive the Schrodinger time-independent wave equation\n    - An electron is confined to a box of length 2Å. Calculate the ground state energy.\n    - Explain Meissner effect with diagram. How does it differ in Type I and Type II superconductors?\n    - Calculate the numerical aperture of an optical fiber given n1=1.5, n2=1.4\n    Mix derivations (5-7 marks) with short concept questions (3 marks) and numericals (4-5 marks).",
  "Engineering Materials": "\n    Generate DESCRIPTIVE + NUMERICAL questions like MU exam:\n    - Compare the composition and properties of Duralumin and Magnalium with uses.\n    - Explain the effect of adding Chromium and Nickel to steel. Give one application each.\n    - Calculate the weight percentage of Cu in brass if it contains 70g Cu and 30g Zn.\n    - Differentiate between thermoplastic and thermosetting plastics with four examples each.\n    - Explain the synthesis and properties of PTFE. Why is it used as a non-stick coating?\n    3-mark questions: definitions, short comparisons\n    5-mark questions: explain with properties and uses\n    7-8 mark questions: detailed comparison, synthesis, numerical",
  "Engineering Graphics": "\n    Generate DESCRIPTIVE DRAWING questions like MU exam:\n    - A line AB, 70mm long, is inclined at 30° to HP and 45° to VP. Draw its projections.\n    - Draw the projections of a hexagonal prism (base 30mm, height 60mm) resting on HP with axis inclined at 45° to HP.\n    - A cone (base 50mm diameter, height 70mm) is cut by a plane perpendicular to VP and inclined at 30° to HP. Draw the section and true shape.\n    - Convert the given orthographic views (front view, top view) into isometric view.\n    Questions must specify exact dimensions, angles, and orientations.\n    Always mention which projection method (first angle) and drawing instruments.",
  "Data Structure": "\n    Generate ALGORITHM + TRACE + CODE questions like MU exam:\n    - Write an algorithm to insert a node at the beginning of a singly linked list. Trace for data: 10→20→30, insert 5.\n    - Evaluate the postfix expression: 5 3 + 2 * 8 4 / - using stack. Show each step.\n    - Write a C function to perform inorder traversal of a binary search tree.\n    - Construct a BST for the values: 45, 15, 79, 90, 10, 55, 12, 20, 50. Show insertions step by step.\n    - Compare Linear Queue and Circular Queue with respect to implementation, advantages and disadvantages.\n    3-mark: definitions, comparisons, short algorithms\n    5-mark: algorithm with trace or C code\n    7-8 mark: complete implementation with analysis",
  "Python Programming": "\n    Generate CODE-BASED + CONCEPTUAL questions like MU exam:\n    - Write a Python program to implement a Stack using list with push, pop and display operations.\n    - What is the output of the following Python code? [give a tricky code snippet]\n    - Explain the difference between *args and **kwargs with suitable example program.\n    - Write a Python program using Pandas to read a CSV file and display rows where salary > 50000.\n    - Demonstrate multilevel inheritance in Python with a suitable example showing method overriding.\n    3-mark: definition, syntax, output questions\n    5-mark: program writing, explain with example\n    7-8 mark: complete program with multiple features"
};

  const subjectSyllabus = syllabusDB[subject];
  const moduleTopics = subjectSyllabus?.modules?.[module] || [];
  const style = questionStyles[subject] || '';

  // Pick 2-3 random topics from the module to focus question on
  const shuffled = moduleTopics.sort(() => 0.5 - Math.random());
  const focusTopics = shuffled.slice(0, Math.min(3, shuffled.length));

  return `You are an expert Mumbai University (MU) NEP 2020 examination question paper setter for ${subject}.

SUBJECT: ${subject}
MODULE: ${module}
MARKS: ${marks}
EXAM: ${examMonth} ${examYear} (MU End Semester Examination)
FOCUS TOPICS FOR THIS QUESTION: ${focusTopics.join(', ')}

FULL MODULE SYLLABUS (for context):
${moduleTopics.map((t, i) => `${i+1}. ${t}`).join('\n')}

QUESTION GENERATION STYLE FOR THIS SUBJECT:
${style}

STRICT RULES:
1. Generate EXACTLY ONE question worth ${marks} marks
2. Question must be from the FOCUS TOPICS listed above
3. Question must match MU ${examMonth} ${examYear} examination style exactly
4. For ${marks} marks: ${marks <= 3 ? 'Short answer — definition, formula, or simple concept (4-6 lines expected)' : marks <= 5 ? 'Medium answer — explanation with example or simple numerical (8-12 lines expected)' : 'Long answer — detailed derivation, full algorithm with trace, or comprehensive explanation with diagram mention (15-20 lines expected)'}
5. Provide EXACTLY 4 multiple choice options (A, B, C, D)
6. Only ONE option must be correct — no ambiguity
7. Wrong options must be plausible but clearly incorrect to a knowledgeable student
8. For numerical questions: include specific numbers, units, and show what needs to be calculated
9. For code/algorithm questions: specify the exact operation to perform and input data
10. For derivation questions: specify exactly what to derive and starting conditions
11. LaTeX rules: use \\frac{}{} NOT f\\frac, use \\times NOT imes, use \\begin{} NOT egin{}
12. NEVER repeat the same question — vary the numbers, functions, and scenarios

RESPONSE FORMAT (strict JSON only, no extra text):
{
  "question": "Complete question text with all specifications, dimensions, data, and sub-parts if any",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correctIndex": 0,
  "explanation": "Step-by-step solution showing exactly how to arrive at the correct answer",
  "topic": "Specific topic this question covers",
  "difficulty": "Easy/Medium/Hard"
}`;
}

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
  let s = String(str);
  const fixes = [
    ['f\\frac','\\frac'],['f\\sqrt','\\sqrt'],['f\\left','\\left'],
    ['f\\right','\\right'],['f\\psi','\\psi'],['f\\hbar','\\hbar'],
    ['f\\pi','\\pi'],['f\\sigma','\\sigma'],['f\\sin','\\sin'],
    ['f\\cos','\\cos'],['f\\tan','\\tan'],['f\\int','\\int'],
    ['f\\sum','\\sum'],['f\\infty','\\infty'],['f\\alpha','\\alpha'],
    ['f\\beta','\\beta'],['f\\gamma','\\gamma'],['f\\theta','\\theta'],
    ['f\\omega','\\omega'],['f\\delta','\\delta'],['f\\lambda','\\lambda'],
    ['f\\Gamma','\\Gamma'],['f\\Delta','\\Delta'],['f\\Sigma','\\Sigma'],
    ['f\\Omega','\\Omega'],['f\\langle','\\langle'],['f\\rangle','\\rangle'],
    ['f\\vec','\\vec'],['f\\hat','\\hat'],['f\\bar','\\bar'],
    ['f\\nabla','\\nabla'],['f\\partial','\\partial'],
    ['extMPa','MPa'],['extPa','Pa'],['extHz','Hz'],
    ['extm','m'],['extC','C'],['extV','V'],['extA','A'],
    ['extW','W'],['extJ','J'],['extK','K'],['extN','N'],['extg','g'],
    ['sinheta','\\sin\\theta'],['cosheta','\\cos\\theta'],
    ['tanheta','\\tan\\theta'],
    ['imes','\\times'],['egin{','\\begin{'],
  ];
  for (const [from, to] of fixes) {
    while (s.includes(from)) s = s.split(from).join(to);
  }
  return s.trim();
}

async function generateAIQuestion(subject, topicsArray, attempt = 1) {
  const topic = topicsArray && topicsArray.length > 0 ? topicsArray[Math.floor(Math.random() * topicsArray.length)] : 'General';
  const marks = [3, 4, 5, 7, 8][Math.floor(Math.random() * 5)];
  
  try {
    const prompt = `You are an expert MU (Mumbai University) NEP 2020 Engineering Professor. Generate ONE real exam-style question (${marks} Marks) exactly like MU end semester papers.

Subject: ${subject}. Topic: ${topic}.

STRICT RULES:
1. Output ONLY valid JSON. No extra text.
2. The question must be a FULL problem-solving question like MU end sem papers (NOT a simple MCQ definition).
3. For ${marks} marks question, the complexity should match: 3-4 marks = medium derivation, 5 marks = full derivation, 7-8 marks = long proof or two-part problem.
4. The 4 options must be ONLY the FINAL ANSWER of the problem (not steps, not definitions).
5. ALL math MUST use proper LaTeX wrapped in $ signs. CRITICAL: The letter f must NEVER appear before any backslash command. Write \\frac NOT f\\frac. Write \\frac NOT f\\frac. Write \\sqrt NOT f\\sqrt. Write \\left NOT f\\left. Write \\right NOT f\\right. Write \\infty NOT infty. Write \\psi NOT psi. Write \\hbar NOT hbar. Units like MPa, g/cm^3 must be written as plain text NOT using \\text{}.
6. The explanation must show complete step-by-step solution.
7. exam_year must be randomly chosen from: May 2019, Nov 2019, May 2022, Nov 2022, May 2023, Nov 2023, May 2024, Nov 2024.

JSON Schema:
{"question": "Solve using variation of parameters: $y'' - 5y' + 6y = e^{2x}$", "options": ["$y = c_1e^{2x} + c_2e^{3x} - xe^{2x}$", "$y = c_1e^{2x} + c_2e^{3x} + xe^{2x}$", "$y = c_1e^{2x} - c_2e^{3x} + xe^{2x}$", "$y = c_1e^{2x} + c_2e^{3x} + e^{2x}$"], "answer": "$y = c_1e^{2x} + c_2e^{3x} - xe^{2x}$", "explanation": "Step 1: Find CF... Step 2: Find W... Step 3: Find PI...", "marks": ${marks}, "topic": "${topic}", "exam_year": "May 2023"}`
    
    const res = await groq.chat.completions.create({ 
        messages: [{ role: "user", content: prompt }], 
        model: attempt === 1 ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant",
        temperature: 0.3, max_tokens: 500,
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
    console.error("❌ Groq Error:", e.message); 
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
        
    // Build topic queue: divide questions evenly across topics
    const topicQueue = [];
    if (topics && topics.length > 0) {
      const questionsPerTopic = Math.max(1, Math.floor((limit === -1 ? 10 : limit) / topics.length));
      const remainder = (limit === -1 ? 10 : limit) % topics.length;
      topics.forEach((topic, i) => {
        const count = questionsPerTopic + (i < remainder ? 1 : 0);
        for (let j = 0; j < count; j++) topicQueue.push(topic);
      });
    }
    room.topicQueue = topicQueue;
    room.topicQueueIndex = 0;
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

    const isCorrect = (answerIndex === room.currentQuestion.correctIndex);

    if (username === room.hostUsername) {
        if (isCorrect) {
            room.scores[username] = (room.scores[username] || 0) + (room.currentQuestion.marks || 5);
            io.to(roomCode).emit('update_scores', room.scores);
        }
        socket.emit('round_result', { correctIndex: room.currentQuestion.correctIndex, correctAnswer: room.currentQuestion.answer, explanation: room.currentQuestion.explanation, isCorrect });
        return;
    }

    room.submittedUsers.add(username);
    broadcastProgress(roomCode);
    
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
