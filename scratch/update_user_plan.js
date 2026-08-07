const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '../frontend/.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const url = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, serviceKey);

async function main() {
  console.log('--- Updating user gktla71@gmail.com plan_type to basic ---');
  
  const userId = '3f26d7d6-79aa-4f2c-b54c-5ce19a9259d5';

  // 1. Update plan_type in profiles table to 'basic'
  const { data: updatedProfile, error: updateErr } = await supabase
    .from('profiles')
    .update({ plan_type: 'basic', updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select();

  if (updateErr) {
    console.error('Error updating profiles plan_type:', updateErr.message);
  } else {
    console.log('Successfully updated profiles plan_type to basic:', updatedProfile);
  }

  // 2. Also check subscriptions table if exists
  const { data: subData, error: subErr } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (!subErr && subData && subData.length > 0) {
    const { data: updatedSub, error: subUpErr } = await supabase
      .from('subscriptions')
      .update({ plan: 'basic', status: 'active', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select();
    console.log('Updated subscriptions table to basic:', updatedSub || subUpErr);
  } else {
    console.log('Subscriptions table check:', subData || subErr);
  }
}

main().catch(console.error);
