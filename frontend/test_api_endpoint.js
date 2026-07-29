const fetch = require('node-fetch');

async function testApi() {
    try {
        const response = await fetch('http://localhost:3000/api/keywords/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keyword: 'test' })
        });
        
        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Response body (start):', text.slice(0, 200));
        
        if (text.trim().startsWith('<!DOCTYPE html>')) {
            console.log('ERROR: Received HTML instead of JSON');
        } else {
            console.log('Received something else (maybe JSON)');
        }
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

testApi();
