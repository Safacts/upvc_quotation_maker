const TOKEN = '8919193869:AAE7d_AXj8l5DkCokiLP6Ix7W-EB0VpAJ0s';
const CHAT_ID = '1295597987';

async function sendMsg(text) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' })
  });
  return res.json();
}

const fs = await import('fs');

const files = [
  'business_documents/01_Client_Contract.md',
  'business_documents/02_Kickoff_Call.md',
  'business_documents/03_Invoice.md',
  'business_documents/04_Thank_You.md'
];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const name = f.split('/')[1];
  
  const chunks = [];
  let remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= 3800) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', 3800);
    if (splitAt < 2000) splitAt = 3800;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt);
  }
  
  for (let i = 0; i < chunks.length; i++) {
    const header = chunks.length > 1 
      ? `<b>📄 ${name} (${i+1}/${chunks.length})</b>`
      : `<b>📄 ${name}</b>`;
    const escaped = chunks[i].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const msg = `${header}\n\n<pre>${escaped}</pre>`;
    const result = await sendMsg(msg);
    console.log(`${name} part ${i+1}: ${result.ok ? 'sent' : 'failed'}`);
  }
}

console.log('Done');
