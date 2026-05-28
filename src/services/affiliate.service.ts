import crypto from 'crypto';
import pool from '../config/db.js';
import { sendAffiliateConversionEmail, sendAffiliateInviteEmail } from '../utils/mailer.util.js';
import { enqueueAffiliateConversion, enqueueAffiliateInvited } from '../utils/emailqueue.js';

export interface Affiliate {
    id: string;
    creator_id: string;
    affiliate_user_id: string;
    commission_percent: number;
    code: string;
    total_earned: number;
    active: boolean;
    created_at: Date;
}

export interface AffiliateConversion {
    id: string;
    affiliate_id: string;
    order_id: string;
    commission_cents: number;
    paid_out: boolean;
    created_at: Date;
}

export const createAffiliate = async (
    creatorId: string,
    affiliateEmail: string,      
    commissionPercent: number = 10
) => {
   
    const { rows: [user] } = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1`,  
        [affiliateEmail.toLowerCase()]
    );

    if (!user) {
        throw new Error('Affiliate user not found');
    }

    if (creatorId === user.id) {           
        throw new Error('You cannot be your own affiliate');
    }

    if (commissionPercent < 1 || commissionPercent > 90) {
        throw new Error('Commission must be between 1% and 90%');
    }

    const code = crypto.randomBytes(5).toString('hex').toUpperCase();

    const { rows: [affiliate] } = await pool.query<Affiliate>(
        `INSERT INTO affiliates (creator_id, affiliate_user_id, commission_percent, code)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [creatorId, user.id, commissionPercent, code]   
    );

    if (!affiliate) throw new Error('Failed to create affiliate');
  
    const { rows: [creator] } = await pool.query<{ name: string; store_slug: string }>(
        `SELECT u.name, cp.store_slug FROM users u 
        JOIN creator_profiles cp ON cp.user_id = u.id 
        WHERE u.id = $1`,
      [creatorId]
    );

    if (!creator) throw new Error('Failed to find creator');

    const { rows: [affiliateUser] } = await pool.query<{ name: string; email: string }>(
    `SELECT name, email FROM users WHERE id = $1`,
    [affiliate.affiliate_user_id]
    );

    if (!affiliateUser) throw new Error('Failed to create affiliate');

    const storeUrl = `${process.env.FRONTEND_URL}/store/${creator.store_slug}`;  // ← built here

    await enqueueAffiliateInvited({
        to: affiliateUser.email,
        affiliateName: affiliateUser.name,
        creatorName: creator.name,
        storeUrl: `${process.env.FRONTEND_URL}/store/${creator.store_slug}`,
        commissionPercent: affiliate.commission_percent,
        affiliateCode: affiliate.code,
    });

    return affiliate;

   
};

export const listAffiliates = async (creatorId: string): Promise<
    (Affiliate & { affiliate_name: string; affiliate_email: string; total_conversions: number })[]
> => {
    const { rows } = await pool.query(`
        SELECT
          a.*,
          u.name        AS affiliate_name,
          u.email       AS affiliate_email,
          COUNT(ac.id)::INT AS total_conversions
        FROM affiliates a
        JOIN users u ON a.affiliate_user_id = u.id
        LEFT JOIN affiliate_conversions ac ON ac.affiliate_id = a.id
        WHERE a.creator_id = $1
        GROUP BY a.id, u.name, u.email
        ORDER BY a.created_at DESC`,
        [creatorId]
    );

    return rows;
};

export const getAffiliateStats = async (affiliateUserId: string): Promise<{
    affiliates: (Affiliate & { creator_name: string; total_conversions: number })[];
    total_earned_cents: number;
    pending_payout_cents: number;
}> => {
    const { rows: affiliates } = await pool.query(
        `SELECT
            a.*,
            cp.display_name AS creator_name,
            COUNT(ac.id)::INT AS total_conversions
        FROM affiliates a
        JOIN creator_profiles cp ON a.creator_id = cp.user_id
        LEFT JOIN affiliate_conversions ac ON ac.affiliate_id = a.id
        WHERE a.affiliate_user_id = $1 AND a.active = true
        GROUP BY a.id, cp.display_name
        ORDER BY a.created_at DESC`,
        [affiliateUserId]
    );

    const { rows: [earned] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(commission_cents), 0) AS total
        FROM affiliate_conversions ac
        JOIN affiliates a ON ac.affiliate_id = a.id
        WHERE a.affiliate_user_id = $1`,
        [affiliateUserId]
    );

    const { rows: [pending] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(commission_cents), 0) AS total
        FROM affiliate_conversions ac
        JOIN affiliates a ON ac.affiliate_id = a.id
        WHERE a.affiliate_user_id = $1 AND ac.paid_out = false`,
        [affiliateUserId]
    );

    return {
        affiliates,
        total_earned_cents: parseInt(earned?.total ?? '0', 10),
        pending_payout_cents: parseInt(pending?.total ?? '0', 10),
    };
};

export const toggleAffiliate = async (
    affiliateId: string,
    creatorId: string
): Promise<Affiliate> => {
    const { rows: [affiliate] } = await pool.query<Affiliate>(
        `UPDATE affiliates SET active = NOT active
         WHERE id = $1 AND creator_id = $2
         RETURNING *`,
        [affiliateId, creatorId]
    );

    if (!affiliate) {
        throw new Error('Affiliate not found or unauthorized');
    }
    return affiliate;
};

export const resolveAffiliateCode = async (
    code: string
): Promise<Affiliate | null> => {
    const { rows: [affiliate] } = await pool.query<Affiliate>(
        `SELECT * FROM affiliates WHERE code = $1 AND active = true`,
        [code.toUpperCase()]
    );

    return affiliate ?? null;
};

export const recordAffiliateConversion = async (
    affiliateCode: string,
    orderId: string,
    orderAmountCents: number,
    productTitle: string 
): Promise<void> => {
    const affiliate = await resolveAffiliateCode(affiliateCode);
    if (!affiliate) return;

    const commissionCents = Math.floor(orderAmountCents * (affiliate.commission_percent / 100));

    const client = await pool.connect();               // ← get a dedicated connection
    try {
        await client.query("BEGIN");

        await client.query(
            `INSERT INTO affiliate_conversions (affiliate_id, order_id, commission_cents)
             VALUES ($1, $2, $3)`,
            [affiliate.id, orderId, commissionCents]
        );

        await client.query(
            `UPDATE affiliates SET total_earned_cents = total_earned_cents + $1 WHERE id = $2`,
            [commissionCents, affiliate.id]
        );

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();    
        

// after client.release() in recordAffiliateConversion:
        const { rows: [affiliateUser] } = await pool.query<{ email: string; name: string }>(
        `SELECT u.email, u.name FROM users u WHERE u.id = $1`,
        [affiliate.affiliate_user_id]
        );

        const { rows: [earned] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(commission_cents), 0) AS total
        FROM affiliate_conversions ac
        JOIN affiliates a ON ac.affiliate_id = a.id
        WHERE a.affiliate_user_id = $1`,
        [affiliate.affiliate_user_id]
        );

        if (affiliateUser) {
       await enqueueAffiliateConversion({
            to: affiliateUser.email,
            affiliateName: affiliateUser.name,
            productTitle,
            commissionCents,
            totalEarnedCents: parseInt(earned?.total ?? '0', 10),
        });
        }                          
    }
};