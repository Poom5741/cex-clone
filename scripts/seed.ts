import { authenticateAsAdmin, generateInitialCandles, startMockTrades } from '../lib/mockData';

async function main() {
  console.log('Seeding database with initial data...');

  // Authenticate as admin first
  console.log('Authenticating as PocketBase admin...');
  const authenticated = await authenticateAsAdmin();
  if (!authenticated) {
    console.error('Failed to authenticate. Exiting.');
    process.exit(1);
  }

  // Generate 7 days of candles for each market (enough for testing, fast to generate)
  const markets = ['ETHUSDC', 'BTCUSDC', 'SOLUSDC'];
  const daysToGenerate = 7;

  console.log(`\n===========================================`);
  console.log(`Generating ${daysToGenerate} days of data`);
  console.log(`From: ${new Date(Date.now() - daysToGenerate * 24 * 60 * 60 * 1000).toISOString()}`);
  console.log(`To: ${new Date().toISOString()}`);
  console.log(`===========================================\n`);

  for (const market of markets) {
    console.log(`\n[${market}] Generating data...`);
    await generateInitialCandles(market, daysToGenerate);
    console.log(`[${market}] ✓ Complete`);
  }

  console.log('\nSeed complete!');
  console.log('Starting mock trades...');

  // Start generating live trades
  await startMockTrades('ETHUSDC', 2000);

  // Keep running
  process.on('SIGINT', () => {
    console.log('\nStopping...');
    process.exit(0);
  });
}

main().catch(console.error);
