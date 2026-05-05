import type { Request, Response } from "express";
import { joinWaitlist, getWaitlist, getWaitlistCount } from "../services/waitlist.service.js";


export const join = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { name?: string; email?: string };

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email is required",
      });
    }

    const entry = await joinWaitlist(email.trim().toLowerCase());

    return res.status(201).json({
      success: true,
      message: "You're on the list! We'll reach out when we launch.",
      data: { id: entry.id, name: entry.name, email: entry.email },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Email already on waitlist") {
      return res.status(409).json({
        success: false,
        message: "This email is already on the waitlist.",
      });
    }
    console.error("joinWaitlist error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const count = async (_req: Request, res: Response) => {
  try {
    const total = await getWaitlistCount();
    return res.status(200).json({ success: true, data: { count: total } });
  } catch (err) {
    console.error("getWaitlistCount error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const list = async (_req: Request, res: Response) => {
  try {
    const entries = await getWaitlist();
    return res.status(200).json({
      success: true,
      count: entries.length,
      data: entries,
    });
  } catch (err) {
    console.error("getWaitlist error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};