aconst axios = require('axios');
const cors = require('cors');

// 1. CORS Setup (Website aur App dono ke liye)
const corsHandler = cors({ origin: true });

// --- CONFIG (TERA DATA) ---
// Note: Security ke liye inhe Vercel Dashboard mein daal dena
const S_URL = process.env.SUPABASE_URL || "https://cctrgxbnntwjmjvxtnpk.supabase.co";
const S_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjdHJneGJubnR3am1qdnh0bnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDA1NjQsImV4cCI6MjA4NzU3NjU2NH0.8YBc6pLD4rcywYmNdYj5u77H_05pRZKy-x4Nfm39dYo";

// AI Behavior (System Prompt)
const SYSTEM_INSTRUCTION = "You are 'ScholarFlow AI', a brilliant and friendly student assistant. Your goal is to solve doubts, explain topics simply, and help with homework in Hinglish. You are polite, professional, and encouraging. Always identify as ScholarFlow AI.";

// Helper: Get up to 7 Keys from Vercel
const getApiKeys = () => {
    const keys = [];
    for (let i = 1; i <= 7; i++) {
        const k = process.env[`GEMINI_KEY_${i}`];
        if (k) keys.push(k);
    }
    return keys;
};

module.exports = async (req, res) => {
    // Run CORS
    await new Promise((resolve, reject) => {
        corsHandler(req, res, (err) => err ? reject(err) : resolve());
    });

    if (req.method === 'OPTIONS') return res.status(200).end();

    const path = req.url;

    // ---------------------------------------------------------
    // FEATURE 1: AUTH & OTP PROXY (Signup, Login, Verify)
    // ---------------------------------------------------------
    if (path.includes('/api/auth') && req.method === 'POST') {
        const { email, password, token, type } = req.body; 

        try {
            let endpoint, payload;
            if (type === 'signup') {
                endpoint = '/auth/v1/signup';
                payload = { email, password };
            } else if (type === 'verify') {
                endpoint = '/auth/v1/verify';
                payload = { email, token, type: 'signup' }; 
            } else {
                // Default: Login
                endpoint = '/auth/v1/token?grant_type=password';
                payload = { email, password };
            }

            const supabaseRes = await axios.post(`${S_URL}${endpoint}`, payload, {
                headers: { 'apikey': S_KEY, 'Content-Type': 'application/json' }
            });

            return res.json(supabaseRes.data);
        } catch (err) {
            console.error("Auth Error:", err.response?.data || err.message);
            return res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
        }
    }

    // ---------------------------------------------------------
    // FEATURE 2: AI CHAT (Multi-Image + 7-Key Rotation + History)
    // ---------------------------------------------------------
    if (path.includes('/api/ai') && req.method === 'POST') {
        // 'images' is an array of objects: [{ data: "base64", mimeType: "image/jpeg" }]
        const { prompt, history, images } = req.body;
        
        // As per your order: Gemini 2.5 Flash
        const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; 
        const keys = getApiKeys();

        if (keys.length === 0) return res.status(500).json({ error: "API Keys missing in Vercel!" });

        // A. Build Contents Array (History Pehle)
        let contents = [];
        if (history && Array.isArray(history)) {
            contents = history.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            }));
        }

        // B. Build Current Message Parts (System Prompt + Text + Multiple Images)
        const currentUserParts = [
            { text: `${SYSTEM_INSTRUCTION}\n\nStudent Question: ${prompt}` }
        ];

        // Har image ko parts mein add karo
        if (images && Array.isArray(images)) {
            images.forEach(img => {
                if (img.data) {
                    currentUserParts.push({
                        inline_data: {
                            mime_type: img.mimeType || "image/jpeg",
                            data: img.data // Base64 string bina prefix ke
                        }
                    });
                }
            });
        }

        // C. Final Payload Structure
        contents.push({
            role: "user",
            parts: currentUserParts
        });

        // D. FEATURE 3: Key Rotation Logic
        let shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
        let lastErr = null;

        for (const key of shuffledKeys) {
            try {
                const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
                
                // Images ke liye timeout 40 seconds rakha hai (kyunki processing slow ho sakti hai)
                const response = await axios.post(aiUrl, { contents }, { timeout: 40000 });

                if (response.data.candidates && response.data.candidates[0].content) {
                    return res.json({
                        answer: response.data.candidates[0].content.parts[0].text,
                        status: "success",
                        model: MODEL
                    });
                }
            } catch (err) {
                lastErr = err;
                console.log(`Key ${key.substring(0, 5)} failed, trying next...`);
                continue; 
            }
        }

        return res.status(500).json({ 
            error: "Bhai saari keys busy hain. Ek baar refresh karke try kar.", 
            details: lastErr?.response?.data || lastErr?.message 
        });
    }

    // ---------------------------------------------------------
    // DEFAULT ROUTE: Status Check
    // ---------------------------------------------------------
    res.json({ 
        message: "ScholarFlow Pro Ultimate Engine Live 🚀", 
        engine: "Gemini 2.5 Flash",
        features: {
            auth: "Active",
            multi_image: "Enabled",
            key_rotation: `Active (${getApiKeys().length} keys)`,
            history: "Supported"
        }
    });
};
