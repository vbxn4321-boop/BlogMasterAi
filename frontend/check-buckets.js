const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function setupBucket() {
    console.log('Checking for "assets" bucket...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
        console.error('Error listing buckets:', listError);
        return;
    }

    const assetsBucket = buckets.find(b => b.name === 'assets');

    if (!assetsBucket) {
        console.log('"assets" bucket not found. Creating it...');
        const { data, error: createError } = await supabase.storage.createBucket('assets', {
            public: true
        });

        if (createError) {
            console.error('Error creating bucket:', createError);
        } else {
            console.log('"assets" bucket created successfully.');
        }
    } else {
        console.log('"assets" bucket already exists.');
        if (!assetsBucket.public) {
            console.log('Updating "assets" bucket to be public...');
            await supabase.storage.updateBucket('assets', { public: true });
        }
    }
}

setupBucket();
