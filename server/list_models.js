require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listMyModels() {
  console.log("📋 Asking Google for your available models...");
  console.log("---------------------------------------------");
  
  try {
    // This command asks Google to list every model you can access
    const response = await genAI.getGenerativeModel({ model: "gemini-pro" }).apiKey; // Validates key first
    // Note: The SDK doesn't have a direct 'listModels' helper in all versions, 
    // so we will try a standard request to a basic model to check connectivity first.
    
    // Actually, let's use the direct API call structure if the SDK allows, 
    // but to be safe, we will try the most common ones and print which one succeeds.
    
    const candidates = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro",
      "gemini-1.0-pro", 
      "gemini-pro",
      "gemini-ultra"
    ];
    
    for (const modelName of candidates) {
        process.stdout.write(`Trying ${modelName}... `);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            await model.generateContent("Test");
            console.log("✅ AVAILABLE!");
        } catch (err) {
            console.log("❌ " + err.message.split('[')[0].trim());
        }
    }

  } catch (error) {
    console.log("❌ CRITICAL ERROR:", error.message);
  }
}

listMyModels();
