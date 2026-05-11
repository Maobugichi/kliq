import type { Request, Response } from "express";
import { joinWaitlist, getWaitlist, getWaitlistCount } from "../services/waitlist.service.js";
import { z } from "zod";
import { enqueueWaitlistConfirmation, handleEmailWebhook, type EmailWebhookEvent } from "../utils/emailqueue.js";


export const joinWaitlistSchema = z.object({
  email:z
     .string({error: "Email is required" })
     .trim()
     .toLowerCase()
     .email("Must be a valid email address")
})

export type joinWaitlistBody = z.infer<typeof joinWaitlistSchema>;

export const join = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as joinWaitlistBody;

    const entry = await joinWaitlist(email);

    await enqueueWaitlistConfirmation(entry.email);

    return res.status(201).json({
      success: true,
      message: "You're on the list! We'll reach out when we launch.",
      data: { id: entry.id, email: entry.email },
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

export const emailWebhook = async (req:Request, res:Response) => {
  try {
    const events:EmailWebhookEvent[] = Array.isArray(req.body) ? req.body : [req.body];

    await Promise.all(events.map(handleEmailWebhook));

    return res.status(200).json({ received: true });
  } catch (err) {

     console.error("[webhook] email webhook error:", err);
    
     res.status(200).json({ received: true });
  }
}