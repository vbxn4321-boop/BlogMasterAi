const fs = require('fs');

async function findStickers() {
    const blogUrls = [
        'https://m.blog.naver.com/naver_blog/223000000000',
        'https://m.blog.naver.com/naver_blog/223100000000',
        'https://m.blog.naver.com/naver_blog/223200000000'
    ];
    for (const url of blogUrls) {
        try {
            const res = await fetch(url);
            const html = await res.text();
            const matches = html.match(/https:\/\/[a-zA-Z0-9.-]+\.pstatic\.net\/[^\s"']+/g) || [];
            const stickers = matches.filter(m => m.includes('sticker') || m.includes('gfmarket') || m.includes('ogq'));
            if (stickers.length > 0) {
                console.log('Found stickers:', stickers.slice(0, 10));
                return;
            }
        } catch (e) {
            console.error(e.message);
        }
    }
    console.log('No stickers found in default blog posts');
}

findStickers();
