import type { Request , Response } from "express";
import { 
    createCoupon,
    listCoupons,
    deleteCoupon,
    toggleCoupon,
    applyCoupon,
    type CreateCouponInput
} from "../services/coupon.service.js";


export const create = async (req:Request, res:Response) => {
    try {
        const creatorId = req.user!.id;
        const { code, discount_type, discount_value, max_uses, expires_at } = req.body as CreateCouponInput;

        if (!code || ! discount_type || !discount_value === undefined) {
            return res.status(400).json({
                success:false,
                message: 'code, discount_type and discount_value are required'
            });
        };

        if (!['percent','flat'].includes(discount_type)) {
            return res.status(400).json({
                success:false,
                message:"discount_type must be 'percent'or 'flat'"
            });
        };

        const coupon = await createCoupon(creatorId,{
            code,
            discount_type,
            discount_value,
            ...(max_uses !== undefined && { max_uses }),
            ...(expires_at !== undefined && { expires_at })
        });

        return res.status(201).json({success:true, data:coupon});
    } catch (err) {
        if (err instanceof Error) {
            const clientErrors = [
                "Percent discount must be between 1 and 100",
                "Flat discount must be greater than 0"
            ];
            if (clientErrors.includes(err.message)) {
                return res.status(400).json({ success:false, message:err.message });
            }

            if (err.message.includes('unique') || err.message.includes('duplicate')) {
                return res.status(409).json({ success:false, message:'Coupon code already exists'})
            }
        }

        console.error('createCoupon error:', err);
        return res.status(500).json({ success:false, message: 'Internal Server Error' });
    }
};


export const list = async (req:Request, res:Response) => {
    try  {
        const creatorId = req.user!.id;
        const coupons = await listCoupons(creatorId);
        return res.status(200).json({ success:true, count: coupons.length, data:coupons });
    } catch (err) {
        console.error('listCoupons error', err);
        return res.status(500).json({ success:false, message:'Internal Server Error' });
    }
};

export const remove = async (req:Request, res:Response) => {
    try {
        const creatorId = req.user!.id;
        const couponId = req.params['couponId'] as string;

        if (!couponId) {
            return res.status(400).json({ success:false, message:'couponId is required'});
        }

        await deleteCoupon(couponId,creatorId);
        return res.status(200).json({ success:true, message: 'Coupon deleted'});
    } catch (err) {
        if (err instanceof Error && err.message === 'Coupon not found or unauthorized') {
            return res.status(404).json({ success:false, message:err.message });
        } 
        console.error('deletedCoupon error:', err);
        return res.status(500).json({ success:false, message:'Internal Server Error'})
    }
}

export const toggle = async (req:Request, res:Response) =>{
    try {
        const creatorId = req.user!.id;
        const couponId = req.params['couponId'] as string;

        if (!couponId) {
            return res.status(400).json({ success:false, message:'couponId is required'});
        }

        const coupon = await toggleCoupon(couponId, creatorId);
        return res.status(200).json({
            success:true,
            message:`Coupon ${coupon.active ? 'activated' : 'deactivated'}`,
            data:coupon
        });
    } catch (err) {
        if (err instanceof Error && err.message === 'Coupon not found or unauthorized') {
            return res.status(404).json({ success:false, message: err.message });
        }

          console.error("toggleCoupon error:", err);
          return res.status(500).json({ success:false,message: 'Internal Server Error'});
    }
    
};

export const apply = async (req:Request, res:Response) => {
    try {
        const { code, product_id } = req.body as {
            code?:string;
            product_id?:string
        }

        if (!code || !product_id) {
            return res.status(400).json({success:false, message:'code and product_id are required'});
        }

        const { rows: [product] } = await(await import('../config/db.js')).default.query<{
            price_cents:number;
            creator_id:string
        }>(
            `SELECT price_cents, creator_id FROM products WHERE id = $1 AND status = 'published'`,
            [product_id]
        );
        
        if (!product) {
            return res.status(404).json({ success:false, message:'Product not found'});
        }

        const result = await applyCoupon(code, product.creator_id,product.price_cents);

        return res.status(200).json({ success:true, data: result});
    } catch (err) {
        if (err instanceof Error) {
            const clientErrors = [
                'Invalid or inactive coupon code',
                'This coupon has expired',
                'This coupon has reached its usage limits'
            ];
            if (clientErrors.includes(err.message)) {
                return res.status(400).json({ success:false, message:err.message});
            }
            console.error('applyCoupon error:', err);
            return res.status(500).json({ success:false, message:'Internal Server Error'});
        }
    }
}