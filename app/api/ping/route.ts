import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!process.env.PING_SECRET || token !== process.env.PING_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("bms_buildings")
      .select("id")
      .limit(1);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
