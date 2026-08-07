const fs = require('fs');
const path = require('path');
const config = require('./config');
const utils = require('./utils');
const axios = require('axios');
const sharp = require('sharp');

/**
 * Module 3: Asset Manager
 * Role: Professional Visual Producer & File System Manager
 *
 * Generates 8 images using Nano Banana Pro (Gemini 3 Pro Image) and saves them as local .jpg files.
 */
class AssetManager {
    constructor(geminiApiKey) {
        this.storagePath = '';
        this.fileList = [];
        this.geminiApiKey = geminiApiKey || null;
    }

    /**
     * Initialize storage directory for this session using YYYYMMDD_keyword_title format
     */
    initStorage(keyword, title) {
        // Sanitize keyword and title to remove invalid folder characters
        const safeKeyword = (keyword || 'keyword').replace(/[\\/:*?"<>|]/g, '').trim();
        const safeTitle = (title || 'untitled').replace(/[\\/:*?"<>|]/g, '').trim();
        const folderName = `${utils.dateStamp()}_${safeKeyword}_${safeTitle}`;

        const sessionDir = path.join(config.paths.temp, folderName);
        utils.ensureDir(sessionDir);
        this.storagePath = sessionDir;
        console.log(`[Module 3] Storage initialized: ${sessionDir}`);
        return sessionDir;
    }

        /**
     * Generate a single image using the Nano Banana Pro (Gemini 3 Pro Image) model.
     *
     * @param {string} prompt - Image description from Module 2
     * @param {number} index - Image index (1-8)
     * @param {string} aspectRatio - e.g. "16:9" or "1:1"
     * @returns {Object} File info
     */
    async generateImage(prompt, index, aspectRatio = "16:9", model = 'gemini-2.5-flash-image', customStyle = null) {
        const filename = `${config.image.prefix}${String(index).padStart(2, '0')}.${config.image.format}`;
        const filePath = path.join(this.storagePath, filename);

        // Skip if already exists and is a valid file (> 10KB)
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 10240) {
                console.log(`[Module 3] Image ${index} already exists and is valid (${stats.size} bytes). Skipping.`);
                return { index, filename, path: filePath, status: 'SUCCESS' };
            } else {
                // Remove invalid/stale file
                fs.unlinkSync(filePath);
            }
        }

        let width = 1366, height = 768; // 16:9
        if (aspectRatio === "1:1") { width = 1024; height = 1024; }

        console.log(`[Module 3] Generating image ${index}/8 (${width}x${height}) using ${model} for: ${prompt.substring(0, 50)}...`);

        let downloaded = false;

        // Attempt 1: 파라미터로 전달받은 모델로 이미지 생성
        try {
            const apiKey = this.geminiApiKey;
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            // 비율 힌트를 프롬프트 앞에 추가
            const ratioHint = aspectRatio === "1:1"
                ? "Generate as a 1:1 square format image. "
                : "Generate as a wide 16:9 landscape format image. ";
            const noTextHint = aspectRatio === "16:9"
                ? "No text, no letters, no characters, no writing, no watermark, no captions of any kind in the image. "
                : "";
            // 계정에 저장된 커스텀 이미지 스타일 조건 — module2_factory.js가 만든 prompt 문장이
            // 이 스타일을 반영했는지와 무관하게, 실제 이미지 생성 API 호출 시 항상 덧붙여 확정 반영한다.
            const customStyleHint = customStyle ? ` ${customStyle}` : '';
            const finalPrompt = ratioHint + noTextHint + prompt + customStyleHint;

            const response = await axios.post(url, {
                contents: [{
                    parts: [{ text: finalPrompt }]
                }]
            }, {
                timeout: 30000 // 30s timeout for faster fallback
            });

            if (response.data && response.data.candidates && response.data.candidates[0].content.parts) {
                const part = response.data.candidates[0].content.parts.find(p => p.inlineData);
                if (part && part.inlineData && part.inlineData.data) {
                    const buffer = Buffer.from(part.inlineData.data, 'base64');

                    if (buffer.length > 5000) {
                        fs.writeFileSync(filePath, buffer);
                        console.log(`[Module 3] Image ${index} generated successfully via ${model} (${buffer.length} bytes).`);
                        downloaded = true;
                    }
                }
            } else {
                console.warn(`[Module 3] Nano Banana response structure unexpected: ${JSON.stringify(response.data).substring(0, 200)}`);
            }
        } catch (error) {
            console.error(`[Module 3] ${model} generation failed for image ${index}: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        }

        // Attempt 2: Fallback to Picsum (Only if Nano Banana failed)
        if (!downloaded) {
            console.log(`[Module 3] Falling back to Picsum for image ${index}...`);
            try {
                const seed = prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + index + Date.now();
                const imageUrl = `https://picsum.photos/seed/${seed}/${width}/${height}`;
                const resp = await axios({ url: imageUrl, responseType: 'arraybuffer', timeout: 20000 });
                if (resp.data && resp.data.length > 5000) {
                    fs.writeFileSync(filePath, Buffer.from(resp.data));
                    downloaded = true;
                }
            } catch (fallbackError) {
                console.error(`[Module 3] Fallback also failed: ${fallbackError.message}`);
            }
        }

        // Validate final file
        const finalStatus = downloaded && fs.existsSync(filePath) && fs.statSync(filePath).size > 5000 ? 'SUCCESS' : 'FAILED';
        if (finalStatus === 'FAILED') {
            console.error(`[Module 3] Image ${index} FAILED - no valid file produced.`);
        }

        // Delay to respect potential rate limits
        await utils.randomDelay(2000, 4000);

        return {
            index,
            filename,
            path: filePath,
            prompt: prompt,
            status: finalStatus
        };
    }

    /**
     * Generate all images from Module 2's prompt list, or use user-provided images.
     * 
     * @param {string[]} imagePrompts - AI prompts from Module 2
     * @param {string} keyword - Main keyword
     * @param {string} title - Post title
     * @param {Object} options - { image_paths, triggerType, onProgress }
     */
    async overlayTextOnImage(filePath, text, style = 'bottom_bar', textColor = 'white', subText = '') {
        function charWidth(char, fontSize) {
            const code = char.charCodeAt(0);
            const isFullWidth =
                (code >= 0xAC00 && code <= 0xD7A3) ||
                (code >= 0x1100 && code <= 0x11FF) ||
                (code >= 0x3130 && code <= 0x318F) ||
                (code >= 0x4E00 && code <= 0x9FFF) ||
                (code >= 0x3040 && code <= 0x30FF) ||
                (code >= 0xFF00 && code <= 0xFFEF);
            return isFullWidth ? fontSize : fontSize * 0.55;
        }

        function wordWidth(word, fontSize) {
            let w = 0;
            for (const ch of word) w += charWidth(ch, fontSize);
            return w;
        }

        function wrapText(txt, maxWidth, fontSize) {
            const spaceWidth = fontSize * 0.3;
            const words = txt.split(' ');
            const lines = [];
            let currentLine = '';
            let currentWidth = 0;
            for (const word of words) {
                const ww = wordWidth(word, fontSize);
                const neededWidth = currentLine === '' ? ww : currentWidth + spaceWidth + ww;
                if (neededWidth > maxWidth && currentLine !== '') {
                    lines.push(currentLine);
                    currentLine = word;
                    currentWidth = ww;
                } else {
                    currentLine = currentLine === '' ? word : currentLine + ' ' + word;
                    currentWidth = neededWidth;
                }
            }
            if (currentLine) lines.push(currentLine);
            return lines;
        }

        try {
            const image = sharp(filePath);
            const meta = await image.metadata();
            const imgWidth = meta.width || 1366;
            const imgHeight = meta.height || 768;

            const padding = Math.round(imgWidth * 0.04);

            // 스타일 4는 우측 영역(약 42%)에만 텍스트를 배치하므로 그 너비 기준으로 폰트 크기 조정
            const effectiveMaxWidth = style === 'right_middle'
                ? Math.round(imgWidth * 0.42)
                : imgWidth - padding * 2;

            let fontSize = Math.round(imgWidth * 0.055);
            let lines;
            while (fontSize >= 20) {
                lines = wrapText(text, effectiveMaxWidth, fontSize);
                if (lines.length <= 2) break;
                fontSize -= 2;
            }
            if (lines.length > 2) lines = lines.slice(0, 2);

            const lineHeight = Math.round(fontSize * 1.45);
            const totalTextHeight = lines.length * lineHeight;
            const strokeColor = textColor === 'white' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.7)';
            const font = 'Malgun Gothic, Apple SD Gothic Neo, NanumGothic, sans-serif';
            const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            // 소제목 계산
            const hasSubText = !!(subText && subText.trim());
            const subFontSize = Math.round(fontSize * 0.62);
            const subLineHeight = Math.round(subFontSize * 1.4);
            const subGap = hasSubText ? Math.round(padding * 0.4) : 0;
            const combinedHeight = totalTextHeight + (hasSubText ? subGap + subLineHeight : 0);

            let svg;

            if (style === 'bottom_bar') {
                // 스타일 1: 하단 반투명 검정 바 + 텍스트
                const barHeight = combinedHeight + padding * 2;
                const barY = imgHeight - barHeight;
                const textEls = lines.map((line, i) => {
                    const y = barY + padding + lineHeight * i + fontSize;
                    return `<text x="${imgWidth / 2}" y="${y}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="${textColor}" font-family="${font}" stroke="${strokeColor}" stroke-width="3" paint-order="stroke">${escape(line)}</text>`;
                }).join('\n  ');
                const subEl = hasSubText ? `<text x="${imgWidth / 2}" y="${barY + padding + totalTextHeight + subGap + subFontSize}" text-anchor="middle" font-size="${subFontSize}" font-weight="normal" fill="${textColor}" font-family="${font}" stroke="${strokeColor}" stroke-width="2" paint-order="stroke">${escape(subText.trim())}</text>` : '';
                svg = `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${barY}" width="${imgWidth}" height="${barHeight}" fill="rgba(0,0,0,0.55)"/>
  ${textEls}
  ${subEl}
</svg>`;

            } else if (style === 'bottom_text') {
                // 스타일 2: 하단 텍스트만 (바 없음)
                const barHeight = combinedHeight + padding * 2;
                const barY = imgHeight - barHeight;
                const textEls = lines.map((line, i) => {
                    const y = barY + padding + lineHeight * i + fontSize;
                    return `<text x="${imgWidth / 2}" y="${y}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="${textColor}" font-family="${font}" stroke="${strokeColor}" stroke-width="3" paint-order="stroke">${escape(line)}</text>`;
                }).join('\n  ');
                const subEl = hasSubText ? `<text x="${imgWidth / 2}" y="${barY + padding + totalTextHeight + subGap + subFontSize}" text-anchor="middle" font-size="${subFontSize}" font-weight="normal" fill="${textColor}" font-family="${font}" stroke="${strokeColor}" stroke-width="2" paint-order="stroke">${escape(subText.trim())}</text>` : '';
                svg = `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
  ${textEls}
  ${subEl}
</svg>`;

            } else if (style === 'center_box') {
                // 스타일 3: 중앙 투명 박스(테두리만) 안에 텍스트
                const boxPaddingH = padding * 1.5;
                const boxPaddingV = padding * 1.2;
                const allLines = hasSubText ? [...lines, subText.trim()] : lines;
                const actualMaxLineWidth = Math.max(...allLines.map(line => {
                    let w = 0;
                    for (const ch of line) w += charWidth(ch, line === subText.trim() ? subFontSize : fontSize);
                    return w;
                }));
                const boxWidth = actualMaxLineWidth + boxPaddingH * 2;
                const boxHeight = combinedHeight + boxPaddingV * 2;
                const boxX = (imgWidth - boxWidth) / 2;
                const boxY = (imgHeight - boxHeight) / 2;
                const textEls = lines.map((line, i) => {
                    const y = boxY + boxPaddingV + lineHeight * i + fontSize;
                    return `<text x="${imgWidth / 2}" y="${y}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="${textColor}" font-family="${font}" stroke="${strokeColor}" stroke-width="3" paint-order="stroke">${escape(line)}</text>`;
                }).join('\n  ');
                const subEl = hasSubText ? `<text x="${imgWidth / 2}" y="${boxY + boxPaddingV + totalTextHeight + subGap + subFontSize}" text-anchor="middle" font-size="${subFontSize}" font-weight="normal" fill="${textColor}" font-family="${font}" stroke="${strokeColor}" stroke-width="2" paint-order="stroke">${escape(subText.trim())}</text>` : '';
                svg = `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" fill="none" stroke="white" stroke-width="4" rx="6"/>
  ${textEls}
  ${subEl}
</svg>`;

            } else if (style === 'right_middle') {
                // 스타일 4: 우측 중단 오른쪽 정렬 텍스트
                const startY = (imgHeight - combinedHeight) / 2;
                const textEls = lines.map((line, i) => {
                    const y = startY + lineHeight * i + fontSize;
                    return `<text x="${imgWidth - padding}" y="${y}" text-anchor="end" font-size="${fontSize}" font-weight="bold" fill="${textColor}" font-family="${font}" stroke="${strokeColor}" stroke-width="3" paint-order="stroke">${escape(line)}</text>`;
                }).join('\n  ');
                const subEl = hasSubText ? `<text x="${imgWidth - padding}" y="${startY + totalTextHeight + subGap + subFontSize}" text-anchor="end" font-size="${subFontSize}" font-weight="normal" fill="${textColor}" font-family="${font}" stroke="${strokeColor}" stroke-width="2" paint-order="stroke">${escape(subText.trim())}</text>` : '';
                svg = `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
  ${textEls}
  ${subEl}
</svg>`;
            } else {
                console.warn(`[Module 3] 알 수 없는 썸네일 스타일: ${style}, bottom_bar로 대체`);
                return this.overlayTextOnImage(filePath, text, 'bottom_bar', textColor, subText);
            }

            const outputPath = filePath.replace(/(\.\w+)$/, '_thumb$1');
            await sharp(filePath)
                .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
                .jpeg({ quality: 92 })
                .toFile(outputPath);

            fs.renameSync(outputPath, filePath);
            console.log(`[Module 3] 썸네일 합성 완료: style=${style} color=${textColor} "${text}" → ${path.basename(filePath)}`);
        } catch (err) {
            console.error(`[Module 3] 썸네일 텍스트 합성 실패: ${err.message}`);
        }
    }

    async generateAll(imagePrompts, keyword, title, options = {}) {
        const { image_paths = [], triggerType = 'manual', thumbnailText = null, thumbnailSubText = null, thumbnailStyle = 'bottom_bar', thumbnailTextColor = 'white', thumbnailBgType = 'image', thumbnailBgColor = null, onProgress = null, imageSource = 'gemini', customImagePrompt = null } = options;
        this.initStorage(keyword, title);
        const results = [];

        console.log(`[Module 3] thumbnailText 수신값: ${JSON.stringify(thumbnailText)}`);

        // 1. Process User-Provided Images (if any)
        const userImages = image_paths || [];
        console.log(`[Module 3] Processing ${userImages.length} user-provided images...`);

        for (let i = 0; i < userImages.length; i++) {
            const userPath = userImages[i];
            // URL에는 쿼리스트링이 붙어 있어 path.extname이 '?auto=compress...' 같은 문자열을 반환함
            // Windows에서 '?'는 파일명 불가 문자이므로 반드시 쿼리스트링을 제거하고 확장자를 추출해야 함
            const cleanUrlPath = userPath.startsWith('http') ? userPath.split('?')[0] : userPath;
            const ext = path.extname(cleanUrlPath) || '.jpg';
            const filename = `${config.image.prefix}${String(i + 1).padStart(2, '0')}${ext}`;
            const targetPath = path.join(this.storagePath, filename);

            try {
                if (fs.existsSync(userPath)) {
                    fs.copyFileSync(userPath, targetPath);
                    console.log(`[Module 3] Copied user image ${i + 1}: ${userPath} -> ${targetPath}`);
                } else if (userPath.startsWith('http')) {
                    console.log(`[Module 3] Downloading user image ${i + 1} from URL: ${userPath}`);
                    const response = await axios({ url: userPath, responseType: 'arraybuffer', timeout: 15000 });
                    fs.writeFileSync(targetPath, Buffer.from(response.data));
                }
                
                const isVideoAsset = /\.(mp4|mov|avi|webm)$/i.test(ext);
                const result = {
                    index: i + 1,
                    filename: filename,
                    path: targetPath,
                    status: 'SUCCESS',
                    source: 'USER',
                    mediaType: isVideoAsset ? 'video' : 'image'
                };

                // 사용자 제공 첫 번째 이미지에 썸네일 텍스트 합성 (동영상은 이미지 처리 대상이 아니므로 건너뜀)
                if (i === 0 && thumbnailText && !isVideoAsset) {
                    await this.overlayTextOnImage(targetPath, thumbnailText, thumbnailStyle, thumbnailTextColor, thumbnailSubText || '');
                }

                results.push(result);
                this.fileList.push(filename);
            } catch (err) {
                console.error(`[Module 3] Failed to process user image ${i + 1}: ${err.message}`);
            }
        }

        // 2. Decide if AI generation is needed
        const currentCount = results.length;
        const minRequired = triggerType === 'image_reference' ? currentCount : 8;
        
        if (currentCount >= minRequired) {
            console.log(`[Module 3] User provided ${currentCount} images (>= ${minRequired}). Skipping AI generation.`);
            return this.buildReport(results);
        }

        // 3. Fill missing images with AI
        const missingCount = minRequired - currentCount;
        console.log(`[Module 3] Filling ${missingCount} missing images with AI generation...`);

        if (!imagePrompts || imagePrompts.length === 0) {
            console.warn(`[Module 3] No image prompts received. Cannot fill missing images.`);
            return this.buildReport(results);
        }

        for (let i = 0; i < missingCount; i++) {
            const promptIndex = i; // Use AI prompts starting from 0
            const displayIndex = currentCount + i + 1; // Start index after user images
            let prompt = imagePrompts[promptIndex] || `${keyword} 관련 고출력 이미지 ${displayIndex}`;

            // 1번 이미지: 썸네일 텍스트 모드일 때 1:1 비율로 생성
            // (프롬프트는 Module 2에서 이미 영어 썸네일 전용 프롬프트로 교체되어 전달됨)
            const isThumbnailImage = displayIndex === 1 && thumbnailText;

            // 이미지 소스 결정:
            // - imageSource === 'gemini': 기존 Gemini 이미지 생성 (변경 없음)
            // - imageSource === 'stock': 무료 API 사용. 단, 썸네일 ON 상태의 1번 이미지는 Gemini 유지
            const useGemini = imageSource === 'gemini' || isThumbnailImage;

            try {
                if (onProgress) {
                    await onProgress(displayIndex, minRequired, prompt);
                }

                let result;
                if (useGemini) {
                    const aspectRatio = isThumbnailImage ? "1:1" : "16:9";
                    const imageModel = isThumbnailImage ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
                    result = await this.generateImage(prompt, displayIndex, aspectRatio, imageModel, customImagePrompt);
                    result.source = 'AI';

                    // 2~8번 이미지: 16:9 비율로 리사이즈 (AI 기본 출력이 1:1이므로)
                    if (!isThumbnailImage && result.status === 'SUCCESS') {
                        try {
                            await sharp(result.path)
                                .resize(1366, 768, { fit: 'cover', position: 'centre' })
                                .jpeg({ quality: 92 })
                                .toFile(result.path + '_resized.jpg');
                            fs.renameSync(result.path + '_resized.jpg', result.path);
                            console.log(`[Module 3] Image ${displayIndex} resized to 16:9`);
                        } catch (resizeErr) {
                            console.warn(`[Module 3] Image ${displayIndex} resize failed (skipped): ${resizeErr.message}`);
                        }
                    }
                } else {
                    result = await this.fetchStockImage(prompt, displayIndex);
                }

                results.push(result);
                this.fileList.push(result.filename);
            } catch (error) {
                console.error(`[Module 3] Image ${displayIndex} failed: ${error.message}`);
                const failFilename = `post_img_${String(displayIndex).padStart(2, '0')}.${config.image.format}`;
                results.push({
                    index: displayIndex,
                    filename: failFilename,
                    path: path.join(this.storagePath, failFilename),
                    status: 'FAILED',
                    error: error.message,
                    source: useGemini ? 'AI' : 'STOCK'
                });
            }
        }

        return this.buildReport(results);
    }

    /**
     * Fetch a single image from a stock photo API using a search query.
     * TODO: Replace Picsum placeholder with the chosen API (Pexels / Unsplash / Pixabay).
     *
     * @param {string} prompt - Search query (English image prompt from Module 2)
     * @param {number} index  - Image index
     */
    async fetchStockImage(prompt, index) {
        const filename = `${config.image.prefix}${String(index).padStart(2, '0')}.${config.image.format}`;
        const filePath = path.join(this.storagePath, filename);

        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 10240) {
                console.log(`[Module 3] Stock image ${index} already exists (${stats.size} bytes). Skipping.`);
                return { index, filename, path: filePath, status: 'SUCCESS', source: 'STOCK' };
            } else {
                fs.unlinkSync(filePath);
            }
        }

        console.log(`[Module 3] Fetching stock image ${index} for: ${prompt.substring(0, 50)}...`);

        let downloaded = false;

        // ── Pexels API 호출 ─────────────────────────────────────────────────
        const pexelsApiKey = process.env.PEXELS_API_KEY;
        if (pexelsApiKey) {
            try {
                const query = prompt
                    .replace(/\(.*?\)/g, '')
                    .replace(/[^a-zA-Z0-9 ]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 60);
                const orientation = index === 1 ? 'square' : 'landscape';
                const searchResp = await axios.get('https://api.pexels.com/v1/search', {
                    params: { query, per_page: 1, orientation },
                    headers: { Authorization: pexelsApiKey },
                    timeout: 10000
                });
                const photo = searchResp.data?.photos?.[0];
                if (photo) {
                    const imageUrl = index === 1 ? (photo.src.large || photo.src.medium) : (photo.src.landscape || photo.src.large);
                    const imgResp = await axios({ url: imageUrl, responseType: 'arraybuffer', timeout: 20000 });
                    if (imgResp.data && imgResp.data.length > 5000) {
                        fs.writeFileSync(filePath, Buffer.from(imgResp.data));
                        downloaded = true;
                        console.log(`[Module 3] Stock image ${index} fetched via Pexels (${imgResp.data.length} bytes).`);
                    }
                }
            } catch (err) {
                console.error(`[Module 3] Pexels fetch failed for image ${index}: ${err.message}`);
            }
        }

        // Pexels 실패 시 Picsum 폴백
        if (!downloaded) {
            try {
                const seed = prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + index;
                const imageUrl = `https://picsum.photos/seed/${seed}/1366/768`;
                const resp = await axios({ url: imageUrl, responseType: 'arraybuffer', timeout: 20000 });
                if (resp.data && resp.data.length > 5000) {
                    fs.writeFileSync(filePath, Buffer.from(resp.data));
                    downloaded = true;
                    console.log(`[Module 3] Stock image ${index} fetched via Picsum fallback (${resp.data.length} bytes).`);
                }
            } catch (err) {
                console.error(`[Module 3] Stock image ${index} fetch failed: ${err.message}`);
            }
        }

        const finalStatus = downloaded && fs.existsSync(filePath) && fs.statSync(filePath).size > 5000 ? 'SUCCESS' : 'FAILED';
        if (finalStatus === 'FAILED') {
            console.error(`[Module 3] Stock image ${index} FAILED — no valid file produced.`);
        }

        await utils.randomDelay(500, 1000);

        return { index, filename, path: filePath, prompt, status: finalStatus, source: 'STOCK' };
    }

    /**
     * Verify all generated files exist and are valid
     */
    verifyAssets() {
        const verified = [];
        for (const filename of this.fileList) {
            const filePath = path.join(this.storagePath, filename);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                verified.push({
                    filename,
                    size: stats.size,
                    valid: stats.size > 0
                });
            }
        }
        return verified;
    }

    /**
     * Build the JSON report for Module 4
     */
    buildReport(results) {
        const successCount = results.filter(r => r.status === 'SUCCESS').length;
        const totalExpected = Math.max(8, results.length);

        const report = {
            asset_status: successCount >= 8 ? 'SUCCESS' : 'PARTIAL',
            storage_path: this.storagePath,
            file_list: this.fileList,
            image_count: successCount,
            total_expected: totalExpected,
            metadata: config.image.style,
            details: results,
            // path -> mediaType 매핑. module4_executor.js/확장프로그램이 동영상/이미지를
            // 구분할 때 우선 이걸 참조하고, 없으면 파일 확장자로 폴백한다.
            media_meta: results.filter(r => r.mediaType).map(r => ({ path: r.path, mediaType: r.mediaType }))
        };

        // Save report to logs
        utils.writeLog(config.paths.logs, 'module3_asset_report', report);

        console.log(`[Module 3] Complete: ${successCount}/${totalExpected} images ready (User: ${results.filter(r => r.source === 'USER').length}, AI: ${results.filter(r => r.source === 'AI').length})`);
        return report;
    }
}

module.exports = AssetManager;
