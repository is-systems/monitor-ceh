const fs = require('fs');
const content = fs.readFileSync('terminal/terminal-core.js', 'utf8');
const urlMatch = content.match(/const SUPABASE_URL = '(.*?)'/);
const keyMatch = content.match(/const SUPABASE_KEY = '(.*?)'/);
if(urlMatch && keyMatch) {
    fetch(urlMatch[1] + '/rest/v1/computed_sklad_gp?select=*', {
        headers: { 'apikey': keyMatch[1], 'Authorization': 'Bearer ' + keyMatch[1] }
    }).then(res => res.json()).then(data => {
        console.log(data);
    });
}
