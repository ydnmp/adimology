import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchEmitenInfo } from "@/lib/stockbit";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  try {
    const { data: symbols, error } = await supabase
      .from("ihsg_symbols")
      .select("symbol")
      .eq("is_active", true)
      .order("symbol", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, step: "load_symbols", error: error.message }, { status: 500 });
    }

    const results = [];

    for (const row of symbols || []) {
      const symbol = row.symbol.toUpperCase();

      try {
        const info = await fetchEmitenInfo(symbol);

        const payload = {
          symbol,
          name: info?.data?.name || "",
          sector: info?.data?.sector || null,
          last_price: Number(info?.data?.price || 0),
          percent: String(info?.data?.percentage || "0"),
          synced_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase
          .from("emiten_cache")
          .upsert(payload, { onConflict: "symbol" });

        if (upsertError) throw upsertError;

        results.push({ symbol, status: "ok", payload });
        await sleep(500);
      } catch (err: any) {
        results.push({ symbol, status: "error", error: err?.message || String(err) });
      }
    }

    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, step: "fatal", error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
