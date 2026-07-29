const fs = require('fs');
const path = require('path');

/**
 * Utility functions shared across all modules
 */
const utils = {
    /**
     * Generate a random integer between min and max (inclusive)
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /**
     * Sleep for a random duration between min and max ms
     */
    async randomDelay(min, max) {
        const delay = utils.randomInt(min, max);
        return new Promise(resolve => setTimeout(resolve, delay));
    },

    /**
     * Ensure a directory exists, create if not
     */
    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return dirPath;
    },

    /**
     * Write JSON data to a log file with timestamp
     */
    writeLog(logDir, filename, data) {
        utils.ensureDir(logDir);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(logDir, `${timestamp}_${filename}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[LOG] Saved: ${filePath}`);
        return filePath;
    },

    /**
     * Format the current date as YYYYMMDD
     */
    dateStamp() {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    },

    /**
     * Normalize a keyword for use as a cache/lookup key (trim, NFC unicode form, lowercase)
     */
    normalizeKeyword(keyword) {
        return keyword.trim().normalize('NFC').toLowerCase();
    },

    /**
     * Download a remote image to a local path
     */
    async downloadImage(url, destPath) {
        const axios = require('axios');
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });
        return new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    },

    /**
     * Get the SmartEditor iframe from the page
     */
    async getSeFrame(page) {
        try {
            const isSmartEditorOne = await page.$('.se-main-container').catch(() => null);
            if (isSmartEditorOne) {
                console.log('[Utils] SmartEditor ONE detected (No frame)');
                return page; 
            }

            // Dismiss draft popup if it exists
            try {
                // Look for common text patterns in popups
                const draftPopupHandled = await page.evaluate(() => {
                    const popups = Array.from(document.querySelectorAll('.se-popup, .se-notice-popup, [class*="popup"], [class*="modal"]'));
                    const targetPrompt = popups.find(p => {
                        const t = p.innerText || "";
                        return t.includes('불러오시겠습니까') || 
                               t.includes('작성 중인 글') || 
                               t.includes('작성중이던') || 
                               t.includes('이어서 작성') ||
                               t.includes('임시저장');
                    });
                    
                    if (targetPrompt) {
                        const buttons = Array.from(targetPrompt.querySelectorAll('button, a, span'));
                        const cancelBtn = buttons.find(b => {
                            const bt = b.innerText || "";
                            return bt.includes('취소') || bt.includes('닫기') || bt.includes('아니오');
                        });
                        if (cancelBtn) {
                            cancelBtn.click();
                            return true;
                        }
                    }
                    return false;
                });
                
                if (draftPopupHandled) {
                    console.log('[Utils] Draft/Notice popup detected and dismissed.');
                    await utils.randomDelay(1500, 2500);
                }
            } catch(e) {
                console.warn(`[Utils] Popup dismissal failed: ${e.message}`);
            }

            // Fallback to legacy mainFrame
            try {
                await page.waitForSelector('#mainFrame', { timeout: 15000 });
                const mainFrame = await page.$('#mainFrame');
                const frame = await mainFrame.contentFrame();
                if (frame) {
                    await frame.waitForSelector('.se-canvas', { timeout: 20000 });
                    return frame;
                }
            } catch (frameError) {
                console.warn('[Utils] Legacy frame not found, checking top-level again...');
                // One more check for ONE container at top level
                const container = await page.$('.se-container');
                if (container) return page;
            }

            return null;
        } catch (e) {
            console.error(`[Utils] Failed to get editor frame: ${e.message}`);
            return null;
        }
    },

    /**
     * Simulate human-like typing by splitting text into chunks
     */
    splitIntoTypingChunks(text, chunkSize = 20) {
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substring(i, i + chunkSize));
        }
        return chunks;
    },
};

module.exports = utils;
