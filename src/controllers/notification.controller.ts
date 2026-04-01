import type { Request, Response } from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "../services/notification.service.js";

// GET /notifications?unread=true
export const list = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const unreadOnly = req.query["unread"] === "true";

    const notifications = await getNotifications(userId, unreadOnly);

    return res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (err) {
    console.error("getNotifications error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// GET /notifications/unread-count
export const unreadCount = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await getUnreadCount(userId);

    return res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// PATCH /notifications/:notificationId/read
export const read = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params["notificationId"] as string;

    if (!notificationId) {
      return res.status(400).json({ success: false, message: "notificationId is required" });
    }

    await markAsRead(notificationId, userId);

    return res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    if (err instanceof Error && err.message === "Notification not found")
      return res.status(404).json({ success: false, message: err.message });
    console.error("markAsRead error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// PATCH /notifications/read-all
export const readAll = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await markAllAsRead(userId);

    return res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    console.error("markAllAsRead error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};