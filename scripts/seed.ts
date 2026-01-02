import { generateInitialCandles, startMockTrades } from '../lib/mockData';

async function main() {
  console.log('Seeding database with initial data...');

  // Generate 1 day of candles for each market (reduced from 7 for speed)
  const markets = ['ETHUSDC', 'BTCUSDC', 'SOLUSDC'];

  for (const market of markets) {
    console.log(`\nGenerating data for ${market}...`);
    await generateInitialCandles(market, 1);
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
