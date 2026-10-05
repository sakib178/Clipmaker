import dotenv from 'dotenv';

// Imported before media/export constants so .env.local applies to every module.
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });
