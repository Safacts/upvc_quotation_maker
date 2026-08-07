const TOKEN = '7790745552:AAGVmXZLXm5MMoWfSG5i2YJBGBY4lU80qzM';
const CHAT_ID = '1295597987';

async function sendFile(filePath, caption) {
  const fs = await import('fs');
  const path = await import('path');
  
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  formData.append('caption', caption);
  formData.append('document', new Blob([fileBuffer]), fileName);
  
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, {
    method: 'POST',
    body: formData
  });
  
  return res.json();
}

const files = [
  { path: 'business_documents/01_Client_Contract.md', caption: '📄 01_Client_Contract.md — Client Services Agreement' },
  { path: 'business_documents/02_Kickoff_Call.md', caption: '📄 02_Kickoff_Call.md — Project Kickoff Call' },
  { path: 'business_documents/03_Invoice.md', caption: '📄 03_Invoice.md — Official Invoice' },
  { path: 'business_documents/04_Thank_You.md', caption: '📄 04_Thank_You.md — Thank You Message' }
];

for (const f of files) {
  const result = await sendFile(f.path, f.caption);
  console.log(`${f.path}: ${result.ok ? 'sent' : 'failed - ' + JSON.stringify(result)}`);
}

console.log('Done');
