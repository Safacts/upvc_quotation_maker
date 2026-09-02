import { quotationQuerySchema, formatZodError } from '../src/lib/console-schemas.ts';

const params = {
  page: '1',
  page_size: '50',
  sort: 'created_at',
  dir: 'desc',
  from: '2026-04-01',
  to: '2026-09-03'
};

const parsed = quotationQuerySchema.safeParse(params);
console.log('parsed.success:', parsed.success);
if (!parsed.success) {
  console.log('Validation errors:', JSON.stringify(formatZodError(parsed.error), null, 2));
} else {
  console.log('Parsed data:', parsed.data);
}
