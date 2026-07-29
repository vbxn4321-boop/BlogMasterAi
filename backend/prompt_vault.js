const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Module 2-A: Prompt Vault
 * 
 * Manages category-based master prompts that are stored in Supabase
 * and loaded dynamically by the content engine.
 */
class PromptVault {
    /**
     * Load a prompt by category
     * @param {string} category - e.g. '여행사', '일상', '맛집'
     * @returns {Object|null} - { content_prompt, image_prompt } or null
     */
    async loadPrompt(category) {
        const { data, error } = await supabase
            .from('prompt_vault')
            .select('content_prompt, image_prompt, description')
            .eq('category', category)
            .eq('is_active', true)
            .single();

        if (error) {
            console.warn(`[Prompt Vault] No prompt found for category: ${category}`);
            return null;
        }

        console.log(`[Prompt Vault] Loaded prompt for: ${category}`);
        return data;
    }

    /**
     * Save or update a prompt
     * @param {string} category
     * @param {string} contentPrompt
     * @param {string} imagePrompt
     * @param {string} description
     */
    async savePrompt(category, contentPrompt, imagePrompt, description = '') {
        const { data, error } = await supabase
            .from('prompt_vault')
            .upsert({
                category,
                content_prompt: contentPrompt,
                image_prompt: imagePrompt,
                description,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'category' })
            .select()
            .single();

        if (error) {
            console.error(`[Prompt Vault] Save error: ${error.message}`);
            throw error;
        }

        console.log(`[Prompt Vault] Saved prompt for: ${category}`);
        return data;
    }

    /**
     * List all active prompts
     */
    async listAll() {
        const { data, error } = await supabase
            .from('prompt_vault')
            .select('category, description, is_active, updated_at')
            .order('category');

        if (error) return [];
        return data;
    }
}

module.exports = PromptVault;
