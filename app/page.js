import { NextResponse } from "next/server";
import { buildExpansionPlan } from "../../../lib/optimizer";

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      zone = "South Delhi",
      demandMultiplier = 1,
      budget = 100,
      deliveryTarget = 20,
      storageLimitPct = 85,
    } = body;

    const plan = buildExpansionPlan({
      zone,
      demandMultiplier: Number(demandMultiplier),
      budget: Number(budget),
      deliveryTarget: Number(deliveryTarget),
      storageLimitPct: Number(storageLimitPct),
    });

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (error) {
    console.error("Planning API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to generate expansion plan.",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
