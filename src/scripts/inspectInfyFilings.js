import { selectLatestQuarterlyFilings } from '../src/services/supabaseService.js';
import { fetchShareholdingFilings } from '../src/services/nseShareService.js';

(async () => {
  try {
    const filings = await fetchShareholdingFilings('INFY');
    console.log('count', filings.length);
    console.log('raw keys:', Object.keys(filings[0] || {}).sort());
    console.log(JSON.stringify(filings[0], null, 2));
    const normalized = selectLatestQuarterlyFilings(filings, 4);
    console.log('normalized count', normalized.length);
    console.log(JSON.stringify(normalized, null, 2));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
