import type { Request, Response, NextFunction } from "express";
import { z, type ZodError } from "zod";


export const validateBody = 
(schema: z.ZodType) => 
(req:Request, res:Response, next:NextFunction):void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
        const errors = formatZodError(result.error);
        res.status(400).json({
            success:false,
            message:"Validation failed",
            errors
        });
        return;
    }

    req.body = result.data;
    next();
};

export const formatZodError = (error:ZodError):Record<string, string> => {
    return error.issues.reduce<Record<string,string>>((acc,issue) => {
        const key = issue.path.join(".") || "root";
        if (!acc[key]) acc[key] = issue.message;
        return acc;
    }, {})
}