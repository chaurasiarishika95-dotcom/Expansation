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
      categoryFactors,
    } = body;

    const cf = categoryFactors && typeof categoryFactors === "object"
      ? Object.fromEntries(Object.entries(categoryFactors).map(([k, v]) => [k, Math.max(0.8, Math.min(1.35, Number(v) || 1))]))
      : undefined;

    const plan = buildExpansionPlan({
      zone,
      demandMultiplier: Number(demandMultiplier),
      budget: Number(budget),
      deliveryTarget: Number(deliveryTarget),
      storageLimitPct: Number(storageLimitPct),
      categoryFactors: cf,
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
