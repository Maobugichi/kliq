import type { Request, Response } from 'express';
import { getBuyerLibrary, resendDownloadEmail } from '../services/buyer.service.js';


export const getLibrary = async(req:Request,res:Response) => {
    try {
        const buyerId = req.user!.id;
        const library = await getBuyerLibrary(buyerId);

        return res.status(200).json({
            success:true,
            count:library.length,
            data:library
        });
    } catch (err) {
        console.error('getLibrary error', err);
        return res.status(500).json({ success:false, message: 'Internal server error'})
    }
}


export const resendDownload = async (req:Request, res:Response) => {
    try {
        const buyerId = req.user!.id;
        const orderId = req.params['orderId'] as string;

        if (!orderId) {
            return res.status(400).json({
                success:false,
                message:'orderId is required'
            });
        }

        await resendDownloadEmail(buyerId, orderId);

        res.status(200).json({
            success:true,
            message:'Download link resent - check your email'
        });
    } catch (err) {
        if (err instanceof Error) {
             const clientErrors = [
        "Order not found or not paid",
        "Access token not found for this order",
        "Access has been revoked for this order",
        "Buyer not found",
        "Product not found",
      ];
      if (clientErrors.includes(err.message))
            return res.status(400).json({ success: false, message: err.message });
        }
        console.error("resendDownload error:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
}