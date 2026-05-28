import type { Request, Response } from 'express';
import { getBuyerLibrary, getBuyerProfile, resendDownloadEmail, updateBuyerProfile } from '../services/buyer.service.js';


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

export const getProfile = async (req: Request, res: Response) => {
    try {
        const buyerId = req.user!.id;
        const profile = await getBuyerProfile(buyerId);
 
        return res.status(200).json({
            success: true,
            data: profile,
        });
    } catch (err) {
        if (err instanceof Error && err.message === 'Buyer not found') {
            return res.status(404).json({ success: false, message: err.message });
        }
        console.error('getProfile error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
 
export const updateProfile = async (req: Request, res: Response) => {
    try {
        const buyerId = req.user!.id;
        const { name, email, password } = req.body as {
            name?: string;
            email?: string;
            password?: string;
        };
 
        // Controller-level guard: reject empty payloads before hitting the service.
        if (name === undefined && email === undefined && password === undefined) {
            return res.status(400).json({
                success: false,
                message: 'At least one field (name, email, password) must be provided.',
            });
        }
 
        // exactOptionalPropertyTypes: passing `key: undefined` is not the same
        // as omitting the key. Build the fields object only with present values
        // so the service signature is satisfied correctly.
        const fields: { name?: string; email?: string; password?: string } = {};
        if (name !== undefined) fields.name = name;
        if (email !== undefined) fields.email = email;
        if (password !== undefined) fields.password = password;
 
        const updated = await updateBuyerProfile(buyerId, fields);
 
        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully.',
            data: updated,
        });
    } catch (err) {
        if (err instanceof Error) {
            // Validation and conflict errors thrown by the service layer are
            // safe to surface directly to the client.
            const clientErrors = [
                'Name must be between 2 and 100 characters.',
                'A valid email address is required.',
                'This email address is already registered to another account.',
                'Password must be at least 8 characters long.',
                'Buyer not found',
                'Profile update failed.',
            ];
            if (clientErrors.includes(err.message)) {
                const statusCode = err.message.includes('already registered') ? 409 : 422;
                return res.status(statusCode).json({
                    success: false,
                    message: err.message,
                });
            }
        }
        console.error('updateProfile error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
 
 