import pool from '../config/db.js';


export interface Coupon {
    id:string;
    creator_id: string;
    code:string;
    discount_type:'percent' | 'flat';
    discount_value:number;
    max_uses:number | null;
    used_count:number;
    expires_at:Date | null;
    active:boolean;
    created_at:Date
}

export interface CreateCouponInput {
  code: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  max_uses?: number;
  expires_at?: Date;
}


export interface ApplyCouponResult {
    coupon_id:string;
    original_price_cents:number;
    discount_cents:number;
    final_price_cents:number;
}

export const createCoupon = async (
    creatorId:string,
    input:CreateCouponInput
):Promise<Coupon> => {
    const code = input.code.toUpperCase().trim();

    if (input.discount_type === 'percent' && (input.discount_value <= 0 && input.discount_value > 100)) {
        throw new Error('Percent discount must be between 1 and 100');
    }

    if (input.discount_type === 'flat' && input.discount_value <= 0) {
        throw new Error('Flat discount must be greater than 0')
    }

    const { rows: [coupon] } = await pool.query<Coupon>(
        `INSERT INTO coupons
            (creator_id, code, discount_type, discount_value, max_uses, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
        [
            creatorId,
            code,
            input.discount_type,
            input.discount_value,
            input.max_uses ?? null,
            input.expires_at ?? null
        ]    
    );

    if (!coupon) throw new Error("failedto create coupon");
    return coupon;
};


export const listCoupons = async (creatorId:string):Promise<Coupon[]> => {
    const { rows } = await pool.query<Coupon>(
        `SELECT * FROM coupons WHERE creator_id = $1 ORDER BY created_at DESC`,
        [creatorId]
    );

    return rows;
}

export const deleteCoupon = async (
    couponId:string,
    creatorId:string
):Promise<void> => {
   const { rowCount } =  await pool.query(
    `DELETE FROM coupons WHERE id = $1 AND creator_id = $2`,
    [couponId, creatorId]
   );

   if (!rowCount || rowCount === 0) {
    throw new Error('coupon not found or unauthorized');
   }
};


export const toggleCoupon = async (
    couponId:string,
    creatorId:string
):Promise<Coupon>=> {
    const{ rows: [coupon] } = await pool.query<Coupon>(
        `UPDATE coupon SET active = NOT active
        WHERE id = $1 AND creator_id = $2
        RETURNING *`,
        [couponId, creatorId]
    );

    if (!coupon) throw new Error('Coupon not found or unauthorized');

    return coupon;
}

export const applyCoupon = async (
    code:string,
    creatorId:string,
    productPriceCents:number
):Promise<ApplyCouponResult> => {
    const { rows: [coupon] } = await pool.query<Coupon>(
        `SELECT * FROM coupons WHERE id = $1 AND creator_id = $2 AND active = true`,
        [code.toUpperCase().trim(),creatorId]
    );

    if (!coupon) throw new Error('Invalid or inactive coupon code');

    if (coupon.expires_at && new Date() > new Date(coupon.expires_at)){
        throw new Error('This coupon has expired');
    }

    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
        throw new Error('This coupon has reached its usage limit');
    }


    let dicountCents:number;

    if (coupon.discount_type === 'percent') {
        dicountCents = Math.floor(productPriceCents * (coupon.discount_value / 100))
    } else {
       dicountCents = Math.min(coupon.discount_value, productPriceCents);
    } 

    const finalPriceCents = Math.max(0,productPriceCents - dicountCents);

    return {
        coupon_id:coupon.id,
        original_price_cents:productPriceCents,
        discount_cents:dicountCents,
        final_price_cents:finalPriceCents
    };
};

export const incrementCouponUsage = async (couponId:string):Promise<void> => {
    await pool.query(
        `UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`,
        [couponId]
    );
};