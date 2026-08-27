// api/groq.js — Vercel Serverless Function
// ✅ This runs on Vercel's servers — process.env WORKS here!

export default async function handler(req, res) {
    // ✅ API key is stored in Vercel Environment Variables
    const apiKey = process.env.GROQ_API_KEY;
    
    // CORS headers — allow your frontend to call this API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight (OPTIONS) request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
    }
    
    // Check if API key exists
    if (!apiKey) {
        console.error('❌ GROQ_API_KEY not set in Vercel environment variables');
        return res.status(500).json({ 
            error: 'API key not configured. Please set GROQ_API_KEY in Vercel environment variables.',
            details: 'Go to Vercel Dashboard → Your Project → Settings → Environment Variables → Add GROQ_API_KEY'
        });
    }
    
    try {
        // Forward the request to Groq API
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(req.body)
        });
        
        // Get the response data
        const data = await response.json();
        
        // Forward the response back to the frontend
        return res.status(response.status).json(data);
        
    } catch (error) {
        console.error('❌ Groq API error:', error.message);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}