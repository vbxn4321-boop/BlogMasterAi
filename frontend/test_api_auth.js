const fetch = require('node-fetch');

async function testApi() {
    try {
        console.log('Sending request to http://localhost:3000/api/keywords/analyze...');
        const response = await fetch('http://localhost:3000/api/keywords/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // Missing auth cookie here? 
                // The middleware might redirect if no auth.
            },
            body: JSON.stringify({ keyword: '코타키나발루' })
        });
        
        console.log('Status:', response.status);
        console.log('Headers:', response.headers.raw());
        const text = await response.text();
        console.log('Response body (first 500 chars):');
        console.log(text.slice(0, 500));
        
        if (text.includes('Redirecting')) {
            console.log('\n>>> ERROR: Detected a redirect! Likely to /login.');
        }
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

testApi();
