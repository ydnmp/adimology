import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchEmitenInfo } from "@/lib/stockbit";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  const { data: symbols, error } = await supabase
    .from("ihsg_symbols")
    .select("symbol")
    .eq("is_active", true)
    .order("symbol", { ascending: true });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  const results = [];
  const now = new Date().toISOString();

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
        synced_at: now,
      };

      const { error: upsertError } = await supabase
        .from("emiten_cache")
        .upsert(payload, { onConflict: "symbol" });

      if (upsertError) throw upsertError;

      results.push({
        symbol,
        status: "ok",
        price: payload.last_price,
        sector: payload.sector,
      });

      await sleep(500);
    } catch (err: any) {
      results.push({
        symbol,
        status: "error",
        error: err.message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    count: results.length,
    results,
  });
}
