import { supaGet } from '../src/lib/supabase.ts';

async function checkQuotes() {
  const quotes = await supaGet('quotations', {
    select: 'id,quote_no,date,customer_name,client_id,created_at',
    limit: 20,
    order: 'created_at.desc'
  });
  console.log('Recent quotations in database:');
  console.log(JSON.stringify(quotes, null, 2));
}

checkQuotes().catch(console.error);
