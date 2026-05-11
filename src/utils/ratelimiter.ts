import rateLimit from "express-rate-limit";


export const createRateLimiter = ({
    windowMinutes = 15,
    max = 10,
    message = "Too many requests, please try again later"
}: {
    windowMinutes?:number;
    max?:number;
    message?:string;
} = {}) => 
    rateLimit({
        windowMs:windowMinutes * 60 * 1000,
        max,
        standardHeaders:true,
        legacyHeaders:false,
        handler:(_req, res) => {
            res.status(429).json({success:false, message});
        }
    })

export const strictLimiter  = createRateLimiter({ max: 5,  windowMinutes: 15 }); // sign-up, waitlist
export const defaultLimiter = createRateLimiter({ max: 30, windowMinutes: 15 }); // general API
export const looseLimiter   = createRateLimiter({ max: 60, windowMinutes: 15 }); // read-heavy endpoints