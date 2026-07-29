const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:\\Users\\vbxn6\\.gemini\\antigravity\\scratch\\blog-master-web\\.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAdmin() {
    const { data: profiles, error } = await supabase.from('profiles').select('*').eq('is_admin', true);
    if (error) {
        console.error("Error fetching admins:", error);
    } else {
        console.log("Admins:", profiles);
    }
}

checkAdmin();
