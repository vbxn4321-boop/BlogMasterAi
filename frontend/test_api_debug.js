async function testApi() {
    try {
        console.log('Sending request to http://localhost:3000/api/keywords/analyze...');
        const response = await fetch('http://localhost:3000/api/keywords/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keyword: '코타키나발루' })
        });
        
        console.log('Status:', response.status);
        const headers = Object.fromEntries(response.headers.entries());
        console.log('Headers:', headers);
        const text = await response.text();
        console.log('Response body (full or first 2000 chars):');
        console.log(text.slice(0, 2000));
        
        if (text.includes('<title>Login')) {
            console.log('\n>>> CONFIRMED: Redirected to LOGIN PAGE');
        } else if (text.includes('404')) {
            console.log('\n>>> CONFIRMED: 404 NOT FOUND');
        }
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

testApi();
