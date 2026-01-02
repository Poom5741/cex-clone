import { generateInitialCandles, startMockTrades } from '../lib/mockData';

async function main() {
  console.log('Seeding database with initial data...');

  // Generate 7 days of candles for each market
  const markets = ['ETHUSDC', 'BTCUSDC', 'SOLUSDC'];

  for (const market of markets) {
    console.log(`Generating data for ${market}...`);
    await generateInitialCandles(market, 7);
  }

  console.log('Seed complete!');
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
