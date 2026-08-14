const fs = require('fs');
const content = fs.readFileSync('terminal/terminal-core.js', 'utf8');
const urlMatch = content.match(/createClient\(\s*'(.*?)'/);
const keyMatch = content.match(/createClient\(\s*'.*?',\s*'(.*?)'/);

if(urlMatch && keyMatch) {
    const url = urlMatch[1] + '/rest/v1/otcheti?select=*&ID%20Детайл=eq.Макара%20вар.%2011';
    fetch(url, {
        headers: { 'apikey': keyMatch[1], 'Authorization': 'Bearer ' + keyMatch[1] }
    }).then(res => res.json()).then(data => {
        console.log("otcheti for Макара вар. 11: ", data);
    }).catch(console.error);

    const url2 = urlMatch[1] + '/rest/v1/otcheti?select=*&ID%20Детайл=ilike.*Макара*';
    fetch(url2, {
        headers: { 'apikey': keyMatch[1], 'Authorization': 'Bearer ' + keyMatch[1] }
    }).then(res => res.json()).then(data => {
        console.log("all otcheti for Макара: ", data.length);
    }).catch(console.error);
} else {
    console.log("Credentials not found");
}
