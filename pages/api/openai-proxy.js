// pages/api/openai-proxy.js

import jwt from 'jsonwebtoken';
import rateLimit from 'next-rate-limit';

const limiter = rateLimit({
    interval: 1 * 1000,
    uniqueTokenPerInterval: 500, 
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET);

        // Apply rate limiting based on token
        // await limiter.check(res, 10, token); // 10 requests per minute
    } catch (error) {
        return res.status(429).json({ message: 'Too Many Requests' });
    }

    // Forward the request to OpenAI
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify(req.body),
        });

        const data = await response.json();

        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error communicating with OpenAI:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
}
