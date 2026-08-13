const fs = require('fs');
const https = require('https');

async function run() {
  const mdPath = 'C:/Users/aadi/.gemini/antigravity-ide/brain/6971c514-ccda-45b5-9b33-a3d11e630fa7/vitharn_overview_for_madhan.md';
  const token = '7790745552:AAGVmXZLXm5MMoWfSG5i2YJBGBY4lU80qzM';
  const chatId = '8141124947';

  const boundary = '--------------------------' + Date.now().toString(16);
  const filename = 'vitharn_overview_for_madhan.md';
  const fileContent = fs.readFileSync(mdPath);

  let data = '';
  data += '--' + boundary + '\r\n';
  data += 'Content-Disposition: form-data; name="chat_id"\r\n\r\n';
  data += chatId + '\r\n';
  data += '--' + boundary + '\r\n';
  data += 'Content-Disposition: form-data; name="caption"\r\n\r\n';
  data += 'Vitharn Architecture & Vision for Madhan\r\n';
  data += '--' + boundary + '\r\n';
  data += 'Content-Disposition: form-data; name="document"; filename="' + filename + '"\r\n';
  data += 'Content-Type: text/markdown\r\n\r\n';

  const postData = Buffer.concat([
    Buffer.from(data, 'utf8'),
    fileContent,
    Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8')
  ]);

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: '/bot' + token + '/sendDocument',
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Content-Length': postData.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let resData = '';
      res.on('data', d => { resData += d; });
      res.on('end', () => { console.log(resData); resolve(); });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
run();
