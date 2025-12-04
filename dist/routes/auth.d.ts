/**
 * Authentication Routes
 * Per Hydex Spec Section 5.6.2
 */
export declare const authRouter: import("express-serve-static-core").Router;
/**
 * Middleware to verify JWT token
 */
export declare function requireAuth(req: any, res: any, next: any): any;
