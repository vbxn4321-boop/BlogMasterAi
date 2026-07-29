const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const utils = require('./utils');

puppeteer.use(StealthPlugin());

/**
 * Module 6: SEO Ranking Scraper
 * 
 * Checks Naver search results for a given keyword and finds the position
 * of a specific blog URL. Uses incognito (non-logged-in) browsing to get
 * standardized search results.
 */
class RankingScraper {
    constructor() {
        this.browser = null;
    }

    async launch() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--incognito',
            ]
        });
    }

    /**
     * Check the ranking of a blog for a specific keyword
     * @param {string} keyword - Search keyword
     * @param {string} blogId - Naver blog ID to find
     * @returns {{ position: number, page: number, totalResults: number } | null}
     */
    async checkRank(keyword, blogId) {
        if (!this.browser) await this.launch();

        const page = await this.browser.newPage();

        try {
            // Set realistic viewport and user agent
            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            let position = null;
            let foundPage = 0;
            let totalResults = 0;

            // Check up to 5 pages of search results
            for (let pageNum = 1; pageNum <= 5; pageNum++) {
                const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&start=${(pageNum - 1) * 10 + 1}`;

                await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await utils.randomDelay(2000, 3000);

                // Extract blog result links
                const results = await page.evaluate((targetBlogId) => {
                    const items = document.querySelectorAll('.api_txt_lines.total_tit, .title_link, .sub_txt.sub_name');
                    const found = [];

                    // Look for the blog ID in result URLs and author names
                    document.querySelectorAll('a[href*="blog.naver.com"]').forEach((link, index) => {
                        const href = link.getAttribute('href') || '';
                        if (href.includes(`blog.naver.com/${targetBlogId}`)) {
                            found.push(index + 1);
                        }
                    });

                    // Also check .sub_txt for blog usernames
                    document.querySelectorAll('.sub_txt.sub_name').forEach((el, index) => {
                        if (el.textContent?.trim() === targetBlogId) {
                            found.push(index + 1);
                        }
                    });

                    return { found: found.length > 0 ? found[0] : null, totalItems: document.querySelectorAll('.api_txt_lines.total_tit, .title_link').length };
                }, blogId);

                totalResults += results.totalItems;

                if (results.found) {
                    position = (pageNum - 1) * 10 + results.found;
                    foundPage = pageNum;
                    break;
                }
            }

            await page.close();

            if (position) {
                return { position, page: foundPage, totalResults };
            }

            return null; // Not found in top 50

        } catch (err) {
            console.error(`[Module 6] Scraping error: ${err.message}`);
            await page.close().catch(() => { });
            return null;
        }
    }

    async close() {
        if (this.browser) await this.browser.close();
    }
}

module.exports = RankingScraper;
