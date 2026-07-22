import crypto from 'crypto';
import type { PoolClient } from 'pg';
import pool from '../config/db.js';
import { enqueueAffiliateConversion, enqueueAffiliateInvited } from '../utils/emailqueue.js';

export interface Affiliate {
    id: string;
    creator_id: string;
    affiliate_user_id: string;
    commission_percent: number;
    code: string;
    total_earned_cents: number;
    active: boolean;
    created_at: Date;
    last_invite_sent_at: Date | null;
}

export interface AffiliateConversion {
    id: string;
    affiliate_id: string;
    order_id: string;
    commission_cents: number;
    paid_out: boolean;
    created_at: Date;
}

const parseAmount = (val: string | undefined): number => {
    const parsed = parseInt(val ?? '0', 10);
    if (isNaN(parsed)) throw new Error('Invalid amount returned from DB');
    return parsed;
};

const RESEND_COOLDOWN_MS = 5 * 60 * 1000; 

export const createAffiliate = async (
    creatorId: string,
    affiliateEmail: string,      
    commissionPercent: number = 10
) => {
   
    if (commissionPercent < 1 || commissionPercent > 90) {
        throw new Error('Commission must be between 1% and 90%');
    }

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

    const code = crypto.randomBytes(10).toString('hex').toUpperCase();

    const { rows: [affiliate] } = await pool.query<Affiliate>(
        `INSERT INTO affiliates (creator_id, affiliate_user_id, commission_percent, code, last_invite_sent_at)
         VALUES ($1, $2, $3, $4,NOW())
         RETURNING *`,
        [creatorId, user.id, commissionPercent, code]   
    );

    if (!affiliate) throw new Error('Failed to create affiliate');
  
    const [{ rows: [creator] }, { rows: [affiliateUser] }] = await Promise.all([
        pool.query<{ name: string; store_slug: string }>(
            `SELECT u.name, cp.store_slug FROM users u 
            JOIN creator_profiles cp ON cp.user_id = u.id 
            WHERE u.id = $1`,
            [creatorId]
        ),
        pool.query<{ name: string; email: string }>(
            `SELECT name, email FROM users WHERE id = $1`,
            [affiliate.affiliate_user_id]
        ),
    ]);

    if (!creator) throw new Error('Failed to find creator');

    if (!affiliateUser) throw new Error('Failed to create affiliate');

    const storeUrl = `${process.env.FRONTEND_URL}/store/${creator.store_slug}`;  // ← built here

    await enqueueAffiliateInvited({
        to: affiliateUser.email,
        affiliateName: affiliateUser.name,
        creatorName: creator.name,
        storeUrl,
        commissionPercent: affiliate.commission_percent,
        affiliateCode: affiliate.code,
    });

    return affiliate;

   
};

export const listAffiliates = async (creatorId: string): Promise<
    (Affiliate & {
        affiliate_name: string;
        affiliate_email: string;
        total_conversions: number;
        conversions_this_week: number;
        store_slug: string;
    })[]
> => {
    const { rows } = await pool.query(`
        SELECT
          a.id, a.creator_id, a.affiliate_user_id, a.commission_percent, a.code, a.active, a.created_at,
          u.name        AS affiliate_name,
          u.email       AS affiliate_email,
          cp.store_slug AS store_slug,
          COUNT(ac.id)::INT AS total_conversions,
          COUNT(ac.id) FILTER (WHERE ac.created_at > NOW() - INTERVAL '7 days')::INT AS conversions_this_week,
          COALESCE(SUM(ac.commission_cents), 0)::INT AS total_earned_cents
        FROM affiliates a
        JOIN users u ON a.affiliate_user_id = u.id
        JOIN creator_profiles cp ON cp.user_id = a.creator_id
        LEFT JOIN affiliate_conversions ac ON ac.affiliate_id = a.id
        WHERE a.creator_id = $1
        GROUP BY a.id, u.name, u.email, cp.store_slug
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
            a.id, a.creator_id, a.affiliate_user_id, a.commission_percent, a.code, a.active, a.created_at,
            cp.display_name AS creator_name,
            COUNT(ac.id)::INT AS total_conversions,
            COALESCE(SUM(ac.commission_cents), 0)::INT AS total_earned_cents
        FROM affiliates a
        JOIN creator_profiles cp ON a.creator_id = cp.user_id
        LEFT JOIN affiliate_conversions ac ON ac.affiliate_id = a.id
        WHERE a.affiliate_user_id = $1 AND a.active = true
        GROUP BY a.id, cp.display_name
        ORDER BY a.created_at DESC`,
        [affiliateUserId]
    );

    const { rows: [totals] } = await pool.query<{
        total_earned: string;
        pending_payout: string;
    }>(
        `SELECT
            COALESCE(SUM(commission_cents), 0) AS total_earned,
            COALESCE(SUM(commission_cents) FILTER (WHERE ac.paid_out = false), 0) AS pending_payout
        FROM affiliate_conversions ac
        JOIN affiliates a ON ac.affiliate_id = a.id
        WHERE a.affiliate_user_id = $1`,
        [affiliateUserId]
    );

    

    return {
        affiliates,
        total_earned_cents: parseAmount(totals?.total_earned),
        pending_payout_cents: parseAmount(totals?.pending_payout),
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
    client: PoolClient,
    affiliateCode: string,
    orderId: string,
    orderAmountCents: number
): Promise<{ affiliateUserId: string; affiliateId: string; commissionCents: number } | null> => {
    const affiliate = await resolveAffiliateCode(affiliateCode);
    if (!affiliate) return null;

    const commissionCents = Math.floor(orderAmountCents * (affiliate.commission_percent / 100));

    try {
        await client.query(
            `INSERT INTO affiliate_conversions (affiliate_id, order_id, commission_cents)
             VALUES ($1, $2, $3)`,
            [affiliate.id, orderId, commissionCents]
        );
    } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          
            return null;
        }
        throw err;
    }

    return {
        affiliateUserId: affiliate.affiliate_user_id,
        affiliateId: affiliate.id,
        commissionCents,
    };
};

export const sendAffiliateConversionNotification = async (
    affiliateUserId: string,
    productTitle: string,
    commissionCents: number
): Promise<void> => {
    const { rows: [affiliateUser] } = await pool.query<{ email: string; name: string }>(
        `SELECT u.email, u.name FROM users u WHERE u.id = $1`,
        [affiliateUserId]
    );

    if (!affiliateUser) return;

    const { rows: [earned] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(commission_cents), 0) AS total
         FROM affiliate_conversions ac
         JOIN affiliates a ON ac.affiliate_id = a.id
         WHERE a.affiliate_user_id = $1`,
        [affiliateUserId]
    );

    await enqueueAffiliateConversion({
        to: affiliateUser.email,
        affiliateName: affiliateUser.name,
        productTitle,
        commissionCents,
        totalEarnedCents: parseAmount(earned?.total),
    });
};

export const resendAffiliateInvite = async (
    affiliateId: string,
    creatorId: string
): Promise<Affiliate> => {
    const { rows: [affiliate] } = await pool.query<Affiliate>(
        `SELECT * FROM affiliates WHERE id = $1 AND creator_id = $2`,
        [affiliateId, creatorId]
    );
 
    if (!affiliate) {
        throw new Error('Affiliate not found or unauthorized');
    }
 
    if (affiliate.last_invite_sent_at) {
        const elapsed = Date.now() - new Date(affiliate.last_invite_sent_at).getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
            const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
            throw new Error(`Please wait ${secondsLeft}s before resending this invite`);
        }
    }
 
    const [{ rows: [creator] }, { rows: [affiliateUser] }] = await Promise.all([
        pool.query<{ name: string; store_slug: string }>(
            `SELECT u.name, cp.store_slug FROM users u
            JOIN creator_profiles cp ON cp.user_id = u.id
            WHERE u.id = $1`,
            [creatorId]
        ),
        pool.query<{ name: string; email: string }>(
            `SELECT name, email FROM users WHERE id = $1`,
            [affiliate.affiliate_user_id]
        ),
    ]);
 
    if (!creator) throw new Error('Failed to find creator');
    if (!affiliateUser) throw new Error('Failed to find affiliate');
 
    const storeUrl = `${process.env.FRONTEND_URL}/store/${creator.store_slug}`;
 
   
    await enqueueAffiliateInvited({
        to: affiliateUser.email,
        affiliateName: affiliateUser.name,
        creatorName: creator.name,
        storeUrl,
        commissionPercent: affiliate.commission_percent,
        affiliateCode: affiliate.code,
    });
 
    const { rows: [updated] } = await pool.query<Affiliate>(
        `UPDATE affiliates SET last_invite_sent_at = NOW() WHERE id = $1 RETURNING *`,
        [affiliateId]
    );
 
    if (!updated) throw new Error('Failed to update affiliate');
 
    return updated;
};

export const updateAffiliateCommission = async (
    affiliateId: string,
    creatorId: string,
    commissionPercent: number
): Promise<Affiliate> => {
    if (commissionPercent < 1 || commissionPercent > 90) {
        throw new Error('Commission must be between 1% and 90%');
    }
 
    const { rows: [affiliate] } = await pool.query<Affiliate>(
        `UPDATE affiliates SET commission_percent = $1
         WHERE id = $2 AND creator_id = $3
         RETURNING *`,
        [commissionPercent, affiliateId, creatorId]
    );
 
    if (!affiliate) {
        throw new Error('Affiliate not found or unauthorized');
    }
 
    return affiliate;
};

export const deleteAffiliate = async (
    affiliateId: string,
    creatorId: string
): Promise<void> => {
    const { rows: [affiliate] } = await pool.query<{ id: string; total_conversions: number }>(
        `SELECT a.id, COUNT(ac.id)::INT AS total_conversions
         FROM affiliates a
         LEFT JOIN affiliate_conversions ac ON ac.affiliate_id = a.id
         WHERE a.id = $1 AND a.creator_id = $2
         GROUP BY a.id`,
        [affiliateId, creatorId]
    );
 
    if (!affiliate) {
        throw new Error('Affiliate not found or unauthorized');
    }
 
    
    if (affiliate.total_conversions > 0) {
        throw new Error('Cannot delete an affiliate with existing conversions — deactivate instead');
    }
 
    const { rowCount } = await pool.query(
        `DELETE FROM affiliates WHERE id = $1 AND creator_id = $2`,
        [affiliateId, creatorId]
    );
 
    if (rowCount === 0) {
        throw new Error('Affiliate not found or unauthorized');
    }
};