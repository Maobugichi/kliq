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