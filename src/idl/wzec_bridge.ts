/**
 * Placeholder for wzec_bridge IDL
 * 
 * In production, copy the generated IDL from:
 * /Users/fb/testing/wzec_bridge/target/idl/wzec_bridge.json
 */

export type WzecBridge = {
    version: string;
    name: string;
    instructions: any[];
    accounts: any[];
};

// This will be populated from the actual IDL at runtime
export const IDL: WzecBridge = {
    version: "0.1.0",
    name: "wzec_bridge",
    instructions: [],
    accounts: [],
};

