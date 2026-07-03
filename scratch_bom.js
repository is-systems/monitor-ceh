const { createClient } = require('@supabase/supabase-js');
const client = createClient(
    'https://zdythzcgcjxwbxufunuh.supabase.co', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'
);

async function run() {
    let bom = await client.from('bom').select('*');
    let mpr1 = bom.data.filter(b => b['ID Компонент'].includes('МПР1 Вар. 25'));
    let mpr = bom.data.filter(b => b['ID Родител'].includes('МПР Вар. 25'));
    console.log("MPR1 as component:");
    console.log(mpr1);
    console.log("MPR as parent:");
    console.log(mpr);
}
run();
