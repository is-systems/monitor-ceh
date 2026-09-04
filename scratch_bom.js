const { createClient } = require('@supabase/supabase-js');
const client = createClient(
    'https://aoekbmhgbohsgpwqsizv.supabase.co', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU'
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

