import { authenticateAsAdmin, startMockTrades } from '../lib/mockData';

async function main() {
  const market = process.argv[2] || 'ETHUSDC';
  const intervalMs = parseInt(process.argv[3]) || 2000;

  console.log('Starting mock trades simulation...');
  console.log(`Market: ${market}`);
  console.log(`Interval: ${intervalMs}ms`);

  // Authenticate as admin first
  console.log('Authenticating as PocketBase admin...');
  const authenticated = await authenticateAsAdmin();
  if (!authenticated) {
    console.error('Failed to authenticate. Exiting.');
    process.exit(1);
  }

  // Start generating live trades
  await startMockTrades(market, intervalMs);

  // Keep running
  process.on('SIGINT', () => {
    console.log('\nStopping mock trades...');
    process.exit(0);
  });
}

main().catch(console.error);
