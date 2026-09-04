import dotenv from 'dotenv';
dotenv.config();

async function testToken() {
  const quoteId = '27ca093d-19a1-4bac-aa2d-e66c79465381';
  const url = `http://localhost:3000/api/quotation/${quoteId}/token`;

  console.log(`Testing token minting for Eeshanya quotation ${quoteId}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': 'eshanya_trade_links'
    },
    body: JSON.stringify({
      client_id: 'eshanya_trade_links',
      admin_email: 'nitish.fce@gmail.com'
    })
  });

  const status = res.status;
  const json = await res.json();
  console.log(`Status: ${status}`);
  console.log('Response:', json);

  if (status === 200 && json.token) {
    console.log(`SUCCESS! Minted token: ${json.token}`);
    console.log(`Test URL: http://localhost:3000/quote/${quoteId}?token=${json.token}`);
  } else {
    console.error('Failed to mint token');
    process.exit(1);
  }
}

testToken();
