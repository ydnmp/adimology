import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchEmitenInfo, fetchHistoricalSummary } from "@/lib/stockbit";

const supabase = createClient(
process.env.SUPABASE_URL!,
process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function sleep(ms: number) {
return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date: Date) {
return date.toISOString().slice(0, 10);
}

function average(numbers: number[]) {
if (!numbers.length) return 0;
return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

export async function GET() {
try {
const { data: symbols, error } = await supabase
.from("ihsg_symbols")
.select("symbol")
.eq("is_active", true)
.order("symbol", { ascending: true });

```
if (error) {
  return NextResponse.json(
    {
      success: false,
      step: "load_symbols",
      error: error.message,
    },
    { status: 500 }
  );
}

const end = new Date();
const start = new Date();

start.setDate(end.getDate() - 45);

const startDate = formatDate(start);
const endDate = formatDate(end);

const results = [];

for (const row of symbols || []) {
  const symbol = String(row.symbol).toUpperCase();

  try {
    const info = await fetchEmitenInfo(symbol);
    const history = await fetchHistoricalSummary(
      symbol,
      startDate,
      endDate,
      30
    );

    const latest = history?.[0];
    const previous = history?.[1];

    if (!latest) {
      results.push({
        symbol,
        status: "skip",
        reason: "No historical data",
      });
      continue;
    }

    const last20Volumes = history
      .slice(0, 20)
      .map((x: any) => Number(x.volume || 0))
      .filter((x: number) => x > 0);

    const payload = {
      symbol,
      price: Number(latest.close || info?.data?.price || 0),
      previous_price: Number(previous?.close || 0),
      open_price: Number(latest.open || 0),
      volume: Number(latest.volume || 0),
      previous_volume: Number(previous?.volume || 0),
      volume_ma20: Math.round(average(last20Volumes)),
      value: Number(latest.value || 0),
      piotroski_f_score: 4,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("ara_screener_live")
      .upsert(payload, {
        onConflict: "symbol",
      });

    if (upsertError) {
      throw upsertError;
    }

    results.push({
      symbol,
      status: "ok",
      price: payload.price,
      volume: payload.volume,
      value: payload.value,
    });

    await sleep(700);
  } catch (err: any) {
    results.push({
      symbol,
      status: "error",
      error: err?.message || String(err),
    });
  }
}

return NextResponse.json({
  success: true,
  table: "ara_screener_live",
  count: results.length,
  results,
});
```

} catch (err: any) {
return NextResponse.json(
{
success: false,
step: "fatal",
error: err?.message || String(err),
},
{ status: 500 }
);
}
}
