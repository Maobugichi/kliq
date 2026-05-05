import type { Request, Response } from "express";
import { getCreatorDashboard, getCreatorBuyers, type BuyerRow } from "../services/dashboard.service.js";


export const dashboard = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const period = (req.query.period as "7d" | "30d" | "90d") ?? "30d";

    if (!["7d", "30d", "90d"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Valid values: 7d, 30d, 90d",
      });
    }

    const data = await getCreatorDashboard(creatorId, period);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("dashboard error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const buyers = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const buyerList = await getCreatorBuyers(creatorId);

    return res.status(200).json({
      success: true,
      count: buyerList.length,
      data: buyerList,
    });
  } catch (err) {
    console.error("buyers error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// GET /creator/buyers/export — returns CSV
export const exportBuyers = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const buyerList = await getCreatorBuyers(creatorId);

    const csvRows = [
      ["Name", "Email", "Total Purchases", "Total Spent (NGN)", "Last Purchase"],
      ...buyerList.map((b: BuyerRow) => [
        b.name,
        b.email,
        b.total_purchases,
        (b.total_spent_cents / 100).toFixed(2),
        new Date(b.last_purchase_at).toISOString().split("T")[0],
      ]),
    ];

    const csv = csvRows.map((row) => row.join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=buyers.csv");
    return res.status(200).send(csv);
  } catch (err) {
    console.error("exportBuyers error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};