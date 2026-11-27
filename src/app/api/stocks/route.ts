import { error, json } from "@/lib/server/http";
import { readStocksFile } from "@/lib/server/stocks";

// The last quotes written by the refresh (data/stocks.json). The page hides the Stocks box on 404.
export async function GET() {
  const stocks = readStocksFile();
  return stocks ? json(stocks) : error(404, "No stock quotes yet");
}
